import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaController, type MediaControllerPorts, type MediaModule } from "../src/controllers/media-controller.ts";
import type { SavedDraft } from "../src/drafts.ts";
import type { MediaPickerOptions } from "../src/page-builder/media-picker.ts";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { placeMediaImage } from "../src/page-builder/media-place";
import type { MediaHeldFiles } from "../src/page-builder/media-picker";
import { readSource, type SourceNode } from "../src/page-builder/source-tree";
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
  await context.applyBatch({ label: "images", edits: new Map(), moves: [], deletes: [], restores: [], uploads: [], expectedPaths: [], expectedSources: new Map(), expectedAssets: new Map() });
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

test("a file brought back outside Media shows its kept records on the page at once", async () => {
  const removed = (sha: string) => JSON.stringify({ version: 2, collections: [], files: {}, removed: [
    { path: "images/old.png", sha, date: new Date().toISOString().slice(0, 10), record: { places: { "index.html": { decorative: true } } } },
  ] });
  const f = fixture();
  f.sources.set(".editor/media.json", removed("sha"));
  f.controller.placeState("index.html", "/images/old.png", "");
  await new Promise(resolve => setTimeout(resolve, 0));
  // The branch holds the removed blob again (Files' or Save's Restore): its Decorative mark is back.
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "")?.state, "decorative");
  // Other bytes at that address are not the removed file.
  f.sources.set(".editor/media.json", removed("another"));
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "")?.state, "missing");
  // Still deleted as a draft: not back.
  f.sources.set(".editor/media.json", removed("sha"));
  f.records.push({ ...f.scope, version: 1, path: "images/old.png", baseSha: "sha", original: "", content: "", deleted: true, updatedAt: 1 } as never);
  assert.equal(f.controller.placeState("index.html", "/images/old.png", "")?.state, "missing");
});

test("a Decorative press on a file back outside Media proves the bytes its records came back for", async () => {
  const f = fixture();
  const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [];
  f.ports.applyBatch = async (_scope, _stamp, batch) => { batches.push(batch); };
  f.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: {}, removed: [
    { path: "images/old.png", sha: "sha", date: new Date().toISOString().slice(0, 10), record: { collections: ["Work"] } },
  ] }));
  await f.controller.changePlace("index.html", [0, 0], true);
  assert.deepEqual(f.errors, []);
  // The transaction refuses when these bytes change before it applies (media-draft-transaction).
  assert.deepEqual([...batches[0].expectedAssets], [["images/old.png", "sha"]]);
  const written = JSON.parse(batches[0].edits.get(".editor/media.json")!);
  assert.deepEqual(written.files["images/old.png"].collections, ["Work"]);
  assert.deepEqual(written.removed ?? [], []);
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

test("placement uses the new file measurement and adjusts page priority in the same change", async () => {
  const seen: unknown[] = [], written: Parameters<MediaControllerPorts["change"]>[2][] = [];
  const f = fixture({
    measureImage: async (...args) => { seen.push(args); return { sizes: "650px", firstScreen: true, large: true, images: [{ node: [0, 1], firstScreen: false, large: false }] }; },
    locateElement: (source, node) => { const tag = startTags(source).filter(tag => tag.name === "img")[node[1]]; return tag && { tag }; },
    change: (_path, _source, edits) => { written.push(edits); return true; },
  });
  f.sources.set("index.html", '<section><img src="/images/old.png" alt="Old alt"><img fetchpriority="high" loading="lazy" class="other"></section>');
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await f.pick()!.onPick!({ path: "images/new.png", width: 1200, height: 600, alt: "", variants: [{ path: "images/new-480.png", width: 480 }] }, () => false);
  assert.equal(seen.length, 1); assert.deepEqual(seen[0], ["index.html", [0, 0], { path: "images/new.png", width: 1200, height: 600, alt: "", variants: [{ path: "images/new-480.png", width: 480 }] }]);
  assert.equal(written.length, 1); assert.equal(written[0].length, 2);
  const target = written[0].find(edit => edit.text.includes('src="/images/new.png"'))!;
  assert.match(target.text, /sizes="650px"/); assert.match(target.text, /fetchpriority="high"/); assert.doesNotMatch(target.text, /loading=/);
  const other = written[0].find(edit => edit.text.includes('class="other"'))!;
  assert.match(other.text, /loading="lazy"/); assert.doesNotMatch(other.text, /fetchpriority/);
});
test("failed measurement places with lazy auto fallback", async () => {
  const f = fixture({ measureImage: async () => { throw new Error("timeout"); } });
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await f.pick()!.onPick!({ path: "images/new.png", width: 1200, height: 600, alt: "", variants: [{ path: "images/new-480.png", width: 480 }] }, () => false);
  assert.match(f.changes[0], /sizes="auto, 100vw"/); assert.match(f.changes[0], /loading="lazy"/); assert.doesNotMatch(f.changes[0], /fetchpriority/);
});
for (const changed of ["page", "records", "repository"] as const) test(`measurement await rechecks ${changed} proof`, async () => {
  const f = fixture({ measureImage: async () => {
    if (changed === "page") f.sources.set("index.html", "new page");
    if (changed === "records") f.sources.set(".editor/media.json", "new records");
    if (changed === "repository") f.bump();
    return undefined;
  } });
  await f.controller.chooseImage({ path: "index.html", node: [0, 0] });
  await assert.rejects(f.pick()!.onPick!({ path: "images/new.png", alt: "" }, () => false), /changed/);
  assert.equal(f.changes.length, 0);
});

