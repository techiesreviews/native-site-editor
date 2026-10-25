import { after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { signal } from "@preact/signals-core";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { UnreadableFile } from "../src/native-boot.ts";
import { createSiteTextIndex, isNativeTextFile, type SiteTextIndexPorts } from "../src/site-text-index.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";

// The index listens for pointer events on the page: the stand-ins keep its listeners, and fire them by type.
type Listener = (event?: Event) => void;
const listeners: { type: string; listener: Listener }[] = [];
const fire = (type: string, event?: Event) => { for (const entry of listeners.filter((at) => at.type === type)) entry.listener(event); };
// The pointer events a test fires; a click is a plain event.
class FakePointerEvent extends Event {
  readonly button: number; readonly pointerId: number; readonly pointerType: string;
  constructor(type: string, init: { button?: number; pointerId: number; pointerType: string }) {
    super(type);
    this.button = init.button ?? 0; this.pointerId = init.pointerId; this.pointerType = init.pointerType;
  }
}
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["document", "window", "PointerEvent", "requestAnimationFrame", "requestIdleCallback"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
fakeGlobals.document = { addEventListener: (type: string, listener: Listener) => { listeners.push({ type, listener }); } };
fakeGlobals.window = { addEventListener: (type: string, listener: Listener) => { listeners.push({ type: `window ${type}`, listener }); } };
fakeGlobals.PointerEvent = FakePointerEvent;
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const SHA = "a".repeat(40);
const REPO = { id: 1, name: "site", full_name: "o/site", private: false, default_branch: "main", owner: { login: "o", type: "User" } } satisfies Repository;
const SNAPSHOT = { branch: "main", commit: SHA, entries: [] } satisfies Snapshot;
const SITE = { routes: { "/": "index.html", "/about": "about.html" }, components: { "site-card": "components/site-card.html" } };
const FILES = ["index.html", "about.html", "components/site-card.html", "style.css", "notes.txt", "node_modules/x/y.css"];

// A real runtime and session over the site above, with the index page read and what the index asked recorded.
// `race` wraps the index's reads, so a test can disturb it at each of them (tests/support/await-race.ts).
function setup(overrides: { unreadable?: UnreadableFile[]; busy?: () => boolean; files?: string[]; start?: boolean; race?: AwaitRace } = {}) {
  const calls: string[] = [], read: string[] = [];
  const wrap = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => overrides.race ? overrides.race.port(name, work) : work;
  // As main.ts: letting the site go drops the titles waiting to be drawn.
  let closed = () => {};
  const runtime = createNativeSiteRuntime({
    scope: () => undefined, shown: () => undefined, drafts: () => ({ get: () => undefined, list: () => [] }), mounted: () => undefined,
    clean: new CleanSourceCache(() => "o"), textKey: () => "", route: () => "/", openFile: () => undefined, pageStyles: () => [],
    find: async () => ({ sha: SHA }), readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => closed(),
  });
  const request = runtime.begin();
  runtime.site = SITE;
  const files = overrides.files ?? FILES;
  runtime.base.files = files;
  runtime.base.sources.set("index.html", "<h1>Home</h1>");
  const appStore = { repository: signal<Repository | undefined>(REPO), snapshot: signal<Snapshot | undefined>(SNAPSHOT), openFile: signal<string | undefined>(undefined) };
  const workspaceSession = createWorkspaceSession();
  let behind = false;
  // The explorer stand-in takes an element's type here; `element` below narrows it as the host's does.
  // eslint-disable-next-line no-restricted-syntax -- the explorer stand-in implements only what the busy check reads.
  const explorer = { matches: () => false, querySelector: () => null } as unknown as HTMLElement;
  const ports = {
    runtime, appStore, workspaceSession,
    mediaController: { refreshUsage: () => { calls.push("usage"); } },
    pagesAndFiles: { pagesTree: { busy: () => overrides.busy?.() ?? false } },
    pagesController: { renderTree: () => { calls.push("tree"); } },
    componentTools: { refresh: () => { calls.push("tools"); } },
    nativePreview: { setError: (message?: string) => { calls.push(`error ${message}`); }, choicesChanged: () => { calls.push("choices"); } },
    pageStructure: { refreshMeta: () => { calls.push("meta"); } },
    get nativePreviewBehind() { return behind; }, set nativePreviewBehind(value) { behind = value; },
    // The one explorer, as the page has: titles waiting for it are dropped once it is another.
    element: <T extends HTMLElement>() => explorer as T,
    currentLoad: () => workspaceSession.current().load,
    draftScope: () => undefined,
    findEntry: wrap("find", async (path: string) => (files.includes(path) ? ({ path, mode: "100644", type: "blob", sha: `${path}-sha` }) satisfies TreeEntry : undefined)),
    // As the host: the preview takes every source, so it is no longer behind.
    updateNativePreviewSources: () => { behind = false; calls.push("sources"); },
    updateAgentContext: () => { calls.push("agent"); },
    readNativeTexts: wrap("read", async (_repo: string, files: { path: string; sha: string }[]) => {
      read.push(...files.map((file) => file.path));
      const unreadable = overrides.unreadable ?? [];
      return { texts: new Map(files.filter((file) => !unreadable.some((bad) => bad.path === file.path)).map((file) => [file.path, `<title>${file.path}</title>`])), unreadable };
    }),
    noteNativeUnreadable: (files: UnreadableFile[] | undefined) => { calls.push(`unreadable ${files?.map((file) => file.path).join(",")}`); },
    updateCurrentPageLabel: () => { calls.push("label"); },
  } satisfies SiteTextIndexPorts;
  const index = createSiteTextIndex(ports);
  closed = () => index.clearPendingTitles();
  // As activateNativeSite does, but at once rather than after the first paint.
  if (overrides.start !== false) index.startNativeTextIndex(REPO, SITE, undefined, workspaceSession.begin(), request);
  return { index, runtime, appStore, workspaceSession, request, calls, read, behind: () => behind };
}

test("only pages, templates and stylesheets outside node_modules are read with the site", () => {
  assert.deepEqual(FILES.filter(isNativeTextFile), ["index.html", "about.html", "components/site-card.html", "style.css"]);
});

test("the index reads every page, template and stylesheet not read yet, and the gate counts the site", async () => {
  const { index, runtime, read, calls, behind } = setup();
  assert.equal(index.nativeTextIndexGate.indexed(), false);
  assert.equal(await index.ensureNativeTextIndex(), undefined);
  assert.deepEqual(read, ["about.html", "components/site-card.html", "style.css"]);
  assert.equal(runtime.base.sources.get("about.html"), "<title>about.html</title>");
  assert.equal(runtime.state.textIndexed, true);
  assert.equal(index.nativeTextIndexGate.indexed(), true);
  assert.equal(await index.nativeTextIndexGate.settled(), true);
  // A template was read, so the page on show is drawn again; titles, agents and the label follow.
  assert.deepEqual(calls, ["sources", "agent", "meta", "tree", "label", "tools", "usage"]);
  assert.equal(behind(), false);
});

test("the index key names the repository, branch, commit and load", () => {
  const { index, request, appStore } = setup();
  assert.equal(index.nativeTextIndexScopeKey(), `o/site\nmain\n${SHA}\n${request}`);
  appStore.snapshot.value = undefined;
  assert.equal(index.nativeTextIndexScopeKey(), "");
});

test("a file GitHub cannot give as text is noted, and the index is complete without it", async () => {
  const { index, runtime, calls, behind } = setup({ unreadable: [{ path: "style.css", message: "Not UTF-8." }] });
  assert.equal(await index.ensureNativeTextIndex(), undefined);
  assert.ok(calls.includes("unreadable style.css"));
  assert.equal(runtime.base.sources.has("style.css"), false);
  assert.equal(runtime.state.textIndexed, true);
  assert.equal(behind(), false, "the template read drew the page again");
});

test("pages not on show wait for the next update: the preview is behind and its choices change", async () => {
  const { index, calls, behind } = setup({ files: ["index.html", "about.html"] });
  assert.equal(await index.ensureNativeTextIndex(), undefined);
  assert.equal(calls.includes("sources"), false);
  assert.ok(calls.includes("choices"));
  assert.equal(behind(), true);
});

test("a commit that changes while the index reads asks to try again", async () => {
  const { index, appStore, runtime } = setup();
  const reading = index.ensureNativeTextIndex();
  appStore.snapshot.value = { ...SNAPSHOT, commit: "b".repeat(40) };
  assert.equal(await reading, "The repository changed meanwhile. Try again.");
  assert.equal(runtime.state.textIndexed, false);
});

test("a deferred index waits for the first paint unless something asks for it", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { index, read, workspaceSession, request } = setup({ start: false });
  index.startNativeTextIndex(REPO, SITE, undefined, workspaceSession.begin(), request, true);
  await Promise.resolve();
  assert.deepEqual(read, []);
  index.wantNativeTextIndex();
  assert.equal(await index.nativeTextIndexGate.settled(), true);
  assert.deepEqual(read, ["about.html", "components/site-card.html", "style.css"]);
});

test("titles read while a Pages row is in use wait until it is free, unless the site is let go", async () => {
  let busy = true;
  const { index, calls } = setup({ busy: () => busy });
  await index.ensureNativeTextIndex();
  assert.equal(calls.includes("tree"), false);
  index.flushPendingNativePageTitles();
  await Promise.resolve();
  assert.equal(calls.includes("tree"), false, "still busy: the titles keep waiting");
  busy = false;
  index.flushPendingNativePageTitles();
  await Promise.resolve();
  assert.equal(calls.filter((call) => call === "tree").length, 1);
  index.flushPendingNativePageTitles();
  await Promise.resolve();
  assert.equal(calls.filter((call) => call === "tree").length, 1, "the waiting titles were drawn once");

  let secondBusy = true;
  const second = setup({ busy: () => secondBusy });
  await second.index.ensureNativeTextIndex();
  // The runtime lets the site go (its `closed` clears the waiting titles), then the row is free.
  second.runtime.reset();
  secondBusy = false;
  second.index.flushPendingNativePageTitles();
  await Promise.resolve();
  assert.equal(second.calls.includes("tree"), false);
});

test("the index writes nothing for a load or site that was left, at every read", async () => {
  type Run = ReturnType<typeof setup> & { done: Promise<boolean> };
  const leaving: [string, (run: Run) => void][] = [["a new load", (run) => { run.runtime.begin(); }],
    ["another site", (run) => { run.runtime.site = { routes: { "/": "index.html" }, components: {} }; }]];
  for (const [what, leave] of leaving) {
    const points = await forEachAwait<Run>((race) => {
      const run = setup({ start: false, race });
      run.index.startNativeTextIndex(REPO, SITE, undefined, run.workspaceSession.begin(), run.request);
      return { ...run, done: run.runtime.state.textIndexing! };
    }, leave, (run) => {
      assert.equal(run.runtime.state.textIndexed, false, what);
      assert.deepEqual([...run.runtime.base.sources.keys()], ["index.html"], what);
      for (const call of ["tree", "usage", "sources"]) assert.equal(run.calls.includes(call), false, `${what}: ${call}`);
      assert.equal(run.calls.some((call) => call.startsWith("error")), false, what);
    });
    // A lookup for each of the three files not read yet, then their one read.
    assert.equal(points, 4, what);
  }
});

test("a deferred index starts two frames, a beat and an idle moment after the first paint, or after 10 s without one", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const frames: (() => void)[] = [], idle: (() => void)[] = [];
  fakeGlobals.requestAnimationFrame = (run: () => void) => frames.push(run);
  fakeGlobals.requestIdleCallback = (run: () => void) => idle.push(run);
  t.after(() => { delete fakeGlobals.requestAnimationFrame; delete fakeGlobals.requestIdleCallback; });
  const drain = (queue: (() => void)[]) => queue.splice(0).forEach((run) => run());

  const painted = setup({ start: false });
  painted.index.startNativeTextIndex(REPO, SITE, undefined, painted.workspaceSession.begin(), painted.request, true);
  painted.index.noteNativePainted();
  assert.deepEqual(painted.runtime.state.paintedPaths, ["index.html"]);
  drain(frames);
  drain(frames);
  t.mock.timers.tick(99);
  assert.equal(idle.length, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.deepEqual(painted.read, [], "waits for the browser to be idle");
  drain(idle);
  assert.equal(await painted.index.nativeTextIndexGate.settled(), true);
  assert.deepEqual(painted.read, ["about.html", "components/site-card.html", "style.css"]);

  const unpainted = setup({ start: false });
  unpainted.index.startNativeTextIndex(REPO, SITE, undefined, unpainted.workspaceSession.begin(), unpainted.request, true);
  t.mock.timers.tick(9_999);
  await Promise.resolve();
  assert.deepEqual(unpainted.read, []);
  t.mock.timers.tick(1);
  assert.equal(await unpainted.index.nativeTextIndexGate.settled(), true);
  assert.deepEqual(unpainted.read, ["about.html", "components/site-card.html", "style.css"]);
});

test("titles wait for a press on the page to end: a mouse at once, a touch after its grace period", async (t: TestContext) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [pointerType, grace] of [["mouse", 0], ["touch", 1000]] as const) {
    listeners.length = 0;
    let busy = true;
    const { index, calls } = setup({ busy: () => busy });
    await index.ensureNativeTextIndex();
    busy = false;
    const drawn = async () => { await Promise.resolve(); return calls.filter((call) => call === "tree").length; };
    fire("pointerdown", new FakePointerEvent("pointerdown", { pointerId: 7, pointerType }));
    // The press itself keeps the titles waiting.
    index.flushPendingNativePageTitles();
    assert.equal(await drawn(), 0, pointerType);
    fire("pointerup", new FakePointerEvent("pointerup", { pointerId: 7, pointerType }));
    if (grace) {
      t.mock.timers.tick(grace - 1);
      assert.equal(await drawn(), 0, `${pointerType} within its grace period`);
      t.mock.timers.tick(1);
    }
    t.mock.timers.tick(0);
    assert.equal(await drawn(), 1, pointerType);
    t.mock.timers.tick(grace);
    assert.equal(await drawn(), 1, `${pointerType}: drawn once`);
  }
});
