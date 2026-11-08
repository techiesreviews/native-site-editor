// Who changed each file, for the commit that saves it (ticket am-26): kept per draft key in this browser, settled by a
// save, forgotten with the draft.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSaveAuthors, type AuthorKeeper, type NotedAuthor } from "../src/save-authors";

const one = "a".repeat(40), two = "b".repeat(40);
/** One browser's IndexedDB, in memory: a reload makes a new list over the same one. */
function keeper(): AuthorKeeper & { kept: Map<string, NotedAuthor[]> } {
  const kept = new Map<string, NotedAuthor[]>();
  return { kept, read: async key => kept.get(key), write: (key, authors) => { if (authors) kept.set(key, authors); else kept.delete(key); } };
}
const names = async (authors: ReturnType<typeof createSaveAuthors>, key = "k", baseSha: string | null = one, account = "lex") =>
  (await authors.collect([{ key, baseSha }], account)).authors;

test("names are kept in this browser: a reload still names everyone, each once, never the one saving", async () => {
  const disk = keeper();
  const before = createSaveAuthors(disk);
  before.note("k", one, { name: "anna" });
  before.note("k", one, { name: "Anna" });
  before.note("k", one, { name: "Codex", agent: true });
  before.note("k", one, { name: "lex" });
  before.note("k", one, { name: "  " });
  await names(before);
  const after = createSaveAuthors(disk);
  assert.deepEqual(await names(after), [{ name: "anna" }, { name: "Codex", agent: true }]);
  // Noted again after the reload: the kept names stay.
  after.note("k", one, { name: "sam" });
  assert.deepEqual(await names(after), [{ name: "anna" }, { name: "Codex", agent: true }, { name: "sam" }]);
  after.forget("k");
  assert.deepEqual(await names(after), []);
  assert.deepEqual(await names(createSaveAuthors(disk)), [], "a draft gone: forgotten on disk too");
});

test("a save settles only what it sent: someone typing while it was on its way is named in the next commit", async () => {
  const authors = createSaveAuthors(keeper());
  authors.note("k", one, { name: "anna" });
  authors.note("k", one, { name: "sam" });
  const { authors: sent, sent: settle } = await authors.collect([{ key: "k", baseSha: one }], "lex");
  assert.deepEqual(sent, [{ name: "anna" }, { name: "sam" }]);
  // While the save is on its way, Sam types again and Bo for the first time.
  authors.note("k", one, { name: "sam" });
  authors.note("k", one, { name: "bo" });
  authors.settle(settle, new Map([["k", two]]));
  // The draft left over the saved blob holds Sam's and Bo's latest words.
  assert.deepEqual(await names(authors, "k", two), [{ name: "sam" }, { name: "bo" }]);
  assert.deepEqual(await names(authors, "k", one), [], "nothing counts over the old blob any more");
});

test("names noted over another version are not the draft's: someone else's save moved the file on", async () => {
  const authors = createSaveAuthors();
  authors.note("k", one, { name: "lex" });
  // Anna's tab: Lex saved, and her draft is over his commit's blob now.
  assert.deepEqual(await names(authors, "k", two, "anna"), []);
  authors.note("k", two, { name: "lex" });
  assert.deepEqual(await names(authors, "k", two, "anna"), [{ name: "lex" }], "noted again over the new version");
  assert.deepEqual(await names(authors, "other", one), [], "other files have their own");
});

test("this browser's tabs share the names: one tab's settle or note is not undone by another's", async () => {
  const disk = keeper();
  const a = createSaveAuthors(disk), b = createSaveAuthors(disk);
  a.note("k", one, { name: "anna" });
  await names(a);
  assert.deepEqual(await names(b), [{ name: "anna" }], "b reads what a noted");
  // B notes an agent connected in B; A, which read the file before, notes someone else: both stay.
  b.note("k", one, { name: "Codex", agent: true });
  await names(b);
  a.note("k", one, { name: "sam" });
  assert.deepEqual(await names(a), [{ name: "anna" }, { name: "Codex", agent: true }, { name: "sam" }]);
  // B saves and settles them all; A's next note does not bring them back.
  const { sent } = await b.collect([{ key: "k", baseSha: one }], "lex");
  b.settle(sent, new Map([["k", two]]));
  await names(b, "k", two);
  a.note("k", two, { name: "bo" });
  assert.deepEqual(await names(a, "k", two), [{ name: "bo" }]);
  assert.deepEqual(await names(a, "k", one), []);
});