for (const artDirected of [false, true]) test(`picker unwraps a picture in one change; art direction ${artDirected}`, async () => {
  const calls: Parameters<MediaControllerPorts["change"]>[] = [], told: string[] = [];
  const f = fixture({
    locateElement: (source, node) => { const tree = readSource(source), element = tree.at(node); return element && tree.range(element); },
    change: (...args) => { calls.push(args); return true; }, announce: text => { told.push(text); },
  });
  const source = `<section>\n<picture slot="hero"><source ${artDirected ? 'MEDIA="(max-width: 600px)"' : 'type="image/avif"'} srcset="/images/old.avif"><img class="hero" src="/images/old.png" alt="Old alt"></picture>\n</section>`;
  f.sources.set("index.html", source);
  await f.controller.chooseImage({ path: "index.html", node: [0, 0, 1] });
  await f.pick()!.onPick!({ path: "images/new.png", alt: "New" }, () => false);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0][3], [0, 0]);
  const page = [...calls[0][2]].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
  assert.doesNotMatch(page, /<source|<picture/); assert.match(page, /class="hero"/); assert.match(page, /slot="hero"/); assert.match(page, /src="\/images\/new.png"/);
  assert.deepEqual(told, artDirected ? ["Image replaced. The new picture is now used on all screens."] : []);
});
test("Decorative picture cleanup and records share one batch", async () => {
  const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [], told: string[] = [];
  const f = fixture({
    locateElement: (source, node) => { const tree = readSource(source), element = tree.at(node); return element && tree.range(element); },
    applyBatch: async (_scope, _stamp, batch) => { batches.push(batch); }, announce: text => { told.push(text); },
  });
  f.sources.set("index.html", '<section><picture><source media="(max-width:600px)" srcset="/images/old.avif"><img src="/images/old.png" alt=""></picture></section>');
  f.sources.set(".editor/media.json", JSON.stringify({ version: 2, collections: [], files: { "images/old.png": { places: { "index.html": { decorative: true } } } } }));
  await f.controller.chooseImage({ path: "index.html", node: [0, 0, 1] });
  await f.pick()!.onPick!({ path: "images/new.png", alt: "New" }, () => false);
  assert.equal(f.changes.length, 0); assert.equal(batches.length, 1);
  assert.doesNotMatch(batches[0].edits.get("index.html")!, /<picture|<source/);
  assert.deepEqual(JSON.parse(batches[0].edits.get(".editor/media.json")!).files["images/new.png"].places, { "index.html": { decorative: true } });
  assert.deepEqual(told, ["Image replaced. The new picture is now used on all screens."]);
});

test("held picker files unwrap a picture through the single save transaction", async () => {
  const told: string[] = [], pages: string[] = [];
  const f = fixture({ locateElement: (source, node) => { const tree = readSource(source), element = tree.at(node); return element && tree.range(element); }, announce: text => { told.push(text); } });
  const source = '<section><picture slot="photo"><source media="phone" srcset="/old.avif"><img src="/images/old.png" alt="Old alt"></picture></section>';
  f.sources.set("index.html", source);
  const image = { path: "images/new.svg", alt: "New" }, tree = readSource(source), expected = source.slice(tree.range(tree.at([0, 0, 1])!)!.start, tree.range(tree.at([0, 0, 1])!)!.end);
  const held: MediaHeldFiles = {
    image: () => image,
    save: async place => {
      const after = place!.apply([image.path], [], { version: 2, collections: [], files: {} });
      pages.push(typeof after === "string" ? after : after.page);
      return { paths: [image.path], placed: true, note: "" };
    },
  };
  await placeMediaImage(f.ports, () => f.controller.workspaceContext(), { path: "index.html", node: [0, 0, 1] }, image,
    { stamp: f.ports.stamp(), epoch: 0, source, expected, initialAlt: "Old alt" }, () => false, held);
  assert.equal(pages.length, 1); assert.equal(f.changes.length, 0);
  assert.doesNotMatch(pages[0], /<picture|<source/); assert.match(pages[0], /slot="photo"/);
  assert.deepEqual(told, ["Image replaced. The new picture is now used on all screens."]);
});

