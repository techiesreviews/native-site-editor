import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftStore, type DraftScope } from "../src/drafts.ts";
import { agentMenuOptions, type AgentMenuPorts } from "../src/agent-menu-host.ts";
import type { AgentSiteInput, SharedContext } from "../src/agent-site.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { Stamp } from "../src/guarded-edit.ts";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { MediaPin } from "../src/controllers/media-controller.ts";
import type { AgentCommand, AgentWho } from "../shared/agent.ts";
import type { PinRequest } from "../src/components/agent-pins.ts";
import { resolveNativeProject } from "../shared/native-project.ts";
import type { Repository, Snapshot } from "../shared/types.ts";

// The draft store and the menu's host read these browser globals; no other tabs, so no channel keeps the process alive.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["window", "document", "localStorage", "addEventListener", "BroadcastChannel"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const values = new Map<string, string>();
fakeGlobals.window = { addEventListener: () => {}, removeEventListener: () => {} };
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

const SCOPE: DraftScope = { account: "o", repoId: 1, repo: "o/site", branch: "main" };
const REPO = { id: 1, full_name: "o/site" } as Repository; // eslint-disable-line no-restricted-syntax -- only the id and name are read.
const SNAPSHOT = { branch: "main", commit: "c1" } as Snapshot; // eslint-disable-line no-restricted-syntax -- only the branch and commit are read.
const SELECTION = { path: "index.html", tag: "p", text: "", reason: "click", selectors: [], node: [0] } satisfies NativePreviewSelection;
const COMMAND = { id: "c1", operation: "write_file", path: "index.html", branch: "main", commit: "c1", content: "", state: "pending" } satisfies AgentCommand;
const PIN = {} as MediaPin; // eslint-disable-line no-restricted-syntax -- handed on unread: the test checks only that it arrives.
// The agent presence names on each pin being worked on (src/agent-presence.ts `onPin`): a take's own taker, or none.
const ON_PIN = new Map<string, AgentWho>([["req-now", { grant: "grant-Copy editor", name: "Copy editor" }], ["req-named", { grant: "grant-Watchdog", name: "Watchdog" }]]);

// The host over the real runtime, app store and drafts; the menu, the agent's site and the other ports record what they were asked.
function setup(options: { draftScope?: () => DraftScope | undefined } = {}) {
  const calls: string[] = [], inputs: AgentSiteInput[] = [];
  const late: { indexed: boolean; holds: boolean; preview: boolean } = { indexed: true, holds: true, preview: true };
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
    setupController: { noteAgent: record("noteAgent") }, pageStructureController: { renderEditBar: record("renderEditBar") },
    mediaPorts: { pin: () => { pins.push("pin"); return PIN; } },
    workspace: { activeFileContext: null, repositoryMenu: { setQuestions: record("questions"), close: record("close menu") } },
    agentPresence: { questions: record("questioned"), onPin: (id: string) => ON_PIN.get(id), colour: (who: AgentWho) => { calls.push(`colour ${who.name}`); return 2; }, atWork: () => [{ name: "Copy editor", file: "index.html", section: "1.0" }], agents: () => [], stop: () => {}, stopped: () => false, heard: () => {}, listen: () => () => {} },
    nativeTextIndexGate: { key: () => "k", indexed: () => late.indexed, settled: async () => true, ensure: async () => { calls.push("index"); late.indexed = true; return undefined; } },
    get nativePreview() { return late.preview ? { route: () => "/", setRequests: record("requests"), showRequest: record("show") } : undefined; },
    api: (async () => { throw new Error("no reads"); }) as unknown as AgentMenuPorts["api"], // eslint-disable-line no-restricted-syntax -- the menu never reads GitHub here.
    readFile: async () => "", readFiles: async () => ({}),
    loadAgentSite: async () => ({ buildAgentContext: async (input: AgentSiteInput) => { inputs.push(input); return { input } as unknown as SharedContext; } }), // eslint-disable-line no-restricted-syntax -- the stand-in context only carries the input back.
    draftScope: options.draftScope ?? (() => SCOPE),
    nativeRouteInfo: (route: string) => ({ title: `title of ${route}` }),
    pathNow: (path: string) => (path === "index.html" ? "file" : undefined),
  } satisfies AgentMenuPorts;
  const commands = { apply: async (command: AgentCommand) => { calls.push(`apply ${command.id}`); }, reload: async (snapshot: { revision: number }) => { calls.push(`reload ${snapshot.revision}`); } };
  // The options each mount of the menu is made with (src/controllers/agent-controller.ts).
  return { options: agentMenuOptions(ports, commands), calls, inputs, late, runtime, appStore, cleanSources, pins };
}

