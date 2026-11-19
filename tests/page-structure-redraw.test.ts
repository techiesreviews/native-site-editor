import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createPageStructure, PageStructureHandlers } from "../src/components/page-structure.ts";
import type { NativeStructure, NativeStructureItem } from "../src/components/native-preview.ts";

declare global {
  var redrawFactory: typeof createPageStructure;
  var redrawSidebar: ReturnType<typeof createPageStructure>;
  var redrawPage: (painted: string, above?: number, box?: boolean) => NativeStructure;
  // The same page after Alt+Down moved the section below the last paragraph.
  var movedPage: (painted: string) => NativeStructure;
  var menuRuns: string[];
  // Edit component mode on the section: its template's bytes, each line a "Read more <line>" paragraph (unset: no mode).
  var templateBytes: string | undefined;
}

// Page Structure alone in a browser page: a heading, a section with a paragraph in it and a last
// paragraph (`above` new paragraphs before them; `box` false leaves the section out); the section's
// row has a menu whose runs land in `menuRuns`. `run` gets the page with `redrawSidebar` showing it.
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
      globalThis.redrawPage = (painted: string, above = 0, box = true): NativeStructure => ({ path: "index.html", paintedSource: painted, items: [
        ...Array.from({ length: above }, (_, at) => item("p", [at], `New ${at}`)), item("h1", [above], "Title"),
        ...box ? [item("section", [above + 1], "Box", [item("p", [above + 1, 0], "Inside")])] : [], item("p", [above + (box ? 2 : 1)], "Last")] });
      globalThis.movedPage = (painted: string): NativeStructure => ({ path: "index.html", paintedSource: painted, items: [
        item("h1", [0], "Title"), item("p", [1], "Last"), item("section", [2], "Box", [item("p", [2, 0], "Inside")])] });
      globalThis.menuRuns = [];
      globalThis.templateBytes = undefined;
      const host = document.createElement("div"); document.body.append(host);
      const outside = document.createElement("input"); outside.id = "outside"; document.body.append(outside);
      globalThis.redrawSidebar = redrawFactory(host, {
        pageSource: () => "", announce: () => {}, onSelect: () => {},
        onMove: (_path: string, entry: NativeStructureItem, direction: string) => entry.tag === "section" && direction === "down" ? [entry.node[0] + 1] : undefined,
        label: (entry: NativeStructureItem) => ({ kind: entry.tag, text: entry.text }),
        menuItems: (_path: string, entry: NativeStructureItem) => entry.tag === "section" || entry.text.startsWith("Read more") ? ["Make component", "Remove"].map(label =>
          ({ label, run: () => { menuRuns.push(`${label} ${entry.text} at ${entry.node.join(".")}`); } })) : [],
        templateRows: (_path: string, at: readonly number[]) => templateBytes === undefined || at.join(".") !== "1" ? undefined : {
          path: "card.html", root: [0], source: templateBytes, badge: () => undefined,
          items: [{ tag: "div", node: [0], text: "", heading: "", slot: "", chips: [], paintedSource: templateBytes,
            children: templateBytes.split("\n").map((line, at) => ({ tag: "p", node: [0, at], text: `Read more ${line}`, heading: "", slot: "", chips: [], paintedSource: templateBytes, children: [] })) }],
        },
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
  // A paint of the page with no rows yet, then its rows.
  await page.evaluate(() => { redrawSidebar.update({ path: "index.html", paintedSource: "v-none", items: [] }); redrawSidebar.update(redrawPage("v2b")); });
  assert.equal(await focusedNode(page), "1");
  // Two such paints in a row, then the rows.
  await page.evaluate(() => {
    redrawSidebar.update({ path: "index.html", paintedSource: "v-none-1", items: [] });
    redrawSidebar.update({ path: "index.html", paintedSource: "v-none-2", items: [] });
    redrawSidebar.update(redrawPage("v2c"));
  });
  assert.equal(await focusedNode(page), "1");
  // The page comes back with a paragraph added above: focus goes to the section's row (now "2"), not to row "1".
  await page.evaluate(() => { redrawSidebar.update({ path: "", items: [] }); redrawSidebar.update(redrawPage("v2d", 1)); });
  assert.equal(await focusedNode(page), "2");
  await page.evaluate(() => redrawSidebar.update(redrawPage("v2e")));
  await row("1").focus();
  // Focus that went elsewhere meanwhile stays there.
  await page.evaluate(() => redrawSidebar.update({ path: "", items: [] }));
  await page.locator("#outside").focus();
  await page.evaluate(() => redrawSidebar.update(redrawPage("v3")));
  assert.equal(await focusedNode(page), "outside");
  // Another page drawn without that row: its own later paints give no row of theirs that focus.
  await row("1").focus();
  await page.evaluate(() => {
    redrawSidebar.update({ ...redrawPage("a1"), path: "about.html", items: redrawPage("a1").items.slice(0, 1) });
    redrawSidebar.update({ ...redrawPage("a2"), path: "about.html" });
  });
  assert.equal(await page.evaluate(() => document.activeElement === document.body), true);
}));

