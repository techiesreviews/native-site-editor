import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommandPaletteController, type CommandPalettePorts } from "../src/controllers/command-palette-controller.ts";
import { createGuardedEdits } from "../src/guarded-edit";
import { createMemoryWorkspace } from "./fakes/memory-workspace";
import { editorPaletteCommands, nativePaletteCommands } from "../src/page-builder/palette";
import { registerCommand, registerCommandSource } from "../src/page-builder/commands";
import { createAppStore } from "../src/app-store.ts";
import { createDraftStore } from "../src/draft-store.ts";
import type { EditBarModel } from "../src/components/edit-bar.ts";
import type { EditorPaletteDeps, mountEditorPalette } from "../src/page-builder/palette.ts";
function fixture() {
  const appStore = createAppStore(createDraftStore());
  let site: ReturnType<CommandPalettePorts["site"]> = { routes: { "/": "index.html", "/notes/": "notes/index.html", "/about/": "about/index.html" }, components: { "feature-section": "components/feature.html" } };
  const workspace = createMemoryWorkspace();
  const edits = createGuardedEdits(workspace.workspace);
  const announced: string[] = [];
  let indexed = false, indexCalls = 0, disposed = 0, opened = 0, inserted = 0, began = 0, started = 0;
  const sources = { "index.html": "<main><h1>Welcome home</h1></main>", "notes/index.html": "<main><h1>Notes heading</h1></main>", "about/index.html": "<main><h1>About the studio</h1></main>", "components/feature.html": "<section><h2>Feature</h2></section>" };
  let model: EditBarModel | undefined;
  const deps: EditorPaletteDeps[] = [];
  const controller = createCommandPaletteController({
    appStore, host: () => ({} as HTMLElement), site: () => site,
    routeTitle: route => route === "/notes/" ? "Field notes" : undefined,
    files: () => Object.keys(sources), sources: () => sources,
    effectiveSource: path => sources[path as keyof typeof sources], indexed: () => indexed,
    index: async () => { indexCalls++; }, stamp: () => edits.stamp("repository"), isMounted: path => path === "index.html",
    beginNewPage: () => { began++; }, startNewPage: () => { started++; },
    actions: { open: () => { opened++; }, isSectionTag: () => false, insert: async () => { inserted++; },
      editBar: () => model, select: () => {}, textSelected: () => false, history: () => {},
      toggleCode: () => {}, codeHidden: () => false, toggleStructure: () => {}, structureHidden: () => false,
      newFile: () => {}, showPagesAndFiles: () => {}, announce: message => { announced.push(message); }, onError: error => { throw error; },
    },
    mountPalette: ((_host: HTMLElement, value: EditorPaletteDeps) => { deps.push(value); return { dispose: () => { disposed++; } }; }) as typeof mountEditorPalette,
  } satisfies CommandPalettePorts);
  return { captureModel: () => { model = { kind: "Heading", controls: [], origin: { path: "index.html", source: sources["index.html"], stamp: edits.stamp("repository"), revision: "target", node: [0] } }; return model; }, controller, appStore, deps, sources, counters: () => ({ indexCalls, disposed, opened, inserted, began, started }), announced, indexed: () => { indexed = true; }, noSite: () => { site = undefined; }, navigate: () => { workspace.setScope("workspace-2"); }, bump: () => workspace.bumpGeneration() };
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
  assert.equal(old.stamp?.().holds(), true);
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


test("palette and captured edit-bar controls hold the host workspace stamp", () => {
  const f = fixture();
  f.appStore.openFile.value = "index.html";
  f.appStore.selection.value = { path: "index.html", tag: "h1", node: [0] } as typeof f.appStore.selection.value;
  const model = f.captureModel();
  f.controller.mount();
  const deps = f.deps[0];
  assert.equal(deps.editBar(), model);
  assert.equal(deps.currentPath(), model.origin?.path);
  assert.equal(deps.source("index.html"), model.origin?.source);
  assert.deepEqual(deps.selection()?.node, model.origin?.node);
  // The palette checks the captured stamp before invoking a control.
  assert.equal(model.origin?.stamp.holds(), true);
  f.controller.mount();
  assert.equal(deps.editBar(), undefined);
  assert.equal(deps.selection(), undefined);
  f.navigate();
  assert.equal(model.origin?.stamp.holds(), false);
  f.controller.dispose(); f.appStore.dispose();
});


test("palette actions after a switch do nothing and say why", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const switchWorkspace of ["navigate", "bump"] as const) {
    const f = fixture();
    f.appStore.openFile.value = "index.html";
    f.controller.mount();
    const deps = f.deps[0];
    deps.nativeElements = () => [{ kind: "native", tag: "native:heading", label: "Heading" }];
    deps.nativeInsertPoint = () => ({ parent: [0], index: 1 });
    const remove = [
      registerCommandSource(() => nativePaletteCommands(deps)),
      registerCommand({ id: "test.open", title: "Open", group: "Pages", run: () => deps.open("index.html") }),
      registerCommand({ id: "test.new-page", title: "New page", group: "Actions", run: deps.newPage }),
    ];
    try {
      const listed = editorPaletteCommands(deps);
      assert.equal(listed.length, 3);
      f[switchWorkspace]();
      for (const command of listed) await command.run();
      t.mock.timers.tick(0);
      await Promise.resolve();
      assert.equal(f.counters().inserted, 0);
      assert.equal(f.counters().opened, 0);
      assert.equal(f.counters().began, 0);
      assert.equal(f.counters().started, 0);
      assert.deepEqual(f.announced, Array(3).fill("The repository changed. Reopen the command palette and try again."));
    } finally {
      remove.forEach(dispose => dispose());
      f.controller.dispose(); f.appStore.dispose();
    }
  }
});
