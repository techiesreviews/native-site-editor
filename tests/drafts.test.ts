import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftStore, type SavedDraft } from "../src/drafts.ts";
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
}
const draft: SavedDraft = { version: 1, account: "lex", repoId: 1, repo: "lex/site", branch: "main", path: "src/index.astro", baseSha: "a".repeat(40), original: "original", content: "draft", updatedAt: 1 };
test("drafts survive a fresh store and are isolated by account, repository ID and branch", () => {
  const disk = storage();
  const first = new DraftStore(disk);
  first.save(draft); first.release();
  const second = new DraftStore(disk);
  assert.equal(second.get(draft, draft.path)?.content, "draft");
  assert.equal(second.list({ ...draft, account: "someone-else" }).length, 0);
  assert.equal(second.list({ ...draft, repoId: 2 }).length, 0);
  assert.equal(second.list({ ...draft, branch: "experiment" }).length, 0);
  assert.equal(second.list({ ...draft, repo: "lex/renamed" }).length, 1);
});
test("discard removes a persisted draft; storage failures keep a recoverable in-memory copy", () => {
  const disk = storage(), store = new DraftStore(disk);
  store.save(draft);
  store.save({ ...draft, content: draft.original });
  assert.equal(new DraftStore(disk).list(draft).length, 0);
  disk.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(store.save(draft), false);
  assert.match(store.error!, /could not be saved/);
  assert.equal(store.get(draft, draft.path)?.content, "draft");
});
test("a draft written with GitHub's current text is dropped, whatever blob it began from; a deletion or an opaque file is kept", () => {
  const store = new DraftStore(storage());
  store.baseline = (_scope, path) => (path === draft.path ? "on GitHub now" : undefined);
  store.save(draft);
  assert.equal(store.list(draft).length, 1);
  // The base is stale (GitHub moved on), the text is GitHub's new version.
  store.save({ ...draft, content: "on GitHub now" });
  assert.equal(store.get(draft, draft.path), undefined);
  // A new file whose path GitHub has with the same text.
  store.save({ ...draft, baseSha: null, original: "", content: "on GitHub now" });
  assert.equal(store.get(draft, draft.path), undefined);
  store.save({ ...draft, deleted: true, content: "on GitHub now" });
  assert.equal(store.get(draft, draft.path)?.deleted, true);
  store.save({ ...draft, baseSha: null, opaque: true, content: "on GitHub now" });
  assert.equal(store.get(draft, draft.path)?.opaque, true);
});
