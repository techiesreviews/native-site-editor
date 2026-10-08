import type { DraftScope, SavedDraft } from "../drafts";
import { keepAsNewFile, listChanges, pruneUnchanged, settleDeletedUpstream, type DraftAccess, type FileChange } from "../file-changes";
import { EMPTY_COMMIT, type PublishResult, type Snapshot, type TreeEntry } from "../../shared/types";

type Store = DraftAccess & { list(scope: DraftScope): SavedDraft[] };

export interface SavePublishPorts {
  /** Live reads: never cached across an await. */
  generation(): number;
  snapshot(): Snapshot | undefined;
  /** Account, repository and branch of the open workspace (src/main.ts scope). */
  scope(): DraftScope | undefined;
  drafts(): Store;
  api<T>(action: string, body: Record<string, string>): Promise<T>;
  /** Runs `check` when the tab is shown or focused again; returns the unsubscribe. */
  onWake(check: () => void): () => void;
  /** Whether the tab is shown; the head is checked only then. */
  visible(): boolean;
  reload(): Promise<void>;
  findEntry(path: string): Promise<TreeEntry | undefined>;
  forget(scope: DraftScope, path: string): void;
  /** The drafts' listings, the file tree and the native preview, drawn again. */
  redraw(): void;
  /** The host's views after files changed (src/main.ts changed). */
  changed(): void;
  /** Closes `paths` where open; returns the open file among them. */
  release(paths: Set<string>): string | undefined;
  openAfter(path?: string): Promise<unknown>;
  announce(text: string): void;
  /** A save went through: its native sources become the base, its uploads' bytes go, its site action is followed. */
  saved(scope: DraftScope, result: PublishResult, submitted: SavedDraft[]): void;
  /** Sets the snapshot a save left and seeds the repository index with it. */
  adopt(snapshot: Snapshot): void;
  /** The agent, revision, tree and text index after the saved snapshot. */
  showSaved(commit: string): void;
  status(message: string): void;
  fail(error: unknown): void;
  /** The change of `path` in the tree, if any. */
  change(path: string): FileChange | undefined;
  openFile(): string | undefined;
  /** The stylesheet open beside the page, if any. */
  secondary(): string | undefined;
  /** Drops the editor's model with the draft; false when the editor did not drop the draft itself. */
  drop(scope: DraftScope, path: string): boolean;
  clearHistory(): void;
  /** Opens the project again when the home page came or went; true while pending. */
  resync(): boolean;
  fallback(path: string): string | undefined;
  /**
   * After a discard: the native preview's sources, then `back` opened when
   * the open file was discarded (`opened`), else the open page's stylesheet
   * as GitHub has it when it was among them (`styled`).
   */
  reopen(opened: boolean, back: string | undefined, styled: boolean): void;
  /** A question in the row menu's (`all` false) or the top bar's dialog; undefined when there is none. */
  confirm(question: Question, all?: boolean): Promise<boolean> | undefined;
}

export interface Question {
  title: string;
  notes: string[];
  action: string;
}

/** What a step began on; a late answer for another scope is dropped. */
export interface SaveProof {
  epoch: number;
  scope?: DraftScope;
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
  // Operation tokens: a newer head check, refresh or discard question supersedes an older one.
  let headCheck = 0, refresh = 0, asking = 0;
  // Paths whose drafts are edits of files GitHub deleted since they began.
  let deletedUpstream = new Set<string>();
  // The boot's check, once per snapshot load (`epoch`).
  let deletedUpstreamCheck: { epoch: number; done: Promise<void> } | undefined;

  const proof = (): SaveProof => ({ epoch: ports.generation(), scope: ports.scope(), snapshot: ports.snapshot() });
  /**
   * Whether `was` still holds: the generation, account, repository, branch
   * and (unless `same` is false, for a refreshed snapshot of the same
   * branch) the snapshot itself. A proof is never re-taken in its place.
   */
  function live(was: SaveProof, same = true) {
    const now = ports.scope(), then = was.scope;
    return was.epoch === ports.generation() && (!same || was.snapshot === ports.snapshot()) &&
      now?.account === then?.account && now?.repoId === then?.repoId && now?.branch === then?.branch;
  }

