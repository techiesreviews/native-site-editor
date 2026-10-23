import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { SourceFile } from "../src/components/source-editor.ts";
import type { SourcePanePorts } from "../src/controllers/source-pane-controller.ts";
import { draftKey, type SavedDraft } from "../src/drafts.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";

// Just enough DOM for the source pane's messages.
class FakeElement {
  children: FakeElement[] = [];
  className = ""; textContent = "";
  replaceChildren(...children: unknown[]) { this.children = children as FakeElement[]; }
}
const saved = ["document", "localStorage", "location", "history"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
const stored = new Map<string, string>();
const shown = { href: "https://editor.test/" };
Object.assign(globalThis, {
  document: { createElement: () => new FakeElement() },
  location: shown,
  history: { replaceState: (_state: unknown, _title: string, url: URL) => { shown.href = String(url); } },
  localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value), removeItem: (key: string) => void stored.delete(key) },
});
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createSourcePaneController } = await import("../src/controllers/source-pane-controller.ts");

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
const REPO = { id: 501, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } } satisfies Repository;
const SNAPSHOT: Snapshot = { commit: "head1234567", branch: "main", entries: [] };
const SCOPE = { account: "lex", repoId: 501, repo: "lex/site", branch: "main" };
const entry = (path: string, more: Partial<TreeEntry> = {}): TreeEntry => ({ path, type: "blob", mode: "100644", sha: `${path}-sha`, size: 10, ...more });

function harness(options: { drafts?: Record<string, SavedDraft>; component?: string; read?: (sha: string) => Promise<string> } = {}) {
  const content = new FakeElement();
  const calls: string[] = [];
  const opened: SourceFile[] = [];
  let fileGeneration = 0;
  let linkedPage: string | undefined;
  const mounted = new Set<string>();
  const session = createWorkspaceSession();
  const appStore = {
    openFile: signal<string | undefined>(undefined), repository: signal<Repository | undefined>(REPO), snapshot: signal<Snapshot | undefined>(SNAPSHOT),
    selection: signal<NativePreviewSelection | undefined>(undefined),
  };
  const ports = {
    appStore,
    workspaceSession: session,
    editorModule: { isMounted: (path) => mounted.has(path), holdHistoryRefresh: (path) => { calls.push(`hold ${path}`); return () => void calls.push(`release ${path}`); } },
    linkedStyles: {
      syncLinkedStyles: (path) => void calls.push(`sync ${path}`),
      openSecondary: async (path) => { calls.push(`secondary ${path}`); return true; },
      renderLinkedStyle: () => void calls.push("render"),
      linkedPage: () => linkedPage,
      unlink: () => { calls.push("unlink"); linkedPage = undefined; },
      openDefaultLinkedStyle: async (page) => { calls.push(`default ${page}`); linkedPage = page; return true; },
      openComponentLinkedStyle: async (page) => { calls.push(`component ${page}`); linkedPage = page; return true; },
    },
    savePublish: {
      proof: () => ({ stamp: session.begin(), snapshot: SNAPSHOT }),
      published: () => {}, discardAll: async () => {}, headFor: () => "head1234567", checkHead: async () => {},
      isDeleted: () => false, settleDeleted: () => {},
    },
    versions: { history: { refresh: () => {}, open: async () => {} } },
    previewSelection: { replayPending: (path) => void calls.push(`replay ${path}`) },
    nativeBaseSources: new Map<string, string>(),
    nativeVariantFiles: { site: () => undefined, read: () => undefined },
    info: { user: { login: "lex", avatar_url: "" } },
    content,
    explorerDropdown: { close: () => void calls.push("close explorer") },
    nativeSite: { routes: { "/": "index.html" }, components: {} },
    nativePreview: { hideEditBar: () => void calls.push("hide bar") },
    componentTools: undefined,
    pageStructure: undefined,
    fileGeneration: () => fileGeneration,
    nextFileGeneration: () => ++fileGeneration,
    setActiveFileContext: () => {},
    openCodeEditor: async (file) => { opened.push(file); mounted.add(file.path); },
    element: () => new FakeElement(),
    status: (message) => void calls.push(`status ${message}`),
    settleStatus: (message) => void calls.push(`settle ${message}`),
    errorMessage: (error, retry) => void calls.push(`error ${(error as Error).message}${retry ? " (retry)" : ""}`),
    readFile: (_repo, sha) => options.read?.(sha) ?? Promise.resolve(`text of ${sha}`),
    entryAt: () => undefined,
    draftScope: () => SCOPE,
    draftStore: () => ({ get: (_scope, path) => options.drafts?.[path] }),
    openAfter: async (path) => void calls.push(`open after ${path}`),
    setCurrentPage: (path) => { appStore.openFile.value = path; calls.push(`page ${path}`); },
    showDeletedFile: (path) => void calls.push(`deleted ${path}`),
    isNativeTextFile: () => true,
    nativeModeActive: () => true,
    nativeRouteForPath: () => undefined,
    nativeComponentTagForPath: (path) => path === options.component ? "site-card" : undefined,
    nativeFallbackPage: () => undefined,
    nativeCssWorkspace: () => undefined,
    updateNativePreviewSources: () => void calls.push("preview"),
    discardedNewPages: () => {},
    restoreFile: async () => {},
    showDirectory: () => {},
    refreshFiles: () => {},
    updateAgentContext: () => {},
    updateCurrentPageLabel: () => {},
    discardFileChange: async () => {},
  } satisfies SourcePanePorts;
  return { ports, pane: createSourcePaneController(ports), content, calls, opened, session, generation: () => fileGeneration, setLinked: (page: string) => { linkedPage = page; } };
}

