import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import type { DraftScope } from "../src/drafts.ts";
import type { InsertPoint } from "../src/components/insert-controls.ts";
import type { PlanResult, Reads } from "../src/guarded-edit.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { PageBuilderHostPorts } from "../src/page-builder-host.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import { resolveNativeProject } from "../shared/native-project.ts";
import { forEachAwait } from "./support/await-race.ts";

// The draft store and the controllers behind the host read these browser globals on first use; no other tabs, so no channel.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["window", "document", "localStorage", "addEventListener", "BroadcastChannel"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const stored = new Map<string, string>();
fakeGlobals.window = { addEventListener: () => {} };
fakeGlobals.document = { addEventListener: () => {}, visibilityState: "visible", querySelector: () => null };
fakeGlobals.addEventListener = () => {};
fakeGlobals.BroadcastChannel = undefined;
fakeGlobals.localStorage = {
  getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); }, key: (index: number) => [...stored.keys()][index] ?? null, get length() { return stored.size; },
};
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});
// The components behind the host import stylesheets and raw SVGs.
registerHooks({ load: (url, context, next) => (/\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context)) });
const { createPageBuilderHost } = await import("../src/page-builder-host.ts");

// eslint-disable-next-line no-restricted-syntax -- the stand-ins implement only the members the host touches.
const stand = <T,>(fake: object) => fake as unknown as T;

const HOME = "<html><head><title>Welcome</title><meta name=\"description\" content=\"Our site\"></head><body><site-header></site-header><main><h1>Home</h1></main></body></html>";
const TEXTS: Record<string, string> = {
  "index.html": HOME,
  "about.html": "<html><head></head><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>About us</h1></main></body></html>",
  "components/site-header.html": "<header><nav><a href=\"/\">Home</a><a href=\"/about.html\">About</a></nav></header>",
};
const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;

