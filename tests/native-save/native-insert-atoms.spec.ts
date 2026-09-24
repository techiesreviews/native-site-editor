import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Plus buttons between the items inside a plain section open a picker of
// the atoms (heading, text, button, image) and the components that fit
// inside a section; choosing one writes it into the page source as one undo
// step, selects it, and a new heading or text starts being edited with its
// placeholder selected. A selected button offers + Button in the edit bar.
const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
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

async function undo(page: Page) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
}

const frameOf = (page: Page) => page.frameLocator(".native-preview-frame");
const plus = (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" });
const shown = (page: Page) => page.locator(".insert-point.is-near .insert-point__plus");
const picker = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const heroTitle = "A native browser preview";

test("a plus inside a section offers atoms and the components that fit there, and a new text starts edited", async ({ page }) => {
  const frame = frameOf(page);
  // Hovering an item inside the hero shows the pair around that item, not the page-level pair around the hero.
  await frame.locator("section.hero p.lead").hover();
  await expect(shown(page)).toHaveCount(2);
  const before = plus(page, /^Add to A native browser preview before “Edit plain HTML/);
  await expect(shown(page).first()).toHaveAccessibleName(/^Add to A native browser preview before “Edit plain HTML/);
  await expect(shown(page).last()).toHaveAccessibleName("Add to A native browser preview before “<img>”");
  await before.click();
  const dialog = picker(page, `Add to ${heroTitle}`);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Goes before “Edit plain HTML");
  const options = dialog.getByRole("option");
  // The four atoms first, with their placeholders, then the components whose template is not a section.
  await expect(options).toHaveText([
    /^Heading\s*A new thought$/, /^Text\s*Start writing here\.$/, /^Button\s*Learn more$/, /^Image\s*Image$/,
    /Card note/, /Project card/, /Site button/, /Site footer/, /Site header/,
  ]);
  await expect(dialog.getByRole("option", { name: /Feature block/ })).toHaveCount(0);

  await dialog.getByRole("option", { name: /^Text/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Text added");
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Paragraph");
  // The new paragraph is being edited with its placeholder selected, so
  // typing replaces it. (Reading the source moves focus to the code editor,
  // so that comes after.)
  const text = frame.locator("p[data-key='text']");
  await expect(text).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect.poll(() => text.evaluate((el) => {
    const selection = el.ownerDocument.getSelection();
    return el.ownerDocument.hasFocus() && selection?.toString();
  })).toBe("Start writing here.");
  await page.keyboard.type("Hello there");
  await page.keyboard.press("Enter");
  await expect(text).toHaveText("Hello there");
  await expect.poll(() => editorText(page, "#content")).toContain(`<p data-key="text">Hello there</p>`);
  // The typing and the insertion are one undo step each.
  const inserted = indexSource.replace(
    `    <p class="lead"`,
    `    <p data-key="text">Start writing here.</p>\n    <p class="lead"`,
  );
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(inserted);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
  await expect(frame.locator("p[data-key='text']")).toHaveCount(0);
});

test("an image takes the placeholder, a heading the level below the section's own, each as one undo step", async ({ page }) => {
  const frame = frameOf(page);
  await frame.locator("section.hero img").hover();
  await plus(page, `Add to ${heroTitle} at the end`).click();
  await picker(page, `Add to ${heroTitle}`).getByRole("option", { name: /^Image/ }).click();
  const withImage = indexSource.replace(
    `data-key="hero-image">\n`,
    `data-key="hero-image">\n    <img src="src/images/placeholder.svg" alt="" data-key="image">\n`,
  );
  await expect.poll(() => editorText(page, "#content")).toBe(withImage);
  await expect(page.locator("#status")).toHaveText("Image added");
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Image");
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // The filler's own heading is an H2, so a new heading there is an H3; a
  // section without a heading gets an H2.
  await frame.locator("section.filler p[data-key='filler-5']").scrollIntoViewIfNeeded();
  await frame.locator("section.filler p[data-key='filler-5']").hover();
  await plus(page, "Add to Scroll to verify at the end").click();
  await picker(page, "Add to Scroll to verify").getByRole("option", { name: /^Heading/ }).click();
  const heading = frame.locator("h3[data-key='heading']");
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.type("Closing words");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("Closing words");
  await expect.poll(() => editorText(page, "#content")).toContain(`home route.</p>\n    <h3 data-key="heading">Closing words</h3>\n`);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource.replace(
    `home route.</p>\n`,
    `home route.</p>\n    <h3 data-key="heading">A new thought</h3>\n`,
  ));
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("+ Button in the edit bar adds a button after the selected one", async ({ page }) => {
  const frame = frameOf(page);
  await frame.locator("section.hero img").hover();
  await plus(page, `Add to ${heroTitle} at the end`).click();
  await picker(page, `Add to ${heroTitle}`).getByRole("option", { name: /^Button/ }).click();
  const one = `<a class="button" href="#/" data-key="button">Learn more</a>`;
  await expect.poll(() => editorText(page, "#content")).toContain(`data-key="hero-image">\n    ${one}\n  </section>`);
  await expect(page.locator("#status")).toHaveText("Button added");
  const bar = page.getByRole("toolbar", { name: "Edit bar" });
  await expect(bar.locator(".edit-bar__kind")).toHaveText("Link");
  await bar.getByRole("button", { name: "+ Button" }).click();
  await expect(page.locator("#status")).toHaveText("Button added");
  // The new button is selected and being edited with its text selected.
  const second = frame.locator("a[data-key='button-2']");
  await expect(second).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.type("Buy now");
  await page.keyboard.press("Enter");
  await expect(second).toHaveText("Buy now");
  await expect.poll(() => editorText(page, "#content")).toContain(`    ${one}\n    <a class="button" href="#/" data-key="button-2">Buy now</a>\n  </section>`);
  // A section with no button in it has no + Button.
  await frame.locator(".hero h1").click();
  await expect(bar.getByRole("button", { name: "+ Button" })).toHaveCount(0);
});
