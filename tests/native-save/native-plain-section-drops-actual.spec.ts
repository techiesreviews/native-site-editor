import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Lex's report (fix-lex-2): blocks in the starter's plain sections and Divs.
// A drop at a page band's edge stays in the band instead of being refused
// between bands, and over an item at a Div's edge stays in the Div; a press on an image (or button) in a Div drags that block,
// also while the Div is selected; the selection box follows an image that
// grows after it was drawn. ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
test.skip(!process.env.ASE_NATIVE_SAVE_FIXTURE?.endsWith("actual-starter"), "Set ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.");
test.use({ viewport: { width: 1400, height: 1400 } });
const ABOUT = "about/index.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const kind = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true }).locator(".edit-bar__kind");
const source = async (page: Page) => (await editorMounted(page, ABOUT), page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), ABOUT));
const undo = (page: Page) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), ABOUT);
const flat = (html: string | undefined) => (html ?? "").replace(/\s+(?=<)/g, "");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${ABOUT}`);
  await expect(frame(page).locator("#contact h2")).toBeVisible({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
  await editorMounted(page, ABOUT);
}

/** A point in the frame (an element's box, `fx`/`fy` across it, plus `dy` px), in page coordinates. */
async function pointIn(page: Page, selector: string, fx = 0.5, fy = 0.5, dy = 0) {
  const target = frame(page).locator(selector).first();
  // In the middle of the frame: a point near its bottom would scroll the page under the drag.
  await target.evaluate(el => el.scrollIntoView({ block: "center" }));
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await target.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  return { x: box.x + r.left + r.width * fx, y: box.y + r.top + r.height * fy + dy };
}

async function dragFromRail(page: Page, name: string, to: { x: number; y: number }) {
  const b = (await rail(page).getByRole("button", { name, exact: true }).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 12, b.y + b.height / 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost(page)).toBeVisible();
}

test("a block dropped at a plain section's top or bottom edge goes in that section, one undo step", { tag: "@actual" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = (await source(page))!;
  // 3 px inside the hero's top edge: the edge escape reaches only <main>, which refuses a Paragraph.
  await dragFromRail(page, "Paragraph", await pointIn(page, "section.hero", 0.5, 0, 3));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › before Heading");
  await expect(page.locator(".pb-drop__refused")).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toContain('<section class="hero flow"><p>Text</p><h1>About Larkspur</h1>');
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
  // 3 px inside #contact's bottom edge: at its end.
  await dragFromRail(page, "Heading", await pointIn(page, "#contact", 0.5, 1, -3));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Paragraph");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/hello@larkspur\.example<\/a><\/p><h2>Heading<\/h2><\/section><\/main>/);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("an image in a selected Div drags itself, and the selection box follows the Div as it grows", { tag: "@actual" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  // Lex's steps on the rail: Section, Heading, Heading, Div, Image, Button.
  for (const name of ["Section", "Heading", "Heading", "Div", "Image", "Button"]) {
    const before = await source(page);
    await rail(page).getByRole("button", { name, exact: true }).click();
    await expect.poll(() => source(page)).not.toBe(before);
  }
  const div = "main > section:last-child > div";
  await expect.poll(async () => flat(await source(page))).toMatch(/<section class="flow"><h2>Heading<\/h2><h2>Heading<\/h2><div class="flow"><img src="\/images\/placeholder.svg" alt="" width="640" height="400"><a class="btn" href="#">Button<\/a><\/div><\/section><\/main>/);
  await expect(frame(page).locator(`${div} > img`)).toBeVisible();
  // Over the image's top, at the Div's edge (a Div has no padding): before the image, in the Div.
  await dragFromRail(page, "Paragraph", await pointIn(page, `${div} > img`, 0.5, 0, 3));
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Div (stack) › before Image");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  // Escape goes up from the new Button to its Div.
  await page.keyboard.press("Escape");
  await expect(kind(page)).toHaveText("Block");

  // The Div grows without a render (as when its image arrives): its box follows.
  const box = () => frame(page).locator(div).evaluate(el => {
    const shown = document.querySelector<HTMLElement>('[data-native-selection-box="selected"]')!.getBoundingClientRect();
    const own = el.getBoundingClientRect();
    return Math.round(shown.height) === Math.round(own.height) && Math.round(shown.top) === Math.round(own.top);
  });
  await expect.poll(box).toBe(true);
  await frame(page).locator(`${div} > img`).evaluate(img => { (img as HTMLElement).style.height = "600px"; });
  await expect.poll(box).toBe(true);
  await frame(page).locator(`${div} > img`).evaluate(img => { (img as HTMLElement).style.height = ""; });

  // Pressed on the image while the Div is selected: the image drags, not the Div.
  const original = (await source(page))!;
  const from = await pointIn(page, `${div} > img`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await expect(ghost(page)).toHaveText("Image");
  await page.mouse.move(...Object.values(await pointIn(page, "#contact h2", 0.5, 0.9)) as [number, number], { steps: 8 });
  await expect(ghost(page)).toHaveAttribute("data-where", "Into Section › after Heading");
  await page.mouse.up();
  await expect.poll(async () => flat(await source(page))).toMatch(/<h2>Get in touch<\/h2><img src="\/images\/placeholder.svg"[^>]*><p>/);
  expect(flat(await source(page))).toContain('<div class="flow"><a class="btn" href="#">Button</a></div>');
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});
