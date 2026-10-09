import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaController, type MediaControllerPorts, type MediaModule } from "../src/controllers/media-controller.ts";
import type { SavedDraft } from "../src/drafts.ts";
import type { MediaPickerOptions } from "../src/page-builder/media-picker.ts";
import { startTags } from "../shared/html-source.ts";

function fixture(overrides: Partial<MediaControllerPorts> = {}) {
  const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const records: SavedDraft[] = [];
  const store = { list: () => records, get: (_scope: typeof scope, path: string) => records.find((draft) => draft.path === path), save: () => true, remove: () => true };
  let identity = "workspace:1", signature = "version:1", visible = true, busy = false, mounts = 0, refreshes = 0, disposed = 0, closes = 0;
  let observerCallback: (() => void) | undefined;
  const sources = new Map([["index.html", '<section><img src="/images/old.png" alt="Old alt"></section>']]);
  const errors: unknown[] = [], changes: string[] = [];
  let pick: MediaPickerOptions | undefined;
  const element = { getAttribute: () => busy ? "true" : "false" } as unknown as HTMLElement;
  const module: MediaModule = {
    openMediaPicker: async (options) => { pick = options; }, closeMediaPicker: () => { closes++; },
    mountMediaLibrary: () => { mounts++; return { element, ready: Promise.resolve(), refreshedKey: undefined, refresh: async () => { refreshes++; }, dispose: () => { disposed++; } }; },
  };
  const ports: MediaControllerPorts = {
    workspace: () => ({ repo: scope.repo, scope, identity, site: { routes: { "/": "index.html" }, components: {} }, nativePaths: ["index.html", "images/old.png"], drafts: store }),
    identity: () => identity, generation: () => 1, source: (path) => sources.get(path), listPaths: async () => [],
    findEntry: async () => ({ sha: "sha", size: 12 }), entry: () => ({ sha: "sha", size: 12 }), readText: async () => "read text", rememberSource: (path, source) => { sources.set(path, source); },
    uploadedBlob: async () => undefined, readBlob: async () => new Blob(["image"], { type: "image/png" }), applyBatch: async () => {}, openPage: async () => {}, load: async () => module,
    openFile: () => "index.html", viewingVersion: () => false, restoreFile: async () => {},
    change: (_path, _source, edits) => { changes.push(edits[0].text); return true; }, galleryHost: () => element, galleryVisible: () => visible, imagesSelected: () => true, gallerySignature: () => signature,
    locateElement: (source) => { const tag = startTags(source).find((item) => item.name === "img"); return tag && { tag }; },
    observeBusy: (_element, changed) => { observerCallback = changed; return { disconnect() {} }; }, announce: () => {}, error: (error) => errors.push(error), ...overrides,
  };
  return { ports, controller: createMediaController(ports), sources, records, scope, module, errors, changes,
    navigate: () => { identity = "workspace:2"; }, signature: () => { signature = "version:2"; }, hide: () => { visible = false; }, show: () => { visible = true; },
    busy: () => { busy = true; }, settle: () => { busy = false; observerCallback?.(); }, pick: () => pick,
    counts: () => ({ mounts, refreshes, disposed, closes }),
  };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("picker preserves existing alt and applies the exact captured image source", async () => {
  const f = fixture();
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  assert.equal(f.pick()?.initialAlt, "Old alt");
  await f.pick()!.onPick!({ path: "images/new.png", alt: "Old alt" });
  assert.equal(f.changes.length, 1);
  assert.match(f.changes[0], /src="\/images\/new.png"/);
  assert.match(f.changes[0], /alt="Old alt"/);
});

test("picker refuses navigation after lazy load and source drift during restore", async () => {
  const f = fixture();
  f.ports.load = async () => { f.navigate(); return f.module; };
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  assert.equal(f.pick(), undefined);
  const restoring = fixture({ openFile: () => "other.html" });
  restoring.ports.restoreFile = async () => { restoring.sources.set("index.html", "changed by an agent"); };
  await restoring.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await assert.rejects(async () => restoring.pick()!.onPick!({ path: "images/new.png", alt: "New" }), /image changed while/);
  assert.equal(restoring.changes.length, 0);
});


test("workspace read cannot populate host caches after navigation", async () => {
  const f = fixture();
  const context = await f.controller.workspaceContext();
  f.ports.readText = async () => { f.navigate(); return "stale source"; };
  await assert.rejects(context.read("styles/site.css"), /repository changed/);
  assert.equal(f.sources.has("styles/site.css"), false);
  assert.throws(() => context.assetVersion!("images/old.png"), /repository changed/);
});

test("workspace asset versions and uploads stay scoped to captured drafts", async () => {
  const f = fixture();
  const context = await f.controller.workspaceContext();
  assert.equal(context.assetVersion!("images/old.png"), "sha");
  const draft: SavedDraft = { ...f.scope, version: 1, path: "images/new.png", baseSha: null, original: "", content: "", updatedAt: 1, sourceSha: "upload-sha", upload: { size: 3, type: "image/png" } };
  f.records.push(draft);
  assert.equal(context.assetVersion!(draft.path), JSON.stringify(draft));
  const uploaded = new Blob(["new"], { type: "image/png" });
  f.ports.uploadedBlob = async (scope, sha) => { assert.equal(scope, f.scope); assert.equal(sha, "upload-sha"); return uploaded; };
  assert.equal(await context.blob(draft.path), uploaded);
});

test("disposed gallery cannot mount from a pending lazy load", async () => {
  const f = fixture();
  let release!: (module: MediaModule) => void;
  f.ports.load = () => new Promise((resolve) => { release = resolve; });
  const opening = f.controller.ensureGallery();
  f.controller.disposeGallery();
  release(f.module);
  await opening;
  assert.equal(f.counts().mounts, 0);
});

test("hidden and busy galleries refresh once after becoming ready; gallery disposal does not close picker", async () => {
  const f = fixture();
  await f.controller.ensureGallery();
  f.hide(); f.signature(); f.controller.requestGalleryRefresh(); await tick();
  assert.equal(f.counts().refreshes, 0);
  f.show(); f.busy(); f.controller.requestGalleryRefresh(); await tick();
  assert.equal(f.counts().refreshes, 0);
  f.settle();
  assert.equal(f.counts().refreshes, 1);
  f.controller.disposeGallery();
  assert.equal(f.counts().closes, 0);
  f.controller.closePicker();
  assert.equal(f.counts().closes, 1);
});
