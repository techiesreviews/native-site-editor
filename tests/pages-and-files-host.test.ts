import { after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftStore, type DraftScope, type SavedDraft } from "../src/drafts.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { ExplorerHost, PagesAndFilesPorts } from "../src/pages-and-files-host.ts";
import { newFilePath, newFolderPath, renamedPath } from "../src/native-create.ts";
import { NATIVE_HOME_PAGE } from "../shared/native-project.ts";
import { nativePageRoute } from "../shared/native-routes.ts";
import { parentProblem } from "../shared/site-rules.ts";
import { createWorkspaceSession, type SessionStamp } from "../src/workspace-session.ts";
import type { Snapshot } from "../shared/types.ts";

// The draft store and the components behind the host read these browser globals on first use.
const fakeGlobals = globalThis as Record<string, unknown>;
const saved = ["window", "document", "localStorage", "addEventListener", "BroadcastChannel"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const values = new Map<string, string>();
fakeGlobals.window = { addEventListener: () => {} };
fakeGlobals.addEventListener = () => {};
// No other tabs: an open channel would keep the test process alive.
fakeGlobals.BroadcastChannel = undefined;
fakeGlobals.document = { addEventListener: () => {}, visibilityState: "visible" };
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
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createPagesAndFilesHost } = await import("../src/pages-and-files-host.ts");
const { createExplorerActions } = await import("../src/pages-and-files-explorer.ts");

const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;
const SHA = "a".repeat(40);
const SNAPSHOT = { repo: "o/site", branch: "main", commit: SHA, entries: [{ path: "notes.txt", type: "blob", sha: SHA }] } as Snapshot;
const holds: SessionStamp = { load: 1, scope: undefined, holds: () => true, changed: () => undefined };
const deletion = (path: string, fields: Partial<SavedDraft> = {}): SavedDraft => ({ ...SCOPE, version: 1, path, baseSha: SHA, original: "kept", content: "kept", updatedAt: 0, deleted: true, ...fields });
// Drafts live in the one real store: each test takes its own out again, whatever it asserts.
const forget = (t: TestContext, ...paths: string[]) => t.after(() => { for (const path of paths) draftStore().remove(SCOPE, path); });
// The one place a stand-in takes an element's type.
// eslint-disable-next-line no-restricted-syntax -- the stand-ins implement only the members the host touches.
const asElement = <T extends HTMLElement>(fake: object) => fake as unknown as T;

