import { after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { signal } from "@preact/signals-core";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { UnreadableFile } from "../src/native-boot.ts";
import { createSiteTextIndex, isNativeTextFile, type SiteTextIndexPorts } from "../src/site-text-index.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";

// The index listens for pointer events on the page; nothing here fires them.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["document", "window"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
fakeGlobals.document = { addEventListener: () => {} };
fakeGlobals.window = { addEventListener: () => {} };
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const SHA = "a".repeat(40);
const REPO = { full_name: "o/site" } as Repository;
const SNAPSHOT = { branch: "main", commit: SHA, entries: [] } satisfies Snapshot;
const SITE = { routes: { "/": "index.html", "/about": "about.html" }, components: { "site-card": "components/site-card.html" } };
const FILES = ["index.html", "about.html", "components/site-card.html", "style.css", "notes.txt", "node_modules/x/y.css"];

// A real runtime and session over the site above, with the index page read and what the index asked recorded.
function setup(overrides: { unreadable?: UnreadableFile[]; busy?: () => boolean; files?: string[]; start?: boolean } = {}) {
  const calls: string[] = [], read: string[] = [];
  const runtime = createNativeSiteRuntime({
    scope: () => undefined, shown: () => undefined, drafts: () => ({ get: () => undefined, list: () => [] }), mounted: () => undefined,
    clean: new CleanSourceCache(() => "o"), textKey: () => "", route: () => "/", openFile: () => undefined, pageStyles: () => [],
    find: async () => ({ sha: SHA }), readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  const request = runtime.begin();
  runtime.site = SITE;
  const files = overrides.files ?? FILES;
  runtime.base.files = files;
  runtime.base.sources.set("index.html", "<h1>Home</h1>");
  const appStore = { repository: signal<Repository | undefined>(REPO), snapshot: signal<Snapshot | undefined>(SNAPSHOT), openFile: signal<string | undefined>(undefined) };
  const workspaceSession = createWorkspaceSession();
  let behind = false;
  // The one place a stand-in takes an element's type.
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
    findEntry: async (path: string) => (files.includes(path) ? ({ path, mode: "100644", type: "blob", sha: `${path}-sha` }) satisfies TreeEntry : undefined),
    // As the host: the preview takes every source, so it is no longer behind.
    updateNativePreviewSources: () => { behind = false; calls.push("sources"); },
    updateAgentContext: () => { calls.push("agent"); },
    readNativeTexts: async (_repo: string, files: { path: string; sha: string }[]) => {
      read.push(...files.map((file) => file.path));
      const unreadable = overrides.unreadable ?? [];
      return { texts: new Map(files.filter((file) => !unreadable.some((bad) => bad.path === file.path)).map((file) => [file.path, `<title>${file.path}</title>`])), unreadable };
    },
    noteNativeUnreadable: (files: UnreadableFile[] | undefined) => { calls.push(`unreadable ${files?.map((file) => file.path).join(",")}`); },
    updateCurrentPageLabel: () => { calls.push("label"); },
  } satisfies SiteTextIndexPorts;
  const index = createSiteTextIndex(ports);
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

  const second = setup({ busy: () => true });
  await second.index.ensureNativeTextIndex();
  second.index.clearPendingTitles();
  second.index.flushPendingNativePageTitles();
  await Promise.resolve();
  assert.equal(second.calls.includes("tree"), false);
});
