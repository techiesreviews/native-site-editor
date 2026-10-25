import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftStore, type DraftScope } from "../src/drafts.ts";
import { createAgentMenuHost, type AgentMenuHostPorts } from "../src/agent-menu-host.ts";
import type { AgentSiteInput, SharedContext } from "../src/agent-site.ts";
import type { AgentMenuPort } from "../src/controllers/agent-controller.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { Stamp } from "../src/guarded-edit.ts";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { MediaPin } from "../src/controllers/media-controller.ts";
import type { AgentCommand } from "../shared/agent.ts";
import { resolveNativeProject } from "../shared/native-project.ts";
import type { Repository, SessionInfo, Snapshot } from "../shared/types.ts";

// The draft store and the menu's host read these browser globals; no other tabs, so no channel keeps the process alive.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["window", "document", "localStorage", "addEventListener", "BroadcastChannel"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const values = new Map<string, string>(), menuHost = { roots: [] as unknown[], append(root: unknown) { this.roots.push(root); } };
fakeGlobals.window = { addEventListener: () => {}, removeEventListener: () => {} };
fakeGlobals.document = { addEventListener: () => {}, visibilityState: "visible", getElementById: (id: string) => (id === "agent-menu" ? menuHost : null) };
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

const SCOPE: DraftScope = { account: "o", repoId: 1, repo: "o/site", branch: "main" };
const REPO = { id: 1, full_name: "o/site" } as Repository; // eslint-disable-line no-restricted-syntax -- only the id and name are read.
const SNAPSHOT = { branch: "main", commit: "c1" } as Snapshot; // eslint-disable-line no-restricted-syntax -- only the branch and commit are read.
type MenuOptions = Parameters<Awaited<ReturnType<AgentMenuHostPorts["loadAgentMenu"]>>["createAgentMenu"]>[0];
const SELECTION = { path: "index.html", tag: "p", text: "", reason: "click", selectors: [], node: [0] } satisfies NativePreviewSelection;
const COMMAND = { id: "c1", operation: "write_file", path: "index.html", branch: "main", commit: "c1", content: "", state: "pending" } satisfies AgentCommand;
const PIN = {} as MediaPin; // eslint-disable-line no-restricted-syntax -- handed on unread: the test checks only that it arrives.