// A host over fakes that record what it asked of them; `late` stands in for ports main.ts declares further down.
function setup() {
  const calls: string[] = [];
  let scope: DraftScope | undefined;
  let generation = 0;
  const late: { restoreFile?: PagesAndFilesPorts["restoreFile"]; loadSnapshot?: PagesAndFilesPorts["loadSnapshot"] } = {};
  const status = asElement({ textContent: "" });
  const appStore = createAppStore(createDraftStore());
  const record = (name: string) => () => { calls.push(name); };
  // The real site runtime over the same drafts: no site, one file on the branch.
  const runtime = createNativeSiteRuntime({
    scope: () => scope, shown: () => undefined, drafts: draftStore, mounted: () => undefined, clean: new CleanSourceCache(() => "o"),
    textKey: () => undefined, route: () => undefined, openFile: () => undefined, pageStyles: () => [], find: async () => undefined,
    readTexts: async () => ({ texts: new Map(), unreadable: [] }), unreadable: () => {}, changed: () => {}, closed: () => {},
  });
  runtime.base.files = ["notes.txt"];
  const ports = {
    app: asElement({}), explorerDropdown: undefined, files: asElement({ querySelectorAll: () => [] }), pageStructure: undefined, siteActions: undefined,
    get fileGeneration() { return generation; }, set fileGeneration(value) { generation = value; },
    appStore, workspaceSession: createWorkspaceSession(),
    runtime,
    editorModule: { isMounted: () => false, refreshDrafts: record("refreshDrafts"), forgetDraftModel: () => {}, dropDraft: () => false, clearHistory: () => {} },
    // Nothing here writes: a plan is refused, the reads find nothing.
    guardedEdits: { stamp: () => holds, run: async () => ({ ok: false, reason: "refused", message: "No writes here." }),
      peek: { source: () => undefined, exists: () => false, template: () => undefined, site: () => undefined } },
    mediaController: { requestGalleryRefresh: record("gallery"), disposeGallery: () => {}, ensureGallery: async () => {}, galleryVisible: () => false },
    cardsController: { cardOffer: () => undefined, cardsLinkingTo: () => undefined, createWithCard: () => undefined },
    linkedStyles: { secondaryPath: () => undefined, unlink: () => {}, openComponentLinkedStyle: async () => {}, openDefaultLinkedStyle: async () => {} },
    versions: { history: { refresh: record("history") } }, previewSelection: { recordIntent: () => {} },
    repositoryIndex: { seed: () => {} }, finishedWork: { add: () => {} },
    element: <T extends HTMLElement>(id: string) => { if (id === "status") return status as T; throw new Error(`No #${id} here.`); },
    lazyModule: <T>(load: () => Promise<T>) => load, loadConfirmDialog: () => import("../src/components/confirm-dialog.ts"),
    api: async <T>() => ({}) as T, status: () => {}, clearError: () => {}, errorMessage: (error: unknown) => { calls.push(`error ${String(error)}`); },
    announce: (text: string) => { calls.push(`announce ${text}`); },
    currentLoad: () => 1, stampOf: () => holds, draftScope: () => scope,
    entryAt: () => undefined, findEntry: async () => undefined, readFile: async () => "", readFiles: async () => ({}), readMediaText: async () => undefined, mediaOrigins: () => [],
    ensureNativeTextIndex: async () => undefined, nativeRouteForPath: () => undefined, nativeRouteInfo: () => ({}), nativeTitles: () => ({}),
    nativeNavigationTarget: () => undefined, writeNativePageMeta: async () => undefined,
    refreshNativeRoutes: () => {}, forgetDraftedAssets: () => {}, loadNativeComponentStyles: async () => {},
    updateAgentContext: record("agent"), updateCurrentPageLabel: () => {}, updateNativePreviewSources: () => {}, updatePreview: () => {},
    setCurrentPage: record("setCurrentPage"), showDirectory: () => { calls.push("directory"); }, openNewDraft: async () => {}, discardUpload: async (path: string) => { calls.push(`discardUpload ${path}`); },
    uploadFilesTo: async () => [], nativeFallbackPage: () => undefined, nativeModeActive: () => false, nativeComponentTagForPath: () => undefined,
    startNativeTextIndex: () => {}, openNativePageSettings: async () => {}, openNativeNavigation: async () => {}, flushPendingNativePageTitles: () => {}, clearPendingTitles: () => {},
    restoreFile: (...args) => late.restoreFile!(...args), loadSnapshot: (...args) => late.loadSnapshot!(...args), openEntry: async () => {},
  } satisfies PagesAndFilesPorts;
  const host = createPagesAndFilesHost(ports);
  return { host, ports, calls, appStore, runtime, late, status, generation: () => generation, open: (next: DraftScope | undefined) => { scope = next; } };
}

test("the tree state and what is at a path follow the draft scope at call time", (t) => {
  const f = setup();
  forget(t, "notes.txt");
  draftStore().save(deletion("notes.txt"));
  assert.equal(f.host.pathNow("notes.txt"), "file");
  f.open(SCOPE);
  assert.equal(f.host.treeState().changes.get("notes.txt")?.kind, "D");
  assert.equal(f.host.pathNow("notes.txt"), "deleted");
});

test("Restore brings a deletion back, refreshes once and says so", (t) => {
  const f = setup();
  forget(t, "notes.txt");
  f.open(SCOPE);
  draftStore().save(deletion("notes.txt"));
  f.host.undoFileChanges({ restore: ["notes.txt"] });
  assert.equal(draftStore().get(SCOPE, "notes.txt"), undefined);
  assert.equal(f.host.pathNow("notes.txt"), "file");
  assert.deepEqual(f.calls, ["refreshDrafts", "history", "agent", "gallery", "announce Restored notes.txt."]);
});

test("after a file goes, the page opens through a port the host reads when it runs", async () => {
  const f = setup();
  f.open(SCOPE);
  f.appStore.snapshot.value = SNAPSHOT;
  await f.host.openAfter(undefined);
  assert.deepEqual(f.calls, ["directory"]);
  const opened: string[] = [];
  f.late.restoreFile = async (path) => { opened.push(path); };
  await f.host.openAfter("notes.txt");
  assert.deepEqual(opened, ["notes.txt"]);
});

test("Restore of the open file takes the next file generation through the host's setter and leaves the page", async (t) => {
  const f = setup();
  forget(t, "notes.txt");
  f.open(SCOPE);
  f.late.restoreFile = async () => {};
  f.appStore.openFile.value = "notes.txt";
  draftStore().save(deletion("notes.txt"));
  f.host.undoFileChanges({ restore: ["notes.txt"] });
  assert.equal(f.generation(), 1);
  assert.equal(f.calls[0], "setCurrentPage");
});