  function seeHead(commit: string) {
    headSeen = { commit, at: Date.now() };
  }
  const trustedHead = () => (headSeen && Date.now() - headSeen.at < headTrust ? headSeen.commit : undefined);
  /** The head a save of `scope` commits onto; nothing once the workspace moved on. */
  function headFor(scope: DraftScope) {
    const seen = ports.snapshot(), now = ports.scope();
    if (!seen || seen.branch !== scope.branch || now?.repoId !== scope.repoId) return undefined;
    return seen.empty && (!headSeen || headSeen.commit === EMPTY_COMMIT) ? EMPTY_COMMIT : trustedHead();
  }
  // Whether GitHub moved the branch on (a pull request merged, a save in
  // another tab): checked when the tab is shown or focused again, at most
  // every 15 seconds, and after a save was refused. A new head loads as
  // Refresh does, the open file opening again.
  async function checkHead(force = false) {
    const was = proof(), seen = was.snapshot;
    if (!was.scope || !seen || !ports.visible() || (!force && Date.now() - headCheckedAt < 15_000)) return;
    headCheckedAt = Date.now();
    const token = ++headCheck, known = trustedHead();
    try {
      const { commit } = await ports.api<{ commit: string }>("head", {
        repo: was.scope.repo, branch: seen.branch,
        ...(known ? { commit: known } : {}),
      });
      if (token !== headCheck || !live(was) || commit === seen.commit) return;
      seeHead(commit);
      await ports.reload();
    } catch {
      // Checked again on the next focus.
    }
  }

