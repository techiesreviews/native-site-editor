import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Add panel (src/page-builder/add-panel.ts): the top bar's "+ Add" docks
// it over the page structure, listing each section component as a live
// thumbnail with the HTML it adds; a click inserts after the selected
// section (or at the end of <main>) and the panel stays; an item dragged
// onto the canvas goes into the gap under the pointer; Escape cancels a
// drag. Each insert is the same source edit as a plus between sections,
// and the new section is selected and highlighted.
const indexPath = "index.html";
const indexSource = readFileSync(resolve("fixtures/native-starter", indexPath), "utf8");
const instance = `<feature-block>\n    <span slot="title">A feature worth sharing</span>\n    <span slot="body">Describe what makes it useful.</span>\n  </feature-block>`;
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });
const addButton = (page: Page) => page.getByRole("button", { name: "Add", exact: true });
const feature = (page: Page) => panel(page).getByRole("option", { name: /^Feature block/ });

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

test("the Add panel shows live thumbnails and their HTML, and a click adds after the selected section", async ({ page }) => {
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await addButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page).getByRole("searchbox", { name: "Search components" })).toBeFocused();
  await expect(panel(page)).toContainText("Goes at the end");
  await expect(panel(page).getByRole("group", { name: "Sections" }).getByRole("option")).toHaveText([/^Feature block\s*<feature-block>$/]);

  // A live thumbnail: the component as the page would show it, in a frame that runs nothing.
  const thumb = panel(page).locator(".pb-thumb__frame").first();
  await expect(thumb).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(page.frameLocator(".pb-add-panel .pb-thumb__frame").first().getByRole("heading", { name: "A feature worth sharing" })).toBeAttached();
  await expect(panel(page).locator(".pb-thumb").first()).toHaveClass(/is-ready/);

  // Code is never hidden: the HTML it adds shows for the item under the pointer, or under every item.
  await feature(page).hover();
  const peek = panel(page).locator(".pb-add-panel__peek");
  await expect(peek).toBeVisible();
  await expect(peek.locator("pre")).toHaveText(instance.replaceAll("\n  ", "\n"));
  const code = panel(page).getByRole("button", { name: "Show HTML" });
  await code.click();
  await expect(code).toHaveAttribute("aria-pressed", "true");
  await expect(peek).toBeHidden();
  await expect(panel(page).locator(".pb-add-item__code")).toHaveText(instance.replaceAll("\n  ", "\n"));
  await code.click();
  await expect(panel(page).locator(".pb-add-item__code")).toBeHidden();

  // With the hero selected, a click adds right after it; the panel stays.
  await frame(page).locator("section.hero").click({ position: { x: 5, y: 5 } });
  await expect(panel(page)).toContainText("Goes before “Reusable cards");
  await feature(page).click();
  await expect(frame(page).locator("section.hero + feature-block + section.cards")).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Feature block added");
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__kind")).toHaveText("Feature block");
  // Highlighted for a moment, and the next click goes after the new one.
  await expect(page.locator(".pb-flash")).toBeVisible();
  await expect(page.locator(".pb-flash")).toBeHidden({ timeout: 5000 });
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Goes before “Reusable cards");
  await expect.poll(() => editorText(page)).toBe(indexSource.replace(`  <section class="cards"`, `  ${instance}\n  <section class="cards"`));

  // Escape closes it, back to "+ Add".
  await feature(page).focus();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(addButton(page)).toBeFocused();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("an item dragged onto the canvas goes into the gap under the pointer; Escape cancels a drag", async ({ page }) => {
  await addButton(page).click();
  await frame(page).locator("section.filler h2").scrollIntoViewIfNeeded();
  const option = feature(page);
  const from = (await option.boundingBox())!;
  const filler = (await frame(page).locator("section.filler").boundingBox())!;

  // Escape while dragging: nothing is added.
  await page.mouse.move(from.x + 30, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 60, { steps: 4 });
  await page.mouse.move(filler.x + filler.width / 2, filler.y + 4, { steps: 6 });
  const target = page.locator(".insert-point.is-target");
  await expect(target).toHaveCount(1);
  await expect(target.locator(".insert-point__drop")).toHaveText("Add “Feature block” here");
  await expect(page.locator(".pb-drag-ghost")).toHaveText("Feature block");
  await page.keyboard.press("Escape");
  await expect(target).toHaveCount(0);
  await expect(page.locator(".pb-drag-ghost")).toHaveCount(0);
  await page.mouse.up();
  await expect(frame(page).locator("feature-block")).toHaveCount(0);
  await expect(panel(page)).toBeVisible();

  // Released over the gap between the cards and the filler: added there.
  const again = (await frame(page).locator("section.filler").boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 60, { steps: 4 });
  await page.mouse.move(again.x + again.width / 2, again.y + 4, { steps: 6 });
  await expect(target).toHaveCount(1);
  await page.mouse.up();
  await expect(frame(page).locator("section.cards + feature-block + section.filler")).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Feature block added");
  await expect(target).toHaveCount(0);
  await expect.poll(() => editorText(page)).toBe(indexSource.replace(`  <section class="filler"`, `  ${instance}\n  <section class="filler"`));
  // One undo step.
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame(page).locator("feature-block")).toHaveCount(0);
});

test("a plus between sections opens the panel for its gap, and it closes after adding", async ({ page }) => {
  await frame(page).locator("section.hero").hover();
  const plus = page.getByRole("button", { name: "Add a section before “A native browser preview”", exact: true });
  await plus.click();
  await expect(plus).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toContainText("Goes before “A native browser preview”");
  // "+ Add" is not the opener here.
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(feature(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeHidden();
  await expect(frame(page).locator("main > feature-block:first-child + section.hero")).toHaveCount(1);
  await expect(plus).toHaveAttribute("aria-expanded", "false");
});