// A host over the real runtime, session and app store with the site above; the rest record what the host asked of them.
// main.ts's later consts (versions, linked styles, media, Pages & files, agents) throw when read while the host is made.
// `getterOnly` hands fileGeneration over without its setter, as a main.ts that dropped it would; `preview` adds to the
// preview stand-in and `ports` replaces plain ports.
function setup(texts = TEXTS, options: { getterOnly?: boolean; preview?: object; ports?: Partial<Pick<PageBuilderHostPorts, "loadSiteSettings" | "ensureNativeTextIndex">> } = {}) {
  const calls: string[] = [], errors: string[] = [], planned: PlanResult[] = [];
  let made = false, scope: DraftScope | undefined, generation = 0, setupKey = "o/site:main", view: { path: string } | undefined;
  let tools: PageBuilderHostPorts["componentTools"];
  const mounted = new Set<string>();
  const runtime = createNativeSiteRuntime({
    scope: () => scope, shown: () => undefined, drafts: () => ({ get: () => undefined, list: () => [] }), mounted: () => undefined,
    clean: new CleanSourceCache(() => "o"), textKey: () => "", route: () => "/", openFile: () => undefined, pageStyles: () => [],
    find: async () => undefined, readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  runtime.base.files = Object.keys(texts);
  for (const [path, text] of Object.entries(texts)) runtime.base.sources.set(path, text);
  const parsed = resolveNativeProject(runtime.base.files);
  assert.ok(parsed.ok);
  runtime.site = parsed.site;
  const appStore = createAppStore(createDraftStore());
  const workspaceSession = createWorkspaceSession();
  const status = { textContent: "" };
  const late = <T,>(name: string, value: T) => { assert.ok(made, `${name} is read while the host is made`); return value; };
  const record = (name: string) => () => { calls.push(name); };
  const reads = stand<Reads>({ site: () => runtime.site, source: (path: string) => runtime.source(path), template: () => undefined });
  const ports = {
    app: stand<HTMLElement>({ querySelector: () => null }), appStore, runtime, workspaceSession,
    editorModule: stand<PageBuilderHostPorts["editorModule"]>({ isMounted: (path: string) => mounted.has(path), refreshVariants: record("variants") }),
    // A plan runs against the files above and is kept; nothing is written.
    guardedEdits: stand<PageBuilderHostPorts["guardedEdits"]>({
      stamp: () => workspaceSession.begin(), peek: reads,
      run: async (plan: (r: Reads) => PlanResult | Promise<PlanResult>) => { planned.push(await plan(reads)); return { ok: true, status: "applied" }; },
    }),
    element: <T extends HTMLElement>(id: string) => stand<T>(id === "status" ? status : {}),
    lazyModule: <T,>(load: () => Promise<T>) => load,
    loadSiteSettings: async () => stand<Awaited<ReturnType<PageBuilderHostPorts["loadSiteSettings"]>>>({}),
    errorMessage: (error: unknown) => { errors.push(error instanceof Error ? error.message : String(error)); },
    announce: (text: string) => { calls.push(`announce ${text}`); },
    codePanes: stand<PageBuilderHostPorts["codePanes"]>({}), nativeHistoryShares: new Map(),
    currentLoad: () => workspaceSession.current().load, setupScope: () => setupKey, draftScope: () => scope,
    stampOf: () => workspaceSession.begin(), nativeHistorySession: (_scope: DraftScope, path: string) => path,
    nativeRouteInfo: (route: string) => ({ title: /<title>(.*)<\/title>/.exec(runtime.source(runtime.site!.routes[route]) ?? "")?.[1] }),
    nativeRouteForPath: (path: string | undefined) => Object.entries(runtime.site?.routes ?? {}).find(([, file]) => file === path)?.[0],
    nativeComponentTagForPath: (path: string) => Object.entries(runtime.site?.components ?? {}).find(([, file]) => file === path)?.[0], nativePageStyles: () => [], nativeImagePaths: () => [],
    ensureNativeTextIndex: async () => undefined, wantNativeTextIndex: record("want index"),
    showNativeWarnings: (warnings: unknown[]) => { calls.push(`warnings ${warnings.length}`); },
    updateCurrentPageLabel: record("label"), updateNativePreviewSources: record("sources"), updateAgentContext: record("agent"),
    workspace: { explorerDropdown: undefined, sidebarResize: undefined }, get componentTools() { return tools; },
    get nativePreview() { return stand<PageBuilderHostPorts["nativePreview"]>({ activate: record("activate"), route: () => "/", clearSelection: () => {}, hideEditBar: record("hide bar"), refreshCardLooks: record("card looks"), ...options.preview }); },
    get pageStructure() { return stand<PageBuilderHostPorts["pageStructure"]>({ refreshMeta: record("meta"), select: () => {} }); },
    get fileGeneration() { return generation; }, set fileGeneration(value) { generation = value; },
    get versions() { return late("versions", stand<PageBuilderHostPorts["versions"]>({ get view() { return view; } })); },
    get linkedStyles() { return late("linkedStyles", stand<PageBuilderHostPorts["linkedStyles"]>({ beginReveal: () => 7, clearStyles: record("clear styles") })); },
    get mediaController() { return late("mediaController", stand<PageBuilderHostPorts["mediaController"]>({})); },
    get pagesController() { return late("pagesController", stand<PageBuilderHostPorts["pagesController"]>({ renderTree: record("tree"), pageLabel: (file: string) => file })); },
    get pagesAndFiles() { return late("pagesAndFiles", stand<PageBuilderHostPorts["pagesAndFiles"]>({})); },
    get agentController() { return late("agentController", stand<PageBuilderHostPorts["agentController"]>({})); },
    restoreFile: async () => {}, ensureExplorer: async () => {}, openCreate: () => {}, nativeSiteReadForCreate: () => undefined,
  } satisfies PageBuilderHostPorts;
  Object.assign(ports, options.ports);
  if (options.getterOnly) Object.defineProperty(ports, "fileGeneration", { get: () => generation, set: undefined });
  const host = createPageBuilderHost(ports);
  made = true;
  return { host, runtime, appStore, workspaceSession, calls, errors, planned, status, mounted, open: (next?: DraftScope) => { scope = next; },
    generation: () => generation, setSetupKey: (key: string) => { setupKey = key; },
    setView: (next?: { path: string }) => { view = next; }, setTools: (next: PageBuilderHostPorts["componentTools"]) => { tools = next; } };
}

test("making the host reads none of main.ts's later consts", () => {
  assert.doesNotThrow(() => setup());
});

test("a page's title and description, with its first heading for the title's placeholder; none for a file that is not a page", () => {
  const { host } = setup();
  assert.deepEqual(host.nativePageMeta("index.html"), { title: "Welcome", description: "Our site", placeholders: { title: "Home" } });
  assert.deepEqual(host.nativePageMeta("about.html"), { title: "", description: "", placeholders: { title: "About us" } });
  assert.equal(host.nativePageMeta("components/site-header.html"), undefined);
});

test("Navigation edits the shared header a page uses, else the page's own links", () => {
  const { host } = setup();
  const shared = host.nativeNavigationTarget("index.html");
  assert.equal(shared?.path, "components/site-header.html");
  assert.equal(shared?.shared, true);
  assert.deepEqual(shared?.list.links.map((link) => link.label), ["Home", "About"]);
  const own = host.nativeNavigationTarget("about.html");
  assert.equal(own?.path, "about.html");
  assert.equal(own?.shared, false);
  assert.equal(host.nativeNavigationTarget(undefined), undefined);
});

test("a section's place planned on the page's bytes is refused once the workspace loads again", async () => {
  const { host, workspaceSession, errors, planned } = setup();
  const gap: InsertPoint = { path: "index.html", parent: [1], index: 1, top: 0, left: 0, width: 0, before: "main", tag: "body" };
  const choice = { tag: "native:paragraph", label: "Paragraph" };
  const point = host.nativeElementAddPoint(choice, gap);
  assert.ok(point && point !== gap);
  assert.equal(host.nativeAddPoints.get(point)?.description, "Inside body, at this gap");
  await host.insertNativeComponent(point, choice);
  assert.equal(planned.length, 1, "while the load holds, the section is planned");
  planned.length = 0;
  workspaceSession.next();
  await host.insertNativeComponent(point, choice);
  assert.deepEqual(errors, ["The insertion source changed. Choose the destination again."]);
  assert.deepEqual(planned, []);
});

test("Page Structure's component fields keep their revision until a source or the load changes", () => {
  const { host, runtime, workspaceSession } = setup();
  const first = host.nativeComponentFieldsRevision();
  assert.equal(host.nativeComponentFieldsRevision(), first);
  runtime.base.sources.set("components/site-header.html", "<header><nav><a href=\"/\">Start</a></nav></header>");
  const second = host.nativeComponentFieldsRevision();
  assert.notEqual(second, first);
  workspaceSession.next();
  assert.notEqual(host.nativeComponentFieldsRevision(), second);
});

test("a page made since the site opened routes at once: its warnings, the preview, agents, Page Structure and the Pages tree follow", () => {
  const { host, runtime, calls } = setup();
  runtime.base.files = [...runtime.base.files, "contact.html"];
  runtime.base.sources.set("contact.html", "<html><head></head><body><main><h1>Contact</h1></main></body></html>");
  host.refreshNativeRoutes();
  assert.ok(Object.values(runtime.site!.routes).includes("contact.html"));
  assert.deepEqual(calls, ["warnings 0", "activate", "sources", "agent", "meta", "tree", "label"]);
});

test("a title written on a page not open is one guarded edit of its head, its Undo naming the page", async () => {
  const { host, planned, status, calls } = setup();
  assert.equal(await host.writeNativePageMeta("about.html", "title", "About"), undefined);
  const [plan] = planned;
  assert.ok(plan && "edits" in plan && plan.edits);
  const [edit] = plan.edits.get("about.html")!;
  const written = TEXTS["about.html"].slice(0, edit.start) + edit.text + TEXTS["about.html"].slice(edit.end);
  assert.match(written, /^<html><head>\s*<title>About<\/title>[^]*<\/head><body><header>/);
  assert.equal(edit.expected, TEXTS["about.html"].slice(edit.start, edit.end));
  assert.equal(plan.done, "Title updated");
  assert.equal(plan.undone, "Undid changing the title of About us.");
  assert.equal(status.textContent, "Title updated");
  assert.ok(calls.includes("label"));
});

test("the Variant lookup's site is there only with a draft scope, made once per site", () => {
  const { host, open } = setup();
  assert.equal(host.nativeVariantFiles.site(), undefined);
  open(SCOPE);
  const site = host.nativeVariantFiles.site();
  assert.deepEqual(site?.components, { "site-header": "components/site-header.html" });
  assert.equal(host.nativeVariantFiles.site(), site);
});

// Clearing the selection in the preview: what select does with no element chosen.
const cleared = stand<Parameters<ReturnType<typeof setup>["host"]["previewSelection"]["select"]>[0]>({ reason: "click" });

test("clearing the selection tells agents and bumps main.ts's file generation through its setter", async () => {
  const { host, calls, generation } = setup();
  await host.previewSelection.select(cleared);
  assert.equal(generation(), 1);
  assert.deepEqual(calls.filter((call) => call === "agent" || call === "clear styles"), ["agent", "clear styles"]);
});

test("fileGeneration handed over without its setter throws on the host's first write", async () => {
  const { host, generation } = setup(TEXTS, { getterOnly: true });
  await assert.rejects(host.previewSelection.select(cleared), { name: "TypeError", message: /fileGeneration/ });
  assert.equal(generation(), 0);
});

test("a template's open intent holds while the setup scope does, read when asked", () => {
  const { host, appStore, mounted, setSetupKey } = setup();
  const template = "components/site-header.html";
  host.previewSelection.recordIntent(template);
  appStore.openFile.value = template;
  mounted.add(template);
  assert.equal(host.previewSelection.editableTemplatePath(), template);
  setSetupKey("o/site:other");
  assert.equal(host.previewSelection.editableTemplatePath(), undefined);
});

test("History's version shown after a place was planned refuses the insert, and plans no new place", async () => {
  const { host, errors, planned, setView } = setup();
  const gap: InsertPoint = { path: "index.html", parent: [1], index: 1, top: 0, left: 0, width: 0, before: "main", tag: "body" };
  const choice = { tag: "native:paragraph", label: "Paragraph" };
  const point = host.nativeElementAddPoint(choice, gap);
  assert.ok(point);
  setView({ path: "index.html" });
  await host.insertNativeComponent(point, choice);
  assert.deepEqual(errors, ["The insertion source changed. Choose the destination again."]);
  assert.deepEqual(planned, []);
  assert.equal(host.nativeElementAddPoint(choice, gap), undefined);
});

test("the rail builds in the template Edit component mode opened after the host was made", () => {
  const { host, setTools } = setup();
  assert.deepEqual(host.blockInsertPorts.target(), { path: "index.html", node: undefined, painted: undefined });
  setTools(stand<PageBuilderHostPorts["componentTools"]>({ mode: { now: () => ({ template: "components/site-header.html", tag: "site-header" }) } }));
  assert.deepEqual(host.blockInsertPorts.target(), { path: "components/site-header.html", template: "site-header" });
});

// A stylesheet the site lists but has not read: the Variant lookup asks for it, and it is read in the background.
function variantSetup() {
  const listed = "styles/extra.css";
  const context = setup();
  context.runtime.base.files = [...context.runtime.base.files, listed];
  context.open(SCOPE);
  context.appStore.repository.value = { id: 1, name: "site", full_name: "o/site", private: false, default_branch: "main", owner: { login: "o", type: "User" } };
  const reads: string[][] = [];
  let settle: (read: boolean) => void = () => {};
  context.runtime.readPredicted = async (_repo, paths) => { reads.push(paths); return new Promise<boolean>((done) => { settle = done; }); };
  return { ...context, listed, reads, settle: (read: boolean) => settle(read) };
}

test("a file the Variant lookup asks for twice is read once in the background, then the variants and card looks refresh", async () => {
  const { host, listed, reads, settle, calls } = variantSetup();
  assert.equal(host.nativeVariantFiles.read(listed), undefined);
  assert.equal(host.nativeVariantFiles.read(listed), undefined);
  await Promise.resolve();
  assert.deepEqual(reads, [[listed]]);
  settle(true);
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(calls.filter((call) => call === "variants" || call === "card looks"), ["variants", "card looks"]);
});

test("a background Variant read that lands after the workspace loads again refreshes nothing", async () => {
  const { host, listed, reads, settle, calls, workspaceSession } = variantSetup();
  host.nativeVariantFiles.read(listed);
  await Promise.resolve();
  assert.equal(reads.length, 1);
  workspaceSession.next();
  settle(true);
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(calls.filter((call) => call === "variants" || call === "card looks"), []);
});

test("a rail click waits for typing: a page that did not answer it ends the click, and no selection drags nothing", async () => {
  const { host } = setup(TEXTS, { preview: { finishTyping: async () => false } });
  assert.equal(await host.finishRailTyping(() => true), false);
  assert.equal(host.dragPageBlock(stand<Parameters<typeof host.dragPageBlock>[0]>({})), undefined);
});

test("Navigation's opener writes nothing once the workspace loads again at either of its waits", async () => {
  const opened: string[] = [];
  const quiet = setup(TEXTS, { ports: { loadSiteSettings: async () => stand<Awaited<ReturnType<PageBuilderHostPorts["loadSiteSettings"]>>>({
    nativeSitePageChoices: () => [], nativeSettingsController: () => ({ navigation: (input: { path: string }) => { opened.push(input.path); } }) }) } });
  await quiet.host.openNativeNavigation("index.html");
  assert.deepEqual(opened, ["components/site-header.html"], "undisturbed, it opens the shared header's navigation");
  const count = await forEachAwait((race) => {
    const opened: string[] = [];
    const settings = stand<Awaited<ReturnType<PageBuilderHostPorts["loadSiteSettings"]>>>({
      nativeSitePageChoices: () => [],
      nativeSettingsController: () => ({ navigation: (input: { path: string }) => { opened.push(input.path); } }),
    });
    const context = setup(TEXTS, { ports: {
      ensureNativeTextIndex: race.port("index", async () => undefined),
      loadSiteSettings: race.port("settings", async () => settings),
    } });
    return { ...context, opened, done: context.host.openNativeNavigation("index.html") };
  }, (run) => { run.workspaceSession.next(); }, (run) => {
    assert.deepEqual(run.opened, []);
    assert.deepEqual(run.errors, []);
  });
  assert.equal(count, 2);
});

test("CSS code intelligence answers for the mounted page, and not while History shows a version", () => {
  const { host, appStore, mounted, open, setView } = setup();
  open(SCOPE);
  appStore.openFile.value = "index.html";
  mounted.add("index.html");
  assert.equal(typeof host.nativeCssWorkspace()?.revision, "string");
  setView({ path: "index.html" });
  assert.equal(host.nativeCssWorkspace(), undefined);
});
