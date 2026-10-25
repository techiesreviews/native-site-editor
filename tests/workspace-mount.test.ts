import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import { draftKey, type DraftScope } from "../src/drafts.ts";
import type { WorkspaceMountPorts } from "../src/workspace-mount.ts";
import type { WorkspaceScope } from "../src/workspace-session.ts";
import type { Directory, Repository, SessionInfo, Snapshot } from "../shared/types.ts";

// Just enough DOM for the workspace's markup, its controls and a folder's summary.
class FakeElement {
  children: FakeElement[] = [];
  listeners = new Map<string, (() => unknown)[]>();
  className = ""; textContent = ""; innerHTML = ""; id = ""; type = ""; value = "";
  disabled = false; open = false;
  constructor(readonly tag = "div") {}
  setAttribute() {}
  append(...children: FakeElement[]) { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]) { this.children = [...children]; }
  addEventListener(type: string, listener: () => unknown) { this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]); }
  removeEventListener() {}
  remove() {}
  dispatch(type: string) { for (const listener of this.listeners.get(type) ?? []) void listener(); }
  focus() { focused = this; }
  matches() { return this.open; }
  querySelector(selector: string): FakeElement | null {
    return this.children.find((child) => `.${child.className}` === selector) ?? this.children.map((child) => child.querySelector(selector)).find(Boolean) ?? null;
  }
  text(): string { return [this.textContent, ...this.children.map((child) => child.text())].join(" "); }
}
let focused: FakeElement | undefined;
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["document", "matchMedia", "window", "requestAnimationFrame"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
fakeGlobals.document = { createElement: (tag: string) => new FakeElement(tag), getElementById: () => null };
fakeGlobals.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const windowListeners = new Map<string, (() => void)[]>();
// The code panes wait a frame after the first paint; the tests never run it.
fakeGlobals.requestAnimationFrame = () => 0;
fakeGlobals.window = { addEventListener: (type: string, listener: () => void) => windowListeners.set(type, [...windowListeners.get(type) ?? [], listener]) };
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete fakeGlobals[name];
  }
});

// The workspace's components, stubbed: each records what it was given and hands back a fake.
interface Made { kind: string; options: unknown; calls: string[]; value: object }
const made: Made[] = [];
function make(kind: string) {
  return (...args: unknown[]) => {
    const record: Made = { kind, options: args.at(-1), calls: [], value: {} };
    record.value = new Proxy({ root: new FakeElement(), element: new FakeElement() }, {
      get: (target, name) => name in target ? target[name as keyof typeof target]
        : name === "then" ? undefined : () => { record.calls.push(String(name)); },
    });
    made.push(record);
    return record.value;
  };
}
const last = (kind: string) => made.findLast((record) => record.kind === kind)!;
fakeGlobals.workspaceMountStubs = {
  preview: make("preview"), structure: make("structure"), rail: make("rail"), dropdown: make("dropdown"), menu: make("menu"),
  siteActions: make("siteActions"), sidebar: make("sidebar"), rowMenu: make("rowMenu"), resize: make("resize"),
  // Set: the code editor (Monaco) chunk fails to load.
  codeEditorFails: false,
};
const stubGlobals = fakeGlobals.workspaceMountStubs as { codeEditorFails: boolean };
const stub = (name: string, kind: string) => `export const ${name} = (...args) => globalThis.workspaceMountStubs.${kind}(...args);`;
const stubs: Record<string, string> = {
  "components/native-preview.ts": stub("createNativePreview", "preview"),
  "components/page-structure.ts": stub("createPageStructure", "structure"),
  "components/block-rail.ts": stub("mountBlockRail", "rail"),
  "components/dropdown.ts": stub("mountDropdown", "dropdown"),
  "components/repository-menu.ts": stub("createRepositoryMenu", "menu"),
  "components/site-actions.ts": stub("mountSiteActions", "siteActions"),
  "components/sidebar-resize.ts": stub("mountSidebarResize", "sidebar"),
  "components/row-menu.ts": stub("createRowMenu", "rowMenu"),
  "components/code-resize.ts": `${stub("mountCodeResize", "resize")}\n${stub("mountCodeWidthResize", "resize")}`,
  "components/code-editor.ts": "export const monacoView = 'Monaco view';",
  "components/refusal-note.ts": "export const dismissRefusalNote = () => {}; export const refuse = () => {};",
};
registerHooks({
  // A failing load is its own URL, so the next import of the chunk can succeed.
  resolve: (specifier, context, next) => {
    const resolved = next(specifier, context);
    return stubGlobals.codeEditorFails && resolved.url.endsWith("/src/components/code-editor.ts") ? { ...resolved, url: `${resolved.url}?fail` } : resolved;
  },
  load: (url, context, next) => {
    if (url.endsWith("/code-editor.ts?fail")) return { format: "module", source: "throw new Error('The code editor chunk failed.');", shortCircuit: true };
    const source = Object.entries(stubs).find(([tail]) => url.endsWith(`/src/${tail}`))?.[1];
    if (source) return { format: "module", source, shortCircuit: true };
    return /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context);
  },
});
const { createWorkspaceMount } = await import("../src/workspace-mount.ts");

