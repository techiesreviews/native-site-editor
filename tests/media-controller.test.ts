import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaController, type MediaControllerPorts, type MediaModule } from "../src/controllers/media-controller.ts";
import type { SavedDraft } from "../src/drafts.ts";
import type { MediaPickerOptions } from "../src/page-builder/media-picker.ts";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { startTags } from "../shared/html-source.ts";

function fixture(overrides: Partial<MediaControllerPorts> = {}) {
  const workspace = createMemoryWorkspace();
  const edits = createGuardedEdits(workspace.workspace);
  const scope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  const records: SavedDraft[] = [];
  const store = { list: () => records, get: (_scope: typeof scope, path: string) => records.find((draft) => draft.path === path), save: () => true, remove: () => true };
  let identity = "workspace:1", signature = "version:1", visible = true, busy = false, mounts = 0, refreshes = 0, disposed = 0, closes = 0;
  let observerCallback: (() => void) | undefined;
  const sources = new Map([["index.html", '<section><img src="/images/old.png" alt="Old alt"></section>']]);
  const errors: unknown[] = [], changes: string[] = [];
  let pick: MediaPickerOptions | undefined;
  const element: Partial<HTMLElement> = { getAttribute: () => busy ? "true" : "false" };
  const module: MediaModule = {
    openMediaPicker: async (options) => { pick = options; }, closeMediaPicker: () => { closes++; },
    mountMediaLibrary: () => { mounts++; return { element: element as HTMLElement, ready: Promise.resolve(), refreshedKey: undefined, refresh: async () => { refreshes++; }, close: () => {}, dispose: () => { disposed++; } }; },
  };
  const ports: MediaControllerPorts = {
    workspace: () => ({ repo: scope.repo, scope, identity, site: { routes: { "/": "index.html" }, components: {} }, nativePaths: ["index.html", "images/old.png"], drafts: store }),
    stamp: () => edits.stamp("repository"),
    identity: () => identity, generation: () => workspace.workspace.generation(), source: (path) => sources.get(path), listPaths: async () => [],
    findEntry: async () => ({ sha: "sha", size: 12 }), entry: () => ({ sha: "sha", size: 12 }), readText: async () => "read text", rememberSource: (path, source) => { sources.set(path, source); },
    uploadedBlob: async () => undefined, readBlob: async () => new Blob(["image"], { type: "image/png" }), applyBatch: async () => {}, openPage: async () => {}, load: async () => module,
    openFile: () => "index.html", viewingVersion: () => false, restoreFile: async () => {},
    change: (_path, _source, edits) => { changes.push(edits[0].text); return true; }, galleryHost: () => element as HTMLElement, galleryVisible: () => visible, mediaSelected: () => true, gallerySignature: () => signature,
    locateElement: (source) => { const tag = startTags(source).find((item) => item.name === "img"); return tag && { tag }; },
    refreshDescriptions: () => {},
    observeBusy: (_element, changed) => { observerCallback = changed; return { disconnect() {} }; }, announce: () => {}, error: (error) => errors.push(error), ...overrides,
  };
  return { ports, controller: createMediaController(ports), sources, records, scope, module, errors, changes,
    navigate: () => { identity = "workspace:2"; workspace.setScope(identity); },
    openAnotherPage: () => { workspace.setRoute("/other/"); workspace.enterEditMode(); },
    bump: () => workspace.bumpGeneration(), signature: () => { signature = "version:2"; }, hide: () => { visible = false; }, show: () => { visible = true; },
    busy: () => { busy = true; }, settle: () => { busy = false; observerCallback?.(); }, pick: () => pick,
    counts: () => ({ mounts, refreshes, disposed, closes }),
  };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("picker preserves the place's own words and applies the exact captured image source", async () => {
  const f = fixture({ placeLabel: () => "Home" });
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  assert.equal(f.pick()?.place, "Home · Old alt");
  await f.pick()!.onPick!({ path: "images/new.png", alt: "New file's words" }, () => false);
  assert.equal(f.changes.length, 1);
  assert.match(f.changes[0], /src="\/images\/new.png"/);
  assert.match(f.changes[0], /alt="Old alt"/);
});

test("swapping a Decorative place's picture moves the mark with the page change in one batch", async () => {
  const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [], told: string[] = [];
  const f = fixture({ applyBatch: async (_scope, _stamp, batch) => { batches.push(batch); }, announce: text => { told.push(text); } });
  f.sources.set("index.html", '<section><img src="/images/old.png" alt=""></section>');
  f.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: { "images/old.png": { places: { "index.html": { decorative: true } } } } }));
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await f.pick()!.onPick!({ path: "images/new.png", alt: "new" }, () => false);
  assert.equal(f.changes.length, 0);
  assert.equal(batches.length, 1);
  const page = batches[0].edits.get("index.html")!, records = JSON.parse(batches[0].edits.get(".editor/media.json")!);
  assert.match(page, /src="\/images\/new.png"/); assert.match(page, /alt=""/);
  assert.deepEqual(records.files["images/new.png"].places, { "index.html": { decorative: true } });
  assert.equal(records.files["images/old.png"]?.places, undefined);
  assert.deepEqual(told, ["Image replaced"]);
  // A file's own Decorative mark gives the place alt="" without a records change.
  const own = fixture();
  own.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: { "images/old.png": { description: { text: "Old alt" } }, "images/new.png": { decorative: true } } }));
  await own.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await own.pick()!.onPick!({ path: "images/new.png", alt: "" }, () => false);
  assert.match(own.changes[0], /alt=""/);
});

