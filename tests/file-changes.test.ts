import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftStore, type SavedDraft } from "../src/drafts.ts";
import { deleteFile, duplicateFile, keepAsNewFile, listChanges, moveBack, moveFile, publishFiles, restoreFile, settleDeletedUpstream } from "../src/file-changes.ts";
import { copyPath, filesLinkingTo, linkNote, protectedPathProblem, renameSelection } from "../src/native-files.ts";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
}
const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
const sha = (c: string) => c.repeat(40);
const edit = (path: string, original: string, content: string, baseSha = sha("a")): SavedDraft => ({ ...scope, version: 1, path, baseSha, original, content, updatedAt: 1 });
const kinds = (store: DraftStore) => listChanges(store.list(scope)).map((change) => `${change.kind} ${change.from ? `${change.from} -> ` : ""}${change.path}`);

test("a deletion is a draft marking the path removed, kept through a fresh store, and Restore brings back its edits", () => {
  const disk = memory();
  const store = new DraftStore(disk);
  store.save(edit("a.txt", "one", "one two"));
  assert.equal(deleteFile(store, scope, { path: "a.txt", sha: sha("a"), text: "one" }), "deleted");
  const again = new DraftStore(disk);
  assert.deepEqual(kinds(again), ["D a.txt"]);
  assert.equal(again.get(scope, "a.txt")?.deleted, true);
  assert.deepEqual(publishFiles(listChanges(again.list(scope))), [{ path: "a.txt", baseSha: sha("a"), content: "", delete: true }]);
  assert.equal(restoreFile(again, scope, "a.txt")?.path, "a.txt");
  assert.deepEqual(kinds(again), ["M a.txt"]);
  assert.equal(again.get(scope, "a.txt")?.content, "one two");
  // A clean file restores to no draft at all; a new file deleted is simply gone.
  deleteFile(store, scope, { path: "b.txt", sha: sha("b"), text: "b" });
  restoreFile(store, scope, "b.txt");
  assert.equal(store.get(scope, "b.txt"), undefined);
  store.save({ ...edit("new.txt", "", "x"), baseSha: null });
  assert.equal(deleteFile(store, scope, { path: "new.txt" }), "discarded");
  assert.equal(store.get(scope, "new.txt"), undefined);
});

test("a rename is one change of two drafts: the text at the new path, the old path deleted; unedited it is saved as the old blob", () => {
  const store = new DraftStore(memory());
  assert.equal(moveFile(store, scope, { path: "src/a.html", sha: sha("a"), text: "<p>a</p>" }, "src/b.html"), "moved");
  const [change] = listChanges(store.list(scope));
  assert.equal(change.kind, "R");
  assert.equal(change.from, "src/a.html");
  assert.deepEqual(publishFiles([change]), [
    { path: "src/b.html", baseSha: null, content: "", sha: sha("a"), movedFrom: "src/a.html" },
    { path: "src/a.html", baseSha: sha("a"), content: "", delete: true },
  ]);
  // Edited after the rename, the new text is sent.
  store.save({ ...store.get(scope, "src/b.html")!, content: "<p>b</p>" });
  assert.equal(publishFiles(listChanges(store.list(scope)))[0].content, "<p>b</p>");
  // Renamed again, still one change from the first path.
  moveFile(store, scope, { path: "src/b.html" }, "src/c.html");
  assert.deepEqual(kinds(store), ["R src/a.html -> src/c.html"]);
  // Moving back keeps the edit as an edit of the old path.
  assert.equal(moveBack(store, scope, "src/c.html")?.path, "src/a.html");
  assert.deepEqual(kinds(store), ["M src/a.html"]);
  assert.equal(store.get(scope, "src/a.html")?.content, "<p>b</p>");
});