// Edit component mode settling, or a late paint, draws the tree again just after a row's menu
// opened: the menu stays open, now on the redrawn row.
test("a row's menu opened just before the tree is drawn again stays open on the redrawn row", () => inBrowser(async page => {
  const row = () => page.locator(`[role=treeitem][data-node="1"]`);
  const menu = page.getByRole("menu");
  await row().click({ button: "right" });
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Make component", "Remove"]);
  await page.evaluate(() => redrawSidebar.refresh());
  assert.equal(await menu.isVisible(), true);
  assert.deepEqual(await menu.getByRole("menuitem").allTextContents(), ["Make component", "Remove"]);
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
  await page.keyboard.press("Escape");

  // Opened from the keyboard and moved down to Remove: Remove keeps focus through the redraw.
  await row().focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Remove");
  await page.evaluate(() => redrawSidebar.refresh());
  assert.equal(await menu.isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Remove");
  await page.keyboard.press("Escape");

  // A paint that changes the rows (one added above renumbers the section): the menu closes rather than guess.
  await row().click({ button: "right" });
  await page.evaluate(() => redrawSidebar.update(redrawPage("v2", 1)));
  assert.equal(await menu.isVisible(), false);
  assert.deepEqual(await page.evaluate(() => menuRuns), []);
  // Two sections alike, the first one's menu open, the first removed: no menu opens on the one left.
  await page.evaluate(() => {
    const twins = redrawPage("v-twins");
    twins.items.splice(2, 0, { ...twins.items[1], node: [2], children: [] });
    twins.items[3] = { ...twins.items[3], node: [3] };
    redrawSidebar.update(twins);
  });
  await row().click({ button: "right" });
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => redrawSidebar.update(redrawPage("v-one")));
  assert.equal(await menu.isVisible(), false);
  // A paint without the section: its menu goes with it, and no other row's opens in its place.
  await page.evaluate(() => redrawSidebar.update(redrawPage("v2b", 1)));
  await page.locator(`[role=treeitem][data-node="2"]`).click({ button: "right" });
  await page.evaluate(() => redrawSidebar.update(redrawPage("v3", 2, false)));
  assert.equal(await menu.isVisible(), false);
  // The same from the keyboard: focus the menu held goes to a row, not nowhere.
  await page.evaluate(() => redrawSidebar.update(redrawPage("v4")));
  await row().focus();
  await page.keyboard.press("Shift+F10");
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => redrawSidebar.update(redrawPage("v5", 0, false)));
  assert.equal(await menu.isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "treeitem");
}));

// R6-11: a paint that changes other rows closes a keyboard-opened menu (it never opens on a changed page);
// the focus it held goes to its own element's row, not to the tree's first row.
test("a keyboard-opened row menu closed by a change to other rows gives focus to its own row", () => inBrowser(async page => {
  const row = (node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
  const menu = page.getByRole("menu");
  // A paragraph added above renumbers the section: focus goes to its row, now "2".
  await row("1").focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Remove");
  await page.evaluate(() => redrawSidebar.update(redrawPage("v1", 1)));
  assert.equal(await menu.isVisible(), false);
  assert.equal(await focusedNode(page), "2");
  // The last paragraph renamed below it: the section's row keeps its number and takes focus.
  await page.keyboard.press("Shift+F10");
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => { const next = redrawPage("v2", 1); next.items[3] = { ...next.items[3], text: "Renamed" }; redrawSidebar.update(next); });
  assert.equal(await menu.isVisible(), false);
  assert.equal(await focusedNode(page), "2");
}));