test("older placement batches copies and srcset, carries held uploads, and handles failure, cancel and drift", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let fail = false, huge = false, requests = 0, during: () => void = () => {};
  class Worker {
    onmessage?: (event: { data: { result?: import("../src/page-builder/media-optimise").MediaOptimiseResult; error?: string } }) => void;
    onerror?: () => void;
    postMessage(message: { file: File; copies: { widths: number[]; format: string } }) {
      requests++;
      assert.deepEqual(message.copies.widths, [480, 960, 1600]);
      queueMicrotask(() => {
        during();
        this.onmessage?.({ data: fail ? { error: "decode failed" } : { result: { before: 100, after: 30,
          outputs: message.copies.widths.map(width => ({ blob: new Blob([huge && width === 1600 ? new Uint8Array(21 * 1024 * 1024) : "copy"], { type: "image/webp" }), extension: "webp", variantWidth: width, width, height: width / 2 })) } } });
      });
    }
    terminate() {}
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  try {
    const setup = () => {
      const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [], told: string[] = [];
      const f = fixture({ applyBatch: async (_scope, _stamp, batch) => { batches.push(batch); }, announce: text => { told.push(text); } });
      f.ports.workspace = () => ({ repo: f.scope.repo, scope: f.scope, identity: "workspace:1", site: { routes: { "/": "index.html" }, components: {} }, nativePaths: ["index.html", "images/old.png"], drafts: { list: () => f.records, get: () => undefined, save: () => true, remove: () => true } });
      return { f, batches, told };
    };
    const image = { path: "images/old.png", alt: "Old", width: 2000, height: 1000 };
    const first = setup();
    await first.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await first.f.pick()!.onPick!(image, () => false);
    assert.equal(first.f.changes.length, 0); assert.equal(first.batches.length, 1);
    const batch = first.batches[0];
    assert.equal(batch.label, "Image replaced");
    assert.deepEqual(batch.uploads.map(upload => upload.path), ["images/old-480.webp", "images/old-960.webp", "images/old-1600.webp"]);
    assert.match(batch.edits.get("index.html")!, /srcset="\/images\/old-480.webp 480w, \/images\/old-960.webp 960w, \/images\/old-1600.webp 1600w, \/images\/old.png 2000w"/);
    assert.equal(batch.expectedAssets.get(image.path), "sha");
    const heldCase = setup();
    let captured: import("../src/page-builder/media-picker").MediaPlacement | undefined;
    const held: MediaHeldFiles = { image: () => image, save: async place => { captured = place; return { paths: [], placed: true, note: "" }; } };
    await heldCase.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await heldCase.f.pick()!.onPick!(image, () => false, held);
    assert.equal(captured?.uploads?.length, 3); assert.equal(captured?.expectedAssets?.get(image.path), "sha");
    const applied = captured!.apply([], [], { version: 2, collections: [], files: {} });
    assert.match(typeof applied === "string" ? applied : applied.page, /old-480.webp 480w/);
    fail = true;
    const failed = setup(); await failed.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await failed.f.pick()!.onPick!(image, () => false);
    assert.equal(failed.f.changes.length, 1); assert.equal(failed.batches.length, 0);
    assert.deepEqual(failed.told, ["Image replaced. Smaller copies could not be made, so the full-size picture is used."]);
    fail = false;
    // A copy over the upload limit, or no names that join the family: full size, with the note, nothing saved.
    huge = true;
    const oversized = setup(); await oversized.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await oversized.f.pick()!.onPick!(image, () => false);
    assert.equal(oversized.f.changes.length, 1); assert.equal(oversized.batches.length, 0);
    assert.deepEqual(oversized.told, ["Image replaced. Smaller copies could not be made, so the full-size picture is used."]);
    assert.doesNotMatch(oversized.f.changes[0], /srcset/);
    huge = false;
    const unnamed = setup(), shared = unnamed.f.ports.workspace();
    unnamed.f.ports.workspace = () => ({ ...shared!, nativePaths: ["index.html", "images/old.gif", "images/old.png"] });
    const asked = requests;
    await unnamed.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await unnamed.f.pick()!.onPick!({ ...image, path: "images/old.gif" }, () => false);
    assert.equal(requests, asked); assert.equal(unnamed.batches.length, 0); assert.equal(unnamed.f.changes.length, 1);
    assert.deepEqual(unnamed.told, ["Image replaced. Smaller copies could not be made, so the full-size picture is used."]);
    let cancelled = false; during = () => { cancelled = true; };
    const cancel = setup(); await cancel.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await cancel.f.pick()!.onPick!(image, () => cancelled);
    assert.equal(cancel.f.changes.length + cancel.batches.length, 0);
    const drift = setup(); during = () => { drift.f.ports.entry = () => ({ sha: "changed", size: 12 }); };
    await drift.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await assert.rejects(async () => drift.f.pick()!.onPick!(image, () => false), /image changed while preparing/);
    assert.equal(drift.f.changes.length + drift.batches.length, 0);
    const adopted = setup(); during = () => {};
    const current = adopted.f.ports.workspace();
    adopted.f.ports.workspace = () => ({ ...current!, nativePaths: ["index.html", "images/old.png", "images/old-480x320.png"] });
    const before = requests;
    await adopted.f.controller.chooseImage({ path: "index.html", node: [0, 0] });
    await adopted.f.pick()!.onPick!({ ...image, variants: [{ path: "images/old-480x320.png", width: 480 }] }, () => false);
    assert.equal(requests, before); assert.equal(adopted.batches.length, 0);
    assert.match(adopted.f.changes[0], /old-480x320.png 480w/);
  } finally { descriptor ? Object.defineProperty(globalThis, "Worker", descriptor) : Reflect.deleteProperty(globalThis, "Worker"); }
});

