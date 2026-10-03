import test from "node:test";
import assert from "node:assert/strict";
import type { SavedDraft, DraftScope } from "../src/drafts";
import { mediaDraftTransaction } from "../src/page-builder/media-draft-transaction";
import { applyMediaWorkspaceBatch, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { memoryUploadBytes } from "../src/uploads";

function harness() {
  const scope: DraftScope = { account: "a", repoId: 1, repo: "a/r", branch: "main" };
  const records = new Map<string, SavedDraft>(), bytes = memoryUploadBytes();
  let current = true, undo: () => boolean = () => false, redo: () => boolean | Promise<boolean> = () => false;
  let fail = "", failAfterWrite = false;
  const store = { get: (_: DraftScope, path: string) => records.get(path), list: () => [...records.values()], error: "store failure",
    save: (record: SavedDraft) => { if (record.path === fail) { fail = ""; if (failAfterWrite) records.set(record.path, record); return false; } records.set(record.path, record); return true; },
    remove: (_: DraftScope, path: string) => { records.delete(path); return true; } };
  const host = { scope, store, bytes, assertLive: () => { if (!current) throw new Error("scope changed"); },
    paths: () => [...records.values()].filter(record => !record.deleted).map(record => record.path),
    source: (path: string) => records.get(path)?.content, assetVersion: (path: string) => records.get(path)?.sourceSha,
    entry: async () => undefined, mounted: () => false,
    prepareSources: () => ({ apply: () => true, undo: () => true, redo: () => true, isCurrent: () => true }),
    modelState: () => ({ isCurrent: () => true }), historyCurrent: () => true,
    history: (u: typeof undo, r: typeof redo) => { undo = u; redo = r; return true; }, refresh: () => {}, announce: () => {} };
  const batch: MediaWorkspaceBatch = { label: "images", expectedPaths: [], expectedSources: new Map([[".editor/media.json", undefined]]), expectedAssets: new Map(), edits: new Map([[".editor/media.json", '{"images":{}}']]), moves: [], deletes: [], uploads: [{ path: "images/a.png", blob: new Blob(["png"], { type: "image/png" }) }] };
  return { host, batch, records, bytes, undo: () => undo(), redo: () => redo(), stale: () => { current = false; }, fail: (path: string, after = false) => { fail = path; failAfterWrite = after; } };
}

test("metadata and upload undo together; redo restages swept bytes", async () => {
  const h = harness(); await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.records.size, 2); assert.equal(h.undo(), true); assert.equal(h.records.size, 0);
  h.bytes.map.clear(); assert.equal(await h.redo(), true); assert.equal(h.records.size, 2); assert.equal(h.bytes.map.size, 1);
});
test("scope change after byte staging removes only owned bytes without drafts", async () => {
  const h = harness(), put = h.bytes.put;
  h.bytes.put = async (key, blob) => { await put(key, blob); h.stale(); };
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /scope changed/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});
test("synchronous store failure restores metadata and drops staged bytes", async () => {
  const h = harness(); h.fail("images/a.png");
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /store failure/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});
test("changed own draft refuses undo without overwriting its replacement", async () => {
  const h = harness(); await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  const own = h.records.get(".editor/media.json")!, other = { ...own, content: "external" };
  h.records.set(own.path, other); assert.equal(h.undo(), false); assert.equal(h.records.get(own.path), other);
});
test("stale redo preserves original scope and creates no byte leak", async () => {
  const h = harness(); await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.undo(), true); h.bytes.map.clear(); h.stale();
  assert.equal(await h.redo(), false); assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});

test("a storage refusal after memory write rolls back its exact own record", async () => {
  const h = harness(); h.fail("images/a.png", true);
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /store failure/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});

test("rollback preserves a newer mounted source when its owned undo refuses", async () => {
  const h = harness();
  let source = "before";
  h.host.source = path => path === "index.html" ? source : h.records.get(path)?.content;
  h.host.mounted = path => path === "index.html";
  h.batch.expectedSources.set("index.html", "before"); h.batch.edits.set("index.html", "after");
  h.host.prepareSources = () => ({
    apply: () => { source = "after"; return true; },
    undo: () => false, redo: () => false, isCurrent: () => true,
  });
  const save = h.host.store.save;
  h.host.store.save = record => {
    if (record.path === "images/a.png") {
      source = "external";
      const own = h.records.get("index.html")!;
      h.records.set("index.html", { ...own, content: source });
      return false;
    }
    return save(record);
  };
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /store failure/);
  assert.equal(source, "external"); assert.equal(h.records.get("index.html")?.content, "external");
  assert.equal(h.records.size, 1); assert.equal(h.bytes.map.size, 0);
});

test("an affected file mounted during snapshot rejects before any writes", async () => {
  const h = harness(); let mounted = false;
  h.host.mounted = () => mounted;
  h.host.modelState = () => { const original = mounted; return { isCurrent: () => mounted === original }; };
  h.host.entry = async () => { mounted = true; return undefined; };
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /files changed/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});
test("newly mounted or changed cached affected models refuse both Undo and Redo", async () => {
  const h = harness(); let identity = 1, mounted = false;
  h.host.mounted = () => mounted;
  h.host.modelState = () => { const captured = identity; return { isCurrent: () => identity === captured }; };
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  mounted = true; assert.equal(h.undo(), false); assert.equal(h.records.size, 2);
  mounted = false; assert.equal(h.undo(), true); assert.equal(h.records.size, 0);
  identity++; assert.equal(await h.redo(), false); assert.equal(h.records.size, 0);
});
test("an initiating history host unmounted during preparation refuses all writes", async () => {
  const h = harness(); let hostCurrent = true;
  h.host.historyCurrent = () => hostCurrent;
  h.host.entry = async () => { hostCurrent = false; return undefined; };
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /files changed/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});
test("refused history registration rolls back exact own records and newly staged bytes", async () => {
  const h = harness(); h.host.history = () => false;
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /initiating editor changed/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0);
});