test("a value's picker resolves to the chosen root path on Use and to nothing on Cancel", async () => {
  const f = fixture();
  const used = f.controller.choosePath("Site settings · Favicon");
  await tick(); await tick();
  assert.equal(f.pick()?.place, "Site settings · Favicon");
  // The path is a URL: names with # or ? stay part of it.
  await f.pick()!.onPick!({ path: "images/a #1?.png", alt: "" }, () => false);
  assert.equal(await used, "/images/a%20%231%3F.png");
  const cancelled = f.controller.choosePath("Site settings · Favicon");
  await tick(); await tick();
  f.pick()!.onClose!();
  assert.equal(await cancelled, undefined);
});

test("picker refuses navigation after lazy load and source drift during restore", async () => {
  const f = fixture();
  f.ports.load = async () => { f.navigate(); return f.module; };
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  assert.equal(f.pick(), undefined);
  const restoring = fixture({ openFile: () => "other.html" });
  restoring.ports.restoreFile = async () => { restoring.sources.set("index.html", "changed by an agent"); };
  await restoring.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await assert.rejects(async () => restoring.pick()!.onPick!({ path: "images/new.png", alt: "New" }, () => false), /image changed while/);
  assert.equal(restoring.changes.length, 0);
});


test("workspace read cannot populate host caches after navigation", async () => {
  const f = fixture();
  const context = await f.controller.workspaceContext();
  f.ports.readText = async () => { f.navigate(); return "stale source"; };
  await assert.rejects(context.read("styles/site.css"), /repository changed/);
  assert.equal(f.sources.has("styles/site.css"), false);
  assert.throws(() => context.assetVersion("images/old.png"), /repository changed/);
});

test("workspace asset versions and uploads stay scoped to captured drafts", async () => {
  const f = fixture();
  const context = await f.controller.workspaceContext();
  assert.equal(context.assetVersion("images/old.png"), "sha");
  const draft: SavedDraft = { ...f.scope, version: 1, path: "images/new.png", baseSha: null, original: "", content: "", updatedAt: 1, sourceSha: "upload-sha", upload: { size: 3, type: "image/png" } };
  f.records.push(draft);
  assert.equal(context.assetVersion(draft.path), JSON.stringify(draft));
  const uploaded = new Blob(["new"], { type: "image/png" });
  f.ports.uploadedBlob = async (scope, sha) => { assert.equal(scope, f.scope); assert.equal(sha, "upload-sha"); return uploaded; };
  assert.equal(await context.blob(draft.path), uploaded);
});

