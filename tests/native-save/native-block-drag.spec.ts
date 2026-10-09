import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Default fixture group: native-cards (#repo=540), a Section › Div (grid) › two cards.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const where = (page: Page) => page.locator(".pb-drag-ghost__where");
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=index.html`);
  await expect(frame(page).locator("#work .cards card-project").first()).toBeVisible({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
  await editorMounted(page);
  // The grid's columns are the stylesheet's: wait for two cards side by side.
  await expect.poll(() => frame(page).locator("#work .cards").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBeGreaterThan(1);
}

/** A point in the frame (an element's box, `fx`/`fy` across it, plus `dx`/`dy` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dx = 0, dy = 0) {
  const target = frame(page).locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx + dx, y: box.y + r.top + r.height * fy + dy };
}

/** Presses a rail block and drags it past the 7 px threshold to `to`. */
async function dragFromRail(page: Page, name: string, to: { x: number; y: number }) {
  const button = rail(page).getByRole("button", { name, exact: true });
  const b = (await button.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 12, b.y + b.height / 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost(page)).toBeVisible();
}

// The gap between the grid's two cards.
const betweenCards = (page: Page) => pointIn(page, "#work .cards card-project:nth-child(2)", 0, 0.3, -3);

test("a Paragraph dragged from the rail between two cards of a nested grid lands there, one undo step", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await dragFromRail(page, "Paragraph", await betweenCards(page));
  await expect(where(page)).toHaveText("Into Div (grid) › after Card project");
  // The line stands sideways between the cards; nothing outlines the grid.
  await expect(page.locator(".pb-drop__line--v")).toBeVisible();
  await expect(page.locator(".pb-drop__refused, .pb-drop__area")).toHaveCount(0);
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator(".pb-drop")).toHaveCount(0);
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/card-project><p>Text<\/p><card-project>/);
  await expect(frame(page).locator("#work .cards > card-project + p + card-project")).toHaveCount(1);
  // The new block is selected.
  await expect(page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind")).toHaveText("Paragraph");
  expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"))).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("Alt steps the target up a level and Escape cancels the drag", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await dragFromRail(page, "Heading", await betweenCards(page));
  await expect(where(page)).toHaveText("Into Div (grid) › after Card project");
  await page.keyboard.down("Alt");
  await expect(where(page)).toHaveText("Into Section › after Heading");
  await expect(page.locator(".pb-drop__line:not(.pb-drop__line--v)")).toBeVisible();
  await page.keyboard.up("Alt");
  await expect(where(page)).toHaveText("Into Div (grid) › after Card project");
  // Tab steps up too, Shift+Tab back.
  await page.keyboard.press("Tab");
  await expect(where(page)).toHaveText("Into Section › after Heading");
  await page.keyboard.press("Shift+Tab");
  await expect(where(page)).toHaveText("Into Div (grid) › after Card project");
  await page.keyboard.press("Escape");
  await expect(ghost(page)).toHaveCount(0);
  await expect(page.locator(".pb-drop")).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await source(page)).toBe(original);
});

test("a card's title slot refuses with its reason; a release there adds nothing", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page);
  await dragFromRail(page, "Paragraph", await pointIn(page, "#work card-project h3[slot=title]"));
  await expect(where(page)).toHaveText(/^The “title” slot is filled by editing its text/);
  await expect(ghost(page)).toHaveClass(/is-refused/);
  await expect(page.locator(".pb-drop__refused")).toBeVisible();
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await source(page)).toBe(original);
});

test("an empty Div shows its drop area, and a Section snaps between page bands", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // An empty Div after the services list, from the rail.
  await frame(page).locator("#services ul").click();
  await rail(page).getByRole("button", { name: "Div", exact: true }).click();
  await expect(frame(page).locator("#services > div.flow:empty")).toBeVisible();
  await dragFromRail(page, "Image", await pointIn(page, "#services > div.flow"));
  await expect(where(page)).toHaveText("Into Div (stack) › empty");
  await expect(page.locator(".pb-drop__area")).toHaveText("Drop into the empty Div (stack)");
  await page.mouse.up();
  await expect(frame(page).locator("#services > div.flow > img")).toBeVisible();
  // A Section over a card goes between bands: after #work when below its middle.
  await dragFromRail(page, "Section", await pointIn(page, "#work .cards card-project", 0.5, 0.9));
  await expect(where(page)).toHaveText(/^Between page bands › /);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<\/section><section class="flow"><\/section><section class="flow" id="services">/);
});
