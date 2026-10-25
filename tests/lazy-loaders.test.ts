import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { installChunkRecovery } from "../src/chunk-recovery.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftStore } from "../src/drafts.ts";
import { lazyModule } from "../src/lazy-module.ts";
import type { LazyLoadersPorts } from "../src/lazy-loaders.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { SessionStamp } from "../src/workspace-session.ts";
import { storage } from "../src/browser-storage.ts";

// The lazily loaded modules stand in: each records its loads and what it was made with, on `lazyStubs`.
interface Stubs { loads: string[]; made: [string, unknown][] }
const stubs: Stubs = { loads: [], made: [] };
(globalThis as Record<string, unknown>).lazyStubs = stubs;
const loaded = (name: string, body = "") => `globalThis.lazyStubs.loads.push(${JSON.stringify(name)}); ${body}`;
const made = (name: string) => `(ports) => { globalThis.lazyStubs.made.push([${JSON.stringify(name)}, ports]); return { name: ${JSON.stringify(name)} }; }`;
const stubModules: Record<string, string> = {
  "src/setup-actions.ts": loaded("setup-actions", `export const createSetupActions = ${made("setup-actions")};`),
  "src/native-settings.ts": loaded("native-settings", `export const createNativeSettings = ${made("native-settings")};`),
  "src/agent-prompts.ts": loaded("agent-prompts", 'export const setupPrompt = () => "prompt";'),
  "src/onboarding-copy.ts": loaded("onboarding-copy", 'export const AGENT_EXPLAINER = ["copy"];'),
  "src/components/spotlight.ts": loaded("spotlight", "export const spotlight = 1;"),
  "src/components/setup-wizard.ts": loaded("setup-wizard", "export const wizard = 1;"),
  "src/components/setup-checklist.ts": loaded("setup-checklist", "export const checklist = 1;"),
  "src/components/agent-menu.ts": loaded("agent-menu", `export const createAgentMenu = ${made("agent-menu")};`),
  "src/agent-records.ts": loaded("agent-records", 'export const indexedDbAgentRecords = () => "records";'),
  "src/page-builder/media-picker.ts": loaded("media-picker", `export const isMediaLibraryPath = () => true; export const configureMediaPicker = ${made("media-picker")};`),
  "src/page-builder/media-workspace.ts": loaded("media-workspace", "export const createMediaWorkspace = (context, pinned) => ({ context, pinned });"),
  "src/page-builder/media-draft-transaction.ts": loaded("media-draft-transaction"),
  "shared/media-records.ts": loaded("media-records"),
};
registerHooks({ load: (url, context, next) => {
  const stub = Object.entries(stubModules).find(([path]) => url.endsWith(`/${path}`));
  return stub ? { format: "module", source: stub[1], shortCircuit: true } : next(url, context);
} });
const { createLazyLoaders } = await import("../src/lazy-loaders.ts");