test("the menu's connection, requests and questions reach the editor, and its commands the agent's", async () => {
  const { calls, appStore, ...made } = setup();
  const options = made.options();
  options.onConnection?.(true);
  appStore.selection.value = SELECTION;
  options.onConnection?.(false);
  options.onRequests?.([]);
  options.onQuestions?.(2);
  options.onShowRequest?.("r1");
  await options.onCommand(COMMAND);
  await options.reload?.({ revision: 2, generation: 1, drafts: [] });
  assert.deepEqual(calls, ["noteAgent true", "noteAgent false", `renderEditBar ${JSON.stringify(SELECTION)}`, "questioned []", "requests []", "questions 2", "close menu", 'show "r1"', "apply c1", "reload 2"]);
});

test("the context agents see waits for the whole site and describes the workspace, its site and the page open", async () => {
  const { calls, inputs, late, runtime, appStore, ...made } = setup();
  const resolved = resolveNativeProject(["index.html"]);
  assert.ok(resolved.ok);
  runtime.site = resolved.site;
  runtime.base.sources.set("index.html", "<p>home</p>");
  appStore.openFile.value = "index.html";
  appStore.selection.value = SELECTION;
  late.indexed = false;
  const options = made.options();
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
  const { options, inputs } = setup({ draftScope: () => undefined });
  assert.equal(await options().context(), undefined);
  assert.equal(inputs.length, 0);
});

test("the files agents read are the open repository's, with the clean cache's blobs, and none with no snapshot", async () => {
  const { options, appStore, cleanSources } = setup();
  const tools = options().tools!;
  cleanSources.put("o/site", "sha-1", "", "<p>home</p>");
  const files = tools.files();
  assert.deepEqual([files?.repo, files?.snapshot], [REPO, SNAPSHOT]);
  assert.deepEqual([files?.has("o/site", "sha-1"), files?.has("o/site", "sha-2")], [true, false]);
  appStore.snapshot.value = undefined;
  assert.equal(tools.files(), undefined);
  // get_site tells who works on what (ticket am-11).
  assert.deepEqual(tools.atWork?.(), [{ name: "Copy editor", file: "index.html", section: "1.0" }]);
});

test("work pinned for Media carries the pin the media ports give", async () => {
  const { options, pins } = setup();
  assert.equal(options().tools!.pin?.()?.media, PIN);
  assert.deepEqual(pins, ["pin"]);
});

test("before the preview exists, requests and a shown request wait, and the selection carries no route", async () => {
  const { calls, inputs, late, runtime, appStore, ...made } = setup();
  late.preview = false;
  const options = made.options();
  options.onRequests?.([]);
  options.onShowRequest?.("r1");
  // The questions' presence needs no preview (Page Structure and Pages and files show it too).
  assert.deepEqual(calls, ["questioned []", "close menu"]);
  const resolved = resolveNativeProject(["index.html"]);
  assert.ok(resolved.ok);
  runtime.site = resolved.site;
  appStore.selection.value = SELECTION;
  assert.ok(await options.context());
  assert.deepEqual([inputs[0].native?.selection?.path, inputs[0].native?.selection?.route], ["index.html", undefined]);
});

test("only a pin an agent works on asks for its colour (am-13): finished ones of earlier sessions, and a watchdog's take presence names no one for, take no place in the order of arrival", async () => {
  const { options, calls } = setup();
  const request = (id: string, state: PinRequest["state"], name: string): PinRequest => ({ id, text: id, state, createdAt: 1, repoId: 1, branch: "main",
    element: { file: "index.html", route: "/", id: "1.0", tag: "h1" }, agent: { grant: `grant-${name}`, name } });
  const took: PinRequest = { ...request("req-took", "seen", "Watchdog"), agentTook: true };
  // Ticket am-45: a take presence names its taker for shows that agent, in its colour.
  const named: PinRequest = { ...request("req-named", "seen", "Watchdog"), agentTook: true };
  options().onRequests?.([request("req-old", "done", "Old helper"), request("req-now", "seen", "Copy editor"), took, named]);
  assert.deepEqual(calls.filter(call => call.startsWith("colour")), ["colour Copy editor", "colour Watchdog"]);
  const told = JSON.parse(calls.find(call => call.startsWith("requests "))!.slice("requests ".length)) as PinRequest[];
  assert.deepEqual(told.map(item => [item.id, item.colour, item.agent?.name, item.agentTook]),
    [["req-old", undefined, "Old helper", undefined], ["req-now", 2, "Copy editor", undefined], ["req-took", undefined, "Watchdog", true], ["req-named", 2, "Watchdog", undefined]]);
});
