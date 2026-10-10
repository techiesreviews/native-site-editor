import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The edit bar's section icons (move, duplicate, remove), image Address and
// Alt text, and the accessibility fields that come with a selection.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
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

test("the section icons move, duplicate and remove it as single undo steps", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");

  // No More menu: the four actions are icon buttons in the bar.
  await expect(bar(page).getByRole("button", { name: "More" })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Move up" }).click();
  await expect(frame.locator("main > section.cards:first-child + section.hero")).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Moved up");
  // The moved section stays selected, now first, so Move up is disabled.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: "Move up" })).toBeDisabled();
  await expect(bar(page).getByRole("button", { name: "Move down" })).toBeEnabled();
  await undo(page);
  await expect(frame.locator("main > section.hero:first-child + section.cards")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(frame.locator("section.cards")).toHaveCount(2);
  await expect(page.locator("#status")).toHaveText("Section duplicated");
  await expect.poll(() => editorText(page, "#content")).toContain(`</section>\n  <section class="cards" data-key="cards">`);
  await undo(page);
  await expect(frame.locator("section.cards")).toHaveCount(1);

  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "Remove" }).click();
  await expect(frame.locator("section.cards")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Section removed");
  await expect.poll(() => selectionOn(page, "section.filler")).toBe(true);
  // The next section takes the removed section’s index.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect.poll(() => editorText(page, "#content")).toContain(`  </section>\n  <section class="filler"`);
  await undo(page);
  await expect(frame.locator("section.cards")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("an image shows in the preview, and Choose image and Alt text edit its tag", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const image = frame.locator(".hero img");
  // The repository file is read for the sandboxed frame.
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await image.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Image");
  // Only whole sections move or duplicate from the bar; any element can be removed.
  await expect(bar(page).getByRole("button", { name: "Remove" })).toHaveCount(1);

  // No alt attribute: the field warns, and opening it writes the file's name at once.
  const altButton = bar(page).getByRole("button", { name: "Alt text missing" });
  await altButton.click();
  const input = popover(page).getByRole("textbox", { name: "Alt text" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Placeholder");
  await expect(popover(page).getByRole("button")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`<img class="hero-image" src="/images/placeholder.svg" data-key="hero-image" alt="Placeholder">`);
  await expect(page.locator("#status")).toHaveText("Alt text updated");
  await expect(bar(page).getByRole("button", { name: "Alt text", exact: true })).toBeVisible();

  // Choose image… opens the repository's images; using one replaces the
  // image in the source as one step. (The bar's old Address field for an
  // image is gone, so a web address is no longer typed here.)
  await expect(bar(page).getByRole("button", { name: "Replace" })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Choose image…" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose image" });
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg" }).click();
  await chooser.getByRole("button", { name: "Use image" }).click();
  await expect(page.locator("#status")).toHaveText("Image replaced");
  // The image's own alt ("Placeholder", written above) is offered and kept.
  await expect.poll(() => editorText(page, "#content")).toContain(`<img width="320" height="180" loading="lazy" decoding="async" class="hero-image" src="/images/studio-desk.svg" data-key="hero-image" alt="Placeholder">`);
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);

  // A written alt is kept; emptied, the image is decorative.
  await bar(page).getByRole("button", { name: "Alt text", exact: true }).click();
  await popover(page).getByRole("textbox", { name: "Alt text" }).fill("A sketch on the desk");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`src="/images/studio-desk.svg" data-key="hero-image" alt="A sketch on the desk"`);
  // A second replacement offers the page's alt and keeps it as written.
  await bar(page).getByRole("button", { name: "Choose image…" }).click();
  await chooser.getByRole("button", { name: "Details for images/placeholder.svg" }).click();
  await expect(chooser.getByRole("textbox", { name: "Alt text for insertion" })).toHaveValue("A sketch on the desk");
  await chooser.getByRole("button", { name: "Use image" }).click();
  await expect.poll(() => editorText(page, "#content")).toContain(`src="/images/placeholder.svg" data-key="hero-image" alt="A sketch on the desk"`);
  // An alt changed in the picker is what the page gets.
  await bar(page).getByRole("button", { name: "Choose image…" }).click();
  await chooser.getByRole("button", { name: "Details for images/studio-desk.svg" }).click();
  await chooser.getByRole("textbox", { name: "Alt text for insertion" }).fill("Desk & lamp");
  await chooser.getByRole("button", { name: "Use image" }).click();
  await expect.poll(() => editorText(page, "#content")).toContain(`src="/images/studio-desk.svg" data-key="hero-image" alt="Desk &amp; lamp"`);
  await bar(page).getByRole("button", { name: "Alt text", exact: true }).click();
  await popover(page).getByRole("textbox", { name: "Alt text" }).fill("");
  await page.keyboard.press("Enter");
  await expect.poll(() => editorText(page, "#content")).toContain(`src="/images/studio-desk.svg" data-key="hero-image" alt=""`);
  await expect(page.locator("#status")).toHaveText("Image marked decorative");
  // A decorative image stays decorative through a replacement.
  await bar(page).getByRole("button", { name: "Choose image…" }).click();
  await chooser.getByRole("button", { name: "Details for images/placeholder.svg" }).click();
  await expect(chooser.getByRole("textbox", { name: "Alt text for insertion" })).toHaveValue("");
  await chooser.getByRole("button", { name: "Use image" }).click();
  await expect.poll(() => editorText(page, "#content")).toContain(`src="/images/placeholder.svg" data-key="hero-image" alt=""`);

  // Seven changes, seven undo steps.
  for (let step = 0; step < 7; step++) await undo(page);
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

// Where the preview draws its selection box, against an element's box.
async function selectionOn(page: Page, selector: string, nth = 0) {
  const frame = page.frameLocator(".native-preview-frame");
  const box = await frame.locator("[data-native-selection-box=selected]").boundingBox();
  const target = await frame.locator(selector).nth(nth).boundingBox();
  return Boolean(box && target && Math.abs(box.y - target.y) <= 2 && Math.abs(box.height - target.height) <= 2);
}

test("Duplicate copies the section as it is and selects the copy; removing the first section selects the next", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  // In view, so the bar shows over it.
  await frame.locator("section.filler h2").scrollIntoViewIfNeeded();
  await select(page, "section.filler");
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(frame.locator("section.filler")).toHaveCount(2);
  await expect(page.locator("#status")).toHaveText("Section duplicated");
  await expect.poll(() => editorText(page, "#content")).toContain(
    `  </section>\n  <section class="filler" data-key="filler">\n    <h2 data-key="filler-title">Scroll to verify</h2>\n    <p data-key="filler-1">`,
  );
  await expect.poll(() => selectionOn(page, "section.filler", 1)).toBe(true);
  await undo(page);
  await expect(frame.locator("section.filler")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // The first section has no previous one: the next one, now first, is selected.
  await frame.locator("section.hero h1").scrollIntoViewIfNeeded();
  await select(page, "section.hero");
  await bar(page).getByRole("button", { name: "Remove" }).click();
  await expect(frame.locator("section.hero")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Section removed");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: "Move up" })).toBeDisabled();
  await expect.poll(() => selectionOn(page, "section.cards")).toBe(true);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});
