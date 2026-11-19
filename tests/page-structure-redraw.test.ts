import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createPageStructure, PageStructureHandlers } from "../src/components/page-structure.ts";
import type { NativeStructure, NativeStructureItem } from "../src/components/native-preview.ts";

declare global {
  var redrawFactory: typeof createPageStructure;
  var redrawSidebar: ReturnType<typeof createPageStructure>;
  var redrawPage: (painted: string) => NativeStructure;
}

// Page Structure alone in a browser page: a heading, a section with a paragraph in it and a last
// paragraph; the section's row has a menu. `run` gets the page with `redrawSidebar` showing it.
async function inBrowser(run: (page: import("@playwright/test").Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { createPageStructure } from './src/components/page-structure'; globalThis.redrawFactory = createPageStructure;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await page.evaluate(() => {
      const item = (tag: string, node: number[], text: string, children: NativeStructureItem[] = []): NativeStructureItem => ({ tag, node, text, heading: "", slot: "", children });
      globalThis.redrawPage = (painted: string): NativeStructure => ({ path: "index.html", paintedSource: painted, items: [
        item("h1", [0], "Title"), item("section", [1], "Box", [item("p", [1, 0], "Inside")]), item("p", [2], "Last")] });
      const host = document.createElement("div"); document.body.append(host);
      const outside = document.createElement("input"); outside.id = "outside"; document.body.append(outside);
      globalThis.redrawSidebar = redrawFactory(host, {
        pageSource: () => "", announce: () => {}, onSelect: () => {},
        label: (entry: NativeStructureItem) => ({ kind: entry.tag, text: entry.text }),
        menuItems: (_path: string, entry: NativeStructureItem) => entry.tag === "section" ? [{ label: "Make component", run: () => {} }] : [],
      } satisfies PageStructureHandlers);
      redrawSidebar.update(redrawPage("v0"));
    });
    await run(page);
  } finally { await browser.close(); }
}

const focusedNode = (page: import("@playwright/test").Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.node ?? document.activeElement?.id ?? document.activeElement?.localName);

// A page or a mode loading draws the tree empty for a moment (the preview shows no page, or a
// component alone): the row that had focus takes it again once a redraw shows it.
test("a redraw that empties the tree gives focus back to the row that had it once its row shows again", () => inBrowser(async page => {
  const row = (node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
  await row("1").focus();
  assert.equal(await focusedNode(page), "1");
  // The preview shows a component by itself, then the page again.
  await page.evaluate(() => redrawSidebar.update({ path: "", items: [] }));
  assert.equal(await row("1").count(), 0);
  await page.evaluate(() => redrawSidebar.update(redrawPage("v1")));
  assert.equal(await focusedNode(page), "1");
  // No page at all for a moment (the preview reloading), then the page again.
  await page.evaluate(() => { redrawSidebar.update(undefined); redrawSidebar.update(redrawPage("v2")); });
  assert.equal(await focusedNode(page), "1");
  // Focus that went elsewhere meanwhile stays there.
  await page.evaluate(() => redrawSidebar.update({ path: "", items: [] }));
  await page.locator("#outside").focus();
  await page.evaluate(() => redrawSidebar.update(redrawPage("v3")));
  assert.equal(await focusedNode(page), "outside");
}));

// Edit component mode settling, or a late paint, draws the tree again just after a row's menu
// opened: the menu stays open, now on the redrawn row.
test("a row's menu opened just before the tree is drawn again stays open on the redrawn row", () => inBrowser(async page => {
  const row = () => page.locator(`[role=treeitem][data-node="1"]`);
  const menu = page.getByRole("menu");
  await row().click({ button: "right" });
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Make component"]);
  await page.evaluate(() => redrawSidebar.refresh());
  assert.equal(await menu.isVisible(), true);
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Make component"]);
  // A new paint of the page draws the rows again too.
  await page.evaluate(() => redrawSidebar.update(redrawPage("v1")));
  assert.equal(await menu.isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await menu.isVisible(), false);

  // Opened from the row's Actions button: open again from the redrawn row's button.
  await row().hover();
  await row().getByRole("button", { name: "Actions for section Box", exact: true }).click();
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => redrawSidebar.refresh());
  assert.equal(await menu.isVisible(), true);
  assert.equal(await row().getByRole("button", { name: "Actions for section Box", exact: true }).getAttribute("aria-expanded"), "true");
}));
