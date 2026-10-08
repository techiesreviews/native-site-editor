import type { DraftScope, SavedDraft } from "../drafts";
import type { DraftAccess, FileChange, keepAsNewFile, listChanges, pruneUnchanged, settleDeletedUpstream } from "../file-changes";
import { EMPTY_COMMIT, type PublishResult, type Repository, type Snapshot, type TreeEntry } from "../../shared/types";

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
  findEntry(path: string): Promise<TreeEntry | undefined>;
  settleDeletedUpstream: typeof settleDeletedUpstream;
  pruneUnchanged: typeof pruneUnchanged;
  keepAsNewFile: typeof keepAsNewFile;
  /** Whether a native site is open. */
  nativeSite(): boolean;
  forgetDraftModel(scope: DraftScope, path: string): void;
  refreshDrafts(): void;
  renderFileTree(): void;
  updateNativePreviewSources(): void;
  forgetDraftedAssets(): void;
  refreshHistory(): void;
  /** The native site's routes and component styles, found again. */
  refreshNativeSite(): void;
  updateAgentContext(): void;
  updateCurrentPageLabel(): void;
  /** Opens the project again when the home page came or went; true while pending. */
  resyncNativeSite(): boolean;
  requestExplorerImagesRefresh(): void;
  /** Closes `paths` where open; returns the open file among them. */
  releaseFiles(paths: Set<string>): string | undefined;
  openAfter(path?: string): Promise<unknown>;
  announce(text: string): void;
  /** After a save: the saved native sources become the base, saved uploads' bytes go. */
  adoptNativeBaseSources(scope: DraftScope, result: PublishResult, submitted: SavedDraft[]): void;
  sweepUploads(scope: DraftScope): void;
  /** The save's site action (deploy) is followed, when the host follows one. */
  trackPublished(scope: DraftScope, result: PublishResult): void;
  /** Sets the snapshot and seeds the repository index with it. */
  adoptSnapshot(repository: Repository, snapshot: Snapshot): void;
  setRevision(commit: string): void;
  startNativeTextIndex(): void;
  status(message: string): void;
  errorMessage(error: unknown): void;
  listChanges: typeof listChanges;
  /** The change of `path` in the tree, if any. */
  change(path: string): FileChange | undefined;
  openFile(): string | undefined;
  /** The stylesheet open beside the page, if any. */
  secondaryPath(): string | undefined;
  /** Drops the editor's model with the draft; false when the editor did not drop the draft itself. */
  dropDraft(scope: DraftScope, path: string): boolean;
  clearEditorHistory(): void;
  nativeModeActive(): boolean;
  nativeFallbackPage(path: string): string | undefined;
  /** The open page's stylesheet opens again as GitHub has it. */
  reopenLinkedStyle(page: string): void;
  /** The row menu's question; undefined when there is no dialog. */
  confirm(question: Question): Promise<boolean> | undefined;
  /** The top bar's Discard all question; undefined when there is no dialog. */
  confirmAll(question: Question): Promise<boolean> | undefined;
}

export interface Question {
  title: string;
  notes: string[];
  action: string;
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
  let refresh = 0;
  let asking = 0;
  // Paths whose drafts are edits of files GitHub deleted since they began.
  let deletedUpstream = new Set<string>();
  // The boot's check, once per snapshot load (`epoch`).
  let deletedUpstreamCheck: { epoch: number; done: Promise<void> } | undefined;

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
  // After files changed: the drafts' listings, routes, both trees and the agent.
  function afterFileChanges() {
    ports.forgetDraftedAssets();
    ports.refreshDrafts();
    ports.refreshHistory();
    if (ports.nativeSite()) ports.refreshNativeSite();
    ports.renderFileTree();
    ports.updateAgentContext();
    ports.updateCurrentPageLabel();
    ports.resyncNativeSite();
    ports.requestExplorerImagesRefresh();
  }

