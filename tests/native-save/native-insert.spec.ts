import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Plus buttons between page sections open a picker of the components that
// fit a section slot (template is one <section>); choosing one writes an
// instance into the page source as one undo step and selects it.
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

async function scrollFrame(page: Page, to: "top" | "bottom") {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await child!.evaluate((where) => window.scrollTo(0, where === "top" ? 0 : document.documentElement.scrollHeight), to);
}

const plus = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const picker = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });

test("a plus between sections inserts a section component, and only those are offered", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  // One plus per gap among <main>'s sections, including both ends.
  await expect(page.locator(".insert-point__plus")).toHaveCount(4);
  const before = plus(page, "Add a section before “Scroll to verify”");
  await expect(before).toBeVisible();
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const cards = (await frame.locator("section.cards").boundingBox())!;
  const filler = (await frame.locator("section.filler").boundingBox())!;
  const plusBox = (await before.boundingBox())!;
  const middle = plusBox.y + plusBox.height / 2;
  expect(middle).toBeGreaterThanOrEqual(cards.y + cards.height - 1);
  expect(middle).toBeLessThanOrEqual(filler.y + 1);
  expect(plusBox.y).toBeGreaterThanOrEqual(frameBox.y);

  await before.click();
  await expect(before).toHaveAttribute("aria-expanded", "true");
  await expect(picker(page)).toBeVisible();
  await expect(picker(page)).toContainText("Goes before “Scroll to verify”");
  await expect(picker(page).getByRole("searchbox", { name: "Search components" })).toBeFocused();
  // A button or a card does not fit a section slot.
  const options = picker(page).getByRole("option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Feature block");

  await options.first().click();
  await expect(picker(page)).toBeHidden();
  await expect(frame.locator("section.cards + feature-block + section.filler")).toHaveCount(1);
  await expect(frame.getByRole("heading", { name: "A feature worth sharing" })).toBeVisible();
  const inserted = indexSource.replace(
    `  <section class="filler"`,
    `  <feature-block data-key="feature-block"></feature-block>\n  <section class="filler"`,
  );
  await expect.poll(() => editorText(page, "#content")).toBe(inserted);
  await expect(page.locator("#status")).toHaveText("Feature block added");
  // The new instance is selected.
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("feature-block");
  // Its own gap now has plus buttons on both sides.
  await expect(page.locator(".insert-point__plus")).toHaveCount(5);

  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator("feature-block")).toHaveCount(0);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("the picker searches, moves by keyboard and closes back to its plus", async ({ page }) => {
  const end = plus(page, "Add a section at the end");
  // Plus buttons scrolled out of the frame are hidden.
  await expect(end).toBeHidden();
  await scrollFrame(page, "bottom");
  await end.click();
  const search = picker(page).getByRole("searchbox", { name: "Search components" });
  await expect(picker(page)).toContainText("Goes at the end");
  await page.keyboard.type("zzz");
  await expect(picker(page)).toContainText("No components match “zzz”");
  await picker(page).getByRole("button", { name: "Clear search" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await page.keyboard.press("ArrowDown");
  await expect(picker(page).getByRole("option", { name: /Feature block/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker(page)).toBeHidden();
  await expect(end).toBeFocused();
  await expect(end).toHaveAttribute("aria-expanded", "false");

  // Enter with a single match inserts it at the end of the page's sections.
  await end.click();
  await page.keyboard.type("feat");
  await page.keyboard.press("Enter");
  await expect(page.frameLocator(".native-preview-frame").locator("section.filler + feature-block")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toContain(
    `  </section>\n  <feature-block data-key="feature-block"></feature-block>\n</main>`,
  );
});

test("inserting while a component file is open edits the page", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await frame.locator(".site-footer p").click();
  await expect(page.locator("#current-page")).toHaveText("src/components/site-footer/site-footer.html");
  await scrollFrame(page, "top");
  await plus(page, "Add a section before “A native browser preview”").click();
  await picker(page).getByRole("option", { name: /Feature block/ }).click();
  await expect(page.locator("#current-page")).toHaveText(indexPath);
  await expect(frame.locator("main > feature-block:first-child + section.hero")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toContain(
    `<main class="page" data-key="main">\n  <feature-block data-key="feature-block"></feature-block>\n  <section class="hero"`,
  );
});
