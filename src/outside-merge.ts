// Outside changes fold in (ticket am-33; ticket 09 items 1 and 2). A commit made outside the editor (GitHub,
// a coding tool) reaches an open tab through the push notice or the focus check (src/controllers/save-publish-controller.ts
// `checkHead`). When it changes only pages and stylesheets the tab already knows, it folds in here, in place, instead
// of the whole repository loading again:
//
// - A file with no draft takes GitHub's new text: the preview follows, and an open code pane with it.
// - A file with a draft is merged three ways against the text that draft started from (`mergeText`). Lines changed on
//   one side only merge by themselves. The outside change enters as someone else's (origin "shared", its history
//   moved past it as src/shared-undo.ts does for a live room), so Lex's own Undo still takes back only his words.
// - A true clash (the same lines changed on both sides) shows the latest version: GitHub's words replace Lex's there
//   as one Undo step of their own, so one Undo brings Lex's words back. No question and no message.
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
import { isNativeTextFile } from "./site-text-index";
import { readSiteTexts } from "./native-boot";
import { readSource } from "./page-builder/source-tree";
import { MAX_BATCH_FILES } from "../shared/types";

/** How long the author's outline and chip stay on the page. */
export const OUTSIDE_MARK_MS = 2_600;
/** Past this many line differences one side is taken as a single change (Myers' trace grows with its square). */
const MAX_LINE_EDITS = 2_000;

/** A side's change to the starting text: lines `[start, end)` of it replaced by `lines`. */
interface Hunk { start: number; end: number; lines: string[] }

const splitLines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Pairs of equal lines `[i, j]` (a's line i is b's line j), in order: Myers' shortest edit script. */
function matchLines(a: readonly number[], b: readonly number[]): [number, number][] {
  const n = a.length, m = b.length, max = n + m, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // After each round d, v's band [-(d + 1), d + 1]: what the walk back reads.
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, MAX_LINE_EDITS) && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    trace.push(v.slice(off - d - 1, off + d + 2));
  }
  if (found < 0) return [];
  const pairs: [number, number][] = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const before = trace[d - 1], at = (k: number) => before[k + d];
    const k = x - y;
    const back = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const fromX = at(back), fromY = fromX - back;
    while (x > fromX && y > fromY) pairs.push([--x, --y]);
    x = fromX; y = fromY;
  }
  while (x > 0 && y > 0) pairs.push([--x, --y]);
  return pairs.reverse();
}

/** What `side` changed of `base` (both as line ids), with `lines` the side's own lines. */
function hunks(base: readonly number[], side: readonly number[], lines: readonly string[]): Hunk[] {
  const out: Hunk[] = [];
  let i = 0, j = 0;
  for (const [bi, si] of [...matchLines(base, side), [base.length, side.length] as [number, number]]) {
    if (bi > i || si > j) out.push({ start: i, end: bi, lines: lines.slice(j, si) });
    i = bi + 1; j = si + 1;
  }
  return out;
}

/** Whether two changes touch the same starting lines: overlapping ranges, or insertions at one place. */
const meets = (a: Hunk, b: Hunk) => (a.start < b.end && b.start < a.end) || (a.start === a.end && b.start === b.end && a.start === b.start)
  || (a.start === a.end && b.start < a.start && a.start < b.end) || (b.start === b.end && a.start < b.start && b.start < a.end);

/** `base`'s lines `[start, end)` with `side`'s changes in that range made. */
function rewrite(base: readonly string[], start: number, end: number, side: readonly Hunk[]) {
  const out: string[] = [];
  let at = start;
  for (const hunk of side) { out.push(...base.slice(at, hunk.start), ...hunk.lines); at = hunk.end; }
  out.push(...base.slice(at, end));
  return out.join("");
}

export interface Merged {
  /** The latest version: both sides' changes, GitHub's (`theirs`) where both changed the same lines. */
  text: string;
  /** The same with Lex's (`ours`) words where both changed the same lines: what one Undo brings back. */
  mine: string;
  clashed: boolean;
}

/**
 * The three-way merge, by line: `ours` (the draft) and `theirs` (GitHub's new text), both changed from `base` (the
 * text the draft started from). Changes to different lines merge by themselves; lines both sides changed alike are
 * taken once; lines both changed differently clash.
 */
