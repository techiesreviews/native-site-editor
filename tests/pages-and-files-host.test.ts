import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createAppStore } from "../src/app-store.ts";
import { CleanSourceCache } from "../src/clean-source-cache.ts";
import { createDraftStore } from "../src/draft-store.ts";
import { draftStore, type DraftScope, type SavedDraft } from "../src/drafts.ts";
import { createNativeSiteRuntime } from "../src/native-site-runtime.ts";
import type { PagesAndFilesPorts } from "../src/pages-and-files-host.ts";
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

const SCOPE = { account: "o", repoId: 1, repo: "o/site", branch: "main" } satisfies DraftScope;
const SHA = "a".repeat(40);
const SNAPSHOT = { repo: "o/site", branch: "main", commit: SHA, entries: [{ path: "notes.txt", type: "blob", sha: SHA }] } as Snapshot;
const holds: SessionStamp = { load: 1, scope: undefined, holds: () => true, changed: () => undefined };
const deletion = (path: string): SavedDraft => ({ ...SCOPE, version: 1, path, baseSha: SHA, original: "kept", content: "kept", updatedAt: 0, deleted: true });

// A host over fakes that record what it asked of them; `late` stands in for ports main.ts declares further down.
function setup() {
  const calls: string[] = [];
  let scope: DraftScope | undefined;
  const late: { restoreFile?: PagesAndFilesPorts["restoreFile"] } = {};
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
    app: {} as HTMLElement, explorerDropdown: undefined, files: {} as HTMLElement, pageStructure: undefined, siteActions: undefined,
    pendingNativePageTitles: undefined, fileGeneration: 0,
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
    element: () => { throw new Error("No DOM here."); },
    lazyModule: <T>(load: () => Promise<T>) => load, loadConfirmDialog: () => import("../src/components/confirm-dialog.ts"),
    api: async <T>() => ({}) as T, status: () => {}, clearError: () => {}, errorMessage: (error: unknown) => { calls.push(`error ${String(error)}`); },
    announce: (text: string) => { calls.push(`announce ${text}`); },
    currentLoad: () => 1, stampOf: () => holds, draftScope: () => scope,
    entryAt: () => undefined, findEntry: async () => undefined, readFile: async () => "", readFiles: async () => ({}), readMediaText: async () => undefined, mediaOrigins: () => [],
    ensureNativeTextIndex: async () => undefined, nativeRouteForPath: () => undefined, nativeRouteInfo: () => ({}), nativeTitles: () => ({}),
    nativeNavigationTarget: () => undefined, writeNativePageMeta: async () => undefined,
    refreshNativeRoutes: () => {}, forgetDraftedAssets: () => {}, loadNativeComponentStyles: async () => {},
    updateAgentContext: record("agent"), updateCurrentPageLabel: () => {}, updateNativePreviewSources: () => {}, updatePreview: () => {},
    setCurrentPage: () => {}, showDirectory: () => { calls.push("directory"); }, openNewDraft: async () => {}, discardUpload: async () => {},
    uploadFilesTo: async () => [], nativeFallbackPage: () => undefined, nativeModeActive: () => false, nativeComponentTagForPath: () => undefined,
    startNativeTextIndex: () => {}, openNativePageSettings: async () => {}, openNativeNavigation: async () => {}, flushPendingNativePageTitles: () => {},
    restoreFile: (...args) => late.restoreFile!(...args), loadSnapshot: async () => {}, openEntry: async () => {},
  } satisfies PagesAndFilesPorts;
  const host = createPagesAndFilesHost(ports);
  return { host, calls, appStore, late, open: (next: DraftScope | undefined) => { scope = next; } };
}

test("the tree state and what is at a path follow the draft scope at call time", () => {
  const f = setup();
  draftStore().save(deletion("notes.txt"));
  assert.equal(f.host.pathNow("notes.txt"), "file");
  f.open(SCOPE);
  assert.equal(f.host.treeState().changes.get("notes.txt")?.kind, "D");
  assert.equal(f.host.pathNow("notes.txt"), "deleted");
  draftStore().remove(SCOPE, "notes.txt");
});

test("Restore brings a deletion back, refreshes once and says so", () => {
  const f = setup();
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
