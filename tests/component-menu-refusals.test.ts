// The two menus of createComponentTools (components.ts) when their element or template moved on
// after the menu was painted: the item says why by the button the menu opened from, and in the
// status line; no toast. In a browser page, as component-typing-hold.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createComponentTools } from "../src/page-builder/components.ts";
import type { createGuardedEdits } from "../src/guarded-edit.ts";
import type { createMemoryWorkspace } from "./fakes/memory-workspace.ts";

type SourceEditor = typeof import("../src/components/source-editor.ts");

declare global {
  var menuRefusalTools: typeof createComponentTools;
  var menuRefusalEdits: typeof createGuardedEdits;
  var menuRefusalWorkspace: typeof createMemoryWorkspace;
}

test("Make component and the slot menu, pressed after their bytes changed, refuse by the button they were opened from", async () => {
  const bundle = await build({
    stdin: { contents: `
      import { createComponentTools } from './src/page-builder/components';
      import { createGuardedEdits } from './src/guarded-edit';
      import { createMemoryWorkspace } from './tests/fakes/memory-workspace';
      globalThis.menuRefusalTools = createComponentTools;
      globalThis.menuRefusalEdits = createGuardedEdits;
      globalThis.menuRefusalWorkspace = createMemoryWorkspace;
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const path = "index.html", template = "components/site-card/site-card.html";
      const source = "<!doctype html><html><body><main><section><h2>Hello</h2><p>World</p></section><site-card>One</site-card></main></body></html>";
      const templateSource = "<article><p>Title</p></article>";
      const site = { routes: { "/": path }, components: { "site-card": template } };
      let tools!: ReturnType<typeof createComponentTools>;
      const m = menuRefusalWorkspace({ branch: { [path]: source, [template]: templateSource }, open: path, site, editModeEntry: () => tools?.mode.entry() });
      const edits = menuRefusalEdits(m.workspace);
      const editor = { isMounted: () => true, getMountedSource: (file: string) => m.source(file), captureHistoryHost: () => ({ isCurrent: () => true }),
        prepareHistorySources: () => ({ isCurrent: () => true, dispose() {} }), closeActiveEditGroup() {}, editGroupCloser: () => () => {} } satisfies Partial<SourceEditor>;
      const status = document.createElement("span"), panelHost = document.createElement("div"), codeTitle = document.createElement("div");
      status.id = "status";
      // The note's own stylesheet is not loaded here: only what places it.
      const style = document.createElement("style");
      style.textContent = ".refusal-note { position: fixed; }";
      document.head.append(style);
      // The buttons the menus were opened from: one low on the page, so a note below it fits.
      const makeOpener = document.createElement("button"), slotOpener = document.createElement("button");
      for (const [opener, top] of [[makeOpener, 40], [slotOpener, 200]] as const) {
        opener.textContent = "⋯"; Object.assign(opener.style, { position: "fixed", left: "20px", top: `${top}px`, width: "32px", height: "32px" });
      }
      document.body.append(status, panelHost, codeTitle, makeOpener, slotOpener);
      const said: string[] = [];
      let reopened: (() => void) | undefined;
      let current = path;
      tools = menuRefusalTools({ site: () => site, edits,
        sources: () => Object.fromEntries(m.files().map(file => [file, m.source(file)!])),
        editor: () => editor as SourceEditor, // The one cast: the menus reach only the ports above.
        currentPath: () => current, selection: () => undefined, previewPage: () => path,
        preview: () => ({ selectAfterUpdate() {}, selectNode() {}, editComponent() {} }),
        openFile: async (file) => { reopened?.(); current = file; await m.workspace.open(file); return true; },
        announce: text => { said.push(text); }, error(error) { throw error; }, images: () => [], prefix: () => "",
        chooseImage: async () => undefined, links: () => [], pageLabel: file => file, panelHost, codeTitle, canvasComponent() {}, refreshBar() {},
        variantFiles: { site: () => undefined, read: () => undefined },
      });
      const notes = () => [...document.querySelectorAll<HTMLElement>(".refusal-note")];
      const below = (note: HTMLElement, opener: HTMLElement) => {
        const a = note.getBoundingClientRect(), b = opener.getBoundingClientRect();
        return a.top >= b.bottom && a.top - b.bottom < 40 && Math.abs(a.left - b.left) < 40;
      };
      const out: Record<string, unknown> = {};

      // Make component, from a row of another file: the page changed while that file opened.
      current = template;
      const make = tools.menuItems({ path, node: [0, 0], tag: "section", paintedSource: source });
      out.makeLabels = make.map(item => item.label);
      reopened = () => { reopened = undefined; m.typeInto(path, source.replace("Hello", "Hello again")); };
      said.length = 0;
      make[0].run(makeOpener);
      await new Promise(done => setTimeout(done, 50));
      out.makeSaid = [...said];
      out.makeStatus = status.textContent;
      out.makeNote = notes().map(note => note.textContent);
      out.makeBelowOpener = notes().length === 1 && below(notes()[0], makeOpener);
      out.makeNoToast = document.querySelector(".editor-toast") === null;

      // The slot menu, in Edit component mode: the template changed after the menu was painted.
      m.typeInto(path, source);
      current = path;
      m.writeDraft(path, source);
      await m.workspace.open(template);
      current = template;
      const entered = await tools.mode.enter({ tag: "site-card", template, instance: { path, node: [0, 1] }, ready: Promise.resolve() });
      out.entered = entered.status;
      const slot = tools.slotMenu({ path: template, node: [0, 0], tag: "p", paintedSource: m.source(template) });
      out.slotLabels = slot.map(item => item.label);
      m.typeInto(template, "<article><p>Changed</p></article>");
      said.length = 0;
      slot[0].run(slotOpener);
      out.slotSaid = [...said];
      out.slotNote = notes().map(note => note.textContent);
      out.slotBelowOpener = notes().length === 1 && below(notes()[0], slotOpener);
      return out;
    });
    assert.deepEqual(result, {
      makeLabels: ["Make component"],
      makeSaid: ["The page changed meanwhile; select the element again."],
      makeStatus: "The page changed meanwhile; select the element again.",
      makeNote: ["The page changed meanwhile; select the element again."],
      makeBelowOpener: true, makeNoToast: true,
      entered: "mode",
      slotLabels: ["Make slot"],
      slotSaid: ["The template changed meanwhile; select the part again."],
      slotNote: ["The template changed meanwhile; select the part again."],
      slotBelowOpener: true,
    });
  } finally {
    await browser.close();
  }
});
