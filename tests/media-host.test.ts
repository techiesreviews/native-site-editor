import { after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import type { MediaHostPorts } from "../src/controllers/media-host.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftKey, draftStore, type DraftScope, type SavedDraft } from "../src/drafts.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import { createWorkspaceSession, githubScope, type SessionStamp } from "../src/workspace-session.ts";
import type { MediaWorkspaceBatch } from "../src/page-builder/media-workspace.ts";
import type { MediaBatchPorts } from "../src/media-batch.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
import { MEDIA_RECORDS_PATH } from "../shared/media-records-path.ts";
import { NATIVE_CONFIG_PATH, resolveNativeProject } from "../shared/native-project.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";

// The draft store reads these browser globals on first use; no other tabs, so no channel keeps the process alive.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["window", "document", "localStorage", "addEventListener", "BroadcastChannel"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const values = new Map<string, string>();
fakeGlobals.window = { addEventListener: () => {} };
fakeGlobals.document = { addEventListener: () => {}, visibilityState: "visible" };
fakeGlobals.addEventListener = () => {};
fakeGlobals.BroadcastChannel = undefined;
fakeGlobals.localStorage = {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }, key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; },
};
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
// Stand-ins the tests drive, on `mediaHostStubs`: the media batch's step and the Files adding (both loaded lazily),
// and the upload bytes, which live in IndexedDB in the browser.
interface Stubs { batch?: (...args: unknown[]) => unknown; adding?: (...args: unknown[]) => unknown; bytes: { get(key: string): Promise<unknown> }; pages: number; used: string[] }
const stubs: Stubs = { bytes: { get: async () => undefined }, pages: 0, used: [] };
fakeGlobals.mediaHostStubs = stubs;
const stubModules: Record<string, string> = {
  // The preview needs a browser: the host only makes one for a background page, which these tests never open.
  "components/native-preview.ts": "export const createNativePreview = () => ({});",
  "media-batch.ts": "export const applyMediaBatch = (...args) => globalThis.mediaHostStubs.batch(...args);",
  "page-builder/media-files-adding.ts": "export const addFilesTo = (...args) => globalThis.mediaHostStubs.adding(...args);",
  // Background pages need a browser: each one made is counted, and its measure answers with what it was asked.
  "background-page.ts": [
    "export const backgroundKey = (scope, path) => `${scope.branch}:${path}`;",
    "export const openBackgroundFrame = () => ({});",
    "export const createBackgroundPages = () => { globalThis.mediaHostStubs.pages++; return { use: (key, _open, work) => { globalThis.mediaHostStubs.used.push(key); return work({ measure: async (request) => ({ request }) }); } }; };",
  ].join("\n"),
};
registerHooks({
  load: (url, context, next) => {
    const stub = Object.entries(stubModules).find(([path]) => url.endsWith(`/src/${path}`));
    if (stub) return { format: "module", source: stub[1], shortCircuit: true };
    // The real uploads module, with the bytes the test holds.
    if (url.endsWith("/src/uploads.ts")) return { format: "module", source: `export * from "${url}?real"; export const uploadBytes = () => globalThis.mediaHostStubs.bytes;`, shortCircuit: true };
    return next(url, context);
  },
});
const { createMediaHost } = await import("../src/controllers/media-host.ts");
const { uploadKey } = await import("../src/uploads.ts");

