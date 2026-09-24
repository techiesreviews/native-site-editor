import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The edit bar's More menu (move, duplicate, remove), image Replace and
// Alt text, and the accessibility fields that come with a selection.
const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

async function editorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
// A click on the element itself, not on whichever child sits at a corner.
const select = (page: Page, selector: string) =>
  page.frameLocator(".native-preview-frame").locator(selector).evaluate((el) => (el as HTMLElement).click());
const popover = (page: Page) => page.locator(".edit-bar__popover");
async function undo(page: Page) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
}

test("More moves, duplicates and removes a section as single undo steps", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");

  await bar(page).getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu", { name: "More" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Move up" })).toBeFocused();
  await menu.getByRole("menuitem", { name: "Move up" }).click();
  await expect(frame.locator("main > section.cards:first-child + section.hero")).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Moved up");
  // The moved section stays selected.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await bar(page).getByRole("button", { name: "More" }).click();
  await expect(menu.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await undo(page);
  await expect(frame.locator("main > section.hero:first-child + section.cards")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "More" }).click();
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(frame.locator("section.cards")).toHaveCount(2);
  await expect(page.locator("#status")).toHaveText("Section duplicated");
  await expect.poll(() => editorText(page, "#content")).toContain(`</section>\n  <section class="cards" data-key="cards-2">`);
  await undo(page);
  await expect(frame.locator("section.cards")).toHaveCount(1);

  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "More" }).click();
  await menu.getByRole("menuitem", { name: "Remove" }).click();
  await expect(frame.locator("section.cards")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Section removed");
  // The previous section is selected next.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect.poll(() => editorText(page, "#content")).toContain(`  </section>\n  <section class="filler"`);
  await undo(page);
  await expect(frame.locator("section.cards")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("an image shows in the preview, and Address and Alt text edit its tag", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const image = frame.locator(".hero img");
  // The repository file is read for the sandboxed frame.
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await image.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Image");
  // Only whole sections move, duplicate or go away.
  await expect(bar(page).getByRole("button", { name: "More" })).toHaveCount(0);

  // No alt attribute: the field warns, and opening it writes the file's name at once.
  const altButton = bar(page).getByRole("button", { name: "Alt text missing" });
  await altButton.click();
  const input = popover(page).getByRole("textbox", { name: "Alt text" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Placeholder");
  await expect(popover(page).getByRole("button")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`<img class="hero-image" src="src/images/placeholder.svg" data-key="hero-image" alt="Placeholder">`);
  await expect(page.locator("#status")).toHaveText("Alt text updated");
  await expect(bar(page).getByRole("button", { name: "Alt text", exact: true })).toBeVisible();

  // Address suggests the repository's images; picking one replaces the image,
  // and the alt follows the new file's name since it matched the old one.
  await expect(bar(page).getByRole("button", { name: "Replace" })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Address" }).click();
  const images = popover(page).getByRole("listbox");
  await expect(images.getByRole("option", { name: "src/images/placeholder.svg" })).toHaveAttribute("aria-selected", "true");
  await images.getByRole("option", { name: "src/images/studio-desk.svg" }).click();
  await expect.poll(() => editorText(page, "#content")).toContain(`<img class="hero-image" src="src/images/studio-desk.svg" data-key="hero-image" alt="Studio desk">`);
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await expect(page.locator("#status")).toHaveText("Image replaced");

  // A written alt is kept on the next replacement; emptied, the image is decorative.
  await bar(page).getByRole("button", { name: "Alt text", exact: true }).click();
  await popover(page).getByRole("textbox", { name: "Alt text" }).fill("A sketch on the desk");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`alt="A sketch on the desk"`);
  // A web address applies as typed, with no image suggested for it.
  await bar(page).getByRole("button", { name: "Address" }).click();
  await popover(page).getByRole("combobox", { name: "Address" }).fill("https://example.test/photo.jpg");
  await expect(images).toBeHidden();
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`<img class="hero-image" src="https://example.test/photo.jpg" data-key="hero-image" alt="A sketch on the desk"`);
  await bar(page).getByRole("button", { name: "Alt text", exact: true }).click();
  await popover(page).getByRole("textbox", { name: "Alt text" }).fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`src="https://example.test/photo.jpg" data-key="hero-image" alt=""`);
  await expect(page.locator("#status")).toHaveText("Image marked decorative");

  // Five changes, five undo steps.
  for (let step = 0; step < 5; step++) await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("a skipped heading level and an unlabelled section get one-press fixes", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const heading = frame.locator(".filler h2");
  await heading.click();
  await expect(bar(page).getByRole("button", { name: /Use H/ })).toHaveCount(0);
  await bar(page).getByRole("combobox", { name: "Heading level" }).selectOption("h5");
  await expect(frame.locator(".filler h5")).toHaveCount(1);
  // H1 came before it, so H2 is next in order.
  await bar(page).getByRole("button", { name: "Use H2" }).click();
  await expect(frame.locator(".filler h2")).toHaveCount(1);
  await expect(bar(page).getByRole("button", { name: /Use H/ })).toHaveCount(0);

  // A section with a heading needs no label; one without warns and takes one.
  await select(page, "section.filler");
  await expect(bar(page).getByRole("button", { name: "Label", exact: true })).toBeVisible();
  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "No heading or label" }).click();
  await popover(page).getByRole("textbox", { name: "Label" }).fill("Project cards");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`<section class="cards" data-key="cards" aria-label="Project cards">`);
  await expect(bar(page).getByRole("button", { name: "Label", exact: true })).toBeVisible();
});
