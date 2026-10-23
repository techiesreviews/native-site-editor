import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { LinkedStylesPorts } from "../src/controllers/linked-styles-controller.ts";
import { draftKey, type SavedDraft } from "../src/drafts.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import type { Repository, Snapshot, TreeEntry } from "../shared/types.ts";

// Just enough DOM for the secondary pane, its title and its rule chips.
class FakeElement {
  children: FakeElement[] = [];
  classes = new Set<string>();
  classList = { add: (name: string) => this.classes.add(name), remove: (name: string) => this.classes.delete(name) };
  listeners = new Map<string, () => void>();
  dataset: Record<string, string> = {};
  hidden = true;
  className = ""; textContent = ""; title = ""; type = "";
  append(...children: FakeElement[]) { this.children.push(...children); }
  replaceChildren(...children: FakeElement[]) { this.children = children; }
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
  click() { this.listeners.get("click")?.(); }
  // A longhand's own expansion (src/controllers/linked-styles-controller.ts longhandsOf).
  get style() {
    const set: string[] = [];
    return Object.assign(set, { setProperty: (property: string) => void set.push(property) });
  }
}
const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
(globalThis as Record<string, unknown>).document = { createElement: () => new FakeElement() };
after(() => {
  if (saved) Object.defineProperty(globalThis, "document", saved);
  else Reflect.deleteProperty(globalThis, "document");
});

// src/ui/dom.ts draws icons: their stylesheet and SVG imports load as empty modules here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true } : next(url, context),
});
const { createLinkedStylesController } = await import("../src/controllers/linked-styles-controller.ts");

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise<void>((resolve) => setImmediate(resolve)); };
const REPO = { id: 501, name: "site", full_name: "lex/site", private: false, default_branch: "main", owner: { login: "lex", type: "User" } } satisfies Repository;
const SNAPSHOT: Snapshot = { commit: "head", branch: "main", entries: [] };
const SCOPE = { account: "lex", repoId: 501, repo: "lex/site", branch: "main" };
const SOURCES: Record<string, string> = { "index.html": "<main class=\"hero\">Hi</main>", "styles.css": ".hero { color: red; }" };

function harness(options: { entries?: Record<string, TreeEntry>; drafts?: Record<string, SavedDraft> } = {}) {
  const ids = new Map<string, FakeElement>();
  const element = (id: string) => { if (!ids.has(id)) ids.set(id, new FakeElement()); return ids.get(id)!; };
  const mounts: { path: string; key: string; host: unknown }[] = [];
  const disposed: string[] = [];
  const highlights: { path: string; count: number }[] = [];
  const revealed: string[] = [];
  const calls: string[] = [];
  const reads: (() => void)[] = [];
  const entries = options.entries ?? { "styles.css": { path: "styles.css", type: "blob", mode: "100644", sha: "css-sha", size: 20 } };
  const session = createWorkspaceSession();
  const appStore = { openFile: signal<string | undefined>("index.html"), repository: signal<Repository | undefined>(REPO), snapshot: signal<Snapshot | undefined>(SNAPSHOT) };
  const ports = {
    appStore,
    workspaceSession: session,
    editorModule: {
      mountSourceEditor: (host, file) => {
        mounts.push({ path: file.path, key: file.key, host });
        return () => void disposed.push(file.path);
      },
      highlightRanges: (path, ranges) => void highlights.push({ path, count: ranges.length }),
      revealRange: (path, start, end) => void revealed.push(`${path}:${start}-${end}`),
    },
    info: { user: { login: "lex", avatar_url: "" } },
    nativeSite: { routes: { "/": "index.html" }, components: {} },
    primaryHistoryScope: undefined,
    nativeVariantFiles: { site: () => undefined, read: () => undefined },
    // eslint-disable-next-line no-restricted-syntax -- a partial DOM fake: the pane, its title and chips use only these members
    element: (id) => element(id) as unknown as HTMLElement,
    nativeModeActive: () => true,
    nativeSources: () => SOURCES,
    nativePageStyles: () => ["styles.css"],
    nativeEffectiveSource: (path) => SOURCES[path],
    nativeComponentTagForPath: () => undefined,
    nativeCssWorkspace: () => undefined,
    nativeHistorySession: (_scope, path) => `history:${path}`,
    draftScope: () => SCOPE,
    draftStore: () => ({ get: (_scope, path) => options.drafts?.[path] }),
    findEntry: async (path) => entries[path],
    readFile: (_repo, sha) => new Promise<string>((resolve) => reads.push(() => resolve(`/* ${sha} */`))),
    applyWidth: () => void calls.push("width"),
    updateNativePreviewSources: () => void calls.push("preview"),
    refreshFiles: () => void calls.push("files"),
    mounted: (path, pane) => void calls.push(`mounted ${path} ${pane}`),
    errorMessage: (error) => void calls.push(`error ${(error as Error).message}`),
  } satisfies LinkedStylesPorts;
  const settle = async () => { await flush(); for (const read of reads.splice(0)) read(); await flush(); };
  return { ports, linked: createLinkedStylesController(ports), element, mounts, disposed, highlights, revealed, calls, settle, session, appStore };
}

