// Outside changes fold in (ticket am-33, src/outside-merge.ts): the three-way merge by line, the element a change
// touched, and one changed file folded into the draft store (the merge as someone else's change, a clash one Undo away).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftStore } from "../src/draft-store.ts";
import { changedNode, foldFile, foldIn, mergeText, type OutsideHost } from "../src/outside-merge.ts";
import type { SavedDraft } from "../src/drafts.ts";
import type { Snapshot, TreeEntry } from "../shared/types.ts";

const lines = (...words: string[]) => words.map(word => `${word}\n`).join("");

test("mergeText: different lines merge by themselves, from either side", () => {
  const base = lines("<h1>Fresh bread</h1>", "<p>Sourdough and rye.</p>", "<p>Open Tuesday to Saturday.</p>");
  const ours = lines("<h1>Fresh bread in Leiden</h1>", "<p>Sourdough and rye.</p>", "<p>Open Tuesday to Saturday.</p>");
  const theirs = lines("<h1>Fresh bread</h1>", "<p>Sourdough and rye.</p>", "<p>Open Tuesday to Sunday.</p>");
  const merged = mergeText(base, ours, theirs);
  assert.equal(merged.clashed, false);
  assert.equal(merged.text, lines("<h1>Fresh bread in Leiden</h1>", "<p>Sourdough and rye.</p>", "<p>Open Tuesday to Sunday.</p>"));
  assert.equal(merged.mine, merged.text);
  // Lines next to each other are still different lines.
  const next = mergeText(lines("a", "b"), lines("A", "b"), lines("a", "B"));
  assert.deepEqual(next, { text: lines("A", "B"), mine: lines("A", "B"), clashed: false });
});

test("mergeText: added and removed lines on both sides, and the same change on both sides taken once", () => {
  const base = lines("one", "two", "three", "four");
  const merged = mergeText(base, lines("zero", "one", "two", "three", "four"), lines("one", "two", "four", "five"));
  assert.deepEqual(merged, { text: lines("zero", "one", "two", "four", "five"), mine: lines("zero", "one", "two", "four", "five"), clashed: false });
  const alike = mergeText(base, lines("one", "TWO", "three", "four"), lines("one", "TWO", "three", "four", "five"));
  assert.equal(alike.clashed, false);
  assert.equal(alike.text, lines("one", "TWO", "three", "four", "five"));
});

test("mergeText: a true clash keeps GitHub's words in the text and Lex's in mine; the rest merges", () => {
  const base = lines("<h1>Fresh bread every morning</h1>", "<p>Sourdough.</p>", "<p>Open daily.</p>");
  const ours = lines("<h1>Warm bread every morning in Leiden</h1>", "<p>Sourdough.</p>", "<p>Open daily.</p>");
  const theirs = lines("<h1>Fresh loaves every morning</h1>", "<p>Sourdough.</p>", "<p>Open daily, 7 to 15.</p>");
  const merged = mergeText(base, ours, theirs);
  assert.equal(merged.clashed, true);
  assert.equal(merged.text, lines("<h1>Fresh loaves every morning</h1>", "<p>Sourdough.</p>", "<p>Open daily, 7 to 15.</p>"));
  assert.equal(merged.mine, lines("<h1>Warm bread every morning in Leiden</h1>", "<p>Sourdough.</p>", "<p>Open daily, 7 to 15.</p>"));
});

test("mergeText: no draft change takes GitHub's text; no GitHub change keeps the draft; a last line without a newline merges", () => {
  assert.deepEqual(mergeText("a", "a", "b"), { text: "b", mine: "b", clashed: false });
  assert.deepEqual(mergeText("a", "b", "a"), { text: "b", mine: "b", clashed: false });
  assert.equal(mergeText("x\ny", "X\ny", "x\nY").text, "X\nY");
});

test("changedNode: the deepest element holding the change in the new page", () => {
  const before = "<!doctype html><html><body><main><section><h1>Hi</h1><p>Old words</p></section></main></body></html>";
  const after = before.replace("Old words", "New words");
  const node = changedNode(before, after);
  assert.ok(node);
  assert.equal(changedNode(before, before), undefined);
  // The paragraph: one level deeper than the heading's section.
  const section = changedNode(before, before.replace("<h1>Hi</h1>", "<h1>Hi</h1><h2>More</h2>"));
  assert.ok(section && section.length < node.length);
});

