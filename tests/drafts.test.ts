import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftStore, draftKey, indexedDbDrafts, memoryDrafts, type DraftDatabase, type SavedDraft } from "../src/drafts.ts";
import { githubScope, holdsDraftScope } from "../src/workspace-session.ts";
import { forEachAwait } from "./support/await-race.ts";
const loadRecovery = () => import("../src/drafts-recovery.ts");
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
test("signed in as \"Lex\", a draft saved as lex is still measured against GitHub's text (main.ts's baseline rule)", () => {
  const store = new DraftStore(storage()), shown = githubScope({ ...draft, account: "Lex" });
  store.baseline = (scope, path) => (holdsDraftScope(shown, scope) && path === draft.path ? "on GitHub now" : undefined);
  store.save(draft);
  assert.equal(store.list({ ...draft, account: "Lex" }).length, 1);
  store.save({ ...draft, content: "on GitHub now" });
  assert.equal(store.get(draft, draft.path), undefined);
  // Another account's draft is never measured against this tab's text.
  store.save({ ...draft, account: "someone-else", content: "on GitHub now" });
  assert.equal(store.list({ ...draft, account: "someone-else" }).length, 1);
});
test("recovery code loads only when legacy records exist", async () => {
  const disk = storage(), db = memoryDrafts();
  await db.write([[draftKey(draft, draft.path), draft]]);
  let calls = 0;
  const recovery = () => { calls++; return loadRecovery(); };
  const store = new DraftStore(disk, db);
  await store.load("lex", recovery);
  assert.equal(calls, 0);
  assert.deepEqual(store.get(draft, draft.path), draft);
  disk.setItem("astro-site-editor:draft:v1:damaged", "{");
  await store.load("lex", recovery);
  assert.equal(calls, 1);
  assert.deepEqual(store.get(draft, draft.path), draft);
});
test("a failed recovery import keeps database drafts visible and legacy bytes stored", async () => {
  const disk = storage(), db = memoryDrafts(), key = draftKey(draft, draft.path);
  await db.write([[key, draft]]);
  const legacy = { ...draft, path: "legacy.txt" }, legacyKey = draftKey(legacy, legacy.path);
  const raw = JSON.stringify(legacy);
  disk.setItem(legacyKey, raw);
  const store = new DraftStore(disk, db);
  await store.load("lex", () => Promise.reject(new Error("Failed to fetch dynamically imported module")));
  assert.deepEqual(store.get(draft, draft.path), draft);
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  assert.equal(disk.getItem(legacyKey), raw);
  store.save({ ...draft, content: "after failed import", updatedAt: 2 });
  await store.flush();
  assert.equal(db.map.get(key)?.content, "after failed import");
  assert.equal(disk.getItem(legacyKey), raw);
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
  await store.load("Lex", loadRecovery);
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
  await store.load("lex", loadRecovery);
  assert.equal(store.get(draft, draft.path)?.content, "draft");
  store.save({ ...draft, content: "later" });
  assert.equal(JSON.parse(disk.getItem(draftKey(draft, draft.path))!).content, "later");
});
for (const badAt of [0, 1, 2, 3]) test(`a damaged legacy draft at position ${badAt} never hides healthy drafts`, async () => {
  const disk = storage(), db = memoryDrafts();
  const healthy = [draft, { ...draft, path: "src/about.astro" }, { ...draft, account: "someone-else", content: "theirs" }];
  const damagedKey = "astro-site-editor:draft:v1:damaged";
  const records = healthy.map(value => [draftKey(value, value.path), JSON.stringify(value)]);
  records.splice(badAt, 0, [damagedKey, "{"]);
  for (const [key, value] of records) disk.setItem(key, value);
  for (const account of ["lex", "lex", "someone-else"]) {
    const store = new DraftStore(disk, db);
    await store.load(account, loadRecovery);
    const expected = healthy.filter(value => value.account === account).sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(store.list({ ...draft, account }), expected);
    assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
    assert.equal(disk.getItem(damagedKey), "{");
    assert.equal(db.map.size, 3);
    assert.equal(disk.length, 1);
  }
});
test("an invalid legacy record stays stored and reports incomplete recovery", async () => {
  const disk = storage(), db = memoryDrafts();
  disk.setItem("astro-site-editor:draft:v1:invalid", JSON.stringify({ version: 1 }));
  new DraftStore(disk).save(draft);
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  assert.deepEqual(store.list(draft), [draft]);
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  store.save({ ...draft, content: "later" });
  await store.flush();
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  assert.equal(disk.getItem("astro-site-editor:draft:v1:invalid"), JSON.stringify({ version: 1 }));
});
for (const failAt of ["read", "key", "length"] as const) test(`a legacy ${failAt} failure retains accessible recovery and durable saving`, async () => {
  const disk = storage(), db = memoryDrafts();
  const other = { ...draft, path: "src/about.astro" };
  new DraftStore(disk).save(draft);
  new DraftStore(disk).save(other);
  const getItem = disk.getItem, key = disk.key;
  let failing = true;
  if (failAt === "read") disk.getItem = name => {
    if (failing && name === draftKey(draft, draft.path)) throw new Error("Unreadable record");
    return getItem(name);
  };
  if (failAt === "key") disk.key = index => {
    if (failing && index === 0) throw new Error("Unreadable key");
    return key(index);
  };
  if (failAt === "length") Object.defineProperty(disk, "length", { get() {
    if (failing) throw new Error("Unreadable storage length");
    return [draft, other].filter(value => getItem(draftKey(value, value.path)) !== null).length;
  } });
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  // Direct reads remain available even while enumeration is broken.
  assert.equal(store.get(other, other.path)?.content, other.content);
  failing = false;
  assert.equal(store.get(draft, draft.path)?.content, draft.content);
  assert.deepEqual(store.list(draft).map(value => value.path), [other.path, draft.path]);
  store.save({ ...other, content: "later" });
  await store.flush();
  assert.equal(db.map.get(draftKey(other, other.path))?.content, "later");
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  store.remove(draft, draft.path);
  await store.flush();
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  const again = new DraftStore(disk, db);
  await again.load("lex", loadRecovery);
  assert.equal(again.get(other, other.path)?.content, "later");
});
for (const failAt of ["get", "write", "load"] as const) test(`database ${failAt} failure keeps legacy bytes and later edits local`, async () => {
  const disk = storage(), db = memoryDrafts();
  new DraftStore(disk).save(draft);
  const store = new DraftStore(disk, { ...db, async [failAt]() { throw new Error("Database unavailable"); } });
  await store.load("lex", loadRecovery);
  assert.equal(store.get(draft, draft.path)?.content, draft.content);
  assert.equal(store.save({ ...draft, content: "later" }), true);
  assert.equal(JSON.parse(disk.getItem(draftKey(draft, draft.path))!).content, "later");
  const again = new DraftStore(disk, db);
  await again.load("lex", loadRecovery);
  assert.equal(again.get(draft, draft.path)?.content, "later");
});
test("restored legacy access reveals a newer local copy beside healthy database drafts", async () => {
  const disk = storage(), db = memoryDrafts();
  const other = { ...draft, path: "database-only.txt" };
  await db.write([[draftKey(draft, draft.path), draft], [draftKey(other, other.path), other]]);
  new DraftStore(disk).save({ ...draft, content: "newer local copy", updatedAt: 5 });
  const getItem = disk.getItem;
  disk.getItem = () => { throw new Error("Storage temporarily unreadable"); };
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  assert.equal(store.get(other, other.path)?.content, other.content);
  disk.getItem = getItem;
  assert.equal(store.get(draft, draft.path)?.content, "newer local copy");
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  store.save({ ...draft, content: "later edit", updatedAt: 6 });
  await store.flush();
  assert.equal(disk.getItem(draftKey(draft, draft.path)), null);
  assert.equal(db.map.get(draftKey(draft, draft.path))?.content, "later edit");
  const again = new DraftStore(disk, db);
  await again.load("lex", loadRecovery);
  assert.equal(again.get(draft, draft.path)?.content, "later edit");
  assert.equal(again.get(other, other.path)?.content, other.content);
  assert.equal(again.error, null);
});
test("incomplete recovery never reports a successful new draft as a failed write", async () => {
  const disk = storage(), db = memoryDrafts();
  disk.setItem("astro-site-editor:draft:v1:damaged", "{");
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  assert.equal(store.save(draft), true);
  await store.flush();
  assert.equal(store.error, null);
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
});
test("fully unavailable localStorage does not prevent working database saving", async () => {
  const disk: Storage = new Proxy({} as Storage, { get() { throw new Error("Storage unavailable"); } });
  const db = memoryDrafts(), store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  assert.equal(store.save(draft), true);
  await store.flush();
  assert.deepEqual(db.map.get(draftKey(draft, draft.path)), draft);
  assert.equal(store.error, null);
});
for (const release of [false, true]) test(`discarding an unreadable legacy and database draft survives reload (release ${release})`, async () => {
  const disk = storage(), db = memoryDrafts();
  await db.write([[draftKey(draft, draft.path), draft]]);
  const getItem = disk.getItem;
  disk.setItem(draftKey(draft, draft.path), JSON.stringify(draft));
  disk.getItem = () => { throw new Error("Legacy storage temporarily unreadable"); };
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  assert.deepEqual(store.get(draft, draft.path), draft);
  assert.equal(store.remove(draft, draft.path), true);
  if (release) store.release();
  await store.flush();
  disk.getItem = getItem;
  const again = new DraftStore(disk, db);
  await again.load("lex", loadRecovery);
  assert.equal(again.get(draft, draft.path), undefined);
});
test("failed legacy cleanup reports a discard failure without resurrecting the discarded draft", async () => {
  const disk = storage(), db = memoryDrafts(), key = draftKey(draft, draft.path);
  disk.setItem(key, JSON.stringify(draft));
  const getItem = disk.getItem, removeItem = disk.removeItem;
  disk.getItem = () => { throw new Error("Temporarily unreadable"); };
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  disk.getItem = getItem;
  disk.removeItem = () => { throw new Error("Removal denied"); };
  store.remove(draft, draft.path);
  await store.flush();
  assert.match(store.error!, /older draft may reappear/);
  assert.equal(disk.getItem(key), JSON.stringify(draft));
  const again = new DraftStore(disk, db);
  await again.load("lex", loadRecovery);
  assert.equal(again.get(draft, draft.path), undefined);
  assert.deepEqual(again.list(draft), []);
  disk.removeItem = removeItem;
  store.remove(draft, draft.path);
  await store.flush();
  assert.equal(store.error, null);
  assert.equal(disk.getItem(key), null);
});
test("invalid fallback records report incomplete recovery without deleting their bytes", () => {
  const disk = storage(), key = draftKey(draft, draft.path), raw = JSON.stringify({ version: 1 });
  disk.setItem(key, raw);
  const store = new DraftStore(disk);
  assert.equal(store.get(draft, draft.path), undefined);
  assert.match(store.recoveryNotice!, /Some drafts could not be recovered/);
  assert.equal(disk.getItem(key), raw);
});
for (const phase of ["migration", "flush"] as const) test(`legacy cleanup preserves another tab's newer fallback draft across every ${phase} await`, async () => {
  const count = await forEachAwait(race => {
    const disk = storage(), db = memoryDrafts(), key = draftKey(draft, draft.path);
    disk.setItem("astro-site-editor:draft:v1:unreadable", "{");
    const getItem = disk.getItem;
    disk.getItem = name => {
      if (name.endsWith(":unreadable")) throw new Error("Unreadable record");
      return getItem(name);
    };
    if (phase === "migration") disk.setItem(key, JSON.stringify(draft));
    const store = new DraftStore(disk, {
      ...db,
      get: phase === "migration" ? race.port("get", name => db.get(name)) : name => db.get(name),
      load: phase === "migration" ? race.port("load", from => db.load(from)) : from => db.load(from),
      write: race.port("write", changes => db.write(changes)),
    });
    const done = store.load("lex", loadRecovery).then(async () => {
      if (phase === "flush") {
        disk.setItem(key, JSON.stringify(draft));
        store.save({ ...draft, content: "database edit", updatedAt: 2 });
        await store.flush();
      }
    });
    return { done, disk, db, key };
  }, run => {
    new DraftStore(run.disk).save({ ...draft, content: "newer from another tab", updatedAt: 3 });
  }, async run => {
    assert.equal(JSON.parse(run.disk.getItem(run.key)!).content, "newer from another tab");
    const again = new DraftStore(run.disk, run.db);
    await again.load("lex", loadRecovery);
    assert.equal(again.get(draft, draft.path)?.content, "newer from another tab");
  });
  assert.ok(count > 0);
});
test("discard cleanup preserves a newer fallback edit queued before the flush starts", async () => {
  const disk = storage(), db = memoryDrafts(), key = draftKey(draft, draft.path);
  disk.setItem("astro-site-editor:draft:v1:unreadable", "{");
  const getItem = disk.getItem;
  disk.getItem = name => {
    if (name.endsWith(":unreadable")) throw new Error("Unreadable record");
    return getItem(name);
  };
  const store = new DraftStore(disk, db);
  await store.load("lex", loadRecovery);
  store.remove(draft, draft.path);
  new DraftStore(disk).save({ ...draft, content: "newer before flush", updatedAt: Date.now() + 1 });
  await store.flush();
  assert.equal(JSON.parse(disk.getItem(key)!).content, "newer before flush");
  const again = new DraftStore(disk, db);
  await again.load("lex", loadRecovery);
  assert.equal(again.get(draft, draft.path)?.content, "newer before flush");
});
test("another tab cleaning up the same legacy copy is not incomplete recovery", async () => {
  await forEachAwait(race => {
    const disk = storage(), db = memoryDrafts(), key = draftKey(draft, draft.path);
    disk.setItem(key, JSON.stringify(draft));
    const store = new DraftStore(disk, {
      get: race.port("get", name => db.get(name)), load: race.port("load", from => db.load(from)),
      write: race.port("write", changes => db.write(changes)),
    });
    return { done: store.load("lex", loadRecovery), disk, key, store };
  }, run => run.disk.removeItem(run.key), run => {
    assert.deepEqual(run.store.get(draft, draft.path), draft);
    assert.equal(run.store.recoveryNotice, null);
  });
});
test("once loaded, writes go through to the database shortly after, coalesced, and survive a fresh store", async () => {
  const disk = storage(), db = memoryDrafts();
  let writes = 0;
  const counted: DraftDatabase = { ...db, write: (changes) => { writes++; return db.write(changes); } };
  const store = new DraftStore(disk, counted);
  await store.load("lex", loadRecovery);
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
  await again.load("lex", loadRecovery);
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
  await store.load("lex", loadRecovery);
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
  await one.load("lex", loadRecovery);
  await two.load("lex", loadRecovery);
  one.save(draft);
  await one.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(two.get(draft, draft.path)?.content, "draft");
  one.remove(draft, draft.path);
  await one.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(two.get(draft, draft.path), undefined);
});

