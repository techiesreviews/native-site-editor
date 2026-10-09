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
  // Over the first card's text its slot refuses: a release there moves nothing.
  const before = await pointIn(page, "#work card-project:nth-child(1) p[slot=body]", 0.2, 0.5);
  await page.mouse.move(before.x, before.y, { steps: 6 });
  await expect(where(page)).toHaveText(/^The “body” slot is filled by editing its text/);
  await expect(page.locator(".pb-drop__refused")).toBeVisible();
  await page.mouse.up();
  // The reason stays on screen by the pointer after the label goes, and in #status.
  await expect(page.locator("#status")).toHaveText(/^The “body” slot is filled by editing its text/);
  await expect(page.locator(".refusal-note")).toHaveText(/^The “body” slot is filled by editing its text/);
  expect(await source(page)).toBe(original);
  // Alt steps up to the grid: before that card.
  await pressAndMove(page, await pointIn(page, "#work card-project:nth-child(2) p[slot=body]"), before);
  await page.keyboard.down("Alt");
  await expect(where(page)).toHaveText("Into Div (grid) › before Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await page.mouse.up();
  // The page relays the release: Alt lets go once the drop is in.
  await expect(ghost(page)).toHaveCount(0);
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
  // Still typing, the bar's name drags the paragraph after the services list; the press commits the text.
  const chip = bar(page).locator(".edit-bar__handle");
  await expect(chip).toHaveText("Paragraph");
  // The bar re-renders as typing goes on: its box once it holds still.
  let c: { x: number; y: number; width: number; height: number } | null = null;
  await expect.poll(async () => (c = await chip.boundingBox())).not.toBeNull();
  c = c!;
  await pressAndMove(page, { x: c.x + c.width / 2, y: c.y + c.height / 2 }, await pointIn(page, "#services ul", 0.5, 0.6));
  await expect(where(page)).toHaveText("Into Section › after List");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/ul><p class="lead">One or two sentences[^<]*what they get\. Typed\.<\/p>/);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
});

test("6 px is a click and 7 px a drag; the header does not drag; Escape cancels", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  // 6 px on a heading: the release is a click that selects it.
  const heading = await pointIn(page, "#services h2", 0.9);
  await page.mouse.move(heading.x, heading.y);
  await page.mouse.down();
  await page.mouse.move(heading.x, heading.y + 6, { steps: 3 });
  await page.mouse.up();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(ghost(page)).toHaveCount(0);
  // Moved 30 px across the header: no drag, the release is a click on it.
  const header = await pointIn(page, "site-header", 0.3, 0.5);
  await page.mouse.move(header.x, header.y);
  await page.mouse.down();
  await page.mouse.move(header.x + 30, header.y, { steps: 4 });
  await page.mouse.up();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText(/header/i);
  await expect(ghost(page)).toHaveCount(0);
  // 7 px on the heading: a drag.
  await page.mouse.move(heading.x, heading.y);
  await page.mouse.down();
  await page.mouse.move(heading.x, heading.y + 7, { steps: 3 });
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Heading");
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator("#status")).toHaveText("Heading was not moved");
  expect(await source(page)).toBe(original);
});

test("a block moves into a card's items slot", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  // The card's own padding, over its unnamed (items) slot, not a named part.
  await pressAndMove(page, await pointIn(page, ".hero .lead", 0.2), await pointIn(page, "#work card-project:nth-child(1)", 0.5, 0, 0).then((p) => ({ x: p.x, y: p.y + 12 })));
  await expect(where(page)).toHaveText(/^Into Card project › items › /);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/Read about Fern &amp; Kettle<\/a><p class="lead">One or two sentences/);
  await expect(frame(page).locator("#work card-project").first().locator("p.lead")).toHaveCount(1);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});
