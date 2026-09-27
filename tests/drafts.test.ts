import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftStore, draftKey, memoryDrafts, type DraftDatabase, type SavedDraft } from "../src/drafts.ts";
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
test("load moves localStorage drafts into the database, then removes them; the newer copy wins", async () => {
  const disk = storage(), db = memoryDrafts();
  const legacy = new DraftStore(disk);
  legacy.save(draft);
  legacy.save({ ...draft, path: "src/about.astro", content: "old", updatedAt: 1 });
  legacy.save({ ...draft, account: "someone-else", content: "theirs" });
  disk.setItem("astro-site-editor:draft:v1:damaged", "{");
  await db.write([[draftKey(draft, "src/about.astro"), { ...draft, path: "src/about.astro", content: "newer", updatedAt: 5 }]]);
  const store = new DraftStore(disk, db);
  await store.load("Lex");
  assert.deepEqual(store.list(draft).map((value) => [value.path, value.content]), [["src/about.astro", "newer"], ["src/index.astro", "draft"]]);
  // Every account's drafts moved; only the signed-in one's are in memory.
  assert.equal(store.list({ ...draft, account: "someone-else" }).length, 0);
  assert.equal(db.map.get(draftKey({ ...draft, account: "someone-else" }, draft.path))?.content, "theirs");
  assert.equal(disk.length, 1);
  assert.equal(disk.getItem("astro-site-editor:draft:v1:damaged"), "{");
});
test("a failing database keeps drafts in localStorage", async () => {
  const disk = storage();
  new DraftStore(disk).save(draft);
  const store = new DraftStore(disk, { ...memoryDrafts(), async write() { throw new Error("blocked"); } });
  await store.load("lex");
  assert.equal(store.get(draft, draft.path)?.content, "draft");
  store.save({ ...draft, content: "later" });
  assert.equal(JSON.parse(disk.getItem(draftKey(draft, draft.path))!).content, "later");
});
test("once loaded, writes go through to the database shortly after, coalesced, and survive a fresh store", async () => {
  const disk = storage(), db = memoryDrafts();
  let writes = 0;
  const counted: DraftDatabase = { ...db, write: (changes) => { writes++; return db.write(changes); } };
  const store = new DraftStore(disk, counted);
  await store.load("lex");
  const big = "x".repeat(900 * 1024);
  for (let i = 0; i < 8; i++) assert.equal(store.save({ ...draft, path: `big-${i}.txt`, content: big + i }), true);
  store.save({ ...draft, content: "draft 2" });
  // Read at once from memory; nothing touched localStorage.
  assert.equal(store.list(draft).length, 9);
  assert.equal(disk.length, 0);
  await store.flush();
  assert.equal(writes, 1);
  store.remove(draft, "big-0.txt");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(writes, 2);
  store.release();
  assert.equal(store.list(draft).length, 0);
  const again = new DraftStore(disk, db);
  await again.load("lex");
  assert.equal(again.list(draft).length, 8);
  assert.equal(again.get(draft, draft.path)?.content, "draft 2");
  assert.equal(again.get(draft, "big-0.txt"), undefined);
});
test("a write the database refuses sets the error, the rest still commit, and the next write retries it", async () => {
  const db = memoryDrafts();
  let full = true;
  const store = new DraftStore(storage(), {
    ...db,
    write: (changes) => full && changes.some(([, value]) => value?.content === "huge")
      ? Promise.reject(new DOMException("full", "QuotaExceededError")) : db.write(changes),
  });
  const errors: string[] = [];
  store.onError = (message) => errors.push(message);
  await store.load("lex");
  store.save({ ...draft, content: "huge" });
  store.save({ ...draft, path: "small.txt" });
  await store.flush();
  assert.match(store.error!, /could not be saved in this browser/);
  assert.equal(errors.length, 1);
  assert.equal(db.map.get(draftKey(draft, "small.txt"))?.content, "draft");
  assert.equal(store.get(draft, draft.path)?.content, "huge");
  assert.equal(store.save({ ...draft, path: "other.txt" }), false);
  full = false;
  await store.flush();
  assert.equal(store.error, null);
  assert.equal(db.map.get(draftKey(draft, draft.path))?.content, "huge");
});
test("another tab's committed drafts are read again", async () => {
  const db = memoryDrafts();
  const one = new DraftStore(storage(), db), two = new DraftStore(storage(), db);
  one.announce = (keys) => void two.refresh(keys);
  await one.load("lex");
  await two.load("lex");
  one.save(draft);
  await one.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(two.get(draft, draft.path)?.content, "draft");
  one.remove(draft, draft.path);
  await one.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(two.get(draft, draft.path), undefined);
});