const SHA = "a".repeat(40);
const REPO = { id: 1, name: "site", full_name: "o/site", private: false, default_branch: "main", owner: { login: "o", type: "User" } } satisfies Repository;
const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;
const entryOf = (path: string) => ({ path, mode: "100644", type: "blob", sha: `${path}-sha` }) satisfies TreeEntry;
const PATHS = ["a.png", "b.jpg", "notes.txt", "logo.svg"];
const SNAPSHOT = { branch: "main", commit: SHA, entries: PATHS.map(entryOf), tree: PATHS.map(entryOf) } satisfies Snapshot;
const draft = (path: string, fields: Partial<SavedDraft> = {}): SavedDraft => ({ ...SCOPE, version: 1, path, baseSha: null, original: "", content: "", updatedAt: 0, ...fields });
// Drafts live in the one real store: each test takes its own out again, whatever it asserts.
const forget = (t: TestContext, ...paths: string[]) => t.after(() => { for (const path of paths) draftStore().remove(SCOPE, path); });
// Where a stand-in takes a type: values the host only hands on to lazily loaded modules (and GitHub's `api`, never called here).
// eslint-disable-next-line no-restricted-syntax -- handed on, never called here.
const handedOn = <T>() => ({}) as T;
// eslint-disable-next-line no-restricted-syntax -- the stand-ins implement only the members the host touches.
const asElement = <T extends HTMLElement>(fake: object) => fake as unknown as T;