test("indexedDbDrafts upgrades v1 without recreating drafts or losing the manual editor's records", async (t) => {
  // This small upgrade/read fixture starts with the v1 store; transactions are read-only here.
  const partial = <T>(value: Partial<T>): T => value as T;
  const stores = new Map<string, Map<string, SavedDraft>>([["drafts", new Map([[draftKey(draft, draft.path), structuredClone(draft)]])]]);
  const event = new Event("success");
  const result = <T>(value: T) => {
    const request = partial<IDBRequest<T>>({ result: structuredClone(value) });
    queueMicrotask(() => request.onsuccess?.call(request, event));
    return request;
  };
  const factory = partial<IDBFactory>({ open(_name, version) {
    assert.equal(version, 2);
    const db = partial<IDBDatabase>({
      objectStoreNames: partial<DOMStringList>({ contains: (name) => stores.has(name) }),
      createObjectStore(name) {
        assert.equal(stores.has(name), false);
        stores.set(name, new Map()); return partial<IDBObjectStore>({});
      },
      transaction(name) {
        const rows = stores.get(String(name))!;
        return partial<IDBTransaction>({ objectStore: () => partial<IDBObjectStore>({
          get: (key) => result(rows.get(String(key))),
          getAll: () => result([...rows.values()]),
          getAllKeys: () => result([...rows.keys()]),
        }) });
      },
    });
    const request = partial<IDBOpenDBRequest>({ result: db });
    queueMicrotask(() => { request.onupgradeneeded?.call(request, partial<IDBVersionChangeEvent>({ oldVersion: 1 })); request.onsuccess?.call(request, event); });
    return request;
  } });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "IDBKeyRange");
  Object.defineProperty(globalThis, "IDBKeyRange", { configurable: true, value: { bound: () => ({}) } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "IDBKeyRange", descriptor); else Reflect.deleteProperty(globalThis, "IDBKeyRange"); });
  const db = indexedDbDrafts("upgrade-drafts", factory), store = new DraftStore(storage(), db);
  assert.deepEqual(await db.get(draftKey(draft, draft.path)), draft);
  await store.load("lex", loadRecovery);
  assert.deepEqual(store.get(draft, draft.path), draft);
  assert.deepEqual([...stores.keys()], ["drafts", "receipts", "workspaces", "conversations"]);
});