test("renaming an edited file carries the edit; a binary file moves as its blob; restoring the old path moves it back", () => {
  const store = new DraftStore(memory());
  store.save(edit("a.css", "a{}", "a{color:red}"));
  moveFile(store, scope, { path: "a.css", sha: sha("a"), text: "a{}" }, "b.css");
  const moved = store.get(scope, "b.css")!;
  assert.equal(moved.content, "a{color:red}");
  assert.equal(moved.original, "a{}");
  assert.equal(moved.sourceSha, sha("a"));
  moveFile(store, scope, { path: "img/x.png", sha: sha("c"), mode: "100755" }, "media/x.png");
  assert.deepEqual(publishFiles(listChanges(store.list(scope))).filter((file) => file.path.includes("x.png")), [
    { path: "media/x.png", baseSha: null, content: "", sha: sha("c"), mode: "100755", movedFrom: "img/x.png" },
    { path: "img/x.png", baseSha: sha("c"), content: "", delete: true },
  ]);
  const back = restoreFile(store, scope, "img/x.png");
  assert.deepEqual([back?.path, back?.from], ["img/x.png", "media/x.png"]);
  assert.equal(store.get(scope, "media/x.png"), undefined);
  assert.equal(store.get(scope, "img/x.png"), undefined);
  // Moving a renamed file onto its old path is the old path again.
  assert.equal(moveFile(store, scope, { path: "b.css" }, "a.css"), "returned");
  assert.deepEqual(kinds(store), ["M a.css"]);
});

