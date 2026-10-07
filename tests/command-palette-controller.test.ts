import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommandPaletteController, type CommandPalettePorts } from "../src/controllers/command-palette-controller.ts";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import type { EditorPaletteDeps, mountEditorPalette } from "../src/page-builder/palette.ts";
function fixture() {
  const appStore = createAppStore(createDraftStore());
  let site: ReturnType<CommandPalettePorts["site"]> = { routes: { "/": "index.html", "/notes/": "notes/index.html", "/about/": "about/index.html" }, components: { "feature-section": "components/feature.html" } };
  let revision = "workspace-1", indexed = false, indexCalls = 0, disposed = 0, opened = 0, began = 0, started = 0;
  const sources = { "index.html": "<main><h1>Welcome home</h1></main>", "notes/index.html": "<main><h1>Notes heading</h1></main>", "about/index.html": "<main><h1>About the studio</h1></main>", "components/feature.html": "<section><h2>Feature</h2></section>" };
  const deps: EditorPaletteDeps[] = [];
  const controller = createCommandPaletteController({
    appStore, host: () => ({} as HTMLElement), site: () => site,
    routeTitle: route => route === "/notes/" ? "Field notes" : undefined,
    files: () => Object.keys(sources), sources: () => sources,
    effectiveSource: path => sources[path as keyof typeof sources], indexed: () => indexed,
    index: async () => { indexCalls++; }, revision: () => revision, isMounted: path => path === "index.html",
    beginNewPage: () => { began++; }, startNewPage: () => { started++; },
    actions: { open: () => { opened++; }, isSectionTag: () => false, insert: async () => {},
      editBar: () => undefined, select: () => {}, textSelected: () => false, history: () => {},
      toggleCode: () => {}, codeHidden: () => false, toggleStructure: () => {}, structureHidden: () => false,
      newFile: () => {}, showPagesAndFiles: () => {}, announce: () => {}, onError: error => { throw error; },
    },
    mountPalette: ((_host: HTMLElement, value: EditorPaletteDeps) => { deps.push(value); return { dispose: () => { disposed++; } }; }) as typeof mountEditorPalette,
  });
  return { controller, appStore, deps, sources, counters: () => ({ indexCalls, disposed, opened, began, started }), indexed: () => { indexed = true; }, noSite: () => { site = undefined; }, navigate: () => { revision = "workspace-2"; } };
}

test("derives title/heading pages, section components and draft sources without eager indexing", async () => {
  const f = fixture(); f.controller.mount(); const deps = f.deps[0];
  assert.equal(f.counters().indexCalls, 0);
  assert.deepEqual(deps.pages().map(page => page.label), ["Home", "Field notes", "About the studio"]);
  assert.deepEqual(deps.components(), [{ tag: "feature-section", file: "components/feature.html", label: "Feature section", section: true }]);
  assert.equal(deps.source("index.html"), f.sources["index.html"]);
  await deps.ready?.(); assert.equal(f.counters().indexCalls, 1);
  f.indexed(); assert.equal(deps.ready?.(), undefined);
  f.noSite(); assert.deepEqual(deps.pages(), []); assert.deepEqual(deps.components(), []); assert.deepEqual(deps.files(), []);
  f.controller.dispose(); f.appStore.dispose();
});

test("selection and editing follow the current file rather than a cached copy", () => {
  const f = fixture(); f.controller.mount(); const deps = f.deps[0];
  f.appStore.openFile.value = "index.html";
  f.appStore.selection.value = { path: "notes/index.html", tag: "p", node: [0] } as typeof f.appStore.selection.value;
  assert.equal(deps.selection(), undefined); assert.equal(deps.editing(), true);
  f.appStore.openFile.value = "notes/index.html";
  assert.equal(deps.selection()?.tag, "p"); assert.equal(deps.editing(), false);
  f.controller.dispose(); f.appStore.dispose();
});

test("remount disposes keyboard registration and rejects actions and views from old dependencies", () => {
  const f = fixture(); f.controller.mount(); const old = f.deps[0];
  f.controller.mount(); assert.equal(f.counters().disposed, 1);
  old.open("index.html"); assert.equal(f.counters().opened, 0); assert.deepEqual(old.pages(), []); assert.equal(old.currentPath(), undefined);
  f.deps[1].open("index.html"); assert.equal(f.counters().opened, 1);
  assert.notEqual(old.revision?.(), f.deps[1].revision?.());
  f.controller.dispose(); f.controller.dispose(); assert.equal(f.counters().disposed, 2); f.appStore.dispose();
});

test("new page waits for explorer rendering and refuses a changed or disposed workspace", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); f.controller.mount(); const deps = f.deps[0];
  deps.newPage(); assert.equal(f.counters().began, 1); assert.equal(f.counters().started, 0);
  t.mock.timers.tick(0); await Promise.resolve(); assert.equal(f.counters().started, 1);
  deps.newPage(); f.navigate(); t.mock.timers.tick(0); await Promise.resolve(); assert.equal(f.counters().started, 1);
  deps.newPage(); f.controller.dispose(); t.mock.timers.tick(0); await Promise.resolve(); assert.equal(f.counters().started, 1);
  deps.newPage(); assert.equal(f.counters().began, 3); f.appStore.dispose();
});