// A host over the real runtime, app store and drafts; GitHub and the other ports record what they were asked.
// `late` stands in for what main.ts declares further down or sets later (read through getters and arrows).
// `race` wraps the branch reads (tests/support/await-race.ts).
function setup(race?: AwaitRace) {
  const calls: string[] = [], reads: string[] = [], stamps: (string | undefined)[] = [], indexed: string[] = [];
  const wrap = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => (race ? race.port(name, work) : work);
  const at: { load: number; setup: string; key: string; holds: boolean; reading?: () => void } = { load: 1, setup: "o/site@main", key: "o/site@main:1", holds: true };
  const stamp: SessionStamp = { load: 1, scope: undefined, holds: () => at.holds, changed: () => (at.holds ? undefined : "scope") };
  const late: { preview?: MediaHostPorts["nativePreview"]; label?: string; tab?: string; tabsShown?: boolean; elements?: Record<string, object> } = {};
  const cleanSources = new CleanSourceCache(() => "o");
  const runtime = createNativeSiteRuntime({
    scope: () => SCOPE, shown: () => undefined, drafts: draftStore, mounted: () => undefined, clean: cleanSources,
    textKey: () => at.key, route: () => undefined, openFile: () => undefined, pageStyles: () => [], find: async () => undefined,
    readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  const appStore = createAppStore(createDraftStore());
  appStore.repository.value = REPO;
  appStore.snapshot.value = SNAPSHOT;
  const record = (name: string) => () => { calls.push(name); };
  const session = createWorkspaceSession(githubScope(SCOPE));
  const ports = {
    runtime, appStore, workspaceSession: session, editorModule: handedOn<MediaHostPorts["editorModule"]>(),
    mediaHistoryHome: handedOn<MediaHostPorts["mediaHistoryHome"]>(), guardedEdits: { stamp: (over?: "repository") => { stamps.push(over); return stamp; } }, parkedSteps: { park: () => {} },
    finishedWork: { add: (scope: DraftScope, kind: string, details?: { count?: number }) => { calls.push(`finished ${kind} ${scope.branch} ${details?.count ?? ""}`.trim()); } },
    pageStructureController: { renderEditBar: record("renderEditBar"), editOpenPage: () => true },
    repositoryIndex: { seed: () => { indexed.push("seed"); }, entry: (_repo: Repository, _snapshot: Snapshot, path: string) => { indexed.push("entry"); return entryOf(path); }, find: async () => undefined }, versions: {}, cleanSources, api: handedOn<MediaHostPorts["api"]>(),
    get nativePreview() { return late.preview; },
    get pagesController() { return { pageLabel: (file: string) => (late.label ? `${late.label} ${file}` : undefined), selectTab: () => {}, explorerTab: () => late.tab ?? "pages" }; },
    get workspace() { return { explorerDropdown: undefined }; },
    element: <T extends HTMLElement>(id: string) => asElement<T>(late.elements?.[id] ?? { hidden: !(id === "explorer-tabs" && late.tabsShown) }),
    lazyModule: <T>(load: () => Promise<T>) => load,
    loadMediaWorkspace: handedOn<MediaHostPorts["loadMediaWorkspace"]>(), loadMedia: handedOn<MediaHostPorts["loadMedia"]>(),
    draftScope: () => SCOPE, currentLoad: () => at.load,
    stampOf: (epoch: number) => ({ ...stamp, load: epoch }), setupScope: () => at.setup, nativeTextIndexScopeKey: () => at.key,
    entryAt: (path: string) => (PATHS.includes(path) ? entryOf(path) : undefined),
    findEntry: wrap("findEntry", async (path: string) => (PATHS.includes(path) ? entryOf(path) : undefined)),
    readFile: wrap("readFile", async (_repo: string, sha: string) => { reads.push(sha); at.reading?.(); return `text of ${sha}`; }),
    readBlob: async () => new Blob(), listRepositoryFiles: async () => PATHS, loadNativeAssets: async () => {}, updateNativePreviewSources: record("updateNativePreviewSources"),
    afterFileChanges: record("afterFileChanges"), openAfter: async (path: string | undefined, keep?: boolean, quiet?: boolean) => { calls.push(`open ${path}${keep ? " keep" : ""}${quiet ? " quiet" : ""}`); },
    restoreFile: async (path: string, epoch: SessionStamp, options?: { linkDefaultStyle?: boolean }) => { calls.push(`restore ${path} ${epoch.load} ${options?.linkDefaultStyle}`); },
    imagesSignature: () => "", announce: (text: string) => { calls.push(`announce ${text}`); }, undoAction: () => undefined,
    errorMessage: (error: unknown) => { calls.push(`error ${String(error)}`); },
  } satisfies MediaHostPorts;
  return { host: createMediaHost(ports), calls, reads, stamps, indexed, at, late, runtime, appStore, session, cleanSources, stamp };
}

test("an image's Address suggests the branch's and the drafted images, sorted, without deleted ones", (t) => {
  const { host } = setup();
  forget(t, "new.webp", "b.jpg", "draft.txt");
  draftStore().save(draft("new.webp", { upload: { size: 1, type: "image/webp" }, opaque: true, sourceSha: SHA }));
  draftStore().save(draft("draft.txt", { content: "words" }));
  draftStore().save(draft("b.jpg", { baseSha: "b.jpg-sha", deleted: true }));
  assert.deepEqual(host.nativeImagePaths(), ["a.png", "logo.svg", "new.webp"]);
});

test("media text reads a held text at once, else reads the branch once and keeps it for the next read", async () => {
  const { host, reads, runtime } = setup();
  runtime.base.sources.set("held.svg", "<svg>held</svg>");
  assert.equal(await host.readMediaText("held.svg"), "<svg>held</svg>");
  assert.equal(await host.readMediaText("logo.svg"), "text of logo.svg-sha");
  assert.equal(await host.readMediaText("logo.svg"), "text of logo.svg-sha");
  assert.deepEqual(reads, ["logo.svg-sha"]);
  assert.equal(await host.readMediaText("missing.svg"), undefined);
});

test("media text read while the text index's key moves on is dropped and not kept", async () => {
  const { host, reads, at } = setup();
  at.reading = () => { at.key = "o/site@main:2"; };
  assert.equal(await host.readMediaText("logo.svg"), undefined);
  at.reading = undefined; at.key = "o/site@main:1";
  assert.equal(await host.readMediaText("logo.svg"), "text of logo.svg-sha");
  assert.deepEqual(reads, ["logo.svg-sha", "logo.svg-sha"]);
});

test("media text of a deleted file is none, and a moved file reads its blob's text", async (t) => {
  const { host, reads } = setup();
  forget(t, "logo.svg", "moved.svg");
  draftStore().save(draft("logo.svg", { baseSha: "logo.svg-sha", deleted: true }));
  draftStore().save(draft("moved.svg", { opaque: true, sourceSha: "logo.svg-sha", movedFrom: "logo.svg" }));
  assert.equal(await host.readMediaText("logo.svg"), undefined);
  assert.equal(await host.readMediaText("moved.svg"), "text of logo.svg-sha");
  assert.deepEqual(reads, ["logo.svg-sha"]);
});

test("the site's own origins come from its Site address and CNAME as they read now", () => {
  const { host, runtime } = setup();
  assert.deepEqual(host.mediaOrigins(), []);
  runtime.base.sources.set(NATIVE_CONFIG_PATH, JSON.stringify({ site: { url: "https://example.org/blog" } }));
  runtime.base.sources.set("CNAME", "www.example.com\n");
  assert.deepEqual(host.mediaOrigins(), ["https://example.org", "https://www.example.com"]);
});

test("discarding an upload removes it, says so and resyncs the files; anything else is left", async (t) => {
  const { host, calls } = setup();
  forget(t, "photo.png", "notes.txt", MEDIA_RECORDS_PATH);
  draftStore().save(draft("notes.txt", { content: "words" }));
  await host.discardUpload("notes.txt");
  assert.ok(draftStore().get(SCOPE, "notes.txt"));
  draftStore().save(draft("photo.png", { upload: { size: 1, type: "image/png" }, opaque: true, sourceSha: SHA }));
  await host.discardUpload("photo.png");
  assert.equal(draftStore().get(SCOPE, "photo.png"), undefined);
  assert.deepEqual(calls, ["afterFileChanges", "announce Discarded photo.png."]);
});

test("an upload discarded once its stamp no longer holds stays", async (t) => {
  const { host, calls, at, stamps } = setup();
  forget(t, "photo.png");
  draftStore().save(draft("photo.png", { upload: { size: 1, type: "image/png" }, opaque: true, sourceSha: SHA }));
  const discarding = host.discardUpload("photo.png");
  at.holds = false;
  await discarding;
  assert.ok(draftStore().get(SCOPE, "photo.png"));
  assert.deepEqual(calls, []);
  // The default stamp, as before the move: not the repository's.
  assert.deepEqual(stamps, [undefined]);
});

test("files added with no repository open add nothing", async () => {
  const { host, appStore } = setup();
  appStore.repository.value = undefined;
  assert.deepEqual(await host.uploadFilesTo("images", [new File(["x"], "x.png")]), []);
  assert.equal(host.mediaPorts.pin?.(), undefined);
});

test("the media controller's ports read the host at call time", async () => {
  const { host, calls, at, late } = setup();
  assert.equal(host.mediaPorts.identity(), "1:o/site@main");
  at.load = 2; at.setup = "o/site@other";
  assert.equal(host.mediaPorts.identity(), "2:o/site@other");
  assert.equal(host.mediaPorts.generation(), 2);
  assert.equal(host.mediaPorts.placeLabel?.("about.html"), undefined);
  late.label = "Page";
  assert.equal(host.mediaPorts.placeLabel?.("about.html"), "Page about.html");
  assert.equal(host.mediaPorts.mediaSelected(), false);
  late.tab = "media";
  assert.equal(host.mediaPorts.mediaSelected(), true);
  assert.equal(host.mediaPorts.workspace()?.identity, "2:o/site@other");
  await host.mediaPorts.restoreFile("index.html", 7);
  await host.mediaPorts.openPage("about.html");
  assert.deepEqual(calls, ["restore index.html 7 false", "open about.html"]);
});

test("an image is measured in the preview only while it shows that page", async () => {
  const { host, runtime, late } = setup();
  assert.equal(await host.mediaPorts.measureImage?.("index.html", [0], {}), undefined);
  const measured: unknown[] = [], answer = { sizes: undefined, widths: [], firstScreen: true, boxes: [], large: false, images: [{ node: [0], firstScreen: true, large: false }] };
  late.preview = { shownRoute: () => "/", measureImage: async (request) => { measured.push(request); return answer; },
    selectAfterUpdate: () => {}, flashInsert: () => {}, selectionBox: () => undefined, imageLook: () => undefined, scrollBy: () => {}, playMedia: () => {} };
  assert.equal(await host.mediaPorts.measureImage?.("index.html", [0], { width: 4, height: 3 }), undefined);
  const site = resolveNativeProject(["index.html"]);
  assert.ok(site.ok);
  runtime.site = site.site;
  assert.equal(await host.mediaPorts.measureImage?.("index.html", [0], { width: 4, height: 3 }), answer);
  assert.deepEqual(measured, [{ path: "index.html", node: [0], slot: undefined, style: undefined, image: { width: 4, height: 3 } }]);
});

test("a media batch goes to the page asked for, else the page open, with the repository stamp and the host's refresh", async (t) => {
  const { host, calls, stamps, appStore, stamp } = setup();
  const seen: { ports: MediaBatchPorts; scope: unknown; stamp: unknown; batch: unknown; opened: unknown }[] = [];
  t.after(() => { stubs.batch = undefined; });
  stubs.batch = (ports, scope, given, batch, _pin, opened) => { seen.push({ ports: ports as MediaBatchPorts, scope, stamp: given, batch, opened }); return { undoOn: "about.html" }; };
  const batch = handedOn<MediaWorkspaceBatch>();
  assert.deepEqual(await host.mediaPorts.applyBatch(SCOPE, stamp, batch, undefined, "about.html"), { undoOn: "about.html" });
  appStore.openFile.value = "index.html";
  await host.mediaPorts.applyBatch(SCOPE, stamp, batch);
  assert.deepEqual(seen.map(({ opened }) => opened), ["about.html", "index.html"]);
  assert.equal(seen[0].scope, SCOPE); assert.equal(seen[0].stamp, stamp); assert.equal(seen[0].batch, batch);
  const ports = seen[0].ports;
  stamps.length = 0;
  assert.equal(ports.stamp(), stamp);
  assert.deepEqual(stamps, ["repository"]);
  ports.refresh();
  assert.deepEqual(calls, ["afterFileChanges", "updateNativePreviewSources"]);
  appStore.selection.value = { path: "index.html", tag: "h1", text: "Home", reason: "click", selectors: [] };
  ports.refresh();
  assert.deepEqual(calls.slice(2), ["afterFileChanges", "updateNativePreviewSources", "renderEditBar"]);
});

test("files added speak only while their workspace shows, and count as finished there once another shows", async (t) => {
  t.after(() => { stubs.adding = undefined; });
  const { host, calls, session } = setup();
  let options: { announce(text: string): void; review?: unknown } | undefined, finish!: (paths: string[]) => void;
  const called = new Promise<void>((started) => {
    stubs.adding = (_host, folder, files, given) => {
      options = given as typeof options; calls.push(`adding ${String(folder)} ${(files as File[]).length}`); started();
      return new Promise<string[]>((done) => { finish = done; });
    };
  });
  const adding = host.uploadFilesTo("images", [new File(["x"], "x.png")]);
  await called;
  assert.equal(options?.review, undefined);
  options!.announce("Added 1 file.");
  session.next(githubScope({ ...SCOPE, branch: "dev" }));
  options!.announce("Added 1 file.");
  finish(["images/x.png"]);
  assert.deepEqual(await adding, ["images/x.png"]);
  assert.deepEqual(calls, ["adding images 1", "announce Added 1 file.", "finished added main 1"]);
});

test("files added with Files' tabs on show can send pictures to Media's Optimise sheet", async (t) => {
  t.after(() => { stubs.adding = undefined; });
  const { host, late } = setup();
  late.tabsShown = true;
  let review: unknown;
  stubs.adding = async (_host, _folder, _files, given) => { review = (given as { review?: unknown }).review; return []; };
  assert.deepEqual(await host.uploadFilesTo("images", [new File(["x"], "x.png")]), []);
  assert.equal(typeof review, "function");
});

test("a source media work read is kept with the site: pages, stylesheets and media records as the site's, the rest in the text index", () => {
  const { host, runtime, cleanSources, at } = setup();
  const paths = ["a.html", "a.css", MEDIA_RECORDS_PATH];
  for (const path of [...paths, "logo.svg"]) host.mediaPorts.rememberSource(path, `text of ${path}`);
  assert.deepEqual([...paths, "logo.svg"].map((path) => runtime.base.sources.has(path)), [false, false, false, false]);
  assert.equal(cleanSources.peek("", at.key, "logo.svg"), undefined);
  const site = resolveNativeProject(["index.html"]);
  assert.ok(site.ok);
  runtime.site = site.site;
  for (const path of [...paths, "logo.svg"]) host.mediaPorts.rememberSource(path, `text of ${path}`);
  assert.deepEqual(paths.map((path) => runtime.base.sources.get(path)), paths.map((path) => `text of ${path}`));
  assert.equal(runtime.base.sources.has("logo.svg"), false);
  assert.equal(cleanSources.peek("", at.key, "logo.svg"), "text of logo.svg");
});

// An upload's bytes, a moved file's blob and a branch file, each read with every await wrapped.
function readScenario(path: string) {
  return (race: AwaitRace) => {
    const run = setup(race);
    draftStore().save(draft("up.svg", { upload: { size: 6, type: "image/svg+xml" }, opaque: true, sourceSha: "up-sha" }));
    draftStore().save(draft("moved.svg", { opaque: true, sourceSha: "logo.svg-sha", movedFrom: "logo.svg" }));
    stubs.bytes = { get: race.port("bytes", async (key: string) => (key === uploadKey(SCOPE, "up-sha") ? { text: race.port("text", async () => "<svg/>") } : undefined)) };
    const result: { text?: string } = {};
    return { ...run, key: run.at.key, done: run.host.readMediaText(path).then((text) => { result.text = text; }), result };
  };
}
const nothingKept = (path: string) => (run: ReturnType<ReturnType<typeof readScenario>>) => {
  assert.equal(run.result.text, undefined);
  assert.equal(run.runtime.state.opaqueText.has(draftKey(SCOPE, path)), false);
  assert.equal(run.cleanSources.peek("", run.key, path), undefined);
};

test("media text whose draft is replaced at any await is dropped, and its text is not kept", async (t) => {
  forget(t, "up.svg", "moved.svg");
  t.after(() => { stubs.bytes = { get: async () => undefined }; });
  for (const path of ["up.svg", "moved.svg"]) {
    const replace = () => { draftStore().save({ ...draftStore().get(SCOPE, path)!, updatedAt: 1 }); };
    assert.ok(await forEachAwait(readScenario(path), replace, nothingKept(path)) >= 1, path);
  }
});

test("media text read while the text index's key moves on at any await is dropped, and its text is not kept", async (t) => {
  forget(t, "up.svg", "moved.svg");
  t.after(() => { stubs.bytes = { get: async () => undefined }; });
  for (const path of ["up.svg", "moved.svg", "logo.svg"])
    assert.ok(await forEachAwait(readScenario(path), (run) => { run.at.key = "o/site@main:2"; }, nothingKept(path)) >= 1, path);
});

// discardUpload waits once, for the lazily loaded discard rules: each disturbance there leaves everything as it was.
test("an upload whose draft or records change, or whose stamp stops holding, while the discard rules load stays", async (t) => {
  forget(t, "photo.png", MEDIA_RECORDS_PATH);
  const disturbances: Record<string, (at: { holds: boolean }) => void> = {
    "draft replaced": () => { draftStore().save({ ...draftStore().get(SCOPE, "photo.png")!, updatedAt: 1 }); },
    "records replaced": () => { draftStore().save({ ...draftStore().get(SCOPE, MEDIA_RECORDS_PATH)!, updatedAt: 1 }); },
    "stamp gone": (at) => { at.holds = false; },
  };
  for (const [name, disturb] of Object.entries(disturbances)) {
    const { host, calls, at } = setup();
    draftStore().save(draft("photo.png", { upload: { size: 1, type: "image/png" }, opaque: true, sourceSha: SHA }));
    draftStore().save(draft(MEDIA_RECORDS_PATH, { content: "{}" }));
    const discarding = host.discardUpload("photo.png");
    disturb(at);
    const kept = [draftStore().get(SCOPE, "photo.png"), draftStore().get(SCOPE, MEDIA_RECORDS_PATH)];
    await discarding;
    assert.deepEqual([draftStore().get(SCOPE, "photo.png"), draftStore().get(SCOPE, MEDIA_RECORDS_PATH)], kept, name);
    assert.ok(kept[0], name);
    assert.deepEqual(calls, [], name);
  }
});

test("draft changes clear the usage check each time and run it once after a 400 ms pause", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  forget(t, "index.html");
  const { host, appStore } = setup();
  const runs: string[] = [];
  host.mediaController.invalidateUsage = () => { runs.push("invalidate"); };
  host.mediaController.refreshUsage = () => { runs.push("refresh"); };
  appStore.drafts.store.open(SCOPE, "index.html", { text: "one", baseSha: "base" });
  t.mock.timers.tick(400);
  runs.length = 0;
  appStore.drafts.store.write(SCOPE, "index.html", "two");
  t.mock.timers.tick(200);
  appStore.drafts.store.write(SCOPE, "index.html", "three");
  t.mock.timers.tick(399);
  assert.deepEqual(runs, ["invalidate", "invalidate"]);
  t.mock.timers.tick(1);
  assert.deepEqual(runs, ["invalidate", "invalidate", "refresh"]);
});

// A preview that answers only with the route it shows.
const showing = (route: () => string | undefined): NonNullable<MediaHostPorts["nativePreview"]> => ({ shownRoute: route, measureImage: async () => undefined,
  selectAfterUpdate: () => {}, flashInsert: () => {}, selectionBox: () => undefined, imageLook: () => undefined, scrollBy: () => {}, playMedia: () => {} });
// Lets the awaits between two timer ticks run (setImmediate is not mocked).
const settle = () => new Promise<void>((done) => setImmediate(done));

test("Improve images opens a page not open yet, then waits until the canvas shows it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { host, calls, runtime, late, appStore } = setup();
  const site = resolveNativeProject(["index.html", "about.html"]);
  assert.ok(site.ok);
  runtime.site = site.site;
  const about = Object.keys(site.site.routes).find((route) => site.site.routes[route] === "about.html");
  let route: string | undefined = "/", done = false;
  late.preview = showing(() => route);
  appStore.openFile.value = "index.html";
  void host.mediaPorts.showPage!("about.html").then(() => { done = true; });
  await settle();
  assert.deepEqual(calls, ["open about.html keep quiet"]);
  for (let tick = 0; tick < 3; tick++) { t.mock.timers.tick(100); await settle(); }
  assert.equal(done, false);
  route = about;
  t.mock.timers.tick(100); await settle();
  assert.equal(done, true);
});

