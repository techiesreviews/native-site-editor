import { test } from "node:test";
import assert from "node:assert/strict";
import type { DraftScope, SavedDraft } from "../src/drafts";
import { mediaDraftTransaction, type MediaDraftHost } from "../src/page-builder/media-draft-transaction";
import { applyMediaWorkspaceBatch, type MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { memoryUploadBytes, type UploadBytes } from "../src/uploads";
import { forEachAwait, type AwaitRace } from "./support/await-race";

function scenario(race: AwaitRace, upload: boolean) {
  const scope = { account: "a", repoId: 1, repo: "a/old", branch: "main" } satisfies DraftScope;
  const records = new Map<string, SavedDraft>(), memory = memoryUploadBytes();
  const state = { live: true, staleWrites: [] as string[], steps: 0 };
  let dispose = () => {};
  const write = (name: string) => { if (!state.live) state.staleWrites.push(name); };
  const bytes = {
    get: race.port("bytes.get", key => memory.get(key)),
    put: race.port("bytes.put", async (key, blob) => { write("bytes.put"); await memory.put(key, blob); }),
    delete: race.port("bytes.delete", key => memory.delete(key)),
    keys: race.port("bytes.keys", () => memory.keys()),
  } satisfies UploadBytes;
  const source = '<img src="images/old.png">';
  const paths = upload ? ["index.html"] : ["index.html", "images/old.png"];
  const host = {
    scope, bytes,
    store: {
      get: (_: DraftScope, path: string) => records.get(path), list: () => [...records.values()], error: null,
      save: (record: SavedDraft) => { write(`draft.save ${record.path}`); records.set(record.path, record); return true; },
      remove: (_: DraftScope, path: string) => { write(`draft.remove ${path}`); records.delete(path); return true; },
    },
    stamp: { holds: () => state.live, changed: () => state.live ? undefined : "scope" as const },
    paths: () => paths, source: (path: string) => path === "index.html" ? source : undefined,
    assetVersion: (path: string) => path === "images/old.png" ? "old-sha" : undefined,
    entry: race.port("entry", async path => paths.includes(path) ? { path, sha: "old-sha" } : undefined),
    mounted: () => false,
    prepareSources: () => ({
      apply: () => { write("sources.apply"); return true; }, undo: () => true, redo: () => true, isCurrent: () => true,
    }),
    modelState: () => ({ isCurrent: () => true }), evictModel: (_path, proof) => proof,
    historyCurrent: () => state.live,
    history: (_undo, _redo, release) => { write("history"); state.steps++; dispose = release; return true; },
    refresh: () => { write("refresh"); }, announce() {},
  } satisfies MediaDraftHost;
  const blob = new Blob(["png"], { type: "image/png" });
  blob.arrayBuffer = race.port("blob.arrayBuffer", () => Blob.prototype.arrayBuffer.call(blob));
  const batch = {
    label: upload ? "Upload image" : "Rename image", expectedPaths: paths,
    expectedSources: new Map([["index.html", source]]),
    expectedAssets: new Map(upload ? [] : [["images/old.png", "old-sha"]]),
    edits: new Map([["index.html", '<img src="images/new.png">']]),
    moves: upload ? [] : [{ from: "images/old.png", to: "images/new.png" }],
    deletes: [], restores: [], uploads: upload ? [{ path: "images/new.png", blob }] : [],
  } satisfies MediaWorkspaceBatch;
  const done = applyMediaWorkspaceBatch(batch, mediaDraftTransaction(host)).then(() => {
    assert.equal(state.live, true, "A disturbed batch must refuse to commit.");
    assert.equal(records.get("index.html")?.content, batch.edits.get("index.html"));
    assert.ok(records.has("images/new.png"));
    assert.equal(state.steps, 1);
  }, error => {
    assert.equal(state.live, false, "The baseline must succeed.");
    assert.match((error as Error).message, /repository changed/);
  }).finally(() => dispose());
  return { state, records, memory, done };
}

for (const upload of [false, true]) test(`Media draft ${upload ? "upload" : "rename"} refuses stale writes at every async port`, async () => {
  const count = await forEachAwait(race => scenario(race, upload), run => { run.state.live = false; }, run => {
    assert.deepEqual(run.state.staleWrites, []);
    assert.equal(run.records.size, 0);
    assert.equal(run.memory.map.size, 0, "Rollback must remove only this run's staged upload bytes.");
    assert.equal(run.state.steps, 0);
  });
  assert.equal(count, upload ? 5 : 3); // Upload: two entries, arrayBuffer, bytes.get, bytes.put; rename: three entries.
});