// R6-12: a move's row takes focus at the next render; a paint with no rows (or no page) before the moved
// page must not lose it.
test("a moved row takes focus when the tree shows no rows for a moment before the moved page", () => inBrowser(async page => {
  const row = (node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
  // A paint of the page with no rows yet, then the moved page.
  await row("1").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.evaluate(() => { redrawSidebar.update({ path: "index.html", paintedSource: "v-none", items: [] }); redrawSidebar.update(movedPage("v1")); });
  assert.equal(await focusedNode(page), "2");
  // The preview showing no page for a moment, then the moved page.
  await page.evaluate(() => redrawSidebar.update(redrawPage("v2")));
  await row("1").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.evaluate(() => { redrawSidebar.update({ path: "", items: [] }); redrawSidebar.update(movedPage("v3")); });
  assert.equal(await focusedNode(page), "2");
}));

// SL-1: the tree empties while a keyboard-opened row menu is open: the menu goes, and its row takes focus
// once the page's rows come back.
test("a keyboard-opened row menu interrupted by an empty tree gives focus to its row when the rows come back", () => inBrowser(async page => {
  const row = (node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
  const menu = page.getByRole("menu");
  // The preview shows a component by itself, then the page again.
  await row("1").focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("ArrowDown");
  await page.evaluate(() => redrawSidebar.update({ path: "", items: [] }));
  assert.equal(await menu.isVisible(), false);
  await page.evaluate(() => redrawSidebar.update(redrawPage("v1")));
  assert.equal(await focusedNode(page), "1");
  // A paint of the page with no rows yet, then its rows with a paragraph added above: the section's row, now "2".
  await page.keyboard.press("Shift+F10");
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => { redrawSidebar.update({ path: "index.html", paintedSource: "v-none", items: [] }); redrawSidebar.update(redrawPage("v2", 1)); });
  assert.equal(await menu.isVisible(), false);
  assert.equal(await focusedNode(page), "2");
}));

// Edit component mode: template rows keep their ids through edits, so a menu opens again on one only
// while the template's bytes are the ones it was opened on.
test("a template row's menu opens again on a redraw of the same bytes, and stays closed once the template changed", () => inBrowser(async page => {
  await page.evaluate(() => { templateBytes = "a\nb"; redrawSidebar.refresh(); });
  const second = page.locator("[role=treeitem][data-template-path]").filter({ hasText: "Read more" }).nth(1);
  const menu = page.getByRole("menu");
  await second.click({ button: "right" });
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => redrawSidebar.refresh());
  assert.equal(await menu.isVisible(), true);
  // A paragraph added above: the second row now stands for what was the first.
  await page.evaluate(() => { templateBytes = "new\na\nb"; redrawSidebar.refresh(); });
  assert.equal(await menu.isVisible(), false);
  // R6-11 in Edit component mode: a keyboard-opened template row menu closed by a change to a page row
  // below gives focus to that same template row.
  await second.focus();
  const focusedRow = () => page.evaluate(() => { const el = document.activeElement as HTMLElement | null; return el?.dataset.node ?? el?.localName; });
  const own = await focusedRow();
  await page.keyboard.press("Shift+F10");
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => { const next = redrawPage("v-t1"); next.items[2] = { ...next.items[2], text: "Renamed" }; redrawSidebar.update(next); });
  assert.equal(await menu.isVisible(), false);
  assert.equal(await focusedRow(), own);
  // A part added above it in the template: focus follows the part to its new number, not the part now at its old one.
  const partB = page.locator("[role=treeitem][data-template-path]").filter({ hasText: "Read more b" });
  await partB.focus();
  const before = await focusedRow();
  await page.keyboard.press("Shift+F10");
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => { templateBytes = "new\nnewer\na\nb"; redrawSidebar.refresh(); });
  assert.equal(await menu.isVisible(), false);
  assert.notEqual(await focusedRow(), before);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes("Read more b")), true);
  // The part removed while its menu is open: focus stays in the tree.
  await page.keyboard.press("Shift+F10");
  assert.equal(await menu.isVisible(), true);
  await page.evaluate(() => { templateBytes = "new\nnewer\na"; redrawSidebar.refresh(); });
  assert.equal(await menu.isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "treeitem");
}));