test("a folder moves and deletes file by file, drafts inside included", () => {
  const store = new DraftStore(memory());
  const files = [
    { path: "docs/a.md", sha: sha("1"), text: "a" },
    { path: "docs/sub/b.md", sha: sha("2"), text: "b" },
  ];
  store.save({ ...edit("docs/new.md", "", "n"), baseSha: null });
  for (const file of [...files, { path: "docs/new.md" }]) moveFile(store, scope, file, file.path.replace(/^docs\//, "notes/"));
  assert.deepEqual(kinds(store), ["R docs/a.md -> notes/a.md", "A notes/new.md", "R docs/sub/b.md -> notes/sub/b.md"]);
  // Deleting the moved folder leaves the old paths deleted.
  for (const path of ["notes/a.md", "notes/sub/b.md", "notes/new.md"]) deleteFile(store, scope, { path });
  assert.deepEqual(kinds(store), ["D docs/a.md", "D docs/sub/b.md"]);
  assert.equal(publishFiles(listChanges(store.list(scope))).length, 2);
});

test("a duplicate is a new file: text as it is now, or the same blob when unchanged or binary", () => {
  const store = new DraftStore(memory());
  duplicateFile(store, scope, { path: "a.html", sha: sha("a"), text: "<p>a</p>" }, "a-copy.html");
  assert.deepEqual(publishFiles(listChanges(store.list(scope))), [{ path: "a-copy.html", baseSha: null, content: "", sha: sha("a") }]);
  store.save(edit("b.html", "b", "bb"));
  duplicateFile(store, scope, { path: "b.html", sha: sha("a"), text: "b" }, "b-copy.html");
  assert.equal(store.get(scope, "b-copy.html")?.content, "bb");
  assert.equal(store.get(scope, "b-copy.html")?.sourceSha, undefined);
});

test("the home page and native.json cannot be deleted, renamed or moved", () => {
  assert.match(protectedPathProblem(["src/pages/index.html"], "delete", "src/pages/index.html", true)!, /home page .* cannot be deleted/);
  assert.match(protectedPathProblem(["a", ".astro-editor/native.json"], "move", "src/pages/index.html", true)!, /native.json cannot be moved/);
  assert.equal(protectedPathProblem(["src/pages/about.html"], "rename", "src/pages/index.html", true), undefined);
  assert.equal(protectedPathProblem([".astro-editor/native.json"], "delete", undefined, false), undefined);
  // The manifest can be deleted when src/pages/index.html keeps the site native; never renamed or moved.
  assert.equal(protectedPathProblem([".astro-editor/native.json"], "delete", "src/pages/index.html", true, true), undefined);
  assert.match(protectedPathProblem([".astro-editor/native.json"], "delete", "src/pages/index.html", true, false)!, /cannot be deleted: without src\/pages\/index.html/);
  assert.match(protectedPathProblem([".astro-editor/native.json"], "rename", "src/pages/index.html", true, true)!, /cannot be renamed/);
});

test("links to a page are counted per file, a lower bound when a source is not loaded", () => {
  const sources = {
    "src/pages/index.html": `<a href="#/about/">About</a> <a href='#/about'>again</a>`,
    "src/pages/work.html": `<a href="#/about/#team">Team</a>`,
    "src/components/site-header/site-header.html": `<a href=#/about/>About</a>`,
    "src/pages/about.html": `<a href="#/about/">self</a>`,
    "src/pages/other.html": `<a href="#/aboutus/">no</a>`,
  };
  const found = filesLinkingTo(sources, ["/about/"], new Set(["src/pages/about.html"]));
  assert.deepEqual(found, { files: ["src/components/site-header/site-header.html", "src/pages/index.html", "src/pages/work.html"], complete: true });
  assert.equal(linkNote(found, ["/about/"], "deleted"), "2 pages and 1 component link to #/about/; those links will lead nowhere.");
  const partial = filesLinkingTo({ ...sources, "src/pages/x.html": undefined }, ["/work/"]);
  assert.equal(linkNote(partial, ["/work/"], "moved"), "At least 0 pages link to #/work/; those links are not updated.");
  assert.equal(linkNote(filesLinkingTo(sources, ["/none/"]), ["/none/"], "moved"), undefined);
});

test("a copy's name and an inline rename's first selection", () => {
  const taken = new Set(["src/a-copy.html"]);
  assert.equal(copyPath("src/a.html", (path) => taken.has(path)), "src/a-copy-2.html");
  assert.equal(copyPath("Makefile", () => false), "Makefile-copy");
  assert.equal(copyPath(".gitkeep", () => false), ".gitkeep-copy");
  assert.deepEqual(renameSelection("about.html", false), { start: 0, end: 5 });
  assert.deepEqual(renameSelection("my.folder", true), { start: 0, end: 9 });
  assert.deepEqual(renameSelection(".env", false), { start: 0, end: 4 });
});

test("drafts of files GitHub deleted: a deletion is dropped, an edit is returned to settle, a new file is left alone", () => {
  const store = new DraftStore(memory());
  store.save(edit(".astro-editor/native.json", "{}", "{\"version\":1}"));
  store.save(edit("kept.txt", "a", "b"));
  deleteFile(store, scope, { path: "gone.txt", sha: sha("b"), text: "x" });
  store.save({ ...edit("new.txt", "", "n"), baseSha: null });
  moveFile(store, scope, { path: "src/old.html", sha: sha("c"), text: "<p>o</p>" }, "src/new.html");
  const missing = new Set([".astro-editor/native.json", "gone.txt", "new.txt", "src/old.html"]);
  assert.deepEqual(settleDeletedUpstream(store, scope, store.list(scope), missing), [".astro-editor/native.json"]);
  // The deletion is gone; the rename's old half too, so its new path is a new file saved as the old blob.
  assert.deepEqual(kinds(store), ["M .astro-editor/native.json", "M kept.txt", "A new.txt", "A src/new.html"]);
  assert.deepEqual(publishFiles(listChanges(store.list(scope))).find((file) => file.path === "src/new.html"), { path: "src/new.html", baseSha: null, content: "", sha: sha("c"), movedFrom: "src/old.html" });
  // Nothing missing: nothing changes.
  assert.deepEqual(settleDeletedUpstream(store, scope, store.list(scope), new Set()), []);
  assert.deepEqual(kinds(store).length, 4);
});

test("an edit of a file GitHub deleted kept as a new file is saved by creating it with the draft's text", () => {
  const store = new DraftStore(memory());
  store.save(edit("notes.md", "old", "new text"));
  assert.equal(keepAsNewFile(store, scope, "notes.md"), true);
  assert.deepEqual(kinds(store), ["A notes.md"]);
  assert.deepEqual(publishFiles(listChanges(store.list(scope))), [{ path: "notes.md", baseSha: null, content: "new text" }]);
  // Only an edit with a base can be kept so.
  assert.equal(keepAsNewFile(store, scope, "notes.md"), false);
  assert.equal(keepAsNewFile(store, scope, "absent.md"), false);
});
