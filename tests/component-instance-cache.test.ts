// The instances createComponentTools keeps (components.ts `instanceAt`, ticket 38): a read is
// kept while the site, the page and the template are the bytes it was read from, and each of
// those changing reads the instance again. In a browser page (the page source is parsed by the DOM).
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createComponentTools } from "../src/page-builder/components.ts";
import type { createGuardedEdits } from "../src/guarded-edit.ts";
import type { createMemoryWorkspace } from "./fakes/memory-workspace.ts";

type SourceEditor = typeof import("../src/components/source-editor.ts");

declare global {
  var instanceCacheTools: typeof createComponentTools;
  var instanceCacheEdits: typeof createGuardedEdits;
  var instanceCacheWorkspace: typeof createMemoryWorkspace;
}

test("a kept instance is read again once its template, the site or its page changes; its link and image lists only when read", async () => {
  const bundle = await build({
    stdin: { contents: `
      import { createComponentTools } from './src/page-builder/components';
      import { createGuardedEdits } from './src/guarded-edit';
      import { createMemoryWorkspace } from './tests/fakes/memory-workspace';
      globalThis.instanceCacheTools = createComponentTools;
      globalThis.instanceCacheEdits = createGuardedEdits;
      globalThis.instanceCacheWorkspace = createMemoryWorkspace;
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    const result = await page.evaluate(() => {
      const path = "index.html", template = "components/site-card/site-card.html";
      const sources: Record<string, string> = {
        [path]: "<!doctype html><html><body><main><site-card>One</site-card></main></body></html>",
        [template]: "<article><slot></slot></article>",
      };
      const withCard = () => ({ routes: { "/": path }, components: { "site-card": template } });
      let site: { routes: Record<string, string>; components: Record<string, string> } = withCard();
      const m = instanceCacheWorkspace({ branch: { ...sources }, open: path, site });
      // Only the editor ports a structure read reaches.
      const editor = { isMounted: () => true, captureHistoryHost: () => ({ isCurrent: () => true }) } satisfies Partial<SourceEditor>;
      // A Structure read builds neither list; a field reads each once (ticket 38).
      const calls = { links: 0, images: 0 };
      const panelHost = document.createElement("div"), codeTitle = document.createElement("div");
      document.body.append(panelHost, codeTitle);
      const tools = instanceCacheTools({ site: () => site, edits: instanceCacheEdits(m.workspace), sources: () => sources,
        editor: () => editor as SourceEditor, // The one cast: a structure read reaches only the ports above.
        currentPath: () => path, selection: () => undefined, previewPage: () => path,
        preview: () => ({ selectAfterUpdate() {}, selectNode() {} }),
        openFile: async () => true, announce() {}, error(error) { throw error; }, images: () => { calls.images++; return ["images/a.jpg"]; }, prefix: () => "",
        chooseImage: async () => undefined, links: () => { calls.links++; return [{ label: "Home", value: "/" }]; }, pageLabel: file => file, panelHost, codeTitle, canvasComponent() {}, refreshBar() {},
        variantFiles: { site: () => undefined, read: () => undefined },
      });
      const slots = (node: number[]) => tools.structure(path, node)?.slots.map(slot => slot.name);
      const attributes = (node: number[]) => tools.structure(path, node)?.attributes.map(item => `${item.name}=${item.value}`);
      const out: Record<string, unknown> = {};
      const model = tools.structure(path, [0, 0])!;
      out.listsUnread = { ...calls };
      out.lists = [model.links.map(link => link.value), [...model.images]];
      out.listsRead = { ...calls };
      out.listsAgain = [model.links.length, model.images.length];
      out.listsReadOnce = { ...calls };
      out.first = slots([0, 0]);
      out.again = slots([0, 0]);
      // The template alone changes: its new slot shows.
      sources[template] = '<article><slot></slot><slot name="x"></slot></article>';
      out.templateChanged = slots([0, 0]);
      // A site without the component: the element is no instance.
      site = { routes: { "/": path }, components: {} };
      out.notComponent = tools.structure(path, [0, 0]);
      // The component again, and the page changes at that place: the read follows the page.
      site = withCard();
      sources[path] = '<!doctype html><html><body><main><p>New</p><site-card data-tone="dark">Two</site-card></main></body></html>';
      out.movedAway = tools.structure(path, [0, 0]);
      out.movedTo = attributes([0, 1]);
      out.host = tools.structure(path, [0, 1])?.host.node;
      sources[path] = sources[path].replace('data-tone="dark"', 'data-tone="light"');
      out.attributeChanged = attributes([0, 1]);
      return out;
    });
    assert.deepEqual(result, {
      listsUnread: { links: 0, images: 0 }, lists: [["/"], ["/images/a.jpg"]], listsRead: { links: 1, images: 1 }, listsAgain: [1, 1], listsReadOnce: { links: 1, images: 1 },
      first: [""], again: [""], templateChanged: ["", "x"], notComponent: undefined,
      movedAway: undefined, movedTo: ["data-tone=dark"], host: [0, 1], attributeChanged: ["data-tone=light"],
    });
  } finally {
    await browser.close();
  }
});
