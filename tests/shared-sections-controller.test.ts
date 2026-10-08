import { nativePageStylesheets } from "../shared/native-project";
import { parseCssImports } from "../shared/css-imports";
import { isSectionTemplate } from "../src/native-insert";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSharedSectionsController, type SharedSectionsPorts } from "../src/controllers/shared-sections-controller";

function revisionPorts() {
  let generation = 1, scope = "first";
  // These tests exercise only the revision/path API; other ports must not be read.
  const ports = new Proxy({
    announce: () => {},
    generation: () => generation,
    setupScope: () => scope,
  }, { get(target, key) {
    if (key in target) return target[key as keyof typeof target];
    throw new Error(`Unexpected port: ${String(key)}`);
  } }) as unknown as SharedSectionsPorts;
  return { controller: createSharedSectionsController(ports), set: (next: number, key: string) => { generation = next; scope = key; } };
}

test("shared master revision reads generation and scope live", () => {
  const host = revisionPorts();
  assert.equal(host.controller.masterRevision(), "first:1");
  host.set(2, "second");
  assert.equal(host.controller.masterRevision(), "second:2");
});

test("only section and page-part masters are private master paths", () => {
  const { controller } = revisionPorts();
  assert.equal(controller.isPrivateMasterPath(".editor/sections/hero.html"), true);
  assert.equal(controller.isPrivateMasterPath(".editor/page-parts/header.html"), true);
  assert.equal(controller.isPrivateMasterPath("index.html"), false);
  assert.equal(controller.isPrivateMasterPath(".editor/page-builder.json"), false);
});

import { createNativeSectionMasterController } from "../src/page-builder/native-section-master-controller";
import { createNativePagePartController } from "../src/page-builder/native-page-part-controller";
import { readSectionCatalog, listSectionChoices } from "../src/page-builder/static-sections";
import { readPagePartCatalog } from "../src/page-builder/native-page-parts";
import { EDITOR_PAGE_BUILDER_PATH } from "../src/page-builder/page-builder-document";
import type { NativeStructureItem } from "../src/components/native-preview";

