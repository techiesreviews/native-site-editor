// Edit component mode held while a part of its template is typed (components.ts): the edit
// sessions open on the mode's template, through createComponentTools in a browser page
// (focus decides "typed"), on the memory workspace with the real guarded edits.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createComponentTools } from "../src/page-builder/components.ts";
import type { createGuardedEdits } from "../src/guarded-edit.ts";
import type { createMemoryWorkspace } from "./fakes/memory-workspace.ts";

type SourceEditor = typeof import("../src/components/source-editor.ts");

declare global {
  var typingHoldTools: typeof createComponentTools;
  var typingHoldEdits: typeof createGuardedEdits;
  var typingHoldWorkspace: typeof createMemoryWorkspace;
}

test("sessions on the mode's template hold it through its instance moving while a field has focus; the last one closing ends it", async () => {
  const bundle = await build({
    stdin: { contents: `
      import { createComponentTools } from './src/page-builder/components';
      import { createGuardedEdits } from './src/guarded-edit';
      import { createMemoryWorkspace } from './tests/fakes/memory-workspace';
      globalThis.typingHoldTools = createComponentTools;
      globalThis.typingHoldEdits = createGuardedEdits;
      globalThis.typingHoldWorkspace = createMemoryWorkspace;
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const path = "index.html", template = "components/site-card/site-card.html";
      const source = "<!doctype html><html><body><main><h1>Hi</h1><site-card>One</site-card></main></body></html>";
      const moved = source.replace("<main>", "<main><p>New</p>");
      const site = { routes: { "/": path }, components: { "site-card": template } };
      let tools!: ReturnType<typeof createComponentTools>;
      const m = typingHoldWorkspace({ branch: { [path]: source, [template]: "<article><p>Title</p></article>" }, open: path, site,
        editModeEntry: () => tools?.mode.entry() });
      const edits = typingHoldEdits(m.workspace);
      // Only the editor ports a session opens and closes through.
      const editor = { isMounted: () => true, getMountedSource: (file: string) => m.source(file), captureHistoryHost: () => ({ isCurrent: () => true }),
        prepareHistorySources: () => ({ isCurrent: () => true, dispose() {} }), closeActiveEditGroup() {}, editGroupCloser: () => () => {} } satisfies Partial<SourceEditor>;
      const frames: unknown[] = [];
      const panelHost = document.createElement("div"), codeTitle = document.createElement("div"), field = document.createElement("textarea");
      document.body.append(panelHost, codeTitle, field);
      tools = typingHoldTools({ site: () => site, edits,
        sources: () => Object.fromEntries(m.files().map(file => [file, m.source(file)!])), // The one cast: the session reaches only the ports above.
        editor: () => editor as SourceEditor,
        currentPath: () => m.openFile(), selection: () => undefined, previewPage: () => path,
        preview: () => ({ selectAfterUpdate() {}, selectNode() {}, editComponent(mode) { frames.push(mode); } }),
        openFile: async (file) => { await m.workspace.open(file); return m.openFile() === file; },
        announce() {}, error(error) { throw error; }, images: () => [], prefix: () => "",
        chooseImage: async () => undefined, links: () => [], pageLabel: file => file, panelHost, codeTitle, canvasComponent() {}, refreshBar() {},
        variantFiles: { site: () => undefined, read: () => undefined },
      });
      const microtask = () => new Promise<void>(done => queueMicrotask(done));
      const on = () => tools.mode.now() !== undefined;
      const enter = async () => {
        m.writeDraft(path, source);
        await m.workspace.open(template);
        const entered = await tools.mode.enter({ tag: "site-card", template, instance: { path, node: [0, 1] }, ready: Promise.resolve() });
        if (entered.status !== "mode") throw new Error(`entered: ${entered.status}`);
      };
      const out: Record<string, boolean> = {};

      // Two sessions on the template, a field focused: the page moves the instance.
      await enter();
      field.focus();
      const first = tools.textRow(template, [0, 0])!.open()!, second = tools.textRow(template, [0, 0])!.open()!;
      m.writeDraft(path, moved);
      tools.mode.sync();
      out.heldByTwo = on();
      first.close();
      await microtask(); await microtask();
      out.heldByOne = on();
      second.close();
      // Off at once; the frame lets go on the sync a microtask later.
      out.offOnLast = !on() && frames.at(-1) !== undefined;
      await microtask(); await microtask();
      out.frameLetGo = frames.at(-1) === undefined;

      // Cancel (Escape) ends it the same way: off at once, the frame let go on the sync after.
      await enter();
      const cancelled = tools.textRow(template, [0, 0])!.open()!;
      m.writeDraft(path, moved);
      out.heldBeforeCancel = on();
      cancelled.cancel();
      await microtask(); await microtask();
      out.cancelEnds = !on() && frames.at(-1) === undefined;

      // A session that went stale (its template changed meanwhile) holds nothing, though not closed.
      await enter();
      const stale = tools.textRow(template, [0, 0])!.open()!;
      m.writeDraft(path, moved);
      out.heldBeforeStale = on();
      m.typeInto(template, "<article><p>Changed</p></article>");
      out.staleHolds = on();
      stale.close();

      // A session on the page, opened before the mode: never its template's, it holds nothing.
      m.typeInto(template, "<article><p>Title</p></article>");
      await m.workspace.open(path);
      const row = tools.textRow(path, [0, 0])!.open()!;
      await enter();
      m.writeDraft(path, moved);
      out.otherHolds = on();
      row.close();
      // Without focus in a field, an open session on the template holds nothing either.
      await enter();
      const unfocused = tools.textRow(template, [0, 0])!.open()!;
      field.blur();
      m.writeDraft(path, moved);
      out.unfocusedHolds = on();
      unfocused.close();
      tools.destroy();
      return out;
    });
    assert.deepEqual(result, { heldByTwo: true, heldByOne: true, offOnLast: true, frameLetGo: true, heldBeforeCancel: true, cancelEnds: true, heldBeforeStale: true, staleHolds: false, otherHolds: false, unfocusedHolds: false });
  } finally { await browser.close(); }
});