// The host over the real runtime, app store and drafts; the menu, the agent's site and the other ports record what they were asked.
function setup(options: { draftScope?: () => DraftScope | undefined } = {}) {
  const calls: string[] = [], inputs: AgentSiteInput[] = [], menus: MenuOptions[] = [];
  const late: { info?: SessionInfo; requests?: unknown; indexed: boolean; holds: boolean } = { info: { user: { login: "o" } } as SessionInfo, indexed: true, holds: true }; // eslint-disable-line no-restricted-syntax -- only the login is read.
  const stamp: Stamp = { holds: () => late.holds, changed: () => (late.holds ? undefined : "scope") } as unknown as Stamp; // eslint-disable-line no-restricted-syntax -- the site host asks only holds and changed.
  const cleanSources = new CleanSourceCache(() => "o");
  const runtime = createNativeSiteRuntime({
    scope: () => SCOPE, shown: () => undefined, drafts: draftStore, mounted: () => undefined, clean: cleanSources,
    textKey: () => "", route: () => undefined, openFile: () => undefined, pageStyles: () => [], find: async () => undefined,
    readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  const appStore = createAppStore(createDraftStore());
  appStore.repository.value = REPO;
  appStore.snapshot.value = SNAPSHOT;
  const pins: string[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push(`${name} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`.trim()); };
  const ports = {
    appStore, runtime, guardedEdits: { stamp: () => stamp }, cleanSources,
    agentCommands: { apply: async (command) => { calls.push(`apply ${command.id}`); }, reload: async (snapshot) => { calls.push(`reload ${snapshot.revision}`); } },
    setupController: { noteAgent: record("noteAgent") }, pageStructureController: { renderEditBar: record("renderEditBar") },
    mediaPorts: { pin: () => { pins.push("pin"); return PIN; } },
    workspace: { activeFileContext: null, repositoryMenu: { setQuestions: record("questions"), close: record("close menu") } },
    nativeTextIndexGate: { key: () => "k", indexed: () => late.indexed, settled: async () => true, ensure: async () => { calls.push("index"); late.indexed = true; return undefined; } },
    get info() { return late.info; },
    get nativePreview() { return { route: () => "/", setRequests: record("requests"), showRequest: record("show") }; },
    api: (async () => { throw new Error("no reads"); }) as unknown as AgentMenuHostPorts["api"], // eslint-disable-line no-restricted-syntax -- the menu never reads GitHub here.
    readFile: async () => "", readFiles: async () => ({}),
    loadAgentSite: async () => ({ buildAgentContext: async (input: AgentSiteInput) => { inputs.push(input); return { input } as unknown as SharedContext; } }), // eslint-disable-line no-restricted-syntax -- the stand-in context only carries the input back.
    loadAgentMenu: async () => ({ createAgentMenu: (options: MenuOptions) => {
      menus.push(options);
// eslint-disable-next-line no-restricted-syntax -- the menu root is only appended and removed; no DOM element here.
      return { root: { remove() {} } as HTMLElement, connected: () => false, changed() {}, consentGranted() {}, destroy() {}, ask: async () => undefined, answer: async () => {}, dismiss: async () => {} } satisfies AgentMenuPort<HTMLElement>; } }),
    draftScope: options.draftScope ?? (() => SCOPE),
    nativeRouteInfo: (route: string) => ({ title: `title of ${route}` }),
    pathNow: (path: string) => (path === "index.html" ? "file" : undefined),
    errorMessage: record("error"),
  } satisfies AgentMenuHostPorts;
  return { host: createAgentMenuHost(ports), calls, inputs, menus, late, runtime, appStore, cleanSources, pins };
}

test("the menu mounts for the signed-in account and its connection, requests and questions reach the editor", async () => {
  const { host, calls, menus, appStore } = setup();
  await host.agentController.ensure();
  assert.equal(menus.length, 1);
  assert.equal(menuHost.roots.length, 1);
  const [options] = menus;
  assert.equal(options.account, "o");
  options.onConnection?.(true);
  appStore.selection.value = SELECTION;
  options.onConnection?.(false);
  options.onRequests?.([]);
  options.onQuestions?.(2);
  options.onShowRequest?.("r1");
  await options.onCommand(COMMAND);
  await options.reload?.({ revision: 2, generation: 1, drafts: [] });
  assert.deepEqual(calls, ["noteAgent true", "noteAgent false", `renderEditBar ${JSON.stringify(SELECTION)}`, "requests []", "questions 2", "close menu", 'show "r1"', "apply c1", "reload 2"]);
});

test("no menu mounts before the session names an account", async () => {
  const { host, menus, late } = setup();
  late.info = undefined;
  await host.agentController.ensure();
  assert.equal(menus.length, 0);
});

test("the context agents see waits for the whole site and describes the workspace, its site and the page open", async () => {
  const { host, calls, inputs, menus, late, runtime, appStore } = setup();
  const resolved = resolveNativeProject(["index.html"]);
  assert.ok(resolved.ok);
  runtime.site = resolved.site;
  runtime.base.sources.set("index.html", "<p>home</p>");
  appStore.openFile.value = "index.html";
  appStore.selection.value = SELECTION;
  late.indexed = false;
  await host.agentController.ensure();
  const options = menus.at(-1)!;
  assert.ok(await options.context());
  assert.deepEqual(calls, ["index"]);
  const [input] = inputs;
  assert.deepEqual([input.repository, input.branch, input.commit, input.file, input.drafts], [{ id: 1, fullName: "o/site" }, "main", "c1", null, []]);
  assert.equal(input.native?.site, resolved.site);
  assert.deepEqual(input.native?.routeInfo("/"), { title: "title of /" });
  assert.equal(input.native?.source("index.html"), "<p>home</p>");
  assert.deepEqual([input.native?.exists("index.html"), input.native?.exists("gone.html"), input.native?.openFile], [true, false, "index.html"]);
  // The selection carries the route the preview shows.
  assert.deepEqual([input.native?.selection?.path, input.native?.selection?.route], ["index.html", "/"]);
  // Left meanwhile: nothing is built.
  late.holds = false;
  assert.equal(await options.context(), undefined);
  assert.equal(inputs.length, 1);
});

test("with no draft scope the context is not built", async () => {
  const { host, menus, inputs } = setup({ draftScope: () => undefined });
  await host.agentController.ensure();
  assert.equal(await menus.at(-1)!.context(), undefined);
  assert.equal(inputs.length, 0);
});

test("the files agents read are the open repository's, with the clean cache's blobs, and none with no snapshot", async () => {
  const { host, menus, appStore, cleanSources } = setup();
  await host.agentController.ensure();
  const tools = menus.at(-1)!.tools!;
  cleanSources.put("o/site", "sha-1", "", "<p>home</p>");
  const files = tools.files();
  assert.deepEqual([files?.repo, files?.snapshot], [REPO, SNAPSHOT]);
  assert.deepEqual([files?.has("o/site", "sha-1"), files?.has("o/site", "sha-2")], [true, false]);
  appStore.snapshot.value = undefined;
  assert.equal(tools.files(), undefined);
});

test("work pinned for Media carries the pin the media ports give", async () => {
  const { host, menus, pins } = setup();
  await host.agentController.ensure();
  assert.equal(menus.at(-1)!.tools!.pin?.()?.media, PIN);
  assert.deepEqual(pins, ["pin"]);
});