// The one place a recorder stands in for a controller the workspace only hands on.
// eslint-disable-next-line no-restricted-syntax -- the fakes implement only the members the workspace calls.
const fake = <T>(value: object) => value as unknown as T;
const scope: DraftScope = { account: "lex", repoId: 7, repo: "lex/site", branch: "main" };
// Only the fields the workspace reads.
const repository = fake<Repository>({ id: 7, name: "site", full_name: "lex/site" });
const snapshot = fake<Snapshot>({ branch: "main", commit: "0123456789abcdef" });

function setup() {
  made.length = 0;
  windowListeners.clear();
  const calls: string[] = [];
  // Records the call by name, with its plain (string or number) arguments.
  const say = (name: string) => (...args: unknown[]) => {
    const plain = args.filter((arg) => typeof arg === "string" || typeof arg === "number");
    calls.push([name, ...plain].join(" "));
  };
  const elements = new Map<string, FakeElement>();
  const byId = (id: string) => { let found = elements.get(id); if (!found) { found = new FakeElement(); found.id = id; elements.set(id, found); } return found; };
  const app = new FakeElement();
  const info: SessionInfo = { configured: true, user: { login: "lex", avatar_url: "" }, installUrl: null };
  const state = {
    info,
    repositories: [repository], fileGeneration: 0, nativePreviewBehind: false, engaged: true, native: false,
    scope: scope as DraftScope | undefined, shown: undefined as WorkspaceScope | undefined,
    nativePreview: undefined as WorkspaceMountPorts["nativePreview"], pageStructure: undefined as WorkspaceMountPorts["pageStructure"],
    componentTools: undefined as WorkspaceMountPorts["componentTools"],
    sources: {} as Record<string, string>, mountedPaths: new Set<string>(), sectionTags: new Set<string>(), typingLanded: true,
    startSite: undefined as ((panel: HTMLElement) => void) | undefined,
    mountListener: undefined as WorkspaceMountPorts["nativeMountListener"],
  };
  let unmountedText: ((file: { scope: DraftScope; path: string }) => void) | undefined;
  let viewLoader: (() => Promise<unknown>) | undefined;
  let mounted: { content: unknown; file: unknown } | undefined;
  const proof = { isCurrent: () => true };
  const begin = () => ({ load: 1, scope: undefined, holds: () => true, changed: () => undefined });
  const appStore = { openFile: signal<string | undefined>(undefined), branch: signal<string | undefined>(undefined), repository: signal<Repository | undefined>(undefined), snapshot: signal<Snapshot | undefined>(undefined), reset: say("appStore.reset") };
  const ports = {
    app: fake<HTMLElement>(app),
    element: <T extends HTMLElement>(id: string) => fake<T>(byId(id)),
    appStore: fake<WorkspaceMountPorts["appStore"]>(appStore),
    editorModule: fake<WorkspaceMountPorts["editorModule"]>({
      onUnmountedText: (hook: typeof unmountedText) => { unmountedText = hook; },
      setViewLoader: (load: typeof viewLoader) => { viewLoader = load; },
      mountSourceEditor: (content: FakeElement, file: unknown) => {
        mounted = { content, file };
        const body = new FakeElement();
        body.className = "code-editor__body";
        content.replaceChildren(body);
        return say("editor disposed");
      },
      captureHistoryHost: () => proof, recordHistoryAction: say("recordHistoryAction"),
      isMounted: (path: string) => state.mountedPaths.has(path), captureFileModelState: () => proof, closeActiveEditGroup: say("closeActiveEditGroup"), clearDrafts: say("clearDrafts"),
    }),
    workspaceSession: { begin },
    runtime: fake<WorkspaceMountPorts["runtime"]>({ get site() { return undefined; }, get engaged() { return state.engaged; }, source: (path: string) => state.sources[path] }),
    finishedWork: fake<WorkspaceMountPorts["finishedWork"]>({ open: say("finishedWork.open"), shown: say("finishedWork.shown") }),
    mediaHistoryHome: fake<WorkspaceMountPorts["mediaHistoryHome"]>({ adopt: say("mediaHistoryHome.adopt"), clear: say("mediaHistoryHome.clear") }),
    parkedSteps: fake<WorkspaceMountPorts["parkedSteps"]>({ adopt: say("parkedSteps.adopt"), clear: say("parkedSteps.clear") }),
    guardedEdits: { stamp: () => ({ holds: () => true, changed: () => undefined }) },
    mediaController: fake<WorkspaceMountPorts["mediaController"]>({ disposeGallery: say("disposeGallery"), mediaEnded: say("mediaEnded"), chooseImage: say("chooseImage") }),
    paletteController: fake<WorkspaceMountPorts["paletteController"]>({ shortcut: say("shortcut"), mount: say("palette.mount"), dispose: say("palette.dispose") }),
    previewSelection: fake<WorkspaceMountPorts["previewSelection"]>({ handlers: () => ({}) }),
    pageStructureController: fake<WorkspaceMountPorts["pageStructureController"]>({
      nativeFormatActions: {}, textEdits: () => [], isNativeSectionTag: (tag: string) => state.sectionTags.has(tag),
      moveBlock: (_at: unknown, _direction: unknown, options: { stale: string }) => { calls.push(`moveBlock ${options.stale}`); },
    }),
    linkedStyles: fake<WorkspaceMountPorts["linkedStyles"]>({ updateBodyStyles: say("updateBodyStyles"), clearSources: say("linkedStyles.clearSources") }),
    versions: fake<WorkspaceMountPorts["versions"]>({ view: undefined, history: { destroy: say("history.destroy") } }),
    cards: fake<WorkspaceMountPorts["cards"]>({}),
    pagesAndFiles: {
      pageActions: undefined, mountExplorer: say("mountExplorer"), loadPagesActions: async () => {},
      filesTreeController: { refresh: say("filesTree.refresh") },
    },
    setup: {
      setupController: fake<WorkspaceMountPorts["setup"]["setupController"]>({ mount: async () => { calls.push("setupController.mount"); }, dispose: say("setupController.dispose") }),
      setupEntry: { remove: say("setupEntry.remove") },
      startSitePanel: () => new Promise<HTMLElement>((resolve) => { state.startSite = resolve; }),
    },
    repositoryIndex: { clear: say("repositoryIndex.clear") },
    cleanSources: { clear: say("cleanSources.clear") },
    get info() { return state.info; },
    get repositories() { return state.repositories; }, set repositories(value) { state.repositories = value; },
    get fileGeneration() { return state.fileGeneration; }, set fileGeneration(value) { state.fileGeneration = value; },
    get nativePreview() { return state.nativePreview; }, set nativePreview(value) { state.nativePreview = value; },
    get pageStructure() { return state.pageStructure; }, set pageStructure(value) { state.pageStructure = value; },
    get componentTools() { return state.componentTools; }, set componentTools(value) { state.componentTools = value; },
    get nativePreviewBehind() { return state.nativePreviewBehind; }, get nativeMountListener() { return state.mountListener; },
    get boot() { return fake<WorkspaceMountPorts["boot"]>({ ensureList: async () => {}, reset: say("boot.reset") }); },
    get agentController() { return fake<WorkspaceMountPorts["agentController"]>({ ensure: async () => { calls.push("agent.ensure"); }, dismiss: async () => {}, answer: async () => {}, destroy: say("agent.destroy") }); },
    get workspaceBoot() { return { dropGuess: say("dropGuess") }; },
    account: {
      reload: async () => { calls.push("refreshRepositoryList"); },
      switchTo: async (login: string) => { calls.push(`switchAccount ${login}`); },
      signOut: async () => { calls.push("disconnect"); },
      choose: async () => { calls.push("chooseRepository"); },
      load: async () => { calls.push(`loadSnapshot ${appStore.branch.value}`); },
    },
    draftScope: () => state.scope,
    shownScope: () => state.shown,
    nextLoad: () => { calls.push("nextLoad"); return begin(); },
    setCurrentPage: say("setCurrentPage"),
    errorMessage: (error: unknown) => { calls.push(`error ${error instanceof Error ? error.message : String(error)}`); },
    announce: say("announce"),
    site: {
      active: () => state.native,
      deactivate: say("deactivateNative"),
      update: say("updateNativePreviewSources"),
      painted: say("noteNativePainted"),
      assets: async () => {},
      shown: async () => {},
      routeSources: () => ({}),
      styles: async () => {},
      files: async () => undefined,
      route: () => undefined,
    },
    builder: {
      choices: () => [],
      addPoint: () => undefined,
      addPoints: new WeakMap(),
      insert: async () => {},
      drag: () => undefined,
      dropTree: () => undefined,
      loadDrag: async () => fake<Awaited<ReturnType<WorkspaceMountPorts["builder"]["loadDrag"]>>>({}),
      loadInsert: async () => fake<Awaited<ReturnType<WorkspaceMountPorts["builder"]["loadInsert"]>>>({}),
      insertPorts: fake<WorkspaceMountPorts["builder"]["insertPorts"]>({ target: () => undefined, refuse: say("refuse") }),
      finishTyping: async () => state.typingLanded,
      menuItems: () => [{ label: "Remove", run: say("remove") }],
      fields: () => "",
      moveItems: () => () => false,
      tools: () => { calls.push("mountComponentTools"); return fake<NonNullable<WorkspaceMountPorts["componentTools"]>>({ destroy: say("componentTools.destroy"), refresh: say("componentTools.refresh") }); },
    },
    page: {
      meta: () => undefined,
      writeMeta: async () => undefined,
      settings: async () => {},
      navigation: async () => {},
      siteSettings: async () => { calls.push("siteSettings"); },
    },
  } satisfies WorkspaceMountPorts;
  const workspace = createWorkspaceMount(ports);
  return { workspace, ports, state, calls, appStore, byId, proof, unmounted: () => unmountedText, viewLoader: () => viewLoader, mounted: () => mounted };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
const directory = fake<Directory>({ entries: [{}, {}] });

test("mountWorkspace hands the preview, Page Structure and the component tools to the host through its setters", () => {
  const { workspace, state, calls, byId } = setup();
  workspace.mountWorkspace();
  assert.equal(state.nativePreview, last("preview").value);
  assert.equal(state.pageStructure, last("structure").value);
  assert.ok(state.componentTools);
  assert.equal(workspace.content, byId("content"));
  assert.equal(workspace.files, byId("files"));
  assert.equal(workspace.repositorySelect, byId("repository"));
  assert.equal(workspace.explorerDropdown, last("dropdown").value);
  assert.equal(workspace.repositoryMenu, last("menu").value);
  assert.equal(workspace.siteActions, last("siteActions").value);
  assert.equal(workspace.sidebarResize, last("sidebar").value);
  assert.deepEqual(calls.filter((call) => /mountExplorer|mountComponentTools|palette.mount/.test(call)), ["mountExplorer", "mountComponentTools", "palette.mount"]);
  // A remount leaves nothing of the first behind.
  const first = last("preview"), tools = state.componentTools;
  workspace.mountWorkspace();
  assert.ok(first.calls.includes("destroy"));
  // The first row menu is closed and gone, and a blur closes the one shown now.
  const menus = made.filter((record) => record.kind === "rowMenu");
  assert.deepEqual(menus[0].calls, ["close"]);
  for (const listener of windowListeners.get("blur") ?? []) listener();
  assert.deepEqual(menus.at(-1)!.calls, ["close"]);
  assert.notEqual(state.componentTools, tools);
  assert.ok(calls.includes("componentTools.destroy"));
});

test("choosing a branch sets it before the snapshot loads, and hands over to the explorer", () => {
  const { workspace, calls, byId } = setup();
  workspace.mountWorkspace();
  const branch = byId("branch");
  branch.value = "dev";
  branch.dispatch("change");
  assert.ok(calls.includes("loadSnapshot dev"));
  assert.ok(last("menu").calls.includes("close"));
  assert.ok(last("dropdown").calls.includes("open"));
  assert.equal(focused, byId("explorer-toggle"));
  byId("repository").dispatch("change");
  assert.ok(calls.includes("chooseRepository"));
});

test("the repository menu's account and sign-out actions reach the ports read when they run", async () => {
  const { workspace, calls } = setup();
  workspace.mountWorkspace();
  const options = last("menu").options as { onSwitchAccount(login: string): void; onSignOut(): void; onReload(): void };
  options.onSwitchAccount("ana");
  options.onReload();
  options.onSignOut();
  await flush();
  assert.deepEqual(calls.filter((call) => /switchAccount|refreshRepositoryList|disconnect/.test(call)), ["switchAccount ana", "refreshRepositoryList", "disconnect"]);
});

test("a finished-elsewhere note, the repository menu opening and Site settings reach their ports", async () => {
  const { workspace, calls, byId } = setup();
  workspace.mountWorkspace();
  (last("menu").options as { onNote(note: unknown): void }).onNote({ repo: "lex/other" });
  assert.ok(calls.includes("finishedWork.open"));
  assert.ok(last("menu").calls.includes("close"));
  assert.ok(last("dropdown").calls.includes("open"));
  assert.equal(focused, byId("explorer-toggle"));
  // The menu's panel opening loads the agent connection and the Setup checklist; closing it does not.
  const panel = byId("repository-actions");
  panel.dispatch("toggle");
  panel.open = true;
  panel.dispatch("toggle");
  byId("site-settings-toggle").dispatch("click");
  await flush();
  assert.deepEqual(calls.filter((call) => /^(agent\.ensure|setupController\.mount|siteSettings)$/.test(call)), ["agent.ensure", "setupController.mount", "siteSettings"]);
});

test("closeWorkspace closes what is open and clears the host's state through its setters", () => {
  const { workspace, state, calls } = setup();
  workspace.mountWorkspace();
  void workspace.openCodeEditor({ key: "k", path: "index.html", source: "" });
  workspace.activeFileContext = { path: "index.html", baseSha: null, language: "html", readOnly: false, original: "", content: "" };
  const preview = last("preview"), dropdown = last("dropdown"), menu = last("menu"), sidebar = last("sidebar"), rail = last("rail"), actions = last("siteActions");
  calls.length = 0;
  workspace.closeWorkspace();
  assert.equal(calls[0], "dropGuess");
  for (const call of ["palette.dispose", "agent.destroy", "setupController.dispose", "setupEntry.remove", "history.destroy", "editor disposed",
    "deactivateNative", "linkedStyles.clearSources", "clearDrafts", "mediaHistoryHome.clear", "parkedSteps.clear", "nextLoad", "boot.reset",
    "appStore.reset", "repositoryIndex.clear", "cleanSources.clear"]) assert.ok(calls.includes(call), call);
  for (const record of [preview, dropdown, menu, sidebar, rail, actions]) assert.ok(record.calls.some((call) => call === "destroy" || call === "dispose"), record.kind);
  assert.equal(state.nativePreview, undefined);
  assert.deepEqual(state.repositories, []);
  assert.equal(state.fileGeneration, 1);
  assert.equal(workspace.activeFileContext, null);
  assert.equal(workspace.explorerDropdown, undefined);
  assert.equal(workspace.repositoryMenu, undefined);
  assert.equal(workspace.siteActions, undefined);
});

test("showDirectory shows a folder's summary in the content pane and moves fileGeneration through the host's setter", () => {
  const { workspace, state, calls, appStore, byId } = setup();
  workspace.mountWorkspace();
  appStore.repository.value = repository;
  appStore.snapshot.value = snapshot;
  workspace.showDirectory(directory, "docs/guides");
  assert.equal(state.fileGeneration, 1);
  assert.ok(calls.includes("setCurrentPage"));
  const text = byId("content").text();
  assert.match(text, /✦ Native site/);
  assert.match(text, /guides/);
  assert.match(text, /2 entries\. Pages, components and styles render live/);
  assert.match(text, /lex\/site/);
  assert.match(text, /0123456789ab/);
});

test("at the top of a repository with no site, Start your site shows unless another file opened meanwhile", async () => {
  const { workspace, state, appStore, byId } = setup();
  workspace.mountWorkspace();
  state.engaged = false;
  appStore.repository.value = repository;
  appStore.snapshot.value = snapshot;
  const panel = new FakeElement();
  workspace.showDirectory(directory);
  state.startSite!(fake<HTMLElement>(panel));
  await flush();
  assert.deepEqual(byId("content").children, [panel]);
  byId("content").replaceChildren();
  workspace.showDirectory(directory);
  state.fileGeneration++;
  state.startSite!(fake<HTMLElement>(panel));
  await flush();
  assert.deepEqual(byId("content").children, []);
});

test("openCodeEditor mounts the editor with a live share's journal, and closeEditor disposes it", async () => {
  const { workspace, state, calls, appStore, byId, proof, mounted } = setup();
  workspace.mountWorkspace();
  const listened: string[] = [];
  state.mountListener = (path, pane) => listened.push(`${path} ${pane}`);
  appStore.openFile.value = "index.html";
  const shareKey = draftKey(scope, "index.html");
  workspace.nativeHistoryShares.set(shareKey, [{ stamp: { load: 1, scope: undefined, holds: () => true, changed: () => undefined }, session: "shared" }]);
  await workspace.openCodeEditor({ key: "k", path: "index.html", source: "<p>", scope });
  assert.equal(mounted()?.content, byId("content"));
  assert.equal((mounted()?.file as { historyScope?: string }).historyScope, "shared");
  assert.deepEqual(workspace.primaryHistoryScope, { key: shareKey, session: "shared", proof });
  assert.deepEqual(listened, ["index.html false"]);
  assert.ok(calls.includes("mediaHistoryHome.adopt") && calls.includes("parkedSteps.adopt index.html"));
  workspace.closeEditor();
  assert.ok(calls.includes("editor disposed"));
  assert.equal(workspace.primaryHistoryScope, undefined);
});

test("openCodeEditor mounts nothing without a signed-in account", async () => {
  const { workspace, state, mounted } = setup();
  state.info = { ...state.info, user: null };
  await workspace.openCodeEditor({ key: "k", path: "index.html", source: "" });
  assert.equal(mounted(), undefined);
});

test("a file's journal is a live share's, else a live alias's, else its own", () => {
  const { workspace } = setup();
  const key = draftKey(scope, "about.html");
  const stamp = (holds: boolean) => ({ load: 1, scope: undefined, holds: () => holds, changed: () => undefined });
  assert.equal(workspace.nativeHistorySession(scope, "about.html"), key);
  workspace.nativeHistoryAliases.set(key, { stamp: stamp(true), session: "alias" });
  assert.equal(workspace.nativeHistorySession(scope, "about.html"), "alias");
  workspace.nativeHistoryShares.set(key, [{ stamp: stamp(false), session: "gone" }]);
  assert.equal(workspace.nativeHistorySession(scope, "about.html"), "alias");
  workspace.nativeHistoryShares.set(key, [{ stamp: stamp(true), session: "share" }]);
  assert.equal(workspace.nativeHistorySession(scope, "about.html"), "share");
});

test("Undo of a file no pane shows refreshes the tree, the preview and the component tools read when it runs", async () => {
  const { state, calls, unmounted, viewLoader } = setup();
  state.native = true;
  state.componentTools = fake<WorkspaceMountPorts["componentTools"]>({ refresh: () => calls.push("componentTools.refresh") });
  unmounted()!({ scope: { ...scope, branch: "dev" }, path: "index.html" });
  assert.deepEqual(calls, []);
  unmounted()!({ scope, path: "index.html" });
  assert.deepEqual(calls, ["filesTree.refresh", "updateNativePreviewSources", "componentTools.refresh"]);
  assert.equal(await viewLoader()!(), "Monaco view");
});

test("setupScope is the checklist's account, repository and branch shown when it is read", () => {
  const { workspace, state } = setup();
  assert.equal(workspace.setupScope(), "");
  state.shown = { kind: "github", account: "lex", repoId: 7, repo: "lex/site", branch: "main" };
  assert.notEqual(workspace.setupScope(), "");
});

test("Refresh reloads the snapshot and hands over to the explorer", async () => {
  const { workspace, calls, byId } = setup();
  workspace.mountWorkspace();
  byId("refresh").dispatch("click");
  await flush();
  assert.ok(calls.includes("loadSnapshot undefined"));
  assert.ok(last("menu").calls.includes("close"));
  assert.ok(last("dropdown").calls.includes("open"));
  assert.equal(focused, byId("explorer-toggle"));
});

test("an Add rail pick while the page's typing has not landed is refused as still updating", async () => {
  const { workspace, state, calls } = setup();
  workspace.mountWorkspace();
  state.typingLanded = false;
  (last("rail").options as { onPick(kind: string): void }).onPick("text");
  await flush();
  assert.ok(calls.includes("refuse The page is still updating. Try again in a moment."));
});

test("openCodeEditor shows nothing of a source that changed while its editor opened", async () => {
  const { workspace, byId, mounted } = setup();
  workspace.mountWorkspace();
  await workspace.openCodeEditor({ key: "k", path: "index.html", source: "" }, () => false);
  assert.equal(mounted(), undefined);
  assert.match(byId("content").text(), /The source changed while its editor opened\. Select it again\./);
});

test("a code editor that fails to load offers Retry for the editor open now, and says nothing for one replaced or closed", async (t) => {
  const { workspace, calls, byId } = setup();
  workspace.mountWorkspace();
  stubGlobals.codeEditorFails = true;
  t.after(() => { stubGlobals.codeEditorFails = false; });
  void workspace.openCodeEditor({ key: "a", path: "a.html", source: "" });
  void workspace.openCodeEditor({ key: "b", path: "b.html", source: "" });
  await flush();
  assert.deepEqual(calls.filter((call) => call.startsWith("error")), ["error The code editor chunk failed."]);
  assert.match(byId("content").text(), /The code editor could not load\..*Retry editor/);
  calls.length = 0;
  void workspace.openCodeEditor({ key: "c", path: "c.html", source: "" });
  workspace.closeEditor();
  await flush();
  assert.deepEqual(calls.filter((call) => call.startsWith("error")), []);
});

test("a Structure row keeps the bytes it was painted from: stale rows offer no actions, and a move says why it is stale", () => {
  const { workspace, state, calls, appStore } = setup();
  workspace.mountWorkspace();
  const item = { node: [0], tag: "section", className: "hero", children: [] };
  const preview = last("preview").options as { onStructure(structure: unknown): void };
  const structure = last("structure").options as {
    menuItems(path: string, item: unknown, opening?: boolean): { label: string }[];
    onMove(path: string, item: unknown, direction: string): unknown;
  };
  state.sources["index.html"] = "A";
  preview.onStructure({ path: "index.html", paintedSource: "A", items: [item] });
  assert.deepEqual(structure.menuItems("index.html", item, true).map((entry) => entry.label), ["Remove"]);
  state.sources["index.html"] = "B";
  assert.deepEqual(structure.menuItems("index.html", item, true), []);
  assert.ok(calls.includes("announce The source changed. Wait for the preview before using this action."));
  // The page open and mounted: its row moves now, or waits for the preview.
  state.mountedPaths.add("index.html");
  appStore.openFile.value = "index.html";
  structure.onMove("index.html", item, "up");
  // Not open: the page opens first, a section or another element.
  appStore.openFile.value = "about.html";
  state.sectionTags.add("section");
  structure.onMove("index.html", item, "up");
  state.sectionTags.clear();
  structure.onMove("index.html", item, "up");
  assert.deepEqual(calls.filter((call) => call.startsWith("moveBlock")), [
    "moveBlock The source changed. Wait for the preview before moving this element.",
    "moveBlock The source changed while its editor opened. Select the section again before moving it.",
    "moveBlock The source changed while its editor opened. Select the element again before moving it.",
  ]);
});