export function mergeText(base: string, ours: string, theirs: string): Merged {
  if (ours === base || ours === theirs) return { text: theirs, mine: theirs, clashed: false };
  if (theirs === base) return { text: ours, mine: ours, clashed: false };
  const ids = new Map<string, number>(), id = (line: string) => { let found = ids.get(line); if (found === undefined) ids.set(line, found = ids.size); return found; };
  const [baseLines, ourLines, theirLines] = [base, ours, theirs].map(splitLines);
  const [b, o, t] = [baseLines, ourLines, theirLines].map(lines => lines.map(id));
  const tagged = [...hunks(b, o, ourLines).map(hunk => ({ hunk, mine: true })), ...hunks(b, t, theirLines).map(hunk => ({ hunk, mine: false }))]
    .sort((x, y) => x.hunk.start - y.hunk.start || x.hunk.end - y.hunk.end);
  let text = "", mine = "", at = 0, clashed = false;
  for (let index = 0; index < tagged.length;) {
    // One group: every change that touches another of it.
    const group = [tagged[index++]];
    let start = group[0].hunk.start, end = group[0].hunk.end;
    while (index < tagged.length && group.some(item => meets(item.hunk, tagged[index].hunk) || tagged[index].hunk.start < end)) {
      const next = tagged[index++];
      group.push(next);
      start = Math.min(start, next.hunk.start); end = Math.max(end, next.hunk.end);
    }
    const kept = baseLines.slice(at, start).join("");
    text += kept; mine += kept; at = end;
    const ourSide = group.filter(item => item.mine).map(item => item.hunk), theirSide = group.filter(item => !item.mine).map(item => item.hunk);
    const theirText = rewrite(baseLines, start, end, theirSide), ourText = rewrite(baseLines, start, end, ourSide);
    if (ourSide.length && theirSide.length && ourText !== theirText) clashed = true;
    text += theirSide.length ? theirText : ourText;
    mine += ourSide.length ? ourText : theirText;
  }
  const rest = baseLines.slice(at).join("");
  return { text: text + rest, mine: mine + rest, clashed };
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
  const [next, made] = await Promise.all([
    ports.api<Snapshot>("snapshot", { repo: repo.full_name, branch: scope.branch, commit }),
    ports.api<CommitFiles>("commit", { repo: repo.full_name, sha: commit }).catch(() => undefined),
  ]);
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
  const drafts = new Map(host.drafts().list(scope).map(draft => [draft.path, draft]));
  if (changed.length > MAX_BATCH_FILES || changed.some(entry => !isNativeTextFile(entry.path) || (drafts.has(entry.path) && unmergeable(drafts.get(entry.path)!))))
    return false;
  const { texts, unreadable } = await readSiteTexts(changed, shas => ports.readFiles(repo.full_name, shas));
  if (!live()) return true;
  if (unreadable.length || texts.size !== changed.length) return false;

  const author = `${made?.author || "Someone"} · GitHub`, store = ports.editorModule.sourceStore();
  const shown: { path: string; before: string; after: string }[] = [];
  for (const entry of changed) {
    const theirs = texts.get(entry.path)!, draft = drafts.get(entry.path);
    const before = ports.runtime.source(entry.path);
    foldFile(store, scope, entry.path, draft, theirs, entry.sha, () => ports.nativeHistorySession(scope, entry.path), author, ports.editorModule.sourceMoved);
    if (before !== undefined) shown.push({ path: entry.path, before, after: ports.runtime.source(entry.path) ?? theirs });
  }
  // GitHub's texts are the base now: the preview, and every file without a draft, show them.
  const result: PublishResult = { commit: next.commit, branch: scope.branch, url: "", files: changed.map(({ path, sha }) => ({ path, sha })), unchanged: false };
  ports.runtime.adoptSaved(scope, result, changed.map(entry => ({ ...scope, version: 1, path: entry.path, baseSha: entry.sha, original: texts.get(entry.path)!, content: texts.get(entry.path)!, updatedAt: 0 })));
  host.adopt(next);
  host.seeHead(next.commit);
  host.showSaved(next.commit);
  const pages = new Set(Object.values(ports.runtime.site?.routes ?? {}));
  for (const file of shown) if (pages.has(file.path)) ports.agentPresence.visit(file.path, changedNode(file.before, file.after), author, OUTSIDE_MARK_MS);
  return true;
}

/**
 * One changed file: `theirs` at blob `sha` is GitHub's text now. Its draft (`record`, or the editor store's open
 * entry) is merged against its starting text; without either only the base moves (the caller's `adoptSaved`).
 */
export function foldFile(store: DraftTextStore, scope: DraftScope, path: string, record: SavedDraft | undefined, theirs: string, sha: string,
  history: () => string, author: string, moved?: (key: string, source: string, sha: string) => void) {
  let file = store.get(scope, path);
  if (!file && record) file = store.open(scope, path, { text: record.original, baseSha: record.baseSha }).file;
  if (!file) return;
  const merged = mergeText(file.base, file.text, theirs);
  // The non-clashing outside change, as someone else's: Lex's steps over the file move past it.
  store.edit({ scope, path, text: merged.mine, record: false, origin: "shared", rebase: rebaseHistory });
  store.acceptBase(scope, path, { text: theirs, baseSha: sha });
  // An open code pane compares with GitHub's new text from now on (src/components/source-editor.ts `sourceMoved`).
  moved?.(file.key, theirs, sha);
  // The clash: the latest version shows, Lex's words one Undo away.
  if (merged.clashed) store.edit({ scope, path, history: history(), label: `${author.split(" · ")[0]}'s change`, text: merged.text });
}
