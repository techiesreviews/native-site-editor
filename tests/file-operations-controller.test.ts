import { test } from "node:test";
import assert from "node:assert/strict";
import { createFileOperationsController, type FileOperationsPorts } from "../src/controllers/file-operations-controller";

function restoreHarness() {
  let deleted = new Map([["pages/a.html", {}], ["pages/b.html", {}], ["other.html", {}]]);
  const restored: string[][] = [], focused: string[] = [], frames: (() => void)[] = [];
  const ports = {
    treeState: () => ({ deleted }),
    undoFileChanges: ({ restore }: { restore: string[] }) => restored.push(restore),
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    fileRow: (path: string) => ({ focus: () => focused.push(path) }),
  } as unknown as FileOperationsPorts;
  return { controller: createFileOperationsController(ports), restored, focused, frames,
    setDeleted: (paths: string[]) => { deleted = new Map(paths.map(path => [path, {}])); } };
}

test("restore delegates the folder's current deletions, then focuses on the next frame", () => {
  const h = restoreHarness();
  h.controller.restoreFileTarget({ path: "pages", name: "pages", folder: true, gone: true });
  assert.deepEqual(h.restored, [["pages/a.html", "pages/b.html"]]);
  assert.deepEqual(h.focused, []);
  h.frames[0]();
  assert.deepEqual(h.focused, ["pages"]);
  h.setDeleted(["pages/new.html"]);
  h.controller.restoreFileTarget({ path: "pages", name: "pages", folder: true, gone: true });
  assert.deepEqual(h.restored[1], ["pages/new.html"]);
});

test("restore delegates a single file without expanding sibling deletions", () => {
  const h = restoreHarness();
  h.controller.restoreFileTarget({ path: "pages/a.html", name: "a.html", folder: false, gone: true });
  assert.deepEqual(h.restored, [["pages/a.html"]]);
});

function operationHarness() {
  let epoch = 1, setup = "repo/main", index = "index", stamp = "draft", text = "source", files = ["a.txt"];
  const calls: string[] = [];
  let onIndex = () => {}, onAsk = () => {}, onRedirect = () => {};
  const sources = { "a.txt": "source" };
  const ports = {
    generation: () => epoch, setupScope: () => setup, nativeTextIndexScopeKey: () => index,
    draftScope: () => ({ account: "a", repoId: 1, repo: "a/r", branch: "main" }),
    site: () => undefined, engaged: () => false, repository: () => ({ full_name: "a/r" }),
    treeState: () => ({ changes: new Map(), deleted: new Map(), drafted: [] }),
    treeSignature: () => "tree", pathNow: () => undefined,
    nativeEffectiveSource: () => text, deleteTargetDraftStamp: () => stamp,
    nativeFiles: () => [...files], nativeLinkSources: () => sources,
    ensureNativeTextIndex: async () => { onIndex(); return undefined; },
    findEntry: async () => ({ path: "a.txt", type: "blob", sha: "sha", mode: "100644" }),
    draftStore: () => ({ get: () => undefined }), baseSource: () => "source",
    nativeRouteForPath: () => undefined,
    confirmDialog: () => ({ ask: async () => { onAsk(); return true; }, choose: async () => { onAsk(); return { value: "go", option: false }; } }),
    readNativeRedirects: async () => { onRedirect(); return undefined; },
    withMovedPageUrls: () => {},
    applyFileOperation: async () => { calls.push("file transaction"); },
    applyNativeOperation: async () => { calls.push("native transaction"); },
    announce: () => {}, errorMessage: () => {}, requestAnimationFrame: () => {},
    parentOf: () => "",
  } as unknown as FileOperationsPorts;
  return { controller: createFileOperationsController(ports), calls,
    changeEpoch: () => { epoch++; }, changeSetup: () => { setup = "repo/other"; },
    changeIndex: () => { index = "other"; }, changeStamp: () => { stamp = "other"; },
    changeSource: () => { text = "other"; }, changeFiles: () => { files.push("b.txt"); },
    onIndex: (callback: () => void) => { onIndex = callback; },
    onAsk: (callback: () => void) => { onAsk = callback; },
    onRedirect: (callback: () => void) => { onRedirect = callback; } };
}
const target = { path: "a.txt", name: "a.txt", folder: false };

for (const change of ["changeEpoch", "changeSetup", "changeIndex", "changeStamp", "changeSource"] as const) {
  test(`delete refuses ${change} during index loading before any transaction`, async () => {
    const h = operationHarness();
    h.onIndex(h[change]);
    assert.equal(await h.controller.deleteFileTarget(target), "The repository or source changed meanwhile. Try again.");
    assert.deepEqual(h.calls, []);
  });
}

test("delete retains the pre-dialog source proof", async () => {
  const h = operationHarness();
  h.onAsk(h.changeSource);
  assert.equal(await h.controller.deleteFileTarget(target), "The repository or source changed meanwhile. Try again.");
  assert.deepEqual(h.calls, []);
});

test("unchanged delete reaches the host transaction once", async () => {
  const h = operationHarness();
  assert.equal(await h.controller.deleteFileTarget(target), undefined);
  assert.deepEqual(h.calls, ["file transaction"]);
});

for (const stage of ["onAsk", "onRedirect"] as const) {
  test(`URL move retains its old source proof through ${stage}`, async () => {
    const h = operationHarness();
    const pins = h.controller.nativeMovePins();
    h[stage](h.changeSource);
    const change = { from: "/a/", to: "/b/", subtree: false };
    const error = await h.controller.moveFilesWithUrls(target, "b.txt", "move", [{ file: { path: "a.txt" }, to: "b.txt" }], {
      changes: [change], links: [], complete: true, redirect: new Map([[change, []]]), live: false, gone: [], pages: [],
    }, pins);
    assert.equal(error, "The site changed while the Move dialog was open, so nothing was moved. Try again to see the latest links.");
    assert.deepEqual(h.calls, []);
  });
}

test("asset snapshot pins file list and generation, leaves source comparison to the transaction", () => {
  const h = operationHarness();
  const snapshot = h.controller.nativeAssetSnapshot("moved");
  assert.ok(!("error" in snapshot));
  assert.equal(snapshot.current(), true);
  assert.deepEqual([...snapshot.expectedSources], [["a.txt", "source"]]);
  h.changeFiles();
  assert.equal(snapshot.current(), false);
});
