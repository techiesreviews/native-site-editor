import test from "node:test";
import assert from "node:assert/strict";
import { DraftStore, type SavedDraft, type DraftScope } from "../src/drafts";
import { createGuardedEdits, type Stamp } from "../src/guarded-edit";
import { createMemoryWorkspace, deferred } from "./fakes/memory-workspace";
import { mediaDraftTransaction, type MediaDraftHost } from "../src/page-builder/media-draft-transaction";
import { applyMediaWorkspaceBatch, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { memoryUploadBytes, uploadKey } from "../src/uploads";
import { createMediaHistoryHome } from "../src/page-builder/media-history-home";

function harness(stamp?: Stamp) {
  const scope: DraftScope = { account: "a", repoId: 1, repo: "a/r", branch: "main" };
  const records = new Map<string, SavedDraft>(), bytes = memoryUploadBytes();
  let current = true, steps = 0, undo: () => boolean = () => false, redo: () => boolean | Promise<boolean> = () => false;
  let fail = "", failAfterWrite = false;
  const store = { get: (_: DraftScope, path: string) => records.get(path), list: () => [...records.values()], error: "store failure",
    save: (record: SavedDraft) => { if (record.path === fail) { fail = ""; if (failAfterWrite) records.set(record.path, record); return false; } records.set(record.path, record); return true; },
    remove: (_: DraftScope, path: string) => { records.delete(path); return true; } };
  const host: MediaDraftHost = { scope, store, bytes, stamp: stamp ?? { holds: () => current, changed: () => current ? undefined : "scope" as const },
    paths: () => [...records.values()].filter(record => !record.deleted).map(record => record.path),
    source: (path: string) => records.get(path)?.content, assetVersion: (path: string) => records.get(path)?.sourceSha,
    entry: async () => undefined, mounted: () => false,
    prepareSources: () => ({ apply: () => true, undo: () => true, redo: () => true, isCurrent: () => true }),
    modelState: () => ({ isCurrent: () => true }), evictModel: (_: string, proof: { isCurrent(): boolean }) => proof.isCurrent() ? proof : undefined, historyCurrent: () => true,
    history: (u: typeof undo, r: typeof redo) => { steps++; undo = u; redo = r; return true; }, refresh: () => {}, announce: () => {} } satisfies MediaDraftHost;
  const batch: MediaWorkspaceBatch = { label: "images", expectedPaths: [], expectedSources: new Map([[".editor/media.json", undefined]]), expectedAssets: new Map(), edits: new Map([[".editor/media.json", '{"version":2,"collections":[],"files":{"images":{}}}']]), moves: [], deletes: [], restores: [], uploads: [{ path: "images/a.png", blob: new Blob(["png"], { type: "image/png" }) }] };
  return { host, batch, records, bytes, steps: () => steps, undo: () => undo(), redo: () => redo(), stale: () => { current = false; }, fail: (path: string, after = false) => { fail = path; failAfterWrite = after; } };
}

test("restore an existing blob without upload; Undo/Redo owns one step", async () => {
  const h = harness();
  h.batch.uploads = []; h.batch.edits.clear(); h.batch.expectedSources.clear();
  h.batch.restores = [{ path: "images/a.png", sha: "old-blob" }];
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  const restored = h.records.get("images/a.png")!;
  assert.equal(restored.baseSha, null); assert.equal(restored.sourceSha, "old-blob");
  assert.equal(restored.opaque, true); assert.equal(restored.upload, undefined);
  assert.equal(h.bytes.map.size, 0); assert.equal(h.steps(), 1);
  assert.equal(h.undo(), true); assert.equal(h.records.size, 0);
  assert.equal(await h.redo(), true); assert.equal(h.records.get("images/a.png"), restored);
});

test("restore before saving drops the matching deletion; Undo/Redo brings it back", async () => {
  const h = harness();
  const deletion: SavedDraft = { ...h.host.scope, version: 1, path: "images/a.png", baseSha: "old-blob", original: "", content: "", deleted: true, updatedAt: 1 };
  h.records.set(deletion.path, deletion);
  h.batch.uploads = []; h.batch.edits.clear(); h.batch.expectedSources.clear();
  h.batch.restores = [{ path: deletion.path, sha: "old-blob" }];
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.records.get(deletion.path), undefined);
  assert.equal(h.undo(), true); assert.equal(h.records.get(deletion.path), deletion);
  assert.equal(await h.redo(), true); assert.equal(h.records.get(deletion.path), undefined);
});

