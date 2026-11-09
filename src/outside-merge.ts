// Outside changes fold in (ticket am-33; ticket 09 items 1 and 2). A commit made outside the editor (GitHub,
// a coding tool) reaches an open tab through the push notice or the focus check (src/controllers/save-publish-controller.ts
// `checkHead`). When it changes only pages and stylesheets the tab already knows, it folds in here, in place, instead
// of the whole repository loading again:
//
// - A file with no draft takes GitHub's new text: the preview follows, and an open code pane with it.
// - A file with a draft is merged three ways against the text that draft started from (`mergeText`). Lines changed on
//   one side only merge by themselves. The outside change enters as someone else's (origin "shared", its history
//   moved past it as src/shared-undo.ts does for a live room), so Lex's own Undo still takes back only his words.
// - A true clash (the same words changed on both sides: lines both changed are merged again by word) shows the latest
//   version: GitHub's words replace Lex's there as one Undo step of their own, so one Undo brings Lex's words back. No
//   question and no message.
// - A page being typed on together in a live room (src/live-text.ts `liveShared`) does not fold: the branch loads again,
//   as before, and unsaved work stays, so the room's copy never takes the change twice. Folding into a live room is a
//   ticket of its own (am-59).
// - The page shown gets a brief outline and a chip naming the commit's author where its text changed
//   (src/agent-presence.ts `visit`); another changed page gets the dot on its row.
//
// Anything else (files added, removed or renamed, other kinds of files, a draft that is a deletion, a move or a binary
// file, a tree GitHub did not list whole) loads the branch again, as before. Loaded on first use, never at boot.

import type { DraftScope, SavedDraft } from "./drafts";
import type { DraftTextStore } from "./draft-store";
import type { PagesAndFilesPorts } from "./pages-and-files-host";
import type { CommitFiles, PublishResult, Snapshot, TreeEntry } from "../shared/types";
import { rebaseHistory } from "./shared-undo";
import { liveShared } from "./live-text";
import { mergeText } from "./text-merge";

import { isNativeTextFile } from "./site-text-index";
import { readSiteTexts } from "./native-boot";
import { readSource } from "./page-builder/source-tree";
import { MAX_BATCH_FILES } from "../shared/types";

/** How long the author's outline and chip stay on the page; the frame's fade (src/components/native-preview-runtime.js,
 * drawPresence) lasts as long: change both together. */