test("page slot placement batches older copies while component fallback stays unchanged", async () => {
  // Balanced fixture only: supply the browser adapter with the source tree, without HTML repairs.
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => {
      let content: unknown;
      return {
        set innerHTML(markup: string) {
          const tree = readSource(markup);
          class Element {
            children: Element[];
            constructor(readonly node?: SourceNode, readonly parentNode: Element | null = null) {
              this.children = tree.children(node).map(child => new Element(child, this));
            }
            get nodeType() { return this.node ? 1 : 11; }
            get localName() { return this.node?.type === "element" ? this.node.name : ""; }
            get parentElement() { return this.parentNode?.node ? this.parentNode : null; }
            get childNodes() { return this.children; }
            getAttribute(name: string) { return this.node ? tree.attribute(this.node, name)?.value ?? null : null; }
            hasAttribute(name: string) { return this.getAttribute(name) !== null; }
            contains(other: Element): boolean { return this === other || this.children.some(child => child.contains(other)); }
            querySelectorAll(selector: string): Element[] {
              const all = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
              const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
              return selector === "*" ? all : all.filter(child => attribute
                ? child.hasAttribute(attribute[1]) && (attribute[2] === undefined || child.getAttribute(attribute[1]) === attribute[2])
                : child.localName === selector);
            }
          }
          content = new Element();
        },
        get content() { return content; },
      };
    },
  } });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let requests = 0, during: () => void = () => {};
  class Worker {
    onmessage?: (event: { data: { result: import("../src/page-builder/media-optimise").MediaOptimiseResult } }) => void;
    onerror?: () => void;
    postMessage() {
      requests++;
      queueMicrotask(() => during());
      queueMicrotask(() => this.onmessage?.({ data: { result: { before: 100, after: 3,
        outputs: [480, 960, 1600].map(width => ({ blob: new Blob(["x"], { type: "image/webp" }), extension: "webp", variantWidth: width, width, height: width / 2 })) } } }));
    }
    terminate() {}
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  try {
    const { placeMediaPath } = await import("../src/page-builder/media-page-markup");
    const batches: Parameters<MediaControllerPorts["applyBatch"]>[2][] = [];
    const f = fixture({ applyBatch: async (_scope, _stamp, batch) => { batches.push(batch); } });
    const image = { path: "images/old.png", width: 2000, height: 1000, alt: "" };
    const source = f.sources.get("index.html")!;
    const place = { path: "index.html", source, edit: (url: string) => `<section><img src="${url}" alt="new"></section>`, placed: false };
    await placeMediaPath(f.ports, f.ports.stamp(), place, image, () => false, undefined, () => {}, () => f.controller.workspaceContext());
    assert.equal(place.placed, true); assert.equal(batches.length, 1); assert.equal(batches[0].uploads.length, 3);
    assert.match(batches[0].edits.get("index.html")!, /old-480.webp 480w/);
    assert.equal(batches[0].expectedSources.get(".editor/media.json"), f.sources.get(".editor/media.json"));
    // Cancel while the copies are made: nothing placed or saved. A changed main refuses without saving copies.
    let cancelled = false, resolved: string | undefined = "unset"; during = () => { cancelled = true; };
    const stopped = { ...place, placed: false };
    await placeMediaPath(f.ports, f.ports.stamp(), stopped, image, () => cancelled, undefined, value => { resolved = value; }, () => f.controller.workspaceContext());
    assert.equal(stopped.placed, false); assert.equal(resolved, undefined); assert.equal(batches.length, 1); assert.equal(f.changes.length, 0);
    during = () => { f.ports.entry = () => ({ sha: "changed", size: 12 }); };
    const drifted = { ...place, placed: false };
    await assert.rejects(async () => placeMediaPath(f.ports, f.ports.stamp(), drifted, image, () => false, undefined, () => {}, () => f.controller.workspaceContext()),
      /changed while preparing placement/);
    assert.equal(drifted.placed, false); assert.equal(batches.length, 1); assert.equal(f.changes.length, 0);
    during = () => {};
    const before = requests;
    const component = { ...place, path: "components/card.html", placed: false };
    f.sources.set(component.path, source);
    await placeMediaPath(f.ports, f.ports.stamp(), component, image, () => false, undefined, () => {}, () => { throw new Error("Components do not need a workspace"); });
    assert.equal(requests, before); assert.equal(f.changes.length, 1); assert.doesNotMatch(f.changes[0], /srcset/);
  } finally {
    descriptor ? Object.defineProperty(globalThis, "Worker", descriptor) : Reflect.deleteProperty(globalThis, "Worker");
    documentDescriptor ? Object.defineProperty(globalThis, "document", documentDescriptor) : Reflect.deleteProperty(globalThis, "document");
  }
});

