import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Any element moves anywhere HTML allows (slice 82): a heading straight into
// <main>, a link into another paragraph; an element no container under the
// pointer can take is refused with the content rule's reason; a component's
// parts stay closed on the page; Sections still snap between page bands.
// Default fixture group: native-cards (#repo=540).
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const source = async (page: Page, path: string) => (await editorMounted(page, path), page.evaluate(async (file) => (await import("/src/components/code-editor.ts")).getMountedSource(file), path));
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");
const undo = (page: Page, path: string) => page.evaluate(async (file) => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", file), path);

test.use({ viewport: { width: 1400, height: 1500 } });

async function open(page: Page, baseURL: string | undefined, file = "index.html") {
  await page.goto(`${baseURL}/#repo=540&branch=main&file=${file}`);
  await expect(frame(page).locator("main section").first()).toBeVisible({ timeout: 30_000 });
  await editorMounted(page, file);
}

/** A point in the frame (an element's box, `fx`/`fy` across it, plus `dy` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dy = 0) {
  const target = frame(page).locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx, y: box.y + r.top + r.height * fy + dy };
}

async function pressAndMove(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

test("a Heading moves out of its Section straight into <main>, one undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page, "index.html");
  // At the hero's bottom edge the drop passes to <main>, after the hero.
  await pressAndMove(page, await pointIn(page, "#services h2", 0.2), await pointIn(page, "section.hero", 0.5, 1, -3));
  await expect(ghost(page)).toHaveAttribute("data-where", "Between page bands › after Section");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page, "index.html"))).toContain('</section><h2>What we do</h2><section class="flow" id="work">');
  await expect(frame(page).locator("main > h2")).toHaveText("What we do");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  expect(await undo(page, "index.html")).toBe(true);
  await expect.poll(() => source(page, "index.html")).toBe(original);
});

test("a list item over a paragraph is refused with the content rule's reason; nothing moves", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await source(page, "index.html");
  await pressAndMove(page, await pointIn(page, "#services li", 0.1), await pointIn(page, ".hero .lead", 0.5, 0.5));
  await expect(ghost(page)).toHaveAttribute("data-where", "A <li> can't go inside a <p>.");
  await expect(page.locator(".pb-drop__refused")).toBeVisible();
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  expect(await source(page, "index.html")).toBe(original);
});

test("a Div dragged over a paragraph goes beside it, never into it", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // The card grid, pressed in its empty third column (on the Div itself), over the hero's lead.
  await pressAndMove(page, await pointIn(page, "#work .cards", 0.9, 0.5), await pointIn(page, ".hero .lead", 0.5, 0.6));
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Div (grid)");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Paragraph");
  await page.keyboard.press("Escape");
  await page.mouse.up();
});

test("a selected link moves into another paragraph, on its line", async ({ page, baseURL }) => {
  const path = "work/fern-and-kettle/index.html";
  await open(page, baseURL, path);
  const original = await source(page, path);
  const link = frame(page).locator(".prose a");
  await link.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  await pressAndMove(page, await pointIn(page, ".prose a", 0.3), await pointIn(page, ".prose p:nth-of-type(2)", 0.5, 0.5));
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Link");
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Paragraph › at the end");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page, path))).toContain('<p>A single page with the opening hours at the top and the menu below.<a href="/#work">Back to all work</a></p><p></p>');
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  expect(await undo(page, path)).toBe(true);
  await expect.poll(() => source(page, path)).toBe(original);
});

test("a component's parts stay closed on the page, and a Section still snaps between page bands", async ({ page, baseURL }) => {
  await open(page, baseURL);
  // Over a card's title (its named slot) a Heading is refused in place.
  await pressAndMove(page, await pointIn(page, "#services h2", 0.2), await pointIn(page, "#work card-project h3[slot=title]", 0.5, 0.5));
  await expect(ghost(page)).toHaveAttribute("data-where", /^The “title” slot is filled by editing its text/);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  // A Section over a paragraph's middle snaps between the bands.
  // Pressed in the gap below its heading: the Section itself.
  await pressAndMove(page, await pointIn(page, "#services h2", 0.5, 1, 6), await pointIn(page, ".hero .lead", 0.5, 0.5));
  await expect(page.locator(".pb-drag-ghost__name")).toHaveText("Section");
  await expect(ghost(page)).toHaveAttribute("data-where", /^Between page bands › /);
  await page.keyboard.press("Escape");
  await page.mouse.up();
});