export const OUTSIDE_MARK_MS = 2_600;
/** How long the fold waits, from its start, for the commit's author before naming the chip "Someone". */
export const AUTHOR_WAIT_MS = 1_500;
/** `promise`'s answer, or undefined once `ms` passed first. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let stop = () => {};
  return Promise.race([promise, new Promise<undefined>(resolve => { const timer = setTimeout(resolve, ms); stop = () => clearTimeout(timer); })]).finally(() => stop());
}
/** The element of page `after` holding where it differs from `before`, as an outline path; none for the page as a whole. */
export function changedNode(before: string, after: string): number[] | undefined {
  if (before === after) return undefined;
  let start = 0;
  const limit = Math.min(before.length, after.length);
  while (start < limit && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let tail = 0;
  while (tail < limit - start && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  const end = after.length - tail;
  try {
    const tree = readSource(after, { page: true });
    // Elements come in document order: the last one holding the change is the deepest.
    const holding = tree.elements().filter(el => {
      if (el.type !== "element" || ["html", "head", "body"].includes(el.name)) return false;
      const range = tree.range(el);
      return range && range.start <= start && end <= range.end;
    }).at(-1);
    return holding ? tree.path(holding) : undefined;
  } catch {
    return undefined;
  }
}

/** What the save controller's host lends the fold (src/pages-and-files-host.ts). */
export interface OutsideHost {
  adopt(snapshot: Snapshot): void;
  showSaved(commit: string): void;
  seeHead(commit: string): void;
  /** The browser's drafts (src/drafts.ts `draftStore`). */
  drafts(): { list(scope: DraftScope): SavedDraft[] };
  /** Whether the file under a draft key is typed on together in a live room now (src/live-text.ts `liveShared`). */
  shared?: (key: string) => boolean;
}
type Ports = Pick<PagesAndFilesPorts, "appStore" | "api" | "readFiles" | "draftScope" | "runtime" | "editorModule" | "agentPresence" | "nativeHistorySession">;

/** A draft the fold cannot merge: a deletion, a move, a new file, bytes, or a draft with no text. */
const unmergeable = (draft: SavedDraft) => Boolean(draft.deleted || draft.movedTo || draft.movedFrom || draft.opaque || draft.upload || draft.baseSha === null || draft.sourceSha);

/**
 * Folds `commit`, the branch's new head, into the open workspace in place. True when it did (or the workspace moved
 * on meanwhile, `live` false: nothing is left to do); false when the branch must load again instead.
 */
export async function foldIn(ports: Ports, host: OutsideHost, commit: string, live: () => boolean): Promise<boolean> {
  const was = ports.appStore.snapshot.value, scope = ports.draftScope(), repo = ports.appStore.repository.value;
  if (!was?.tree || !scope || !repo || was.empty) return false;
  // Two reads. The snapshot decides whether the fold goes on: it answers (the fold goes on), fails (the caller loads the
  // branch again, while its load holds) or never answers (src/read-retry.ts gives up after its retries: a failure).
  // The commit read only names the chip: it answers (its author), fails, or answers too late or never ("Someone",
  // once AUTHOR_WAIT_MS passed since the fold began). It never holds the fold back past that.
  const author = within(ports.api<CommitFiles>("commit", { repo: repo.full_name, sha: commit }).then(made => made.author, () => undefined), AUTHOR_WAIT_MS);
  const next = await ports.api<Snapshot>("snapshot", { repo: repo.full_name, branch: scope.branch, commit });
  if (!live()) return true;
  if (!next.tree || next.empty) return false;
  const blobs = (tree: TreeEntry[]) => new Map(tree.filter(entry => entry.type === "blob").map(entry => [entry.path, entry]));
  const before = blobs(was.tree), after = blobs(next.tree);
  if (before.size !== after.size) return false;
  const changed: TreeEntry[] = [];
  for (const [path, entry] of after) {
    const old = before.get(path);
    if (!old || old.mode !== entry.mode) return false;
    if (old.sha !== entry.sha) changed.push(entry);
  }
  // The drafts as they are now: read again after the files' read, as Lex may delete or move a page meanwhile.
  const draftsNow = () => new Map(host.drafts().list(scope).map(draft => [draft.path, draft]));
  const mergeable = (drafts: Map<string, SavedDraft>) => !changed.some(entry => drafts.has(entry.path) && unmergeable(drafts.get(entry.path)!));
  if (changed.length > MAX_BATCH_FILES || changed.some(entry => !isNativeTextFile(entry.path)) || !mergeable(draftsNow())) return false;
  const { texts, unreadable } = await readSiteTexts(changed, shas => ports.readFiles(repo.full_name, shas));
  if (!live()) return true;
  if (unreadable.length || texts.size !== changed.length || !mergeable(draftsNow())) return false;

  const name = await author;
  if (!live()) return true;
  const drafted = draftsNow();
  if (!mergeable(drafted)) return false;
  const store = ports.editorModule.sourceStore();
  // A page typed on together now: the branch loads again, as before (am-59 folds into a live room).
  const together = host.shared ?? ((key: string) => liveShared(store, key));
  if (changed.some(entry => { const key = store.get(scope, entry.path)?.key; return key !== undefined && together(key); })) return false;
  const label = `${name || "Someone"} · GitHub`;
  const shown = new Map(changed.flatMap(entry => { const text = ports.runtime.source(entry.path); return text === undefined ? [] : [[entry.path, text] as const]; }));
  for (const entry of changed)
    foldFile(store, scope, entry.path, drafted.get(entry.path), texts.get(entry.path)!, entry.sha, () => ports.nativeHistorySession(scope, entry.path), label, ports.editorModule.sourceMoved);
  // GitHub's texts are the base now: the preview, and every file without a draft, show them.
  const result: PublishResult = { commit: next.commit, branch: scope.branch, url: "", files: changed.map(({ path, sha }) => ({ path, sha })), unchanged: false };
  ports.runtime.adoptSaved(scope, result, changed.map(entry => ({ ...scope, version: 1, path: entry.path, baseSha: entry.sha, original: texts.get(entry.path)!, content: texts.get(entry.path)!, updatedAt: 0 })));
  host.adopt(next);
  host.seeHead(next.commit);
  host.showSaved(next.commit);
  // Each page's text before and after, read once every layer (pane, draft, base) has taken the change.
  const pages = new Set(Object.values(ports.runtime.site?.routes ?? {}));
  for (const [path, was] of shown) if (pages.has(path))
    ports.agentPresence.visit(path, changedNode(was, ports.runtime.source(path) ?? texts.get(path)!), label, OUTSIDE_MARK_MS);
  return true;
}

/**
 * One changed file: `theirs` at blob `sha` is GitHub's text now. Its draft (`record`, or the editor
 * store's open entry) is merged against its starting text; without either only the base moves (the caller's
 * `adoptSaved`). A file typed on together in a live room never comes here (`foldIn` loads the branch again).
 */
export function foldFile(store: DraftTextStore, scope: DraftScope, path: string, record: SavedDraft | undefined, theirs: string, sha: string,
  history: () => string, author: string, moved?: (key: string, source: string, sha: string) => void) {
  let file = store.get(scope, path);
  // A draft only on record opens in the store to merge, and stays open there (deliberately): its Undo step needs it.
  if (!file && record) file = store.open(scope, path, { text: record.original, baseSha: record.baseSha }).file;
  if (!file) return;
  const merged = mergeText(file.base, file.text, theirs);
  // The outside change, as someone else's: Lex's steps over the file move past it.
  store.edit({ scope, path, text: merged.mine, record: false, origin: "shared", rebase: rebaseHistory });
  store.acceptBase(scope, path, { text: theirs, baseSha: sha });
  // An open code pane compares with GitHub's new text from now on (src/components/source-editor.ts `sourceMoved`).
  moved?.(file.key, theirs, sha);
  // The clash: the latest version shows, Lex's words one Undo away.
  if (merged.clashed) store.edit({ scope, path, history: history(), label: `${author.split(" · ")[0]}'s change`, text: merged.text });
}
