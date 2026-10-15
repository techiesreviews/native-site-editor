import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMediaBatch, type MediaBatchPorts } from "../src/media-batch";
import type { DraftScope } from "../src/drafts";
import type { Stamp } from "../src/guarded-edit";
import type { MediaWorkspaceBatch } from "../src/page-builder/media-workspace";
import { deferred } from "./fakes/memory-workspace";

// The batch body loads with Media; a switch while any of its loads is held refuses before staging.
function harness() {
  let live = true, staged = 0, histories = 0, listings = 0;
  const appStore = { openFile: { value: "index.html" as string | undefined }, repository: { value: { full_name: "lex/site" } }, snapshot: { value: { branch: "main" } } };
  const workspace = deferred<Awaited<ReturnType<MediaBatchPorts["load"]>>>();
  const listing = deferred<string[]>();
  // eslint-disable-next-line no-restricted-syntax -- the batch body reads only these three exports of the lazy modules.
  const modules = [
    { applyMediaWorkspaceBatch: async () => { staged++; } },
    { mediaDraftTransaction: (input: unknown) => input },
    { MEDIA_RECORDS_PATH: ".editor/media.json" },
  ] as unknown as Awaited<ReturnType<MediaBatchPorts["load"]>>;
  // eslint-disable-next-line no-restricted-syntax -- the editor, stores and history home are faked by the members the batch body calls.
  const ports = {
    appStore, site: () => undefined, load: () => workspace.promise,
    listRepositoryFiles: () => { listings++; return listing.promise; },
    editor: { captureHistoryHost: () => ({ isCurrent: () => true }), recordHistoryAction: () => { histories++; } },
    mediaHistoryHome: { hold: () => { histories++; } },
    nativeFiles: () => [], draftStore: () => ({ list: () => [], get: () => undefined }), bytes: () => ({}),
    mediaIdentity: () => "lex/site", mediaTextSource: () => undefined, entryAt: () => undefined, findEntry: async () => undefined,
    refresh: () => {}, announce: () => {},
  } as unknown as MediaBatchPorts;
  const stamp: Stamp = { holds: () => live, changed: () => (live ? undefined : "scope") };
  const batch: MediaWorkspaceBatch = { label: "Swap image", expectedPaths: [], expectedSources: new Map(), expectedAssets: new Map(),
    edits: new Map([["index.html", "<img>"]]), moves: [], deletes: [], restores: [], uploads: [] };
  const run = () => applyMediaBatch(ports, {} as DraftScope, stamp, batch, "index.html");
  return { appStore, workspace, listing, modules, run, switchRepository: () => { live = false; }, counts: () => ({ staged, histories, listings }) };
}

test("a media batch refuses a repository switch or a page switch while its workspace chunk loads", async () => {
  for (const change of ["repository", "page"] as const) {
    const h = harness();
    const pending = h.run();
    if (change === "repository") h.switchRepository(); else h.appStore.openFile.value = "about/index.html";
    h.workspace.resolve(h.modules);
    h.listing.resolve([]);
    await assert.rejects(pending, change === "repository" ? /repository changed/ : /open page changed/);
    assert.deepEqual(h.counts(), { staged: 0, histories: 0, listings: 1 }, change);
  }
});

test("a media batch refuses a switch while the repository listing is read", async () => {
  for (const change of ["repository", "page"] as const) {
    const h = harness();
    const pending = h.run();
    h.workspace.resolve(h.modules);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.counts().listings, 1);
    if (change === "repository") h.switchRepository(); else h.appStore.openFile.value = "about/index.html";
    h.listing.resolve([]);
    await assert.rejects(pending, change === "repository" ? /repository changed/ : /open page changed/);
    assert.equal(h.counts().staged, 0, change);
  }
});

test("a media batch with nothing switched stages once", async () => {
  const h = harness();
  const pending = h.run();
  h.workspace.resolve(h.modules);
  h.listing.resolve([]);
  await pending;
  assert.equal(h.counts().staged, 1);
});