test("a home page drafted in a site-less repository opens the project again, and the wait it gives clears after", async (t) => {
  const f = setup();
  forget(t, NATIVE_HOME_PAGE);
  f.open(SCOPE);
  f.appStore.snapshot.value = SNAPSHOT;
  let finish!: () => void;
  const loads: (string | undefined)[] = [];
  f.late.loadSnapshot = async (resume) => { loads.push(resume); await new Promise<void>((resolve) => { finish = resolve; }); };
  draftStore().save({ ...SCOPE, version: 1, path: NATIVE_HOME_PAGE, baseSha: null, original: "", content: "<h1>Home</h1>", updatedAt: 0 });
  assert.equal(f.runtime.engaged, false);
  f.host.afterFileChanges();
  const waiting = f.host.nativeResyncDone;
  assert.ok(waiting instanceof Promise);
  await Promise.resolve();
  assert.deepEqual(loads, [undefined]);
  finish();
  await waiting;
  assert.equal(f.host.nativeResyncDone, undefined);
});

test("Create refuses a name the branch has and makes a folder as its .gitkeep, a draft with no base blob", async (t) => {
  const f = setup();
  forget(t, "docs/.gitkeep");
  f.open(SCOPE);
  f.appStore.snapshot.value = SNAPSHOT;
  const explorer = createExplorerActions(f.ports, {
    createDialog: undefined, fileActions: undefined, fileOps: undefined, filesTreeController: f.host.filesTreeController, treeState: f.host.treeState,
    undoFileChanges: f.host.undoFileChanges, savePublish: f.host.savePublish, branchPathProblem: f.host.branchPathProblem, resyncNativeSite: () => false,
    parentOf: (path) => path.slice(0, Math.max(0, path.lastIndexOf("/"))), nativePageRoute, parentProblem, newFilePath, newFolderPath, renamedPath,
  } satisfies ExplorerHost);
  assert.deepEqual(explorer.planCreation({ kind: "file", folder: "", name: "notes.txt" }), { ok: false, error: "notes.txt already exists." });
  assert.equal(await explorer.createFromRequest({ kind: "folder", folder: "", name: "docs" }), undefined);
  const kept = draftStore().get(SCOPE, "docs/.gitkeep");
  assert.equal(kept?.baseSha, null);
  assert.equal(kept?.content, "");
  assert.equal(f.status.textContent, "Created the folder docs.");
});

test("Pages actions are read from the host after they load; a copy taken before stays empty", async () => {
  const f = setup();
  f.open(SCOPE);
  const { pageActions } = f.host;
  assert.equal(f.host.pageActions, undefined);
  await f.host.loadPagesActions();
  assert.ok(f.host.pageActions);
  assert.equal(pageActions, undefined);
});

test("a change's Restore, Move back and Discard of an upload each take their own way back", async (t) => {
  const f = setup();
  forget(t, "notes.txt", "old.txt", "new.txt");
  f.open(SCOPE);
  f.late.restoreFile = async () => {};
  draftStore().save(deletion("notes.txt"));
  draftStore().save(deletion("old.txt", { movedTo: "new.txt" }));
  draftStore().save({ ...SCOPE, version: 1, path: "new.txt", baseSha: null, original: "kept", content: "kept", updatedAt: 0, movedFrom: "old.txt", sourceSha: SHA });
  const changes = f.host.treeState().changes;
  assert.equal(changes.get("notes.txt")?.kind, "D");
  assert.equal(changes.get("new.txt")?.kind, "R");
  await f.host.discardFileChange(changes.get("notes.txt")!);
  await f.host.discardFileChange(changes.get("new.txt")!);
  const upload = { ...SCOPE, version: 1 as const, path: "photo.png", baseSha: null, original: "", content: "", updatedAt: 0, upload: { size: 3, type: "image/png" } };
  await f.host.discardFileChange({ kind: "A", path: "photo.png", drafts: [upload] });
  const said = f.calls.filter((call) => call.startsWith("announce ") || call.startsWith("discardUpload "));
  assert.deepEqual(said, ["announce Restored notes.txt.", "announce Moved new.txt back to old.txt.", "discardUpload photo.png"]);
  assert.equal(draftStore().get(SCOPE, "new.txt"), undefined);
  assert.equal(draftStore().get(SCOPE, "old.txt")?.deleted, undefined);
});
