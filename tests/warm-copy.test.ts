import { test } from "node:test";
import assert from "node:assert/strict";
import { asWarmCopy, forgetWarmCopy, onWarmCopyForgotten, MAX_TEXT_LENGTH, MAX_TREE_ENTRIES, provenTexts, readWarmCopy, warmFor, writeWarmCopy, type WarmCopy } from "../src/warm-copy.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";
import type { Repository, TreeEntry } from "../shared/types.ts";

// The site this browser showed last (TOOLS-242): kept whole, read back only when well formed, and its texts used
// only when they hash to their blob SHA at their path.
const HELLO = "hello\n", HELLO_SHA = "ce013625030ba8dba906f756967f9e9ca394464a"; // git hash-object of "hello\n"
const repo = { id: 7, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } } as Repository;
const blob = (path: string, sha: string): TreeEntry => ({ path, sha, mode: "100644", type: "blob" });
function copy(extra: Partial<WarmCopy> = {}): WarmCopy {
  const tree = [blob("index.html", HELLO_SHA), blob("style.css", "a".repeat(40))];
  return { login: "Lex", source: "https://editor.test/", repo, branch: "main",
    snapshot: { commit: "c".repeat(40), branch: "main", entries: tree, tree }, files: [{ path: "index.html", sha: HELLO_SHA, text: HELLO }], ...extra };
}

test("the copy round-trips and a new one replaces it; forgetting leaves none", async () => {
  const { factory } = fakeIndexedDB();
  assert.equal(await readWarmCopy(factory), undefined);
  await writeWarmCopy(copy(), factory);
  assert.deepEqual(await readWarmCopy(factory), copy());
  await writeWarmCopy(copy({ branch: "next", snapshot: { ...copy().snapshot, branch: "next" } }), factory);
  assert.equal((await readWarmCopy(factory))?.branch, "next");
  await forgetWarmCopy(factory);
  assert.equal(await readWarmCopy(factory), undefined);
});

test("a site past the limits, or an empty one, is not kept and forgets the last copy", async () => {
  const { factory } = fakeIndexedDB();
  await writeWarmCopy(copy(), factory);
  const huge = Array.from({ length: MAX_TREE_ENTRIES + 1 }, (_, index) => blob(`f${index}`, HELLO_SHA));
  await writeWarmCopy(copy({ snapshot: { ...copy().snapshot, tree: huge } }), factory);
  assert.equal(await readWarmCopy(factory), undefined);
  await writeWarmCopy(copy(), factory);
  await writeWarmCopy(copy({ files: [{ path: "index.html", sha: HELLO_SHA, text: "x".repeat(MAX_TEXT_LENGTH + 1) }] }), factory);
  assert.equal(await readWarmCopy(factory), undefined);
  await writeWarmCopy(copy(), factory);
  await writeWarmCopy(copy({ snapshot: { ...copy().snapshot, empty: true } }), factory);
  assert.equal(await readWarmCopy(factory), undefined);
});

test("storage that cannot open reads as none and writes nothing, without throwing", async () => {
  const blocked = fakeIndexedDB();
  blocked.state.openError = true;
  await writeWarmCopy(copy(), blocked.factory);
  assert.equal(await readWarmCopy(blocked.factory), undefined);
  const denied = { open() { throw new DOMException("Denied", "SecurityError"); } } as Pick<IDBFactory, "open">;
  assert.equal(await readWarmCopy(denied), undefined);
  await forgetWarmCopy(denied);
});

test("a malformed record reads as none", () => {
  assert.ok(asWarmCopy(copy()));
  for (const bad of [
    undefined, { ...copy(), login: "" }, { ...copy(), source: undefined }, { ...copy(), repo: { ...repo, id: "7" } },
    { ...copy(), branch: "other" }, { ...copy(), snapshot: { ...copy().snapshot, tree: undefined } }, { ...copy(), snapshot: { ...copy().snapshot, empty: true } },
    { ...copy(), files: [{ path: "index.html", sha: HELLO_SHA }] }, { ...copy(), files: "index.html" },
    { ...copy(), snapshot: { ...copy().snapshot, tree: [null] } }, { ...copy(), snapshot: { ...copy().snapshot, entries: [{ path: "index.html" }] } },
  ]) assert.equal(asWarmCopy(bad as Partial<WarmCopy> | undefined), undefined, JSON.stringify(bad)?.slice(0, 80));
});

test("the copy is for this boot only on the same account, editor, repository and branch", () => {
  const at = { login: "lex", source: "https://editor.test/", repoId: 7, branch: "main" };
  assert.equal(warmFor(copy(), at), true, "the login's case does not matter");
  assert.equal(warmFor(undefined, at), false);
  for (const other of [{ login: "sam" }, { source: "https://preview.test/" }, { repoId: 8 }, { branch: "next" }])
    assert.equal(warmFor(copy(), { ...at, ...other }), false, JSON.stringify(other));
});

