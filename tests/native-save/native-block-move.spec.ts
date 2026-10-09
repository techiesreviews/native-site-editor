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
  await expect(ghost(page)).toHaveText("Heading");
  await expect(ghost(page).locator("svg.element-icon")).toHaveAttribute("width", "14");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  // The label names the block only; the line is the place.
  await expect(where(page)).toBeHidden();
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
  await expect(ghost(page)).toHaveText("Card project");
  await expect(ghost(page).locator("svg.component-mark")).toHaveAttribute("width", "12");
  // In the component colour of its Structure row.
  const rowKind = page.locator(".page-structure__row--component .page-structure__kind").filter({ hasText: /^Card project$/ }).first();
  expect(await ghost(page).evaluate(el => getComputedStyle(el).color)).toBe(await rowKind.evaluate(el => getComputedStyle(el).color));
  // Over itself: it stays, and nothing is drawn.
  await expect(ghost(page)).toHaveAttribute("data-where", "Stays where it is");
  await expect(page.locator(".pb-drop__line")).toHaveCount(0);
  // Over another card's text, the grid targets the gap before that card.
  const before = await pointIn(page, "#work card-project:nth-child(1) p[slot=body]", 0.2, 0.5);
  await page.mouse.move(before.x, before.y, { steps: 6 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › before Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await expect(page.locator(".pb-drop__refused")).toHaveCount(0);
  // Alt now steps up from the grid to the surrounding Section.
  await page.keyboard.down("Alt");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Heading");
  await page.keyboard.up("Alt");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › before Card project");
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await expect.poll(async () => flat(await source(page)).indexOf("Harbour Lane Pottery</h3>")).toBeLessThan(flat(await source(page)).indexOf("Fern &amp; Kettle</h3>"));
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Card project");
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a card dragged over the third card's title reorders in the grid, one undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // Add the third card in this test; the shared fixture keeps its two cards.
  await frame(page).locator("#work card-project").first().hover();
  await page.locator(".card-ghost__add").click();
  await page.getByRole("dialog", { name: "New card with its own page" }).getByRole("button", { name: "Card only" }).click();
  const titles = frame(page).locator("#work card-project > h3[slot=title]");
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery", "Untitled project"]);
  const original = await source(page);
  // Clear the newly added card's selection so the press drags the first card.
  await page.keyboard.press("Escape");
  // The title's middle, a little into its after half so the side never rests on a rounding.
  const to = await pointIn(page, "#work card-project:nth-child(3) h3[slot=title]", 0.6);
  await pressAndMove(page, await pointIn(page, "#work card-project:nth-child(1) h3[slot=title]"), to);
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (grid) › after Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  // The line stands at the third card's right edge, along its height.
  const right = await pointIn(page, "#work card-project:nth-child(3)", 1, 0.5);
  const line = (await page.locator(".pb-drop__line--v").boundingBox())!;
  expect(Math.abs(line.x + line.width / 2 - right.x)).toBeLessThan(24);
  expect(line.y).toBeLessThan(right.y);
  expect(line.y + line.height).toBeGreaterThan(right.y);
  await page.mouse.up();
  await expect(titles).toHaveText(["Harbour Lane Pottery", "Untitled project", "Fern & Kettle"]);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery", "Untitled project"]);
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
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after List");
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
  await expect(ghost(page)).toHaveText("Heading");
  await expect(ghost(page).locator("svg.element-icon")).toHaveAttribute("width", "14");
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
  await expect(ghost(page)).toHaveAttribute("data-where", /^Into Card project › items › /);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/Read about Fern &amp; Kettle<\/a><p class="lead">One or two sentences/);
  await expect(frame(page).locator("#work card-project").first().locator("p.lead")).toHaveCount(1);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a card pressed in a section component's items slot swaps with the second card, one undo step", async ({ page, baseURL }) => {
  // Default fixture group: native-cards, with Recent work made a component.
  await open(page, baseURL);
  const edit = async (path: string, content: string) => {
    const response = await page.request.post(`${baseURL}/__demo/external-edit`, { data: { repo: "native-cards", path, content } });
    expect(response.ok()).toBe(true);
  };
  await edit("components/section-work/section-work.html", '<section class="flow">\n  <slot name="title"><h2>Recent work</h2></slot>\n  <div class="cards"><slot><card-project></card-project></slot></div>\n</section>\n');
  await edit("components/section-work/section-work.css", ":host { display: block; }\n.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }\n");
  const home = (await source(page))!;
  const made = home.replace('<section class="flow" id="work">', '<section-work id="work">').replace('<h2>Recent work</h2>\n      <div class="cards">', '<h2 slot="title">Recent work</h2>')
    .replace(/<\/card-project>\n      <\/div>\n    <\/section>/, "</card-project>\n    </section-work>");
  expect(made).toContain('</card-project>\n    </section-work>');
  await edit("index.html", made);
  await page.reload();
  const cards = frame(page).locator("section-work > card-project");
  const titles = cards.locator('h3[slot="title"]');
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  await editorMounted(page);
  await expect.poll(() => cards.nth(1).evaluate(el => el.getBoundingClientRect().top - el.previousElementSibling!.getBoundingClientRect().top)).toBe(0);
  const original = await source(page);
  await pressAndMove(page, await pointIn(page, "section-work card-project:nth-of-type(1) h3[slot=title]"), await pointIn(page, "section-work card-project:nth-of-type(2) h3[slot=title]", 0.8));
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Card project");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section work › items › after Card project");
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await page.mouse.up();
  await expect(titles).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);
  await expect.poll(async () => flat(await source(page))).toMatch(/Harbour Lane Pottery<\/h3>.*Fern &amp; Kettle<\/h3>/);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
  await expect(titles).toHaveText(["Fern & Kettle", "Harbour Lane Pottery"]);
  // With the section component selected (as after Make component and Done), a press on a card still drags the card (fix-lex-2).
  await frame(page).locator("section-work").evaluate(el => (el as HTMLElement).click());
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section work");
  await pressAndMove(page, await pointIn(page, "section-work card-project:nth-of-type(1) h3[slot=title]"), await pointIn(page, "section-work card-project:nth-of-type(2) h3[slot=title]", 0.8));
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Card project");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section work › items › after Card project");
  await page.mouse.up();
  await expect(titles).toHaveText(["Harbour Lane Pottery", "Fern & Kettle"]);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});