const scope = { account: "lex", repoId: 7, repo: "lex/site", branch: "main" };
const oldSha = "a".repeat(40), newSha = "b".repeat(40);

test("foldFile: a draft merges as someone else's change, and Lex's Undo still takes back his own words", async () => {
  const store = createDraftStore({ now: () => 1 });
  const base = lines("<h1>Fresh bread</h1>", "<p>Open Saturday.</p>");
  store.open(scope, "index.html", { text: base, baseSha: oldSha });
  assert.equal(store.edit({ scope, path: "index.html", history: "page", text: lines("<h1>Fresh bread in Leiden</h1>", "<p>Open Saturday.</p>") }).ok, true);
  const theirs = lines("<h1>Fresh bread</h1>", "<p>Open Sunday.</p>");
  foldFile(store, scope, "index.html", undefined, theirs, newSha, () => "page", "Sam · GitHub");
  const file = store.get(scope, "index.html")!;
  assert.equal(file.text, lines("<h1>Fresh bread in Leiden</h1>", "<p>Open Sunday.</p>"));
  assert.equal(file.base, theirs);
  assert.equal(file.baseSha, newSha);
  // One Undo: Lex's heading goes, Sam's line stays.
  assert.equal((await store.undo("page")).ok, true);
  assert.equal(store.text(scope, "index.html"), theirs);
});

test("foldFile: a clash shows the latest, and one Undo brings back Lex's words", async () => {
  const store = createDraftStore({ now: () => 1 });
  const base = lines("<h1>Fresh bread every morning</h1>", "<p>Open Saturday.</p>");
  store.open(scope, "index.html", { text: base, baseSha: oldSha });
  const mine = lines("<h1>Warm bread every morning in Leiden</h1>", "<p>Open Saturday.</p>");
  store.edit({ scope, path: "index.html", history: "page", text: mine });
  const theirs = lines("<h1>Fresh loaves every morning</h1>", "<p>Open Saturday.</p>");
  foldFile(store, scope, "index.html", undefined, theirs, newSha, () => "page", "Sam · GitHub");
  assert.equal(store.text(scope, "index.html"), theirs);
  assert.equal(store.peek("page", "undo"), "Sam's change");
  assert.equal((await store.undo("page")).ok, true);
  assert.equal(store.text(scope, "index.html"), mine);
  assert.equal(store.get(scope, "index.html")!.baseSha, newSha);
});

test("foldFile: a clean open file takes GitHub's text as its base, with no draft change; a draft only on record opens to merge", () => {
  const records = new Map<string, SavedDraft>();
  const store = createDraftStore({ now: () => 1, persistence: {
    get: (_scope, path) => records.get(path), save: draft => { records.set(draft.path, draft); return true; }, remove: (_scope, path) => records.delete(path),
  } });
  store.open(scope, "index.html", { text: "old\n", baseSha: oldSha });
  foldFile(store, scope, "index.html", undefined, "new\n", newSha, () => "page", "Sam · GitHub");
  const file = store.get(scope, "index.html")!;
  assert.deepEqual([file.text, file.base, file.baseSha, file.changed], ["new\n", "new\n", newSha, false]);
  const record: SavedDraft = { ...scope, version: 1, path: "about.html", baseSha: oldSha, original: lines("a", "b"), content: lines("A", "b"), updatedAt: 1 };
  records.set(record.path, record);
  foldFile(store, scope, "about.html", record, lines("a", "B"), newSha, () => "about", "Sam · GitHub");
  assert.equal(store.text(scope, "about.html"), lines("A", "B"));
  assert.deepEqual([records.get("about.html")?.content, records.get("about.html")?.original, records.get("about.html")?.baseSha], [lines("A", "B"), lines("a", "B"), newSha]);
  // Neither open nor drafted: nothing in the store (the base moves in the runtime).
  foldFile(store, scope, "style.css", undefined, "x\n", newSha, () => "css", "Sam · GitHub");
  assert.equal(store.get(scope, "style.css"), undefined);
});

