import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { applyAgentMedia } from "../src/agent-media-actions";
import type { AgentCommand } from "../shared/agent";
import { indexedDbAgentRecords } from "../src/agent-records";
import { DraftStore, draftDatabaseName, indexedDbDrafts, type DraftScope, type SavedDraft } from "../src/drafts";
import { mediaDraftTransaction, type MediaDraftHost } from "../src/page-builder/media-draft-transaction";
import { applyMediaWorkspaceBatch, type MediaWorkspaceContext, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { indexedDbUploadBytes, uploadKey, gitBlobSha, sweepUploads } from "../src/uploads";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";

const partial = <T>(value: Partial<T>): T => value as T;
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
};
let sequence = 0;
async function setup(t: TestContext, extraMedia: string[] = []) {
  const drafts = fakeIndexedDB(), uploads = fakeIndexedDB();
  let recordsTransactions = 0, byteDeletes = 0, stages = 0, writes = 0, steps = 0, refreshes = 0;
  let live = true, model = '<video src="media/film.mp4"></video>', afterCommit = () => {}, beforeCommit = () => {};
  let abortUpload = false;
  const events: string[] = [];
  const factory = partial<IDBFactory>({ open(name, version) {
    const request = (name === draftDatabaseName ? drafts : uploads).factory.open(name, version);
    let success: typeof request.onsuccess;
    Object.defineProperty(request, "onsuccess", { get: () => success, set(callback: typeof success) {
      success = event => {
        const db = request.result, transaction = db.transaction.bind(db);
        db.transaction = (names, mode, options) => {
          const tx = transaction(names, mode, options);
          if (mode === "readwrite" && typeof names !== "string" && [...names].includes("receipts") && [...names].includes("drafts")) {
            recordsTransactions++;
            events.push("records transaction");
            if (stages) assert.ok(uploads.stores.get("bytes")?.size, "bytes must be durable before the records transaction opens");
            beforeCommit();
            let complete: typeof tx.oncomplete;
            Object.defineProperty(tx, "oncomplete", { get: () => complete, set(value: typeof complete) {
              complete = event => { value?.call(tx, event); afterCommit(); };
            } });
          }
          if (name !== draftDatabaseName && mode === "readwrite" && abortUpload) {
            const objectStore = tx.objectStore.bind(tx);
            tx.objectStore = storeName => {
              const store = objectStore(storeName), put = store.put.bind(store);
              store.put = (...args) => {
                const written = put(...args);
                let handler: typeof written.onsuccess;
                Object.defineProperty(written, "onsuccess", { get: () => handler, set(value: typeof handler) {
                  handler = event => { value?.call(written, event); tx.abort(); };
                } });
                return written;
              };
              return store;
            };
          }
          return tx;
        };
        callback?.call(request, event);
      };
    } });
    return request;
  } });
  for (const [name, value] of Object.entries({ indexedDB: factory, IDBKeyRange: { bound: (lower: string, upper: string) => ({ lower, upper }) } })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  const scope: DraftScope = { account: `media-${++sequence}`, repoId: 1, repo: "lex/site", branch: "main" };
  const db = indexedDbDrafts(draftDatabaseName, factory);
  const store = new DraftStore(storage(), { ...db, write: changes => { writes++; return db.write(changes); } });
  await store.load(scope.account);
  const bytes = indexedDbUploadBytes();
  const observedBytes = { ...bytes, put: async (key: string, blob: Blob) => { stages++; await bytes.put(key, blob); events.push("bytes durable"); },
    delete: async (key: string) => { byteDeletes++; await bytes.delete(key); } };
  const base = new Map([["index.html", model]]), originalPaths = ["index.html", "media/film.mp4", ...extraMedia];
  const paths = () => [...new Set([...originalPaths, ...store.list(scope).filter(d => !d.deleted).map(d => d.path)])];
  const source = (path: string) => path === "index.html" ? model : store.get(scope, path)?.content ?? base.get(path);
  const assetVersion = (path: string) => { const draft = store.get(scope, path); return draft ? JSON.stringify(draft) : originalPaths.includes(path) ? "a".repeat(40) : undefined; };
  const host = {
    scope, store, bytes: observedBytes,
    stamp: { holds: () => live, changed: () => live ? undefined : "scope" as const }, paths, source, assetVersion,
    entry: async path => originalPaths.includes(path) ? { path, sha: "a".repeat(40), text: base.get(path) } : undefined,
    mounted: path => path === "index.html", modelState: () => ({ isCurrent: () => true }), evictModel: (_path, proof) => proof,
    historyCurrent: () => live,
    prepareSources(edits) {
      const before = model;
      let applied = false;
      return { isCurrent: () => model === (applied ? edits.find(edit => edit.path === "index.html")?.text ?? before : before),
        apply: () => { for (const edit of edits) model = edit.text; applied = true; events.push("sources"); return true; },
        undo: () => { model = before; return true; }, redo: () => true };
    },
    history: () => { steps++; return true; }, refresh: () => { refreshes++; }, announce() {},
  } satisfies MediaDraftHost;
  const context = {
    key: "media", scope, drafts: store, get paths() { return paths(); }, items: [{ path: "media/film.mp4", size: 10 }, ...extraMedia.map(path => ({ path, size: 10 }))],
    pages: ["index.html"], components: {}, history: true,
    flushTyping() {}, assertLive: () => { if (!live) throw new Error("Repository changed"); },
    read: async path => source(path), blob: async () => new Blob(["video"], { type: "video/mp4" }), assetVersion,
    applyBatch: batch => applyMediaWorkspaceBatch(batch, mediaDraftTransaction(host)), openPage: async () => {},
  } satisfies MediaWorkspaceContext;
  const command: AgentCommand = { id: "operation", grantId: "grant", operation: "write_subtitles", path: "", branch: "main", commit: "commit", content: "",
    state: "pending", createdAt: Date.now(), args: { file: "media/film.mp4", text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n" } };
  const records = indexedDbAgentRecords(draftDatabaseName, factory);
  const run = (input = command) => applyAgentMedia(context, input, () => { throw new Error("Unexpected placement"); });
  return { scope, store, bytes, records, command, context, host, drafts, uploads, events, run,
    counts: () => ({ recordsTransactions, byteDeletes, stages, writes, steps, refreshes }), model: () => model,
    beforeCommit: (action: () => void) => { beforeCommit = action; }, afterCommit: (action: () => void) => { afterCommit = action; },
    stale: () => { live = false; }, abortUpload: () => { abortUpload = true; } };
}

test("agent bytes complete before one records transaction, then publish without a second draft write; reload recovers all three", async t => {
  const f = await setup(t);
  const outcome = await f.run();
  assert.equal(f.counts().recordsTransactions, 1);
  assert.equal(f.counts().writes, 0);
  assert.equal(f.counts().steps, 1);
  assert.deepEqual(f.events.slice(0, 3), ["bytes durable", "records transaction", "sources"]);
  const receipt = await f.records.receipt(f.scope, "operation", "grant");
  assert.deepEqual(receipt?.outcome, outcome);
  assert.ok(!receipt!.payloadIdentity.includes("WEBVTT"));
  const loaded = new DraftStore(storage(), indexedDbDrafts(draftDatabaseName, f.drafts.factory));
  await loaded.load(f.scope.account);
  assert.equal(loaded.list(f.scope).length, 3);
  const upload = loaded.list(f.scope).find(draft => draft.upload)!;
  assert.ok(await indexedDbUploadBytes().get(uploadKey(f.scope, upload.sourceSha!)));
  assert.match(f.model(), /track/);
});

for (const failure of ["AbortError", "QuotaExceededError"]) test(`${failure} in records applies nothing and retains staged bytes`, async t => {
  const f = await setup(t), before = f.model();
  f.beforeCommit(() => { f.drafts.state.failPutAt = 2; f.drafts.state.failure = failure; });
  await assert.rejects(f.run(), /Nothing was changed; your drafts are as they were/);
  assert.deepEqual((await f.records.snapshot(f.scope)).drafts, []);
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
  assert.equal(f.model(), before);
  assert.equal(f.counts().steps, 0);
  assert.equal(f.counts().byteDeletes, 0);
  assert.equal((await f.bytes.keys()).length, 1);
  await sweepUploads(f.bytes, f.scope, f.store.list(f.scope));
  assert.equal((await f.bytes.keys()).length, 1, "a memory-only sweep has no durable orphan proof");
});

test("failed commit never deletes upload bytes referenced by another unsaved draft", async t => {
  const f = await setup(t);
  const sha = await gitBlobSha(new TextEncoder().encode(f.command.args!.text!));
  const draft: SavedDraft = { ...f.scope, version: 1, path: "files/unsaved.vtt", original: "", content: "", baseSha: null,
    opaque: true, upload: { type: "text/vtt", size: 1 }, sourceSha: sha, updatedAt: 1 };
  f.store.save(draft);
  await f.store.flush();
  await f.bytes.put(uploadKey(f.scope, sha), new Blob([f.command.args!.text!]));
  await f.records.cancel(f.scope, "operation", "grant");
  await assert.rejects(f.run(), /Nothing was changed/);
  assert.ok(await f.bytes.get(uploadKey(f.scope, sha)));
  assert.equal((await f.records.snapshot(f.scope)).drafts.length, 1);
  assert.equal(f.counts().byteDeletes, 0);
});

test("cancel before commit has no drafts, receipt, model or history changes", async t => {
  const f = await setup(t), before = f.model();
  await f.records.cancel(f.scope, "operation", "grant");
  await assert.rejects(f.run(), /Nothing was changed/);
  assert.deepEqual((await f.records.snapshot(f.scope)).drafts, []);
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
  assert.equal(f.model(), before);
  assert.equal(f.counts().steps, 0);
});

test("cancel after commit reports applied and leaves all drafts and bytes", async t => {
  const f = await setup(t);
  let cancelled: ReturnType<typeof f.records.cancel> | undefined;
  f.afterCommit(() => { cancelled = f.records.cancel(f.scope, "operation", "grant"); });
  assert.ok(await f.run());
  assert.equal((await cancelled)?.status, "applied");
  assert.equal((await f.records.snapshot(f.scope)).drafts.length, 3);
  assert.equal((await f.bytes.keys()).length, 1);
});

test("matching duplicate returns recorded outcome without staging; reused id refuses", async t => {
  const f = await setup(t), first = await f.run(), counts = f.counts();
  assert.deepEqual(await f.run(), first);
  assert.equal(f.counts().stages, counts.stages);
  assert.equal(f.counts().steps, counts.steps);
  await assert.rejects(f.run({ ...f.command, args: { ...f.command.args, text: "different" } }), /Nothing was changed/);
  assert.equal(f.counts().stages, counts.stages);
});

test("missing grantId refuses before staging; reads need no receipt", async t => {
  const f = await setup(t);
  await assert.rejects(f.run({ ...f.command, grantId: undefined }), /grantId/);
  await f.run({ ...f.command, grantId: undefined, operation: "adding_settings", args: {} });
  assert.equal(f.counts().stages, 0);
  assert.deepEqual((await f.records.snapshot(f.scope)).drafts, []);
});

test("empty change still records its outcome without history", async t => {
  const f = await setup(t);
  const command = { ...f.command, operation: "keep_media" as const, args: { files: ["media/film.mp4"] } };
  await f.run(command);
  const result = await f.run({ ...command, id: "empty" });
  assert.deepEqual((await f.records.receipt(f.scope, "empty", "grant"))?.outcome, result);
  assert.equal(f.counts().steps, 1);
});

test("editor moved on after durable commit settles draft memory and reports applied", async t => {
  const f = await setup(t);
  f.afterCommit(f.stale);
  assert.ok(await f.run());
  assert.equal(f.store.list(f.scope).length, 3);
  assert.equal(f.counts().steps, 0);
  assert.equal(f.counts().refreshes, 1);
});

test("byte request success followed by transaction abort is a failure", async t => {
  const f = await setup(t);
  f.abortUpload();
  await assert.rejects(f.run(), /Nothing was changed/);
  assert.equal(f.counts().recordsTransactions, 0);
  assert.equal(f.counts().steps, 0);
  assert.deepEqual(await f.bytes.keys(), []);
});

test("manual media still uses the original synchronous publish and draft persistence", async t => {
  const f = await setup(t);
  const batch: MediaWorkspaceBatch = { label: "Manual", expectedPaths: f.context.paths, expectedSources: new Map(), expectedAssets: new Map(),
    edits: new Map([["index.html", "manual"]]), moves: [], deletes: [], restores: [], uploads: [] };
  await f.context.applyBatch(batch);
  await f.store.flush();
  assert.equal(f.counts().recordsTransactions, 0);
  assert.equal(f.counts().writes, 1);
  assert.equal(f.counts().steps, 1);
  assert.equal(f.model(), "manual");
});

test("a newer unsaved draft than the mounted source refuses without staging or overwriting it", async t => {
  const f = await setup(t);
  f.store.save({ ...f.scope, version: 1, path: "index.html", baseSha: "a".repeat(40), original: f.model(), content: "newer manual", updatedAt: 1 });
  await assert.rejects(f.run(), /source changed/);
  assert.equal(f.store.get(f.scope, "index.html")?.content, "newer manual");
  assert.equal((await f.records.snapshot(f.scope)).drafts[0][1].content, "newer manual");
  assert.equal(f.counts().stages, 0);
  assert.equal(f.counts().steps, 0);
});

test("cancellation of a batch during upload staging leaves drafts and history untouched", async t => {
  const f = await setup(t), before = f.model();
  const put = f.host.bytes.put.bind(f.host.bytes);
  f.host.bytes.put = async (...args) => { await put(...args); f.stale(); };
  await assert.rejects(f.run(), /Nothing was changed/);
  assert.equal(f.counts().recordsTransactions, 0);
  assert.equal(f.counts().steps, 0);
  assert.equal(f.counts().byteDeletes, 0);
  assert.equal(f.model(), before);
  assert.equal(f.store.list(f.scope).length, 0);
  assert.equal((await f.bytes.keys()).length, 1);
});

test("Improve images requiring two batches refuses before draft or byte mutation", async t => {
  const f = await setup(t);
  const { readSource } = await import("../src/page-builder/source-tree");
  const text = new Map([["index.html", '<html><head><title>Home</title></head><body><img src="/images/heavy.jpg"></body></html>'],
    ["components/hero/hero.html", '<img src="/images/heavy.jpg">']]);
  const png = (length: number) => {
    const data = new Uint8Array(length), view = new DataView(data.buffer);
    data.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(16, 3000); view.setUint32(20, 2000);
    return new Blob([data], { type: "image/png" });
  };
  let mutations = 0;
  const context: MediaWorkspaceContext = { ...f.context, paths: [...text.keys(), "images/heavy.jpg"],
    items: [{ path: "images/heavy.jpg", size: 300000 }], components: { "hero-card": "components/hero/hero.html" },
    read: async path => text.get(path), blob: async () => png(300000), assetVersion: path => path,
    applyBatch: async () => { mutations++; } };
  const ports: import("../src/agent-improve-images").AgentImprovePorts = {
    sizes: async () => ({ width: 3000, height: 2000 }),
    heavy: { tree: source => readSource(source, { page: true }), encode: async () => ({ outputs: [
      { blob: png(1000), width: 1200, height: 800, extension: "webp" }], before: 300000, after: 1000 }) },
  };
  await assert.rejects(applyAgentMedia(context, { ...f.command, operation: "improve_images", args: {} },
    () => { throw new Error("Unexpected placement"); }, undefined, undefined, undefined, { context: async () => context }, ports), /more than one batch/);
  assert.equal(mutations, 0);
  assert.equal(f.counts().stages, 0);
  assert.equal(f.counts().steps, 0);
  assert.deepEqual((await f.records.snapshot(f.scope)).drafts, []);
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
});

test("adding settings reports the committed settings from its prepared batch", async t => {
  const f = await setup(t);
  const result = await f.run({ ...f.command, operation: "adding_settings", args: { image: "smaller" } });
  assert.equal(JSON.parse(result!.result.report).image, "smaller");
  assert.equal(JSON.parse(result!.result.report).isDefault, false);
  assert.deepEqual((await f.records.receipt(f.scope, "operation", "grant"))?.outcome, result);
  assert.equal(JSON.parse(f.store.get(f.scope, ".editor/media.json")!.content).adding.image, "smaller");
  assert.equal(f.counts().steps, 1);
});

test("buffered adding settings reports the prepared change and reset, and receipts replay that report after later changes", async t => {
  const f = await setup(t);
  const change: AgentCommand = { ...f.command, id: "settings-change", operation: "adding_settings", args: { image: "smaller", keepOriginal: true } };
  const changed = await f.run(change);
  assert.equal(JSON.parse(changed!.result.report).image, "smaller");
  assert.equal(JSON.parse(changed!.result.report).isDefault, false);
  assert.deepEqual((await f.records.receipt(f.scope, change.id, "grant"))?.outcome, changed);
  const reset = await f.run({ ...change, id: "settings-reset", args: { reset: true } });
  assert.equal(JSON.parse(reset!.result.report).isDefault, true);
  assert.equal(JSON.parse(reset!.result.report).keepOriginal, false);
  assert.deepEqual((await f.records.receipt(f.scope, "settings-reset", "grant"))?.outcome, reset);
  assert.equal(f.counts().steps, 2);
  assert.equal(f.counts().recordsTransactions, 2);
  assert.deepEqual(await f.run(change), changed);
  assert.equal(f.counts().steps, 2);
  assert.equal(f.counts().writes, 0);
});

test("a page draft another tab persisted after this tab read it refuses removal and keeps the image", async t => {
  const f = await setup(t, ["media/unused.png"]);
  // Another tab adds a use of the picture; this tab's memory has not heard (its notification is delayed).
  const other = new DraftStore(storage(), indexedDbDrafts(draftDatabaseName, f.drafts.factory));
  await other.load(f.scope.account);
  assert.ok(other.save({ ...f.scope, version: 1, path: "index.html", baseSha: "a".repeat(40), original: f.model(),
    content: `${f.model()}<img src="media/unused.png">`, updatedAt: Date.now() }));
  await other.flush();
  assert.equal(f.store.get(f.scope, "index.html"), undefined);
  await assert.rejects(f.run({ ...f.command, operation: "remove_media", args: { files: ["media/unused.png"] } }),
    /Nothing was changed; your drafts are as they were/);
  assert.equal(await f.records.receipt(f.scope, "operation", "grant"), undefined);
  const drafts = (await f.records.snapshot(f.scope)).drafts.map(([, record]) => record as SavedDraft);
  assert.deepEqual(drafts.map(draft => draft.path), ["index.html"]);
  assert.match(drafts[0].content, /unused\.png/);
  assert.equal(f.counts().steps, 0);
});


test("live media generation stays fenced when its owner is first built after takeover", async t => {
  const f = await setup(t);
  const before = await f.records.workspace(f.scope);
  await f.records.setGeneration(f.scope, before.generation, before.generation + 1);
  await assert.rejects(f.run({ ...f.command, ownerGeneration: before.generation }), /another.*tab|ownership|could not save|workspace or draft changed/i);
  assert.deepEqual(f.store.list(f.scope), []);
  assert.equal(f.counts().steps, 0);
  assert.equal(await f.records.receipt(f.scope, f.command.id, "grant"), undefined);
});
