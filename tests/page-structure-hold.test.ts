import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import type { createPageStructure, PageStructureHandlers } from "../src/components/page-structure.ts";
import type { NativeStructure, NativeStructureItem } from "../src/components/native-preview.ts";
import type { ComponentSlotEditSession, ComponentStructureModel } from "../src/page-builder/components.ts";

declare global {
  var pageStructureFactory: typeof createPageStructure;
  var sidebar: ReturnType<typeof createPageStructure>;
  var paint: (added: number) => NativeStructure;
  var rename: (label: string) => void;
}

// Page Structure alone in a browser page (pageStructureFactory), passed to `run`.
async function inBrowser(run: (page: import("@playwright/test").Page) => Promise<void>) {
  const bundle = await build({
    stdin: { contents: "import { createPageStructure } from './src/components/page-structure'; globalThis.pageStructureFactory = createPageStructure;", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", loader: { ".css": "empty", ".svg": "text" },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.addScriptTag({ content: "globalThis.__name = (fn) => fn;" + bundle.outputFiles[0].text });
    await run(page);
  } finally { await browser.close(); }
}

// A paint held while a row's text is typed numbers the page ahead of the rows drawn: what is chosen
// in it is named as drawn, and once it is drawn folds and the mark follow their elements.
test("held paints that add rows above: choices in them name the drawn rows; folds and the mark follow once drawn", () => inBrowser(async page => {
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
    // A refresh (a template part's own write) keeps the paint held as well.
    await page.evaluate(() => sidebar.refresh());
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
}));

// A click on a slot's own row while its text is edited leaves nothing selected and the edit open.
// An element only a held paint has, chosen then, ends the edit at once; its row is marked once drawn.
test("with nothing selected, an element only the held paint has, chosen: the edit ends at once and its row is marked once drawn", () => inBrowser(async page => {
  await page.evaluate(() => {
    const item = (tag: string, node: number[], text: string): NativeStructureItem => ({ tag, node, text, heading: "", slot: "", children: [] });
    // A card whose title slot edits here, a paragraph, and `added` paragraphs after them.
    const paint = (added: number): NativeStructure => ({ path: "index.html", paintedSource: `v${added}`, items: [
      item("site-card", [0], "Card"), item("p", [1], "Last"), ...Array.from({ length: added }, (_, at) => item("p", [2 + at], `New ${at + 1}`))] });
    const session = { write: () => true, close: () => {}, cancel: () => true, stale: () => false, patchable: false, patch: () => false } satisfies ComponentSlotEditSession;
    const card = {
      host: { path: "index.html", node: [0], tag: "site-card" },
      slots: [{ name: "title", label: "Title", kind: "text", value: { kind: "text", text: "Card", editable: true }, shown: true, filled: true, whenEmpty: "keep", assignedNodes: [] }],
      attributes: [], images: [], links: [],
      openAttribute: () => undefined, addAttribute: () => ({ ok: true }), openAttributeAdd: () => undefined, removeAttribute: () => false,
      openField: () => undefined, openSlotEdit: () => session, openImageChoice: () => undefined,
      setVisible: () => false, selectSlot: () => {}, edit: () => {}, disconnect: () => {},
    } satisfies ComponentStructureModel;
    const host = document.createElement("div"); document.body.append(host);
    const tree = pageStructureFactory(host, {
      pageSource: () => "", announce: () => {}, onSelect: () => {},
      label: (entry: NativeStructureItem) => ({ kind: entry.tag, text: entry.text }),
      componentSlots: (_path: string, node: readonly number[]) => node.join() === "0" ? card : undefined,
    } satisfies PageStructureHandlers);
    globalThis.sidebar = tree; globalThis.paint = paint;
    tree.update(paint(0));
  });
  const slotRow = page.locator("[role=treeitem][data-slot-row]").first();
  const field = page.getByRole("textbox", { name: "Title: Text", exact: true });
  const selected = page.locator("[role=treeitem][aria-selected=true]");
  await slotRow.press("F2");
  await field.waitFor();
  // A click on the slot's row (not its text): nothing selected, the edit stays open.
  await slotRow.dispatchEvent("click");
  await page.waitForFunction(() => document.querySelector("[role=treeitem][aria-selected=true]") === null);
  await field.evaluate((field: HTMLTextAreaElement) => { field.focus(); field.value = "Typed"; field.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.evaluate(() => sidebar.update(paint(1)));
  assert.equal(await page.locator('[role=treeitem][data-node="2"]').count(), 0);
  assert.equal(await field.evaluate(field => field === document.activeElement), true);
  await page.evaluate(() => sidebar.select({ path: "index.html", node: [2], paintedSource: "v1" }));
  assert.equal(await field.count(), 0);
  await page.locator('[role=treeitem][data-node="2"]').waitFor();
  assert.equal(await selected.count(), 1);
  assert.equal(await page.locator('[role=treeitem][data-node="2"]').getAttribute("aria-selected"), "true");
}));

// A refresh with no paint held (the source or mode changed) draws at once, the typing field kept.
test("with a field focused and no paint held, refresh draws at once; the field keeps its text and caret", () => inBrowser(async page => {
  await page.evaluate(() => {
    const item = (tag: string, node: number[], text: string): NativeStructureItem => ({ tag, node, text, heading: "", slot: "", children: [] });
    const host = document.createElement("div"); document.body.append(host);
    let named = "Last";
    const tree = pageStructureFactory(host, {
      pageSource: () => "", announce: () => {}, onSelect: () => {},
      label: (entry: NativeStructureItem) => ({ kind: entry.tag, text: entry.tag === "p" ? named : entry.text }),
      textRow: (_path: string, _node: readonly number[], tag: string) => tag === "h1" ? { lines: "Title", breaks: false,
        open: () => ({ write: () => true, close: () => {}, cancel: () => true, stale: () => false, patchable: false, patch: () => false }) } : undefined,
    } satisfies PageStructureHandlers);
    globalThis.sidebar = tree; globalThis.rename = label => { named = label; };
    tree.update({ path: "index.html", paintedSource: "v0", items: [item("h1", [0], "Title"), item("p", [1], "Last")] });
  });
  const row = (node: string) => page.locator(`[role=treeitem][data-node="${node}"]`);
  await row("0").locator(".page-structure__text").first().dblclick();
  const field = row("0").locator("textarea");
  await field.waitFor({ state: "attached" });
  await field.evaluate((field: HTMLTextAreaElement) => { field.focus(); field.value = "Typed"; field.dispatchEvent(new Event("input", { bubbles: true })); field.setSelectionRange(2, 2); });
  // The paragraph's label changes; refresh draws it at once.
  await page.evaluate(() => { rename("Renamed"); sidebar.refresh(); });
  assert.match(await row("1").innerText(), /Renamed/);
  assert.deepEqual(await field.evaluate((field: HTMLTextAreaElement) => [field === document.activeElement && field.isConnected, field.value, field.selectionStart, field.selectionEnd]), [true, "Typed", 2, 2]);
}));