test("opening a page reads it, mounts its source and opens its stylesheet beside it", async () => {
  const h = harness();
  await h.pane.openEntry(entry("index.html"), "index.html", h.session.begin());
  assert.deepEqual(h.opened.map(({ key, path, source, baseSha, readOnly }) => ({ key, path, source, baseSha, readOnly })),
    [{ key: draftKey(SCOPE, "index.html"), path: "index.html", source: "text of index.html-sha", baseSha: "index.html-sha", readOnly: false }]);
  assert.deepEqual(h.calls, [
    "close explorer", "page index.html", "status Reading index.html…", "hide bar", "replay index.html", "unlink",
    "hold index.html", "default index.html", "release index.html", "settle Viewing index.html at head123.",
  ]);
  // The open file is remembered for the next visit.
  assert.equal(new URL(shown.href).hash, "#repo=501&branch=main&file=index.html");
});

test("a component template opens its own stylesheet; another page's stylesheet does not carry over", async () => {
  const h = harness({ component: "components/site-card.html" });
  h.setLinked("index.html");
  await h.pane.openEntry(entry("components/site-card.html"), "components/site-card.html", h.session.begin(), { quietStatus: true });
  assert.deepEqual(h.calls.filter((call) => /^(unlink|component|default)/.test(call)), ["unlink", "component components/site-card.html"]);
});

test("a file opened while another was reading has the last word", async () => {
  let release!: (text: string) => void;
  const h = harness({ read: () => new Promise<string>((resolve) => { release = resolve; }) });
  const first = h.pane.openEntry(entry("index.html"), "index.html", h.session.begin());
  await flush();
  h.ports.nextFileGeneration();
  release("late");
  await first;
  assert.deepEqual(h.opened, []);
});

test("a file deleted in the drafts shows its note; one moved opens where it is now", async () => {
  const h = harness({ drafts: { "old.html": { path: "old.html", deleted: true } as SavedDraft, "moved.html": { path: "moved.html", deleted: true, movedTo: "new.html" } as SavedDraft } });
  await h.pane.openEntry(entry("old.html"), "old.html", h.session.begin());
  assert.equal(h.generation(), 1);
  await h.pane.openEntry(entry("moved.html"), "moved.html", h.session.begin(), { keepExplorer: true });
  assert.deepEqual(h.calls, ["close explorer", "page old.html", "deleted old.html", "open after new.html"]);
  assert.deepEqual(h.opened, []);
});

test("a submodule and a file over 1 MB are described, not read", async () => {
  const h = harness();
  await h.pane.openEntry(entry("vendor", { type: "commit", sha: "abcdef1234567890" }), "vendor", h.session.begin());
  assert.equal(h.content.children[0].textContent, "Git submodule at abcdef123456. Submodule contents are not loaded by this editor.");
  await h.pane.openEntry(entry("big.css", { size: 2 * 1024 * 1024 }), "big.css", h.session.begin());
  assert.equal(h.content.children[0].textContent, "This file is larger than the 1 MB the editor opens as text.");
  assert.deepEqual(h.calls.filter((call) => call.startsWith("status")), ["status Submodule selected.", "status Large file selected."]);
});

test("a failed read shows its message and offers the caller's retry", async () => {
  const h = harness({ read: () => Promise.reject(new Error("GitHub said no")) });
  await h.pane.openEntry(entry("index.html"), "index.html", h.session.begin(), { retry: () => {} });
  assert.equal(h.content.children[0].textContent, "GitHub said no");
  assert.equal(h.calls.at(-1), "error GitHub said no (retry)");
});

test("an open from a load that moved on does nothing", async () => {
  const h = harness();
  const at = h.session.begin();
  h.session.next();
  await h.pane.openEntry(entry("index.html"), "index.html", at);
  assert.deepEqual(h.calls, []);
  assert.equal(h.generation(), 0);
});