  // Drafts of files GitHub deleted since they began, found when a snapshot
  // loads (src/file-changes.ts): a deletion is dropped, an edit waits in Save
  // to GitHub and the code editor for Discard draft or Keep as new file.
  // Drafts that are GitHub's version now (a merge, a save elsewhere, an agent
  // writing the same text) are no change and go too, compared by blob SHA.
  // At boot it runs after the first paint (checkDeletedUpstream); every
  // draft's file is looked up at once, so folders listed for one serve all.
  async function findDeletedUpstream(epoch: number) {
    if (epoch !== ports.generation()) return;
    deletedUpstream = new Set();
    const scope = ports.draftScope();
    if (!scope) return;
    const was = proof();
    const all = ports.drafts().list(scope);
    const drafts = all.filter((draft) => draft.baseSha !== null);
    const missing = new Set<string>();
    const entries = new Map<string, TreeEntry | undefined>();
    try {
      // New files are looked for only when the whole tree is at hand.
      const looked = was.snapshot?.tree ? all : drafts;
      const found = await Promise.all(looked.map((draft) => ports.findEntry(draft.path)));
      if (!live(was)) return;
      looked.forEach((draft, index) => {
        entries.set(draft.path, found[index]);
        if (!found[index] && draft.baseSha !== null) missing.add(draft.path);
      });
    } catch {
      // Unknown: a save reports it instead.
      return;
    }
    deletedUpstream = new Set(ports.settleDeletedUpstream(ports.drafts(), scope, drafts, missing));
    const left = ports.drafts().list(scope).filter((draft) => entries.has(draft.path) && !deletedUpstream.has(draft.path));
    const dropped = await ports.pruneUnchanged(ports.drafts(), scope, left, (path) => entries.get(path)).catch(() => []);
    if (!live(was)) return;
    for (const path of dropped) ports.forgetDraftModel(scope, path);
    if (dropped.length || deletedUpstream.size || missing.size) {
      ports.refreshDrafts();
      ports.renderFileTree();
      if (ports.nativeSite()) ports.updateNativePreviewSources();
    }
  }
  // Run after the first paint, or at once by a file opened before then that needs it.
  function checkDeletedUpstream(epoch: number) {
    if (deletedUpstreamCheck?.epoch !== epoch) deletedUpstreamCheck = { epoch, done: findDeletedUpstream(epoch).catch(() => undefined) };
    return deletedUpstreamCheck.done;
  }
  // Discard draft (`keep` false) or Keep as new file, for an edit of a file GitHub deleted.
  function settleDeletedDraft(path: string, keep: boolean) {
    const scope = ports.draftScope();
    if (!scope) return;
    const opened = ports.releaseFiles(new Set([path]));
    if (keep) ports.keepAsNewFile(ports.drafts(), scope, path);
    else ports.drafts().remove(scope, path);
    deletedUpstream.delete(path);
    afterFileChanges();
    if (opened) void ports.openAfter(keep ? path : undefined);
    ports.announce(keep ? `Kept ${path} as a new file. Saving creates it again.` : `Discarded the draft of ${path}.`);
  }

