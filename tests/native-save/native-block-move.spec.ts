import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Blocks drag themselves (ticket 12 §10, §12): a press on a page block moved
// 7 px moves it across containers, one undo step; cards reorder sideways; a
// plain click still selects and edits text; the header does not drag.
// Default fixture group: native-cards (#repo=540), a Section › Div (grid) › two cards.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const where = (page: Page) => page.locator(".pb-drag-ghost__where");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));

// Tall enough that the whole page shows: points measured before a press stay put.
test.use({ viewport: { width: 1400, height: 1500 } });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await expect.poll(() => frame(page).locator("#work .cards").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBeGreaterThan(1);
}

/** A point in the frame (an element's box, `fx`/`fy` across it, plus `dx` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dx = 0) {
  const target = frame(page).locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx + dx, y: box.y + r.top + r.height * fy };
}

/** Presses at `from` and moves past the 7 px threshold to `to`. */
async function pressAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

test("a Heading pressed in the page moves into another container's Div, one undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await pressAndMove(page, await pointIn(page, "#services h2", 0.2), await pointIn(page, "#work .cards card-project:nth-child(2)", 0, 0.3, -3));
  await expect(ghost(page)).toBeVisible();
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Heading");
  await expect(where(page)).toHaveText("Into Div (grid) › after Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><h2>What we do<\/h2><card-project>/);
  await expect(frame(page).locator("#services > h2")).toHaveCount(0);
  // The moved block is selected; the release selected nothing else and typed nothing.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(page.locator("#status")).toHaveText("Heading moved. Into Div (grid) › after Card project");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("cards reorder sideways by dragging one", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  // A press on the card's text moves the card, the instance, not its slotted paragraph.
  const itself = await pointIn(page, "#work card-project:nth-child(2)", 0.3, 0.5);
  await pressAndMove(page, await pointIn(page, "#work card-project:nth-child(2) p[slot=body]"), itself);
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Card project");
  // Over itself: it stays, and nothing is drawn.
  await expect(where(page)).toHaveText("Stays where it is");
  await expect(page.locator(".pb-drop__line")).toHaveCount(0);
  // Over the first card's text its slot refuses; Alt steps up to the grid: before that card.
  const before = await pointIn(page, "#work card-project:nth-child(1) p[slot=body]", 0.2, 0.5);
  await page.mouse.move(before.x, before.y, { steps: 6 });
  await expect(where(page)).toHaveText(/^The “body” slot is filled by editing its text/);
  await page.keyboard.down("Alt");
  await expect(where(page)).toHaveText("Into Div (grid) › before Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(async () => flat(await source(page)).indexOf("Harbour Lane Pottery</h3>")).toBeLessThan(flat(await source(page)).indexOf("Fern &amp; Kettle</h3>"));
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a plain click still edits text, a press in typed text selects it, and the name chip moves it", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const lead = frame(page).locator(".hero .lead");
  await lead.click();
  await expect(lead).toHaveAttribute("contenteditable", /.+/);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  // Press and move inside the text being typed: a text selection, no drag.
  const from = await pointIn(page, ".hero .lead", 0.1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y, { steps: 6 });
  await expect(ghost(page)).toHaveCount(0);
  await page.mouse.up();
  expect((await lead.evaluate(() => document.getSelection()?.toString() ?? "")).length).toBeGreaterThan(0);
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed.");
  await page.keyboard.press("Enter");
  await expect.poll(async () => flat(await source(page))).toMatch(/what they get\. Typed\.<\/p>/);
  // The bar's name drags the paragraph after the services list.
  await lead.click();
  const chip = bar(page).locator(".edit-bar__handle");
  await expect(chip).toHaveText("Paragraph");
  const c = (await chip.boundingBox())!;
  await pressAndMove(page, { x: c.x + c.width / 2, y: c.y + c.height / 2 }, await pointIn(page, "#services ul", 0.5, 0.6));
  await expect(where(page)).toHaveText("Into Section › after List");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/ul><p class="lead">One or two sentences/);
});

test("the header does not drag from the page; Escape cancels a block's drag", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  const header = await pointIn(page, "site-header", 0.5, 0.5);
  await pressAndMove(page, header, { x: header.x, y: header.y + 120 });
  await page.waitForTimeout(150);
  await expect(ghost(page)).toHaveCount(0);
  await page.mouse.up();
  // Escape leaves a dragged block where it was.
  await pressAndMove(page, await pointIn(page, "#services h2", 0.9), await pointIn(page, ".hero", 0.5, 0.2));
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Heading");
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Heading was not moved");
  await page.mouse.up();
  expect(await source(page)).toBe(original);
});