test("a moved-away deletion or another blob refuses a restore without partial edits", async () => {
  for (const movedTo of [undefined, "elsewhere.png"]) {
    const h = harness();
    const deletion: SavedDraft = { ...h.host.scope, version: 1, path: "images/a.png", baseSha: movedTo ? "old-blob" : "different", original: "", content: "", deleted: true, movedTo, updatedAt: 1 };
    h.records.set(deletion.path, deletion);
    h.batch.uploads = []; h.batch.restores = [{ path: deletion.path, sha: "old-blob" }];
    await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /already exists/);
    assert.equal(h.records.get(deletion.path), deletion); assert.equal(h.records.size, 1); assert.equal(h.steps(), 0);
  }
});

test("a metadata change with no page open applies and undoes", async () => {
  const h = harness(), home = createMediaHistoryHome();
  h.batch.uploads = [];
  const previous: SavedDraft = { ...h.host.scope, version: 1, path: ".editor/media.json", baseSha: null, original: "", content: '{"version":2,"collections":[],"files":{}}', updatedAt: 1 };
  h.records.set(previous.path, previous);
  h.batch.expectedPaths = [previous.path];
  h.batch.expectedSources.set(previous.path, previous.content);
  h.host.historyCurrent = () => h.host.stamp.holds();
  h.host.history = (undo, redo) => home.hold("site", undo, redo);
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.records.get(previous.path)?.content, h.batch.edits.get(previous.path));
  assert.notEqual(h.records.get(previous.path), previous);
  let undo: () => boolean | Promise<boolean> = () => false, redo: typeof undo = () => false, steps = 0;
  home.adopt("site", (u, r) => { undo = u; redo = r; steps++; return true; });
  assert.equal(steps, 1);
  assert.equal(await undo(), true);
  assert.equal(h.records.get(previous.path), previous);
  assert.equal(await redo(), true);
  assert.equal(h.records.get(previous.path)?.content, h.batch.edits.get(previous.path));
});

test("metadata and upload undo together; redo restages swept bytes", async () => {
  const h = harness(); await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.records.size, 2); assert.equal(h.undo(), true); assert.equal(h.records.size, 0);
  h.bytes.map.clear(); assert.equal(await h.redo(), true); assert.equal(h.records.size, 2); assert.equal(h.bytes.map.size, 1);
});
test("scope change after byte staging removes only owned bytes without drafts", async () => {
  const h = harness(), put = h.bytes.put.bind(h.bytes);
  h.bytes.put = async (key, blob) => { await put(key, blob); h.stale(); };
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /repository changed/);
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
  const save = h.host.store.save.bind(h.host.store);
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

for (const phase of ["apply", "undo", "redo"]) test(`refresh ${phase} cannot adopt an unrelated model version`, async () => {
  const h = harness(); let version = 1, refreshes = 0;
  h.host.modelState = () => { const captured = version; return { isCurrent: () => version === captured }; };
  h.host.refresh = () => { if (++refreshes === (phase === "apply" ? 1 : phase === "undo" ? 2 : 3)) version++; };
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  if (phase === "apply") { assert.equal(h.undo(), false); assert.equal(h.records.size, 2); }
  else { assert.equal(h.undo(), true); if (phase === "undo") { assert.equal(await h.redo(), false); assert.equal(h.records.size, 0); }
    else { assert.equal(await h.redo(), true); assert.equal(h.undo(), false); assert.equal(h.records.size, 2); } }
});

test("a verified own cached-model eviction advances only that path's proof", async () => {
  const h = harness(), models = new Map<string, object>([[".editor/media.json", {}]]);
  h.host.modelState = path => { const captured = models.get(path); return { isCurrent: () => models.get(path) === captured }; };
  h.host.evictModel = (path, proof) => {
    if (!proof.isCurrent()) return undefined;
    models.delete(path);
    return h.host.modelState(path);
  };
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(models.has(".editor/media.json"), false);
  assert.equal(h.undo(), true); assert.equal(await h.redo(), true);
  models.set("images/a.png", {});
  assert.equal(h.undo(), false); assert.equal(h.records.size, 2);
});


test("a repository switch during the media workspace load writes nothing", async () => {
  const workspace = createMemoryWorkspace();
  // The Images session's stamp, taken before applyMediaBatch's lazy load (main.ts) and handed to the transaction.
  const stamp = createGuardedEdits(workspace.workspace).stamp("repository");
  const h = harness(stamp);
  const loading = deferred<void>();
  const loaded = loading.promise.then(() => applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)));
  workspace.setScope("lex/another-site@main");
  loading.resolve();
  await assert.rejects(loaded, /repository changed/);
  assert.equal(h.records.size, 0);
  assert.equal(h.bytes.map.size, 0);
  assert.equal(h.steps(), 0);
});