  /**
   * Drops the drafts of `paths`, each with the other half of its rename, or
   * every draft of the branch: the files are GitHub's again. The open file
   * and the style pane close when among them, and the open file opens again
   * as GitHub has it (a new page's parent page, a renamed file at its old
   * path). Returns how many drafts went.
   */
  function discardDrafts(paths?: string[]): number {
    const scope = ports.draftScope();
    if (!scope) return 0;
    const store = ports.drafts();
    const all = store.list(scope);
    const chosen = new Set(paths ?? all.map((draft) => draft.path));
    for (const draft of all) {
      if (!chosen.has(draft.path)) continue;
      if (draft.movedFrom && store.get(scope, draft.movedFrom)?.movedTo === draft.path) chosen.add(draft.movedFrom);
      if (draft.movedTo && store.get(scope, draft.movedTo)?.movedFrom === draft.path) chosen.add(draft.movedTo);
    }
    const open = ports.openFile();
    const openDraft = open && chosen.has(open) ? store.get(scope, open) : undefined;
    const secondary = ports.secondaryPath();
    const styled = Boolean(secondary && chosen.has(secondary));
    const opened = ports.releaseFiles(chosen);
    let count = 0;
    for (const path of chosen) {
      if (!store.get(scope, path)) continue;
      // The model kept for the file goes with its draft.
      if (!ports.dropDraft(scope, path)) store.remove(scope, path);
      deletedUpstream.delete(path);
      count++;
    }
    // Undo would replay edits into files that are GitHub's again.
    ports.clearEditorHistory();
    afterFileChanges();
    // The new site's home page was discarded: the project opens again as site-less.
    if (ports.resyncNativeSite()) return count;
    if (ports.nativeModeActive()) ports.updateNativePreviewSources();
    const page = ports.openFile();
    if (opened) {
      const back = openDraft?.movedFrom && chosen.has(openDraft.movedFrom) ? openDraft.movedFrom
        : openDraft?.baseSha === null ? ports.nativeFallbackPage(opened) : opened;
      void ports.openAfter(back);
    } else if (styled && page && ports.nativeModeActive()) ports.reopenLinkedStyle(page);
    return count;
  }
  // Discard changes on one file (its row menu in Pages & files).
  async function discardOneFile(path: string) {
    const change = ports.change(path);
    if (!change) return;
    const was = proof(), token = ++asking;
    const asked = await ports.confirm({
      title: `Discard the changes to ${change.from ? `${change.from} → ${path}` : path}?`,
      notes: [change.kind === "A" ? "It is not on GitHub yet, so this removes it." : "It goes back to GitHub's version. This cannot be undone."],
      action: "Discard",
    });
    if (!asked || token !== asking || !live(was)) return;
    discardDrafts([path]);
    ports.announce(`Discarded the changes to ${path}.`);
  }
  // Discard changes in the top bar: every draft of the branch, after a question naming them.
  async function discardAllChanges() {
    const scope = ports.draftScope();
    if (!scope) return;
    const changes = ports.listChanges(ports.drafts().list(scope));
    if (!changes.length) return;
    const n = changes.length;
    const names = changes.map((change) => (change.from ? `${change.from} → ${change.path}` : change.path));
    const shown = names.length > 12 ? `${names.slice(0, 10).join(", ")} and ${names.length - 10} more` : names.join(", ");
    const words = `${n} unsaved ${n === 1 ? "change" : "changes"}`;
    const was = proof(), token = ++asking;
    const question = ports.confirmAll({
      title: `Discard ${words}?`,
      notes: [shown, `Every file goes back to GitHub's version on ${scope.branch}, including changes agents made. This cannot be undone.`],
      action: "Discard all",
    });
    if (!question) return;
    const asked = await question;
    if (!asked || token !== asking || !live(was)) return;
    discardDrafts();
    ports.announce(`Discarded ${words}.`);
  }

  /** A save of `scope` that `was` opened the editor for went through. */
  function published(was: SaveProof, scope: DraftScope, result: PublishResult, submitted: SavedDraft[]) {
    if (!live(was, false)) return;
    ports.adoptNativeBaseSources(scope, result, submitted);
    // Saved uploads are GitHub's now; this browser lets their bytes go.
    ports.sweepUploads(scope);
    seeHead(result.commit);
    void refreshAfterPublish(scope, result.commit);
    ports.trackPublished(scope, result);
  }
  // After a save: the branch as the save left it. `commit` is the save's own
  // commit, so a GitHub read lagging behind it still gives it (worker/github.ts).
  async function refreshAfterPublish(scope: DraftScope, commit: string) {
    const was = proof(), token = ++refresh;
    try {
      const result = await ports.api<Snapshot>("snapshot", { repo: scope.repo, branch: scope.branch, commit });
      const repository = ports.repository();
      if (token !== refresh || !live(was) || !repository || repository.full_name !== scope.repo || was.branch !== scope.branch) return;
      ports.adoptSnapshot(repository, result);
      seeHead(result.commit);
      const now = { ...was, snapshot: result };
      await findDeletedUpstream(was.epoch);
      if (token !== refresh || !live(now)) return;
      ports.updateAgentContext();
      ports.setRevision(result.commit);
      ports.renderFileTree();
      ports.startNativeTextIndex();
      ports.status("Selected files saved to GitHub.");
    } catch (error) {
      if (was.epoch === ports.generation()) ports.errorMessage(error);
    }
  }

  const unwake = ports.onWake(() => void checkBranchHead());

  function dispose() {
    unwake();
    headCheck++;
    refresh++;
    asking++;
  }

  return {
    proof, live, seeHead, trustedHead, publishedHead, checkBranchHead,
    discardDrafts, discardOneFile, discardAllChanges, published, refreshAfterPublish, afterFileChanges, findDeletedUpstream, checkDeletedUpstream, settleDeletedDraft,
    isDeletedUpstream: (path: string) => deletedUpstream.has(path),
    /** A new snapshot loads: nothing is known deleted until it is checked. */
    resetDeletedUpstream: () => { deletedUpstream = new Set(); },
    dispose,
  };
}