  // Drafts of files GitHub deleted since they began, found when a snapshot
  // loads (src/file-changes.ts): a deletion is dropped, an edit waits in Save
  // to GitHub and the code editor for Discard draft or Keep as new file.
  // Drafts that are GitHub's version now (a merge, a save elsewhere, an agent
  // writing the same text) are no change and go too, compared by blob SHA.
  // At boot it runs after the first paint (checkDeleted); every
  // draft's file is looked up at once, so folders listed for one serve all.
  async function findDeletedUpstream(epoch: number) {
    if (epoch !== ports.generation()) return;
    deletedUpstream = new Set();
    const was = proof(), scope = was.scope;
    if (!scope) return;
    const store = ports.drafts();
    const all = store.list(scope);
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
    deletedUpstream = new Set(settleDeletedUpstream(store, scope, drafts, missing));
    const left = store.list(scope).filter((draft) => entries.has(draft.path) && !deletedUpstream.has(draft.path));
    const dropped = await pruneUnchanged(store, scope, left, (path) => entries.get(path)).catch(() => []);
    if (!live(was)) return;
    for (const path of dropped) ports.forget(scope, path);
    if (dropped.length || deletedUpstream.size || missing.size) ports.redraw();
  }
  // Run after the first paint, or at once by a file opened before then that needs it.
  function checkDeleted(epoch: number) {
    if (deletedUpstreamCheck?.epoch !== epoch) deletedUpstreamCheck = { epoch, done: findDeletedUpstream(epoch).catch(() => undefined) };
    return deletedUpstreamCheck.done;
  }
  // Discard draft (`keep` false) or Keep as new file, for an edit of a file GitHub deleted.
  function settleDeleted(path: string, keep: boolean) {
    const scope = ports.scope();
    if (!scope) return;
    const opened = ports.release(new Set([path]));
    if (keep) keepAsNewFile(ports.drafts(), scope, path);
    else ports.drafts().remove(scope, path);
    deletedUpstream.delete(path);
    ports.changed();
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
  function discard(paths?: string[]): number {
    const scope = ports.scope();
    if (!scope) return 0;
    const store = ports.drafts();
    const all = store.list(scope);
    const chosen = new Set(paths ?? all.map((draft) => draft.path));
    for (const draft of all) {
      if (!chosen.has(draft.path)) continue;
      if (draft.movedFrom && store.get(scope, draft.movedFrom)?.movedTo === draft.path) chosen.add(draft.movedFrom);
      if (draft.movedTo && store.get(scope, draft.movedTo)?.movedFrom === draft.path) chosen.add(draft.movedTo);
    }
    const open = ports.openFile(), secondary = ports.secondary();
    const openDraft = open && chosen.has(open) ? store.get(scope, open) : undefined;
    const styled = Boolean(secondary && chosen.has(secondary));
    const opened = ports.release(chosen);
    let count = 0;
    for (const path of chosen) {
      if (!store.get(scope, path)) continue;
      // The model kept for the file goes with its draft.
      if (!ports.drop(scope, path)) store.remove(scope, path);
      deletedUpstream.delete(path);
      count++;
    }
    // Undo would replay edits into files that are GitHub's again.
    ports.clearHistory();
    ports.changed();
    // The new site's home page was discarded: the project opens again as site-less.
    if (ports.resync()) return count;
    ports.reopen(Boolean(opened), !opened ? undefined : openDraft?.movedFrom && chosen.has(openDraft.movedFrom) ? openDraft.movedFrom
      : openDraft?.baseSha === null ? ports.fallback(opened) : opened, styled);
    return count;
  }
  // Asks, then discards only when the answer is yes, the newest question, and for the scope asked about.
  async function confirmed(question: Question, all: boolean, paths?: string[]) {
    const was = proof(), token = ++asking;
    if (!(await ports.confirm(question, all)) || token !== asking || !live(was)) return false;
    discard(paths);
    return true;
  }
  // Discard changes on one file (its row menu in Pages & files).
  async function discardFile(path: string) {
    const change = ports.change(path);
    if (change && await confirmed({
      title: `Discard the changes to ${change.from ? `${change.from} → ${path}` : path}?`,
      notes: [change.kind === "A" ? "It is not on GitHub yet, so this removes it." : "It goes back to GitHub's version. This cannot be undone."],
      action: "Discard",
    }, false, [path])) ports.announce(`Discarded the changes to ${path}.`);
  }
  // Discard changes in the top bar: every draft of the branch, after a question naming them.
  async function discardAll() {
    const scope = ports.scope();
    const changes = scope ? listChanges(ports.drafts().list(scope)) : [];
    if (!scope || !changes.length) return;
    const n = changes.length;
    const names = changes.map((change) => (change.from ? `${change.from} → ${change.path}` : change.path));
    const shown = names.length > 12 ? `${names.slice(0, 10).join(", ")} and ${names.length - 10} more` : names.join(", ");
    const words = `${n} unsaved ${n === 1 ? "change" : "changes"}`;
    if (await confirmed({
      title: `Discard ${words}?`,
      notes: [shown, `Every file goes back to GitHub's version on ${scope.branch}, including changes agents made. This cannot be undone.`],
      action: "Discard all",
    }, true)) ports.announce(`Discarded ${words}.`);
  }

  /** A save of `scope`, from an editor opened on `was`, went through. */
  function published(was: SaveProof, scope: DraftScope, result: PublishResult, submitted: SavedDraft[]) {
    if (!live(was, false)) return;
    ports.saved(scope, result, submitted);
    seeHead(result.commit);
    void refreshAfterPublish(scope, result.commit);
  }
  // After a save: the branch as the save left it. `commit` is the save's own
  // commit, so a GitHub read lagging behind it still gives it (worker/github.ts).
  async function refreshAfterPublish(scope: DraftScope, commit: string) {
    const was = proof(), token = ++refresh;
    try {
      const result = await ports.api<Snapshot>("snapshot", { repo: scope.repo, branch: scope.branch, commit });
      if (token !== refresh || !live(was) || was.scope?.repo !== scope.repo || was.scope.branch !== scope.branch) return;
      ports.adopt(result);
      seeHead(result.commit);
      await findDeletedUpstream(was.epoch);
      if (token !== refresh || !live({ ...was, snapshot: result })) return;
      ports.showSaved(result.commit);
      ports.status("Selected files saved to GitHub.");
    } catch (error) {
      if (was.epoch === ports.generation()) ports.fail(error);
    }
  }

  const unwake = ports.onWake(() => void checkHead());
  function dispose() {
    unwake();
    headCheck++;
    refresh++;
    asking++;
  }

  return {
    proof, seeHead, trustedHead, headFor, checkHead, checkDeleted, settleDeleted,
    discard, discardFile, discardAll, published, dispose,
    isDeleted: (path: string) => deletedUpstream.has(path),
    /** A new snapshot loads: nothing is known deleted until it is checked. */
    resetDeleted: () => { deletedUpstream = new Set(); },
  };
}