test("a picture spot's picker lists videos too; a GIF added there becomes a looping video in the spot, one save", async () => {
  const { locatePageElement } = await import("../src/page-builder/media-insert");
  const page = '<html><head><title>T</title></head><body><main><section><img slot="photo" class="shot" src="/images/old.png" alt="Old"></section></main></body></html>';
  const player = ["styles/media-player.css", "scripts/media-player.js", "scripts/media-online.js"];
  const told: string[] = [];
  const f = fixture({ locateElement: locatePageElement, announce: text => { told.push(text); } });
  const base = f.ports.workspace.bind(f.ports);
  f.ports.workspace = () => ({ ...base()!, nativePaths: ["index.html", "images/old.png", ...player] });
  f.sources.set("index.html", page);
  await f.controller.chooseImage({ path: "index.html", node: [0, 0, 0] });
  assert.match(f.pick()!.accept!, /^image\/\*,.*\.mp4/);
  assert.equal(f.pick()!.chosenNote!("clip.mp4"), "loops silently here");
  assert.equal(f.pick()!.chosenNote!("photo.webp"), undefined);
  // The added file keeps its own name until saved; what it became (an MP4) decides the place.
  const request = { file: new File(["gif"], "cat.gif", { type: "image/gif" }), folder: "media", result: { outputs: [{ blob: new Blob(["mp4"]), extension: "mp4", width: 320, height: 240 }] } };
  let saved: string | undefined;
  // eslint-disable-next-line no-restricted-syntax -- a held addition needs only these; its prepared result is the browser's
  const held = {
    chosen: () => ({ request, take() {} }),
    image: (paths: string[]) => ({ path: paths[0], alt: "", variants: [] }),
    save: async (place?: Parameters<MediaHeldFiles["save"]>[0]) => {
      const result = place!.apply(["media/cat.mp4"], [request] as never, { version: 2, collections: [], files: { "media/cat.mp4": { fromGif: true, still: "media/cat.webp" } } });
      saved = typeof result === "string" ? result : result.page;
      return { paths: ["media/cat.mp4"], placed: true, note: "" };
    },
  } as unknown as MediaHeldFiles;
  await f.pick()!.onPick!({ path: "pending:1", alt: "", variants: [] }, () => false, held);
  assert.deepEqual(f.errors, []);
  assert.match(saved!, /<section><video src="\/media\/cat.mp4" poster="\/media\/cat.webp" controls muted loop playsinline slot="photo" class="shot" width="320" height="240" aria-label="Old"><\/video><\/section>/);
  assert.match(saved!, /<script type="module" src="\/scripts\/media-player.js"><\/script>/);
  assert.equal(f.changes.length, 0);
  assert.deepEqual(told, ["Looping video added."]);
});
