import { after, test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { signal } from "@preact/signals-core";
import type { NativePreviewSelection } from "../src/components/native-preview.ts";
import type { LinkedStylesPorts } from "../src/controllers/linked-styles-controller.ts";
import { draftKey, type SavedDraft } from "../src/drafts.ts";
import { createWorkspaceSession } from "../src/workspace-session.ts";
import { forEachAwait, type AwaitRace } from "./support/await-race.ts";
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

function harness(options: { entries?: Record<string, TreeEntry>; drafts?: Record<string, SavedDraft>; race?: AwaitRace; sources?: Record<string, string>; componentTag?: string;
  primary?: LinkedStylesPorts["primaryHistoryScope"]; afterFind?: () => void } = {}) {
  // The writer's async ports, wrapped for an await race when one is given (its reads then answer at once).
  const port = <Args extends unknown[], Value>(name: string, work: (...args: Args) => Promise<Value>) => options.race ? options.race.port(name, work) : work;
  const sources = { ...SOURCES, ...options.sources };
  const drafts = options.drafts ?? {};
  const ids = new Map<string, FakeElement>();
  const element = (id: string) => { if (!ids.has(id)) ids.set(id, new FakeElement()); return ids.get(id)!; };
  const mounts: { path: string; key: string; host: unknown; source: string; baseSha?: string | null; historyScope?: string }[] = [];
  const disposed: string[] = [];
  const highlights: { path: string; ranges: string[] }[] = [];
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
        mounts.push({ path: file.path, key: file.key, host, source: file.source, baseSha: file.baseSha, historyScope: file.historyScope });
        return () => void disposed.push(file.path);
      },
      highlightRanges: (path, ranges) => void highlights.push({ path, ranges: ranges.map(({ start, end }) => `${start}-${end}`) }),
      revealRange: (path, start, end) => void revealed.push(`${path}:${start}-${end}`),
    },
    info: { user: { login: "lex", avatar_url: "" } },
    nativeSite: { routes: { "/": "index.html" }, components: {} },
    get primaryHistoryScope() { return options.primary; },
    nativeVariantFiles: { site: () => undefined, read: () => undefined },
    // eslint-disable-next-line no-restricted-syntax -- a partial DOM fake: the pane, its title and chips use only these members
    element: (id) => element(id) as unknown as HTMLElement,
    nativeModeActive: () => true,
    nativeSources: () => sources,
    nativePageStyles: () => ["styles.css"],
    nativeEffectiveSource: (path) => sources[path],
    nativeComponentTagForPath: (path) => path === options.componentTag ? "site-card" : undefined,
    nativeCssWorkspace: () => undefined,
    nativeHistorySession: (_scope, path) => `history:${path}`,
    draftScope: () => SCOPE,
    draftStore: () => ({ get: (_scope, path) => drafts[path] }),
    findEntry: port("findEntry", async (path: string) => { calls.push(`find ${path}`); options.afterFind?.(); return entries[path]; }),
    readFile: port("readFile", (_repo: string, sha: string) => { calls.push(`read ${sha}`); return options.race ? Promise.resolve(`/* ${sha} */`) : new Promise<string>((resolve) => reads.push(() => resolve(`/* ${sha} */`))); }),
    applyWidth: () => void calls.push("width"),
    updateNativePreviewSources: () => void calls.push("preview"),
    refreshFiles: () => void calls.push("files"),
    mounted: (path, pane) => void calls.push(`mounted ${path} ${pane}`),
    errorMessage: (error) => void calls.push(`error ${(error as Error).message}`),
  } satisfies LinkedStylesPorts;
  const settle = async () => { await flush(); for (const read of reads.splice(0)) read(); await flush(); };
  return { ports, linked: createLinkedStylesController(ports), element, mounts, disposed, highlights, revealed, calls, settle, session, appStore, sources, drafts };
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
  assert.deepEqual(h.calls, ["find styles.css", "read css-sha", "width", "mounted styles.css true"]);
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
  assert.deepEqual(h.calls, ["find missing.css", "error Could not open missing.css."]);
  assert.equal(h.element("secondary-pane").hidden, true);
});