test("wide text edits and a new redirects file stage, commit, Undo and Redo together", async () => {
  const h = harness();
  const base = new Map(["app.js", "data.json", "feed.xml", "AGENTS.md", "_headers", "_redirects"].map(path => [path, `before ${path}`]));
  base.delete("_redirects");
  h.batch.uploads = [];
  h.batch.edits.clear();
  h.batch.expectedSources.clear();
  h.batch.expectedPaths = [...base.keys()];
  h.host.paths = () => [...new Set([...base.keys(), ...h.records.keys()])];
  h.host.source = path => h.records.get(path)?.content ?? base.get(path);
  h.host.entry = async path => base.has(path) ? { path, sha: `sha-${path}`, mode: "100644", text: base.get(path) } : undefined;
  for (const path of [...base.keys(), "_redirects"]) {
    h.batch.edits.set(path, `after ${path}`);
    h.batch.expectedSources.set(path, base.get(path));
  }
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.steps(), 1);
  for (const path of h.batch.edits.keys()) {
    assert.equal(h.records.get(path)?.content, `after ${path}`);
    assert.equal(h.records.get(path)?.original, base.get(path) ?? "");
    assert.equal(h.records.get(path)?.baseSha, base.has(path) ? `sha-${path}` : null);
  }
  assert.equal(h.undo(), true);
  assert.equal(h.records.size, 0);
  for (const [path, source] of base) assert.equal(h.host.source(path), source);
  assert.equal(h.host.source("_redirects"), undefined);
  assert.equal(await h.redo(), true);
  for (const [path, source] of h.batch.edits) assert.equal(h.host.source(path), source);
});

test("a wide text source changed during staging refuses the entire batch", async () => {
  const h = harness(); let source = "before";
  h.host.source = path => path === "app.js" ? source : h.records.get(path)?.content;
  h.batch.expectedSources.set("app.js", source); h.batch.edits.set("app.js", "after");
  const put = h.bytes.put.bind(h.bytes);
  h.bytes.put = async (key, blob) => { await put(key, blob); source = "external"; };
  await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /app.js changed/);
  assert.equal(h.records.size, 0); assert.equal(h.bytes.map.size, 0); assert.equal(source, "external");
});

test("an uploaded SVG edited as text publishes its rewritten content and restores its bytes on Undo", async () => {
  const h = harness();
  const before: SavedDraft = { ...h.host.scope, version: 1, path: "image.svg", baseSha: null, original: "", content: "", sourceSha: "svg-sha", opaque: true, upload: { size: 10, type: "image/svg+xml" }, updatedAt: 1 };
  h.records.set(before.path, before);
  h.batch.uploads = []; h.batch.edits = new Map([[before.path, '<image href="/new.webp"/>']]);
  h.batch.expectedPaths = [before.path]; h.batch.expectedSources.clear();
  h.host.source = path => { const draft = h.records.get(path); return draft?.opaque ? '<image href="/old.webp"/>' : draft?.content; };
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.records.get(before.path)?.opaque, undefined);
  assert.equal(h.records.get(before.path)?.sourceSha, undefined);
  assert.equal(h.records.get(before.path)?.content, '<image href="/new.webp"/>');
  assert.equal(h.undo(), true); assert.equal(h.records.get(before.path), before);
  assert.equal(await h.redo(), true); assert.equal(h.records.get(before.path)?.opaque, undefined);
});