test("texts are proven by their blob SHA at their path in the kept snapshot", async () => {
  const kept = copy({ files: [
    { path: "index.html", sha: HELLO_SHA, text: HELLO },
    // Damaged: the text no longer hashes to its SHA.
    { path: "style.css", sha: "a".repeat(40), text: "body{}" },
    // Not at this path in the snapshot.
    { path: "about.html", sha: HELLO_SHA, text: HELLO },
  ] });
  assert.deepEqual([...await provenTexts(kept)], [[HELLO_SHA, HELLO]]);
  const moved = copy({ snapshot: { ...copy().snapshot, tree: [blob("index.html", "b".repeat(40))] } });
  assert.equal((await provenTexts(moved)).size, 0);
});

test("after sign-out nothing is kept again in that storage: a late keep, a tab leaving", async () => {
  const { factory } = fakeIndexedDB();
  await writeWarmCopy(copy(), factory);
  await forgetWarmCopy(factory);
  await writeWarmCopy(copy(), factory);
  assert.equal(await readWarmCopy(factory), undefined);
  // Another storage (another test's, never the page's) keeps as before.
  const other = fakeIndexedDB().factory;
  await writeWarmCopy(copy(), other);
  assert.ok(await readWarmCopy(other));
});

test("sign-out in another tab: this page keeps nothing more in the page's storage", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const { factory } = fakeIndexedDB();
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: factory });
  try {
    await writeWarmCopy(copy());
    assert.ok(await readWarmCopy());
    const other = new BroadcastChannel("native-site-editor-warm-copy");
    other.postMessage("signed-out");
    other.close();
    // fixed-wait: the channel delivers on a later turn and nothing marks its arrival.
    await new Promise((done) => setTimeout(done, 50));
    await writeWarmCopy(copy({ branch: "next", snapshot: { ...copy().snapshot, branch: "next" } }));
    assert.equal(await readWarmCopy(), undefined, "hearing it removed the copy, and the later keep wrote nothing");
  } finally {
    if (saved) Object.defineProperty(globalThis, "indexedDB", saved);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("a keep still opening the storage when another tab signs out writes nothing; hearing it undoes a keep that raced it", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  let open!: () => void;
  const opening = new Promise<void>((done) => { open = done; });
  const { factory } = fakeIndexedDB(undefined, () => opening);
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: factory });
  try {
    const keep = writeWarmCopy(copy());
    const other = new BroadcastChannel("native-site-editor-warm-copy");
    other.postMessage("signed-out");
    other.close();
    // fixed-wait: the channel delivers on a later turn and nothing marks its arrival.
    await new Promise((done) => setTimeout(done, 50));
    open();
    await keep;
    assert.equal(await readWarmCopy(), undefined);
  } finally {
    if (saved) Object.defineProperty(globalThis, "indexedDB", saved);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("a kept time from the future counts as now; one that is not a time counts as none", () => {
  const future = asWarmCopy({ ...copy(), at: Date.now() + 3_600_000 });
  assert.ok(future?.at !== undefined && future.at <= Date.now());
  // A damaged record, as storage may hold one: its time is a word.
  const damaged: Partial<WarmCopy> = JSON.parse(JSON.stringify({ ...copy(), at: "soon" }));
  assert.equal(asWarmCopy(damaged)?.at, undefined);
  assert.equal(asWarmCopy({ ...copy(), at: 1234 })?.at, 1234);
});

test("after another context's version change closes the connection, the next keep opens the storage again", async () => {
  const fake = fakeIndexedDB();
  await writeWarmCopy(copy(), fake.factory);
  fake.versionChange();
  await writeWarmCopy(copy({ branch: "next", snapshot: { ...copy().snapshot, branch: "next" } }), fake.factory);
  assert.equal((await readWarmCopy(fake.factory))?.branch, "next");
});

test("sign-out notifications identify one account or all accounts and can be unsubscribed", async () => {
  const { factory } = fakeIndexedDB(), notices: unknown[] = [];
  const unsubscribe = onWarmCopyForgotten(notice => { notices.push(notice); });
  try {
    await forgetWarmCopy(factory, { login: "lex", all: false });
    await forgetWarmCopy(factory, { all: true });
    unsubscribe();
    await forgetWarmCopy(factory, { all: true });
    assert.deepEqual(notices, [{ login: "lex", all: false }, { all: true }]);
  } finally { unsubscribe(); }
});