// The loaders over the real runtime and app store; the host's later state records what it was asked.
function setup() {
  const calls: string[] = [];
  const runtime = createNativeSiteRuntime({
    scope: () => undefined, shown: () => undefined, drafts: draftStore, mounted: () => undefined, clean: new CleanSourceCache(() => "o"),
    textKey: () => "", route: () => undefined, openFile: () => undefined, pageStyles: () => [], find: async () => undefined,
    readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  const late = { setupPorts: 0 };
  const stamp = (load: number): SessionStamp => ({ load, scope: undefined, holds: () => true, changed: () => undefined });
  const ports = {
    runtime, appStore: createAppStore(createDraftStore()), currentLoad: () => 7, stampOf: stamp, loadNativeAssets: async () => {},
    get guardedEdits() { return {} as LazyLoadersPorts["guardedEdits"]; }, // eslint-disable-line no-restricted-syntax -- handed on, never called here.
    get mediaController() {
      // eslint-disable-next-line no-restricted-syntax -- only the workspace context and usage are read.
      return { workspaceContext: (_library: unknown, pin?: unknown) => { calls.push(`context ${pin ?? "shown"}`); return Promise.resolve({}); },
        usageRecords: () => { calls.push("usage"); return []; }, onUsageChange: () => () => {} } as unknown as LazyLoadersPorts["mediaController"];
    },
    get mediaPorts() { return { pin: () => "pin" } as unknown as LazyLoadersPorts["mediaPorts"]; }, // eslint-disable-line no-restricted-syntax -- only the pin is read.
    get pagesController() { return { pageLabel: (file: string) => `label ${file}` }; },
    get pagesAndFiles() { return { pageActions: undefined }; },
    setupScope: () => "o/site@main",
    restoreFile: async (path: string, at: SessionStamp) => { calls.push(`restore ${path} ${at.load}`); },
    nativeSiteReadForCreate: async () => undefined, readMediaText: async () => undefined,
    loadPagesActions: async () => { calls.push("pages actions"); },
    setupActions: () => { late.setupPorts++; return { marker: "setup" } as unknown as ReturnType<LazyLoadersPorts["setupActions"]>; }, // eslint-disable-line no-restricted-syntax -- the stand-in only keeps them.
  } satisfies LazyLoadersPorts;
  stubs.loads = []; stubs.made = [];
  return { loaders: createLazyLoaders(ports), calls, late };
}

test("setup's actions are made once, with their ports read when they first load, and the panels wait for them", async () => {
  const { loaders, late } = setup();
  assert.equal(late.setupPorts, 0);
  const [checklist, wizard] = await Promise.all([loaders.loadChecklist(), loaders.loadWizard()]);
  assert.deepEqual([checklist, wizard].map((module) => Object.keys(module)), [["checklist"], ["wizard"]]);
  assert.equal(late.setupPorts, 1);
  assert.deepEqual(stubs.made, [["setup-actions", { marker: "setup" }]]);
  // The wizard brought the agent prompt with it.
  assert.equal(loaders.agentPrompts?.setupPrompt({} as never), "prompt");
});

test("the agent copy is there once the spotlight has loaded", async () => {
  const { loaders } = setup();
  await loaders.loadSpotlight();
  assert.deepEqual(loaders.onboardingCopy?.AGENT_EXPLAINER, ["copy"]);
});

test("the settings load after Pages' actions and restore through a stamp of the load they were opened in", async () => {
  const { loaders, calls } = setup();
  await loaders.loadSiteSettings();
  const [[name, ports]] = stubs.made as [string, Parameters<typeof import("../src/native-settings.ts").createNativeSettings>[0]][];
  assert.equal(name, "native-settings");
  assert.deepEqual(calls, ["pages actions"]);
  assert.equal(ports.generation, 7);
  assert.equal(ports.nativePageLabelOf("about.html"), "label about.html");
  assert.equal(ports.setupScope(), "o/site@main");
  await ports.restoreFile("index.html", 3);
  assert.deepEqual(calls.at(-1), "restore index.html 3");
});

test("the media picker reads the shown workspace, a pinned one and the usage check", async () => {
  const { loaders, calls } = setup();
  await loaders.loadMedia();
  const [[, host]] = stubs.made as [string, { context: () => unknown; pinned: () => (() => unknown) | undefined; usage: { records(): unknown; pageLabel(file: string): unknown } }][];
  await host.context();
  await host.pinned()?.();
  host.usage.records();
  assert.equal(host.usage.pageLabel("index.html"), "label index.html");
  assert.deepEqual(calls, ["context shown", "context pin", "usage"]);
  assert.deepEqual(stubs.loads.sort(), ["media-draft-transaction", "media-picker", "media-records", "media-workspace"]);
});

test("the agent menu is made with the browser's agent records", async () => {
  const { loaders } = setup();
  const { createAgentMenu } = await loaders.loadAgentMenu();
  createAgentMenu({ account: "o" } as never);
  assert.deepEqual(stubs.made, [["agent-menu", { account: "o", records: "records" }]]);
});

test("a failed import is handed to chunk recovery and tried again on the next call", async () => {
  const reloads: string[] = [], kept = new Map<string, string>();
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  (globalThis as Record<string, unknown>).window = { addEventListener: () => {} };
  try {
    installChunkRecovery({ storage: () => ({ getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, value); } }),
      unsafe: () => false, flush: async () => {}, persistenceError: () => false, reload: () => { reloads.push("reload"); }, notice: () => {} });
  } finally {
    if (saved) Object.defineProperty(globalThis, "window", saved); else Reflect.deleteProperty(globalThis, "window");
  }
  let attempts = 0;
  const load = lazyModule(async () => { if (++attempts === 1) throw new Error("Failed to fetch dynamically imported module"); return attempts; });
  await assert.rejects(load(), { message: "Failed to fetch dynamically imported module" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(reloads, ["reload"]);
  assert.equal(await load(), 2);
  assert.equal(await load(), 2);
  assert.equal(attempts, 2);
});

test("a refused browser store keeps nothing instead of throwing", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("denied"); } });
  try {
    const store = storage("local");
    store.setItem("key", "value");
    assert.equal(store.getItem("key"), null);
  } finally {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