test("Improve images opens nothing for the page already open, and gives up waiting after 5 s", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { host, calls, runtime, late, appStore } = setup();
  const site = resolveNativeProject(["index.html", "about.html"]);
  assert.ok(site.ok);
  runtime.site = site.site;
  late.preview = showing(() => "/");
  appStore.openFile.value = "about.html";
  let done = false;
  void host.mediaPorts.showPage!("about.html").then(() => { done = true; });
  for (let tick = 0; tick < 49; tick++) { await settle(); t.mock.timers.tick(100); }
  await settle();
  assert.equal(done, false);
  t.mock.timers.tick(100); await settle();
  assert.equal(done, true);
  assert.deepEqual(calls, []);
});

test("work away from its workspace measures in one background page of its site, and with no site in none", async (t) => {
  t.after(() => { stubs.pages = 0; stubs.used = []; });
  const { host, runtime } = setup();
  const away = host.mediaPorts.pin!()!;
  assert.equal(await host.mediaPorts.measureAway!(away, "index.html", [0], {}), undefined);
  assert.equal(stubs.pages, 0);
  const site = resolveNativeProject(["index.html"]);
  assert.ok(site.ok);
  runtime.site = site.site;
  const pinned = host.mediaPorts.pin!()!;
  for (let time = 0; time < 2; time++)
    assert.deepEqual(await host.mediaPorts.measureAway!(pinned, "index.html", [0], { width: 4, height: 3 }), { request: { path: "index.html", node: [0], slot: undefined, style: undefined, image: { width: 4, height: 3 } } });
  assert.equal(stubs.pages, 1);
  assert.deepEqual(stubs.used, ["main:index.html", "main:index.html"]);
});