test("explicit replacement stages new bytes over an existing branch path, preserves base SHA and undoes/redoes once", async () => {
  const h = harness(), path = "images/a.png";
  h.host.paths = () => [path, ...h.records.keys()];
  h.host.assetVersion = file => file === path ? "old-sha" : undefined;
  h.host.entry = async file => file === path ? { path, sha: "old-sha" } : undefined;
  h.batch.expectedPaths = [path]; h.batch.expectedAssets.set(path, "old-sha"); h.batch.overwrites = [path];
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  const draft = h.records.get(path)!;
  assert.equal(draft.baseSha, "old-sha"); assert.equal(draft.opaque, true); assert.ok(draft.upload);
  assert.notEqual(draft.sourceSha, "old-sha"); assert.equal(h.steps(), 1);
  assert.equal(await (await h.bytes.get(uploadKey(h.host.scope, draft.sourceSha!)))?.text(), "png");
  assert.equal(h.undo(), true); assert.equal(h.records.size, 0);
  h.bytes.map.clear(); assert.equal(await h.redo(), true);
  assert.equal(h.records.get(path)?.sourceSha, draft.sourceSha); assert.equal(h.steps(), 1); assert.equal(h.bytes.map.size, 1);
});

test("explicit replacement survives the real draft store (no text, still a change) through Undo and Redo", async () => {
  const h = harness(), path = "images/a.png", data = new Map<string, string>();
  const real = new DraftStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); },
    key: index => [...data.keys()][index] ?? null, get length() { return data.size; } });
  h.host.store = { get: (scope, file) => real.get(scope, file), list: scope => real.list(scope), error: "store failure",
    save: record => real.save(record), remove: (scope, file) => real.remove(scope, file) } as typeof h.host.store;
  h.host.paths = () => [path, ...real.list(h.host.scope).filter(record => !record.deleted).map(record => record.path)];
  h.host.assetVersion = file => file === path ? real.get(h.host.scope, path)?.sourceSha ?? "old-sha" : real.get(h.host.scope, file)?.sourceSha;
  h.host.source = file => real.get(h.host.scope, file)?.content;
  h.host.entry = async file => file === path ? { path, sha: "old-sha" } : undefined;
  h.batch.expectedPaths = [path]; h.batch.expectedAssets.set(path, "old-sha"); h.batch.overwrites = [path];
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  const draft = real.get(h.host.scope, path)!;
  assert.ok(draft, "the replaced file's draft is kept");
  assert.equal(draft.baseSha, "old-sha"); assert.ok(draft.upload); assert.notEqual(draft.sourceSha, "old-sha");
  assert.equal(h.undo(), true); assert.equal(real.get(h.host.scope, path), undefined);
  h.bytes.map.clear(); assert.equal(await h.redo(), true);
  assert.equal(real.get(h.host.scope, path)?.sourceSha, draft.sourceSha); assert.equal(h.bytes.map.size, 1);
});

test("replacement of an existing upload preserves its base and exact draft on Undo", async () => {
  const h = harness(), path = "images/a.png";
  const old: SavedDraft = { ...h.host.scope, version: 1, path, baseSha: "branch-sha", original: "", content: "", opaque: true, sourceSha: "old-upload", upload: { size: 3, type: "image/png" }, updatedAt: 1 };
  h.records.set(path, old); h.batch.expectedPaths = [path]; h.batch.expectedAssets.set(path, "old-upload"); h.batch.overwrites = [path];
  await applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host));
  assert.equal(h.records.get(path)?.baseSha, "branch-sha"); assert.notEqual(h.records.get(path)?.sourceSha, "old-upload");
  assert.equal(h.undo(), true); assert.equal(h.records.get(path), old); assert.equal(await h.redo(), true);
});

test("ordinary uploads still refuse taken paths; replacement requires revision and no overlapping delete", async () => {
  for (const mode of ["ordinary", "no-proof", "delete"]) {
    const h = harness(), path = "images/a.png";
    h.host.paths = () => [path]; h.host.entry = async () => ({ path, sha: "branch-sha" });
    h.batch.expectedPaths = [path];
    if (mode !== "ordinary") h.batch.overwrites = [path];
    if (mode === "delete") { h.batch.expectedAssets.set(path, undefined); h.batch.deletes = [path]; }
    await assert.rejects(applyMediaWorkspaceBatch(h.batch, mediaDraftTransaction(h.host)), /already exists|captured image revision/);
    assert.equal(h.records.size, 0); assert.equal(h.steps(), 0); assert.equal(h.bytes.map.size, 0);
  }
});
