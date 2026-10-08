import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess } from "../file-changes";
import { EMPTY_COMMIT, type Repository, type Snapshot } from "../../shared/types";

type Store = DraftAccess & { list(scope: DraftScope): SavedDraft[] };

export interface SavePublishPorts {
  /** Live reads: never cached across an await. */
  generation(): number;
  account(): string | undefined;
  repository(): Repository | undefined;
  snapshot(): Snapshot | undefined;
  draftScope(): DraftScope | undefined;
  drafts(): Store;
  api<T>(action: string, body: Record<string, unknown>): Promise<T>;
  /** Whether the tab is shown; the head is checked only then. */
  visible(): boolean;
  /** Runs `check` when the tab is shown or focused again; returns the unsubscribe. */
  onWake(check: () => void): () => void;
  loadSnapshot(): Promise<void>;
}

/** What a step began on; a late answer for another scope is dropped. */
export interface SaveProof {
  epoch: number;
  account?: string;
  repoId?: number;
  branch?: string;
  snapshot?: Snapshot;
}

const headTrust = 5 * 60_000;

/**
 * Save and publish orchestration: head trust and checks, reconciliation of
 * drafts GitHub deleted or now holds, the snapshot after a save, and
 * discarding. Draft storage, file transactions and rendering stay in the host.
 */
export function createSavePublishController(ports: SavePublishPorts) {
  // The branch head as this tab last learned it (a snapshot, a save) and when:
  // trusted over GitHub's answer for a while, as GitHub's reads can lag its
  // writes; after that a branch reset elsewhere is believed.
  let headSeen: { commit: string; at: number } | undefined;
  let headCheckedAt = 0;
  let headCheck = 0;

  function proof(): SaveProof {
    const snapshot = ports.snapshot();
    return { epoch: ports.generation(), account: ports.account(), repoId: ports.repository()?.id, branch: snapshot?.branch, snapshot };
  }
  /** Whether `was` still holds; `snapshot` false lets a refreshed snapshot of the same branch pass. */
  function live(was: SaveProof, snapshot = true) {
    const now = ports.snapshot();
    return was.epoch === ports.generation() && was.account === ports.account() && was.repoId === ports.repository()?.id &&
      was.branch === now?.branch && (!snapshot || was.snapshot === now);
  }

  function seeHead(commit: string) {
    headSeen = { commit, at: Date.now() };
  }
  const trustedHead = () => (headSeen && Date.now() - headSeen.at < headTrust ? headSeen.commit : undefined);
  /** The head a save of `scope` commits onto; nothing once the workspace moved on. */
  function publishedHead(scope: DraftScope) {
    const snapshot = ports.snapshot();
    if (snapshot?.branch !== scope.branch || ports.repository()?.id !== scope.repoId) return undefined;
    return snapshot.empty && (!headSeen || headSeen.commit === EMPTY_COMMIT) ? EMPTY_COMMIT : trustedHead();
  }
  // Whether GitHub moved the branch on (a pull request merged, a save in
  // another tab): checked when the tab is shown or focused again, at most
  // every 15 seconds, and after a save was refused. A new head loads as
  // Refresh does, the open file opening again.
  async function checkBranchHead(force = false) {
    const repo = ports.repository(), seen = ports.snapshot();
    if (!repo || !seen || !ports.visible()) return;
    if (!force && Date.now() - headCheckedAt < 15_000) return;
    headCheckedAt = Date.now();
    const was = proof(), token = ++headCheck;
    try {
      const known = trustedHead();
      const { commit } = await ports.api<{ commit: string }>("head", {
        repo: repo.full_name, branch: seen.branch,
        ...(known ? { commit: known } : {}),
      });
      if (token !== headCheck || !live(was) || commit === seen.commit) return;
      seeHead(commit);
      await ports.loadSnapshot();
    } catch {
      // Checked again on the next focus.
    }
  }
  const unwake = ports.onWake(() => void checkBranchHead());

  function dispose() {
    unwake();
    headCheck++;
  }

  return { proof, live, seeHead, trustedHead, publishedHead, checkBranchHead, dispose };
}