const PAGE = "index.html";
const HTML = '<html><head><link rel="stylesheet" href="site.css"></head><body><section class="hero"><h2>Hero</h2></section></body></html>';
const start = HTML.indexOf("<section"), end = HTML.indexOf("</section>") + 10;
const item = { tag: "section", node: [0], heading: "Hero", text: "Hero" } as NativeStructureItem;
const metadata = { id: "hero", label: "Hero", rootClass: "hero", stylesheetPath: "site.css" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function fixture() {
  const state = {
    generation: 1, scope: "scope", fileGeneration: 1, history: false, indexed: true, selected: 0,
    mounted: true, validProof: true, captures: 0, collapsed: false,
    sources: { [PAGE]: HTML, "site.css": ".hero { color: red; }" } as Record<string, string>,
    files: [PAGE, "site.css"], open: PAGE,
  };
  const messages: string[] = [], errors: unknown[] = [], timers: (() => void)[] = [];
  const operations: Parameters<SharedSectionsPorts["applyNativeOperation"]>[0][] = [];
  let apply = async (operation: typeof operations[number]) => { operations.push(operation); return undefined as string | undefined; };
  let restore = async (path: string, _epoch: number, options: { beforeMount?: () => boolean }) => { if (!options.beforeMount || options.beforeMount()) { state.open = path; state.fileGeneration++; } };
  const store = { openFile: { get value() { return state.open; } }, selection: { value: { path: PAGE, node: [0], tag: "section" } } };
  let master!: ReturnType<typeof createNativeSectionMasterController>, part!: ReturnType<typeof createNativePagePartController>;
  const ports = {
    generation: () => state.generation, setupScope: () => state.scope, fileGeneration: () => state.fileGeneration,
    draftScope: () => ({ account: "a", repoId: 1, repo: "a/b", branch: "dev" }),
    versionView: () => state.history, site: () => ({ routes: { "/": PAGE }, components: {} }), textIndexed: () => state.indexed,
    store, editor: () => ({ isMounted: () => state.mounted, captureFileModelState: () => { state.captures++; return { isCurrent: () => state.validProof }; } }),
    preview: () => undefined, codePanes: () => ({ heightResize: () => undefined }),
    masterController: () => master, pagePartController: () => part,
    nativeFiles: () => [...state.files], nativeSources: () => Object.fromEntries(Object.entries(state.sources).filter(([path]) => !path.startsWith("."))),
    nativeEffectiveSource: (path: string) => state.sources[path],
    nativeSharedCatalogs: (text: string | undefined) => { try { return { sections: readSectionCatalog(text), parts: readPagePartCatalog(text) }; } catch { return undefined; } },
    readSectionCatalog, listSectionChoices, parseCssImports, nativePageStylesheets, isSectionTemplate,
    nativeCanonicalCopy: () => ({ node: [0], range: { start, end } }),
    locateNativeElementRange: () => ({ start, end, tag: { start, end: HTML.indexOf(">", start) + 1, name: "section" } }),
    locateNativeElement: () => ({ start, end: HTML.indexOf(">", start) + 1, name: "section" }),
    startTagAttribute: () => ({ value: "hero" }), nativeClassCount: () => 1,
    paintedSource: () => HTML, selectionEpoch: () => state.selected,
    applyNativeOperation: (operation: typeof operations[number]) => apply(operation),
    restoreFile: (path: string, epoch: number, options: { beforeMount?: () => boolean }) => restore(path, epoch, options),
    ensureNativeTextIndex: async () => undefined, wantNativeTextIndex: () => {},
    announce: (message: string) => messages.push(message), errorMessage: (error: unknown) => errors.push(error),
    status: (message: string) => messages.push(message), codeCollapsed: () => state.collapsed,
    renderNativeEditBar: () => {}, renderMasterBanner: () => {}, updateNativePreviewSources: () => messages.push("preview"),
    renderNativeShownStructure: () => messages.push("structure"), nativeStructureEdit: async () => {},
    isNativeSectionTag: (tag: string) => tag === "section", setTimer: (callback: () => void) => timers.push(callback),
  } as unknown as SharedSectionsPorts;
  const controller = createSharedSectionsController(ports);
  master = createNativeSectionMasterController(controller.masterHost);
  part = createNativePagePartController(controller.masterHost);
  return { state, controller, ports, operations, messages, errors, timers,
    apply: (next: typeof apply) => { apply = next; }, restore: (next: typeof restore) => { restore = next; } };
}
function available(host: ReturnType<typeof fixture>) {
  const root = host.controller.sharedRoot(PAGE, item);
  assert.ok(root && root.state === "available");
  return root;
}

test("shared authoring commits master and JSON in one guarded operation, refresh deferred", async () => {
  const host = fixture(), root = available(host);
  assert.deepEqual(await root.actions.submit(metadata, root.context.key), { success: true });
  assert.equal(host.operations.length, 1);
  assert.deepEqual(host.operations[0].creates?.map(file => file.path), [EDITOR_PAGE_BUILDER_PATH, ".editor/sections/hero.html"]);
  assert.equal(host.operations[0].current?.(), true);
  assert.deepEqual(host.messages, []);
  assert.equal(host.timers.length, 1);
  host.timers[0]();
  assert.deepEqual(host.messages, ["preview", "structure"]);
});

for (const [name, change] of Object.entries({
  generation: (h: ReturnType<typeof fixture>) => { h.state.generation++; },
  scope: (h: ReturnType<typeof fixture>) => { h.state.scope = "other"; },
  history: (h: ReturnType<typeof fixture>) => { h.state.history = true; },
  model: (h: ReturnType<typeof fixture>) => { h.state.validProof = false; },
  page: (h: ReturnType<typeof fixture>) => { h.state.sources[PAGE] += " "; },
  stylesheet: (h: ReturnType<typeof fixture>) => { h.state.sources["site.css"] += " "; },
  files: (h: ReturnType<typeof fixture>) => { h.state.files.push("other.html"); },
  open: (h: ReturnType<typeof fixture>) => { h.state.open = "other.html"; },
  selection: (h: ReturnType<typeof fixture>) => { h.state.selected++; },
  cancel: (h: ReturnType<typeof fixture>) => { available(h).actions.close(available(h).context.key, "cancel"); },
})) {
  test(`shared pending transaction refuses changed ${name} without replacing its proof`, async () => {
    const host = fixture(), root = available(host), pending = deferred<string | undefined>();
    let operation!: Parameters<SharedSectionsPorts["applyNativeOperation"]>[0];
    host.apply(async value => { operation = value; return pending.promise; });
    const saving = root.actions.submit(metadata, root.context.key);
    assert.equal(operation.current?.(), true);
    change(host);
    const captures = host.state.captures;
    assert.equal(operation.current?.(), false);
    if (name === "model") assert.equal(host.state.captures, captures);
    pending.resolve("stale");
    assert.deepEqual(await saving, { error: "stale" });
    assert.equal(host.timers.length, 0);
  });
}

test("shared forms reject duplicate saves and unoffered record ids; retry after failure", async () => {
  const host = fixture(), root = available(host), pending = deferred<string | undefined>();
  host.apply(async () => pending.promise);
  const saving = root.actions.submit(metadata, root.context.key);
  assert.deepEqual(await root.actions.submit(metadata, root.context.key), { error: "This is already being saved." });
  pending.resolve("failed");
  assert.deepEqual(await saving, { error: "failed" });
  assert.ok(root.actions.link);
  assert.deepEqual(await root.actions.link("unoffered", root.context.key), { error: "Choose a shared item offered for this selection." });
  host.apply(async () => undefined);
  assert.deepEqual(await root.actions.submit(metadata, root.context.key), { success: true });
});

test("shared revision invalidates contexts on same-byte model replacement", async () => {
  const host = fixture(), root = available(host), revision = host.controller.nativeSharedFieldsRevision();
  host.state.validProof = false;
  assert.notEqual(host.controller.nativeSharedFieldsRevision(), revision);
  assert.deepEqual(await root.actions.submit(metadata, root.context.key), { error: "The page or its shared files changed. Select the element again." });
});

test("master host open refuses changed revision after await and gates private ownership", async () => {
  const host = fixture(), pending = deferred<void>();
  let beforeMount!: () => boolean;
  host.restore(async (_path, _epoch, options) => { beforeMount = options.beforeMount!; await pending.promise; });
  const open = host.controller.masterHost.open(".editor/sections/hero.html", host.controller.masterRevision());
  assert.equal(beforeMount(), false);
  host.state.generation++;
  pending.resolve();
  assert.equal(await open, false);
});

test("master host apply pins expected file graph and history through transaction", async () => {
  const host = fixture();
  const operation = { expectedSources: new Map([[PAGE, HTML]]), edits: new Map([[PAGE, HTML + " "]]), done: "done", undone: "undo" };
  await host.controller.masterHost.apply(operation, host.state.files, () => true);
  assert.equal(host.operations.length, 1);
  assert.equal(host.operations[0].current?.(), true);
  host.state.files.push("new.html");
  assert.equal(host.operations[0].current?.(), false);
});

test("shared roots unavailable before index, in history, or on unmounted page", () => {
  for (const change of [(h: ReturnType<typeof fixture>) => { h.state.indexed = false; }, (h: ReturnType<typeof fixture>) => { h.state.history = true; }, (h: ReturnType<typeof fixture>) => { h.state.mounted = false; }]) {
    const host = fixture(); change(host);
    assert.equal(host.controller.sharedRoot(PAGE, item), undefined);
  }
});

test("private editable source requires the live open master, public source remains live", () => {
  const host = fixture();
  assert.equal(host.controller.editableSource(".editor/sections/hero.html"), undefined);
  assert.equal(host.controller.editableSource(PAGE), HTML);
  host.state.sources[PAGE] = "changed";
  assert.equal(host.controller.editableSource(PAGE), "changed");
});