test("openSecondary mounts the stylesheet beside the page and keeps it on a second open", async () => {
  const h = harness();
  const opening = h.linked.openSecondary("styles.css");
  await h.settle();
  assert.equal(await opening, true);
  assert.deepEqual(h.mounts.map(({ path, key }) => ({ path, key })), [{ path: "styles.css", key: draftKey(SCOPE, "styles.css") }]);
  assert.equal(h.mounts[0].host, h.element("content-secondary"));
  assert.equal(h.element("secondary-pane").hidden, false);
  assert.ok(h.element("main").classes.has("has-secondary"));
  assert.deepEqual(h.calls, ["width", "mounted styles.css true"]);
  assert.equal(h.linked.secondaryPath(), "styles.css");

  assert.equal(await h.linked.openSecondary("styles.css"), true);
  assert.equal(h.mounts.length, 1);
});

test("an open the guard no longer wants mounts nothing", async () => {
  const h = harness();
  let wanted = true;
  const opening = h.linked.openSecondary("styles.css", () => wanted);
  wanted = false;
  await h.settle();
  assert.equal(await opening, false);
  assert.deepEqual(h.mounts, []);
  assert.equal(h.linked.secondaryPath(), undefined);
});

test("a stylesheet deleted in the drafts does not open", async () => {
  const h = harness({ drafts: { "styles.css": { path: "styles.css", deleted: true } as SavedDraft } });
  assert.equal(await h.linked.openSecondary("styles.css"), false);
  assert.deepEqual(h.mounts, []);
});

test("a missing stylesheet is reported and leaves the pane closed", async () => {
  const h = harness({ entries: {} });
  assert.equal(await h.linked.openSecondary("missing.css"), false);
  assert.deepEqual(h.calls, ["error Could not open missing.css."]);
  assert.equal(h.element("secondary-pane").hidden, true);
});

test("closeSecondary disposes the pane's editor and hides it", async () => {
  const h = harness();
  const opening = h.linked.openSecondary("styles.css");
  await h.settle();
  await opening;
  h.linked.closeSecondary();
  assert.deepEqual(h.disposed, ["styles.css"]);
  assert.equal(h.element("secondary-pane").hidden, true);
  assert.ok(!h.element("main").classes.has("has-secondary"));
  assert.equal(h.linked.secondaryPath(), undefined);
});

test("the default stylesheet opens beside a page, idle, and unlink closes it", async () => {
  const h = harness();
  const opening = h.linked.openDefaultLinkedStyle("index.html");
  await h.settle();
  assert.equal(await opening, true);
  assert.equal(h.linked.linkedPage(), "index.html");
  assert.equal(h.element("secondary-title").textContent, "styles.css");
  // Idle: no chips and no "No rules match" note until an element is selected.
  assert.deepEqual(h.element("secondary-rules").children, []);
  h.linked.unlink();
  assert.equal(h.linked.linkedPage(), undefined);
  assert.equal(h.element("secondary-pane").hidden, true);
});

test("a preview click links the element's rules as chips and reveals the first one", async () => {
  const h = harness();
  const selection = {
    path: "index.html", tag: "main", text: "Hi", reason: "click", node: [0],
    selectors: [{ path: "styles.css", selector: ".hero", ruleIndex: 0, match: [".hero"], kind: "rule", declarations: [{ property: "color", value: "red" }] }],
  } satisfies NativePreviewSelection;
  const linking = h.linked.linkNativeStyles(selection, true);
  await h.settle();
  await linking;
  assert.equal(h.linked.linkedPage(), "index.html");
  assert.equal(h.linked.secondaryPath(), "styles.css");
  const chips = h.element("secondary-rules").children;
  assert.equal(chips.length, 1);
  assert.equal(chips[0].children[0].textContent, ".hero");
  assert.match(chips[0].title, /^\.hero\nstyles\.css/);
  assert.deepEqual(h.revealed, ["styles.css:0-21"]);
  assert.deepEqual(h.highlights.map(({ path }) => path), ["styles.css", "index.html"]);
});

test("beginReveal supersedes a pending default link; clearStyles opens the default again", async () => {
  const h = harness();
  const opening = h.linked.openDefaultLinkedStyle("index.html");
  const request = h.linked.beginReveal();
  assert.equal(h.linked.styleRequest(), request);
  await h.settle();
  assert.equal(await opening, false);
  assert.deepEqual(h.mounts, []);
  h.linked.clearStyles();
  await h.settle();
  assert.equal(h.mounts.length, 1);
  assert.equal(h.linked.linkedPage(), "index.html");
});