function foldSetup(next: TreeEntry[], options: { texts?: Record<string, string>; author?: string; drafts?: SavedDraft[] } = {}) {
  const tree: TreeEntry[] = [
    { path: "index.html", type: "blob", sha: oldSha, mode: "100644" },
    { path: "style.css", type: "blob", sha: "c".repeat(40), mode: "100644" },
  ];
  const was: Snapshot = { commit: "1".repeat(40), branch: "main", entries: [], tree };
  const after: Snapshot = { commit: "2".repeat(40), branch: "main", entries: [], tree: next };
  const store = createDraftStore({ now: () => 1 });
  const calls: string[] = [], visits: unknown[][] = [], adopted: Snapshot[] = [], base = new Map<string, string>([["index.html", "<p>Old</p>\n"]]);
  const ports = {
    appStore: { snapshot: { value: was }, repository: { value: { full_name: "lex/site" } } },
    api: async (action: string) => { calls.push(action); return action === "snapshot" ? after : { files: [], truncated: false, author: options.author }; },
    readFiles: async (_repo: string, shas: string[]) => Object.fromEntries(shas.map(sha => [sha, options.texts?.[sha] ?? "<p>New</p>\n"])),
    draftScope: () => scope,
    runtime: {
      source: (path: string) => base.get(path),
      site: { routes: { "/": "index.html" } },
      adoptSaved: (_scope: unknown, _result: unknown, files: SavedDraft[]) => { for (const file of files) base.set(file.path, file.content); },
    },
    editorModule: { sourceStore: () => store },
    agentPresence: { visit: (...args: unknown[]) => { visits.push(args); } },
    nativeHistorySession: (_scope: unknown, path: string) => path,
  };
  const host: OutsideHost = { adopt: snapshot => adopted.push(snapshot), showSaved: () => undefined, seeHead: () => undefined, drafts: () => ({ list: () => options.drafts ?? [] }) };
  // eslint-disable-next-line no-restricted-syntax -- a partial fake of the host's ports: only the fields foldIn reads.
  return { ports: ports as unknown as Parameters<typeof foldIn>[0], host, calls, visits, adopted, base, after };
}

test("foldIn: a changed page folds in place, with the author's chip on what changed", async () => {
  const f = foldSetup([
    { path: "index.html", type: "blob", sha: newSha, mode: "100644" },
    { path: "style.css", type: "blob", sha: "c".repeat(40), mode: "100644" },
  ], { author: "sam" });
  assert.equal(await foldIn(f.ports, f.host, f.after.commit, () => true), true);
  assert.equal(f.base.get("index.html"), "<p>New</p>\n");
  assert.deepEqual(f.adopted, [f.after]);
  assert.equal(f.visits.length, 1);
  assert.equal(f.visits[0][0], "index.html");
  assert.equal(f.visits[0][2], "sam · GitHub");
});

test("foldIn: added, removed or other kinds of files load the branch again; a workspace moved on does nothing", async () => {
  const added = foldSetup([
    { path: "index.html", type: "blob", sha: oldSha, mode: "100644" },
    { path: "style.css", type: "blob", sha: "c".repeat(40), mode: "100644" },
    { path: "new.html", type: "blob", sha: newSha, mode: "100644" },
  ]);
  assert.equal(await foldIn(added.ports, added.host, added.after.commit, () => true), false);
  assert.deepEqual(added.adopted, []);
  const image = foldSetup([
    { path: "index.html", type: "blob", sha: oldSha, mode: "100644" },
    { path: "style.css", type: "blob", sha: "c".repeat(40), mode: "100644" },
  ]);
  (image.ports.appStore.snapshot.value!.tree as TreeEntry[]).push({ path: "logo.png", type: "blob", sha: "d".repeat(40), mode: "100644" });
  (image.after.tree as TreeEntry[]).push({ path: "logo.png", type: "blob", sha: "e".repeat(40), mode: "100644" });
  assert.equal(await foldIn(image.ports, image.host, image.after.commit, () => true), false);
  const gone = foldSetup([{ path: "index.html", type: "blob", sha: newSha, mode: "100644" }, { path: "style.css", type: "blob", sha: "c".repeat(40), mode: "100644" }]);
  assert.equal(await foldIn(gone.ports, gone.host, gone.after.commit, () => false), true);
  assert.deepEqual(gone.adopted, []);
});

test("foldIn: a draft that is a deletion loads the branch again", async () => {
  const f = foldSetup([
    { path: "index.html", type: "blob", sha: newSha, mode: "100644" },
    { path: "style.css", type: "blob", sha: "c".repeat(40), mode: "100644" },
  ], { drafts: [{ ...scope, version: 1, path: "index.html", baseSha: oldSha, original: "<p>Old</p>\n", content: "", deleted: true, updatedAt: 1 }] });
  assert.equal(await foldIn(f.ports, f.host, f.after.commit, () => true), false);
  assert.deepEqual(f.adopted, []);
});