test("the gallery's host drops Media's hint, and the gallery is visible only on Media's open explorer", () => {
  const { host, late } = setup();
  let removed = 0, open = true;
  const media = { hidden: false, querySelector: (selector: string) => (selector === ":scope > .sidebar-hint" ? { remove: () => { removed++; } } : null) };
  late.elements = { "explorer-media": media, explorer: { matches: (selector: string) => selector === ":popover-open" && open } };
  assert.equal(host.mediaPorts.galleryHost(), media);
  assert.equal(removed, 1);
  assert.equal(host.mediaPorts.galleryVisible(), true);
  open = false;
  assert.equal(host.mediaPorts.galleryVisible(), false);
  open = true; media.hidden = true;
  assert.equal(host.mediaPorts.galleryVisible(), false);
});

test("work pinned to a workspace no longer shown reads its entries from its own snapshot, seeding the index first", () => {
  const { host, session, indexed } = setup();
  const pin = host.mediaPorts.pin!()!;
  assert.deepEqual(pin.entry("logo.svg"), entryOf("logo.svg"));
  assert.deepEqual(indexed, []);
  session.next(githubScope({ ...SCOPE, branch: "dev" }));
  assert.deepEqual(pin.entry("logo.svg"), entryOf("logo.svg"));
  assert.deepEqual(indexed, ["seed", "entry"]);
});