test("Files' Review… opens the Optimise sheet only in the repository it came from", async () => {
  const f = fixture(), reviewed: string[] = [];
  let ready!: () => void;
  f.module.mountMediaLibrary = () => ({ element: {} as HTMLElement, ready: new Promise<void>(resolve => { ready = resolve; }), refreshedKey: undefined,
    refresh: async () => {}, dispose: () => {}, review: (files: File[], folder: string) => { reviewed.push(`${folder}:${files.map(file => file.name).join(",")}`); } });
  const pending = f.controller.reviewInGallery([new File(["x"], "a.png")], "about");
  await tick(); await tick();
  f.navigate();
  ready();
  await pending;
  assert.deepEqual(reviewed, []);
  const g = fixture(), done: string[] = [];
  g.module.mountMediaLibrary = () => ({ element: {} as HTMLElement, ready: Promise.resolve(), refreshedKey: undefined,
    refresh: async () => {}, dispose: () => {}, review: (files: File[], folder: string) => { done.push(`${folder}:${files.map(file => file.name).join(",")}`); } });
  await g.controller.reviewInGallery([new File(["x"], "a.png")], "about");
  assert.deepEqual(done, ["about:a.png"]);
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


test("Images holds its repository stamp across page changes and passes that same stamp to the batch", async () => {
  const f = fixture();
  let held: ReturnType<MediaControllerPorts["stamp"]> | undefined;
  const stamp = f.ports.stamp.bind(f.ports);
  f.ports.stamp = () => held = stamp();
  const context = await f.controller.workspaceContext();
  f.openAnotherPage();
  assert.doesNotThrow(() => context.assertLive());
  let applied = 0;
  f.ports.applyBatch = async (scope, proof) => { assert.equal(scope, f.scope); assert.equal(proof, held); applied++; };
  await context.applyBatch({ label: "images", edits: new Map(), moves: [], deletes: [], uploads: [], expectedPaths: [], expectedSources: new Map(), expectedAssets: new Map() });
  assert.equal(applied, 1);
  f.bump();
  assert.throws(() => context.assertLive(), /repository changed/);
});

test("image picker survives page changes but refuses a new repository generation", async () => {
  const f = fixture();
  f.ports.load = async () => { f.openAnotherPage(); return f.module; };
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  assert.ok(f.pick());
  f.bump();
  await assert.rejects(async () => f.pick()!.onPick!({ path: "images/new.png", alt: "New" }), /repository changed/);
  assert.equal(f.changes.length, 0);
});

test("place Decorative writes page and records atomically; unmark leaves empty alt and undo shows the gap", async () => {
  const f = fixture();
  f.ports.findEntry = async () => undefined;
  const original = f.sources.get("index.html")!;
  const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [];
  f.ports.applyBatch = async (_scope, _stamp, batch) => {
    batches.push(batch);
    for (const [path, source] of batch.edits) f.sources.set(path, source);
  };
  await f.controller.changePlace("index.html", [0, 0], true);
  assert.deepEqual(f.errors, []);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].expectedSources.get("index.html"), original);
  assert.equal(batches[0].expectedSources.get(".editor/media.json"), undefined);
  assert.equal(batches[0].edits.size, 2);
  assert.match(f.sources.get("index.html")!, /alt=""/);
  assert.equal(JSON.parse(f.sources.get(".editor/media.json")!).files["images/old.png"].places["index.html"].decorative, true);
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "")?.state, "decorative");
  const marked = f.sources.get("index.html");
  await f.controller.changePlace("index.html", [0, 0], false);
  assert.equal(f.sources.get("index.html"), marked);
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "")?.state, "missing");
  // Simulate Undo of both batches, including removal of newly created metadata.
  f.sources.delete(".editor/media.json"); f.sources.set("index.html", original);
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "")?.state, "missing");
  // Lazy rules report legacy names as gaps even while their alt is nonempty.
  for (const alt of ["old", "old.png"]) {
    assert.equal(f.controller.placeState("index.html", "/images/old.png", alt)?.state, "missing");
    assert.equal(f.controller.placeState("index.html", "/images/old.png", alt)?.own, false);
  }
  f.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: {
    "images/old.png": { places: { "index.html": { agentText: "old.png" } } },
  } }));
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "old.png")?.own, true);
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "old.png")?.byAgent, true);
});