test("an uploaded stylesheet not on GitHub is looked up, not opened from its empty draft", async () => {
  const upload = { path: "uploaded.css", baseSha: null, content: "", upload: { size: 20, type: "text/css" }, opaque: true } as SavedDraft;
  const h = harness({ entries: {}, drafts: { "uploaded.css": upload } });
  assert.equal(await h.linked.openSecondary("uploaded.css"), false);
  assert.deepEqual(h.calls, ["find uploaded.css", "error Could not open uploaded.css."]);
  assert.deepEqual(h.mounts, []);
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

const CARD = "components/card.html", CARD_CSS = "components/card.css";
const STYLES_ENTRY: TreeEntry = { path: "styles.css", type: "blob", mode: "100644", sha: "css-sha", size: 20 };
const HERO_SELECTION = {
  path: "index.html", tag: "main", text: "Hi", reason: "click", node: [0],
  selectors: [{ path: "styles.css", selector: ".hero", ruleIndex: 0, match: [".hero"], kind: "rule", declarations: [{ property: "color", value: "red" }] }],
} satisfies NativePreviewSelection;

test("a component's stylesheet opens beside it unless the page, the load or its draft moved on at any await", async () => {
  for (const disturbance of ["page", "load", "deleted"] as const) {
    const points = await forEachAwait(
      (race) => {
        const h = harness({ race, componentTag: CARD, entries: { "styles.css": STYLES_ENTRY, [CARD_CSS]: { path: CARD_CSS, type: "blob", mode: "100644", sha: "card-sha", size: 20 } } });
        h.appStore.openFile.value = CARD;
        return { h, linkedPage: undefined as string | undefined, done: h.linked.openComponentLinkedStyle(CARD) };
      },
      (run) => {
        run.linkedPage = run.h.linked.linkedPage();
        if (disturbance === "page") run.h.appStore.openFile.value = "index.html";
        else if (disturbance === "load") run.h.session.next();
        else run.h.drafts[CARD_CSS] = { path: CARD_CSS, deleted: true } as SavedDraft;
      },
      (run) => {
        assert.deepEqual(run.h.mounts.filter(({ path }) => path === CARD_CSS), [], disturbance);
        // A deleted component stylesheet falls back to the page's shared one; anything else changes nothing.
        if (disturbance === "deleted") return;
        assert.deepEqual(run.h.mounts, [], disturbance);
        assert.equal(run.h.linked.linkedPage(), run.linkedPage, disturbance);
      },
    );
    assert.equal(points, 3);
  }
});

test("a component without its own stylesheet opens the shared one beside it", async () => {
  const h = harness({ componentTag: CARD });
  h.appStore.openFile.value = CARD;
  const opening = h.linked.openComponentLinkedStyle(CARD);
  await h.settle();
  assert.equal(await opening, true);
  assert.deepEqual(h.mounts.map(({ path }) => path), ["styles.css"]);
  assert.equal(h.linked.linkedPage(), CARD);
  assert.equal(h.linked.secondaryPath(), "styles.css");
});

test("a component stylesheet only in the drafts opens from its draft without reading GitHub", async () => {
  const h = harness({ componentTag: CARD, drafts: { [CARD_CSS]: { path: CARD_CSS, baseSha: null } as SavedDraft } });
  h.appStore.openFile.value = CARD;
  const opening = h.linked.openComponentLinkedStyle(CARD);
  await h.settle();
  assert.equal(await opening, true);
  assert.deepEqual(h.mounts.map(({ path, source, baseSha }) => ({ path, source, baseSha })), [{ path: CARD_CSS, source: "", baseSha: null }]);
  assert.deepEqual(h.calls.filter((call) => /^(find|read) /.test(call)), []);
});

test("an uploaded component stylesheet not on GitHub opens the shared one instead", async () => {
  const upload = { path: CARD_CSS, baseSha: null, upload: { size: 20, type: "text/css" }, opaque: true } as SavedDraft;
  const h = harness({ componentTag: CARD, drafts: { [CARD_CSS]: upload } });
  h.appStore.openFile.value = CARD;
  const opening = h.linked.openComponentLinkedStyle(CARD);
  await h.settle();
  assert.equal(await opening, true);
  assert.deepEqual(h.mounts.map(({ path }) => path), ["styles.css"]);
  assert.ok(h.calls.includes(`find ${CARD_CSS}`));
});

test("an edit to the stylesheet re-maps the linked rules to their new place", async () => {
  const h = harness();
  const linking = h.linked.linkNativeStyles(HERO_SELECTION, true);
  await h.settle();
  await linking;
  assert.deepEqual(h.revealed, ["styles.css:0-21"]);
  const text = "/* new */\n.hero { color: red; }";
  h.sources["styles.css"] = text;
  h.highlights.length = 0;
  h.linked.syncLinkedStyles("styles.css", text);
  assert.deepEqual(h.highlights.find(({ path }) => path === "styles.css")?.ranges, ["10-31"]);
  h.element("secondary-rules").children[0].click();
  await flush();
  assert.equal(h.revealed.at(-1), "styles.css:10-31");
});

test("new <body> rules that put another stylesheet first switch the default pane to it", async () => {
  const h = harness({
    sources: { "theme.css": "body { color: blue; }" },
    entries: { "styles.css": STYLES_ENTRY, "theme.css": { path: "theme.css", type: "blob", mode: "100644", sha: "theme-sha", size: 20 } },
  });
  const opening = h.linked.openDefaultLinkedStyle("index.html");
  await h.settle();
  assert.equal(await opening, true);
  assert.equal(h.linked.secondaryPath(), "styles.css");
  h.linked.updateBodyStyles({ rules: [{ path: "theme.css", selector: "body", ruleIndex: 0, match: ["body"], kind: "rule", declarations: [{ property: "color", value: "blue" }] }] });
  await h.settle();
  assert.equal(h.linked.secondaryPath(), "theme.css");
  assert.deepEqual(h.mounts.map(({ path }) => path), ["styles.css", "theme.css"]);
  assert.deepEqual(h.disposed, ["styles.css"]);
  assert.equal(h.element("secondary-title").textContent, "theme.css");
  assert.equal(h.linked.linkedPage(), "index.html");
});

const THEME_ENTRY: TreeEntry = { path: "theme.css", type: "blob", mode: "100644", sha: "theme-sha", size: 20 };
const CARD_ENTRY: TreeEntry = { path: CARD_CSS, type: "blob", mode: "100644", sha: "card-sha", size: 20 };

test("a selection in the code updates the chips without moving the open stylesheet", async () => {
  const h = harness({ sources: { "theme.css": ".hero { color: blue; }" }, entries: { "styles.css": STYLES_ENTRY, "theme.css": THEME_ENTRY } });
  const opening = h.linked.openDefaultLinkedStyle("index.html");
  await h.settle();
  assert.equal(await opening, true);
  const selection = {
    ...HERO_SELECTION,
    selectors: [{ path: "theme.css", selector: ".hero", ruleIndex: 0, match: [".hero"], kind: "rule", declarations: [{ property: "color", value: "blue" }] }],
  } satisfies NativePreviewSelection;
  await h.linked.linkNativeStyles(selection, false);
  await h.settle();
  assert.equal(h.linked.secondaryPath(), "styles.css");
  assert.deepEqual(h.mounts.map(({ path }) => path), ["styles.css"]);
  assert.deepEqual(h.revealed, []);
  const chips = h.element("secondary-rules").children;
  assert.equal(chips.length, 1);
  // The rule's own file is named, since it is not the pane's.
  assert.deepEqual(chips[0].children.map(({ textContent }) => textContent), [".hero", "theme.css"]);
});

test("an element of a template with no rules of its own keeps the template's stylesheet, not the <body> rules' one", async () => {
  const h = harness({
    componentTag: CARD,
    sources: { "theme.css": "body { color: blue; }", [CARD_CSS]: "site-card { display: block; }" },
    entries: { "styles.css": STYLES_ENTRY, "theme.css": THEME_ENTRY, [CARD_CSS]: CARD_ENTRY },
  });
  h.appStore.openFile.value = CARD;
  h.linked.updateBodyStyles({ rules: [{ path: "theme.css", selector: "body", ruleIndex: 0, match: ["body"], kind: "rule", declarations: [{ property: "color", value: "blue" }] }] });
  const linking = h.linked.linkNativeStyles({ path: CARD, tag: "div", text: "", reason: "click", node: [0], selectors: [] }, true);
  await h.settle();
  await linking;
  assert.deepEqual(h.mounts.map(({ path }) => path), [CARD_CSS]);
  assert.equal(h.linked.secondaryPath(), CARD_CSS);
  assert.equal(h.linked.linkedPage(), CARD);
});

test("a preview click's rules open beside the page unless the page, the load or a newer click moved on at any await", async () => {
  for (const disturbance of ["page", "load", "click"] as const) {
    const points = await forEachAwait(
      (race) => {
        const h = harness({ race });
        return { h, linkedPage: undefined as string | undefined, done: h.linked.linkNativeStyles(HERO_SELECTION, true) };
      },
      (run) => {
        run.linkedPage = run.h.linked.linkedPage();
        if (disturbance === "page") run.h.appStore.openFile.value = "about.html";
        else if (disturbance === "load") run.h.session.next();
        else run.h.linked.beginReveal();
      },
      (run) => {
        assert.deepEqual(run.h.mounts, [], disturbance);
        assert.deepEqual(run.h.revealed, [], disturbance);
        assert.equal(run.h.linked.linkedPage(), run.linkedPage, disturbance);
      },
    );
    assert.equal(points, 2);
  }
});

test("the stylesheet beside a page shares the page's live history journal", async () => {
  const proof = { current: true, isCurrent() { return this.current; } };
  const h = harness({ primary: { key: draftKey(SCOPE, "index.html"), session: "s1", proof } });
  const opening = h.linked.openSecondary("styles.css");
  await h.settle();
  assert.equal(await opening, true);
  assert.deepEqual(h.mounts.map(({ path, historyScope }) => ({ path, historyScope })), [{ path: "styles.css", historyScope: "s1" }]);
});

test("a page journal that stops being current while the stylesheet is found mounts nothing", async () => {
  const proof = { current: true, isCurrent() { return this.current; } };
  const h = harness({ primary: { key: draftKey(SCOPE, "index.html"), session: "s1", proof }, afterFind: () => { proof.current = false; } });
  const opening = h.linked.openSecondary("styles.css");
  await h.settle();
  assert.equal(await opening, false);
  assert.deepEqual(h.mounts, []);
  assert.equal(h.linked.secondaryPath(), undefined);
});

test("new <body> rules that still put the same stylesheet first redraw its chips in place", async () => {
  const h = harness({ sources: { "styles.css": "body { color: red; }" } });
  const opening = h.linked.openDefaultLinkedStyle("index.html");
  await h.settle();
  assert.equal(await opening, true);
  assert.deepEqual(h.element("secondary-rules").children, []);
  h.linked.updateBodyStyles({ rules: [{ path: "styles.css", selector: "body", ruleIndex: 0, match: ["body"], kind: "rule", declarations: [{ property: "color", value: "red" }] }] });
  await h.settle();
  assert.deepEqual(h.mounts.map(({ path }) => path), ["styles.css"]);
  assert.deepEqual(h.disposed, []);
  assert.deepEqual(h.element("secondary-rules").children.map((chip) => chip.children[0].textContent), ["body"]);
});