test("the usage check's key is the text index's only once the index is for it", () => {
  const { host, runtime, at } = setup();
  assert.equal(host.mediaPorts.usage!.key(), "");
  runtime.state.textIndexScope = at.key;
  assert.equal(host.mediaPorts.usage!.key(), "o/site@main:1");
  at.key = "o/site@main:2";
  assert.equal(host.mediaPorts.usage!.key(), "");
});

test("Media lists the branch's files, and asks for a repository with none open", async () => {
  const { host, appStore } = setup();
  assert.deepEqual(await host.mediaPorts.listPaths(host.mediaPorts.workspace()!), PATHS);
  appStore.repository.value = undefined;
  await assert.rejects(host.mediaPorts.listPaths(handedOn()), { message: "Choose a repository before opening Media." });
});

test("files that fail to be added say why and add nothing", async (t) => {
  t.after(() => { stubs.adding = undefined; });
  const { host, calls } = setup();
  stubs.adding = async () => { throw new Error("x"); };
  assert.deepEqual(await host.uploadFilesTo("images", [new File(["x"], "x.png")]), []);
  assert.deepEqual(calls, ["error Error: x"]);
});

test("a placed image is selected once the canvas updates, and flashes", () => {
  const { host, late } = setup();
  host.mediaPorts.select!("index.html", [0, 2]);
  const seen: string[] = [];
  late.preview = { ...showing(() => "/"), selectAfterUpdate: (at) => { seen.push(`select ${JSON.stringify(at)}`); }, flashInsert: (at) => { seen.push(`flash ${JSON.stringify(at)}`); } };
  host.mediaPorts.select!("index.html", [0, 2]);
  assert.deepEqual(seen, ['select {"path":"index.html","node":[0,2]}', 'flash {"path":"index.html","node":[0,2]}']);
});