test("a Decorative press refuses when the page is switched while records are read", async () => {
  let open = "index.html";
  const f = fixture({ openFile: () => open });
  let writes = 0;
  f.ports.applyBatch = async () => { writes++; };
  f.ports.readText = async () => { open = "about.html"; return '{"version":2,"collections":[],"files":{}}'; };
  const original = f.sources.get("index.html");
  await f.controller.changePlace("index.html", [0, 0], true);
  assert.equal(writes, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(f.sources.get("index.html"), original);
  // A press for a page that is not open does nothing at all.
  await f.controller.changePlace("index.html", [0, 0], true);
  assert.equal(writes, 0);
  // Entering history view while records load refuses too.
  let viewing = false;
  const h = fixture({ viewingVersion: () => viewing });
  h.ports.applyBatch = async () => { writes++; };
  h.ports.readText = async () => { viewing = true; return '{"version":2,"collections":[],"files":{}}'; };
  await h.controller.changePlace("index.html", [0, 0], true);
  assert.equal(writes, 0);
  assert.equal(h.errors.length, 1);
});

test("place marking refuses unreadable records, page drift during reads and repository changes", async () => {
  for (const fault of ["malformed", "unreadable", "page", "repository"]) {
    const f = fixture();
    const original = f.sources.get("index.html");
    let writes = 0;
    f.ports.applyBatch = async () => { writes++; };
    if (fault === "malformed") f.sources.set(".editor/media.json", "bad JSON");
    else f.ports.readText = async () => {
      if (fault === "unreadable") throw new Error("Cannot read records");
      if (fault === "page") f.sources.set("index.html", "New source");
      if (fault === "repository") f.navigate();
      return '{"version":2,"collections":[],"files":{}}';
    };
    await f.controller.changePlace("index.html", [0, 0], true);
    assert.equal(writes, 0);
    assert.equal(f.errors.length, 1);
    if (fault !== "page") assert.equal(f.sources.get("index.html"), original);
  }
});

test("Decorative's first save preserves starting collections before the library opens", async () => {
  const f = fixture();
  const workspace = f.ports.workspace()!;
  f.ports.workspace = () => ({ ...workspace, nativePaths: [...workspace.nativePaths ?? [], "images/logos/mark.png"] });
  f.ports.findEntry = async () => undefined;
  f.ports.applyBatch = async (_scope, _stamp, batch) => {
    for (const [path, source] of batch.edits) f.sources.set(path, source);
  };
  await f.controller.changePlace("index.html", [0, 0], true);
  assert.deepEqual(f.errors, []);
  const saved = JSON.parse(f.sources.get(".editor/media.json")!);
  assert.deepEqual(saved.collections, ["Logos"]);
  assert.deepEqual(saved.files["images/logos/mark.png"].collections, ["Logos"]);
});

test("an unsaved uploaded SVG is read from browser storage for the usage scan", async () => {
  const f = fixture();
  const draft: SavedDraft = { ...f.scope, version: 1, path: "images/new.svg", baseSha: null, original: "", content: "", updatedAt: 1, sourceSha: "svg-sha", opaque: true, upload: { size: 40, type: "image/svg+xml" } };
  f.records.push(draft);
  f.ports.uploadedBlob = async (_scope, sha) => sha === "svg-sha" ? new Blob(['<svg><image href="/images/old.png"/></svg>']) : undefined;
  const context = await f.controller.workspaceContext();
  assert.equal(await context.read("images/new.svg"), '<svg><image href="/images/old.png"/></svg>');
  assert.equal(f.sources.has("images/new.svg"), false);
});

test("Cancel while Use reads the records places nothing; a newer records draft refuses the swap", async () => {
  const f = fixture();
  let closed = false;
  f.ports.readText = async () => { closed = true; return '{"version":2,"collections":[],"files":{}}'; };
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await f.pick()!.onPick!({ path: "images/new.png", alt: "" }, () => closed);
  assert.equal(f.changes.length, 0);
  const newer = fixture();
  newer.ports.readText = async () => { newer.sources.set(".editor/media.json", '{"version":2,"collections":["Newer"],"files":{}}'); return '{"version":2,"collections":[],"files":{}}'; };
  newer.ports.rememberSource = () => {};
  await newer.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await assert.rejects(async () => newer.pick()!.onPick!({ path: "images/new.png", alt: "" }, () => false), /image changed while/);
  assert.equal(newer.changes.length, 0);
});

test("a value's picker opens nothing when the repository changed while it loaded", async () => {
  const f = fixture();
  f.ports.load = async () => { f.navigate(); return f.module; };
  assert.equal(await f.controller.choosePath("Site settings · Favicon"), undefined);
  assert.equal(f.pick(), undefined);
});

test("agent placement uses the picker's exact markup and Decorative batch; refuses non-images", async () => {
  const image = { path: "images/new.png", alt: "New", width: 960, height: 640, variants: [{ path: "images/new-480w.png", width: 480 }] };
  const picked = fixture(), agent = fixture();
  for (const f of [picked, agent]) f.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: { "images/old.png": { description: { text: "Old alt" } }, "images/new.png": { description: { text: "New" } } } }));
  await picked.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await picked.pick()!.onPick!(image, () => false);
  await agent.controller.preparePlacement({ path: "index.html", node: [0, 0] })(image);
  assert.deepEqual(agent.changes, picked.changes);
  assert.match(agent.changes[0], /srcset=.*480w.*960w/);
  assert.match(agent.changes[0], /width="960"/); assert.match(agent.changes[0], /height="640"/);
  assert.match(agent.changes[0], /loading="lazy"/); assert.match(agent.changes[0], /alt="New"/);
  const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [];
  const marked = fixture({ applyBatch: async (_scope, _stamp, batch) => { batches.push(batch); } });
  marked.sources.set("index.html", '<section><img src="/images/old.png" alt=""></section>');
  marked.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: { "images/old.png": { places: { "index.html": { decorative: true } } } } }));
  await marked.controller.preparePlacement({ path: "index.html", node: [0, 0] })(image);
  assert.equal(batches.length, 1);
  assert.match(batches[0].edits.get("index.html")!, /alt=""/);
  assert.equal(JSON.parse(batches[0].edits.get(".editor/media.json")!).files["images/new.png"].places["index.html"].decorative, true);
  const invalid = fixture({ locateElement: source => ({ tag: startTags(source)[0] }) });
  assert.throws(() => invalid.controller.preparePlacement({ path: "index.html", node: [0] }), /That element is not an image/);
});

test("agent placement holds its page and decoded file proof across lazy reads", async () => {
  const f = fixture();
  const place = f.controller.preparePlacement({ path: "index.html", node: [0, 0] });
  f.sources.set("index.html", '<section><img src="/images/old.png" alt="Other words"></section>');
  await assert.rejects(place({ path: "images/new.png", alt: "New" }), /This image changed/);
  assert.equal(f.changes.length, 0);
  const asset = fixture();
  await assert.rejects(asset.controller.preparePlacement({ path: "index.html", node: [0, 0] })(
    { path: "images/old.png", alt: "New" }, { path: "images/old.png", version: "previous-sha" },
  ), /image changed while preparing/);
  assert.equal(asset.changes.length, 0);
});
