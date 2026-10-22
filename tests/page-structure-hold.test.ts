import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createPageStructure, PageStructureHandlers } from "../src/components/page-structure.ts";
import type { NativeStructure, NativeStructureItem } from "../src/components/native-preview.ts";

declare global {
  var pageStructureFactory: typeof createPageStructure;
  var sidebar: ReturnType<typeof createPageStructure>;
  var paint: (added: number) => NativeStructure;
}

// A paint held while a row's text is typed numbers the page ahead of the rows drawn: what is chosen
// in it is named as drawn, and once it is drawn folds and the mark follow their elements.
test("held paints that add rows above: choices in them name the drawn rows; folds and the mark follow once drawn", async () => {
  const bundle = await build({
    stdin: { contents: "import { createPageStructure } from './src/components/page-structure'; globalThis.pageStructureFactory = createPageStructure;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await page.evaluate(() => {
      const item = (tag: string, node: number[], text: string, children: NativeStructureItem[] = []): NativeStructureItem => ({ tag, node, text, heading: "", slot: "", children });
      // The page with `added` paragraphs above the heading, a section and a last paragraph: each added one moves those down one.
      const paint = (added: number): NativeStructure => ({ path: "index.html", paintedSource: `v${added}`, items: [
        ...Array.from({ length: added }, (_, at) => item("p", [at], `New ${added - at}`)),
        item("h1", [added], "Title"), item("section", [added + 1], "Box", [item("p", [added + 1, 0], "Inside")]), item("p", [added + 2], "Last")] });
      const host = document.createElement("div"); document.body.append(host);
      const tree = pageStructureFactory(host, {
        pageSource: () => "", announce: () => {}, onSelect: () => {},
        label: (entry: NativeStructureItem) => ({ kind: entry.tag, text: entry.text }),
        textRow: (_path: string, _node: readonly number[], tag: string) => tag === "h1" ? { lines: "Title", breaks: false,
          open: () => ({ write: () => true, close: () => {}, cancel: () => true, stale: () => false, patchable: false, patch: () => false }) } : undefined,
      } satisfies PageStructureHandlers);
      globalThis.sidebar = tree; globalThis.paint = paint;
      tree.update(paint(0));
    });
    const row = (node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
    // Types in the heading's row, then a paint with `added` paragraphs above arrives and is held.
    const typeThenHold = async (heading: string, added: number) => {
      await row(heading).locator(".page-structure__text").first().dblclick();
      const field = row(heading).locator("textarea");
      await field.waitFor({ state: "attached" });
      await field.evaluate((field: HTMLTextAreaElement) => { field.focus(); field.value = "Typed"; field.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.evaluate(added => sidebar.update(paint(added)), added);
      return field;
    };
    const choose = (node: number[], painted: string) => page.evaluate(({ node, painted }) =>
      sidebar.select({ path: "index.html", node, paintedSource: painted }), { node, painted });
    const kept = (field: ReturnType<typeof row>) => field.evaluate(field => field === document.activeElement && field.isConnected);

    // The section folded by hand.
    await row("1").locator(".page-structure__toggle").first().dispatchEvent("click");
    assert.equal(await row("1").getAttribute("aria-expanded"), "false");

    // The edited heading chosen in the held paint (its own writes select it): the edit goes on, the rows as drawn.
    let field = await typeThenHold("0", 1);
    await choose([1], "v1");
    assert.equal(await kept(field), true);
    assert.equal(await row("3").count(), 0);
    // Focus leaves: the held paint is drawn, the heading marked and the section folded, each one row lower.
    await field.evaluate(field => (field as HTMLElement).blur());
    await row("3").waitFor();
    assert.equal(await row("1").getAttribute("aria-selected"), "true");
    assert.equal(await row("2").getAttribute("aria-expanded"), "false");

    // Another element chosen in a held paint ends the edit; the paint is drawn with that element marked.
    field = await typeThenHold("1", 2);
    assert.equal(await kept(field), true);
    await choose([4], "v2");
    await row("4").waitFor();
    assert.equal(await row("4").getAttribute("aria-selected"), "true");
    assert.equal(await row("3").getAttribute("aria-expanded"), "false");
    assert.equal(await row("2").getAttribute("aria-selected"), "false");

    // An element only the held paint has, chosen: marked once that paint is drawn.
    field = await typeThenHold("2", 3);
    assert.equal(await kept(field), true);
    await choose([0], "v3");
    await row("5").waitFor();
    assert.equal(await row("0").getAttribute("aria-selected"), "true");
    assert.equal(await row("4").getAttribute("aria-expanded"), "false");
  } finally { await browser.close(); }
});
