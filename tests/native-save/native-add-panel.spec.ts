import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Add panel (src/page-builder/add-panel.ts): the top bar's "+ Add" docks
// it over the page structure, listing each section component as a live
// thumbnail; a click inserts after the selected
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
const addButton = (page: Page) => page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true });
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

test("the Add panel shows live thumbnails without HTML previews, and a click adds after the selected section", async ({ page }) => {
  await expect(page.locator(".topbar").getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await addButton(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page).getByRole("searchbox", { name: "Search elements and components" })).toBeFocused();
  await expect(panel(page)).toContainText("Goes at the end");
  await expect(panel(page).getByRole("group", { name: "More sections" }).getByRole("option")).toHaveText([/^Feature block\s*<feature-block>$/]);

  // A live thumbnail: the component as the page would show it, in a frame that runs nothing.
  const thumb = feature(page).locator(".pb-thumb__frame");
  await expect(thumb).toHaveAttribute("sandbox", "allow-same-origin");
  await expect(feature(page).frameLocator(".pb-thumb__frame").getByRole("heading", { name: "A feature worth sharing" })).toBeAttached();
  await expect(feature(page).locator(".pb-thumb")).toHaveClass(/is-ready/);

  await feature(page).hover();
  await feature(page).focus();
  await expect(panel(page).getByRole("button", { name: "Show HTML" })).toHaveCount(0);
  await expect(panel(page).locator(".pb-add-panel__peek, .pb-add-item__code, .pb-add-panel__code-toggle")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Source editor", exact: true }).first()).toBeVisible();

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
  await option.scrollIntoViewIfNeeded();
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

test("with an element of a component's template selected, a click adds after the page's instance of it", async ({ page }) => {
  // A note inside a card's template inside the cards section: the section is the page's.
  // Entering a template takes an explicit Edit (a plain click selects the page's instance).
  const tree = page.getByRole("tree", { name: "Page structure", exact: true });
  await tree.getByRole("treeitem", { name: "Section", exact: true }).locator(".page-structure__toggle").click();
  const card = tree.getByRole("treeitem", { name: /^Project card Reusable cards/ }).first();
  await card.locator(".page-structure__toggle").click();
  await card.getByRole("button", { name: "Edit component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await frame(page).locator("section.cards project-card card-note p").first().click({ position: { x: 5, y: 5 } });
  await expect(page.locator("#current-page")).not.toHaveAttribute("data-path", indexPath);
  await addButton(page).click();
  await expect(panel(page)).toContainText("Goes before “Scroll to verify”");
  await feature(page).click();
  await expect(frame(page).locator("section.cards + feature-block + section.filler")).toHaveCount(1);
  await expect.poll(() => editorText(page)).toBe(indexSource.replace(`  <section class="filler"`, `  ${instance}\n  <section class="filler"`));
});

test("while History shows an earlier version nothing can be added, until Back to latest", async ({ page, baseURL }) => {
  const source = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: "index.html", content: source.replace("A native browser preview", "Edited on GitHub") },
  });
  await page.reload();
  await expect(frame(page).locator(".hero h1")).toHaveText("Edited on GitHub", { timeout: 30_000 });
  await addButton(page).click();
  await expect(panel(page)).toBeVisible();
  await page.locator("#history-button").click();
  await page.getByRole("dialog", { name: "History" }).locator(".commit-history__item").nth(1).locator(".commit-history__view").click();
  const bar = page.getByRole("region", { name: "Earlier version" });
  await expect(frame(page).locator(".hero h1")).toHaveText("A native browser preview");
  // The panel closed, "+ Add" waits, and the gaps of the old version offer nothing.
  await expect(panel(page)).toBeHidden();
  await expect(addButton(page)).toBeDisabled();
  await expect(page.locator(".insert-point__plus")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await bar.getByRole("button", { name: "Back to latest" }).click();
  await expect(frame(page).locator(".hero h1")).toHaveText("Edited on GitHub");
  await expect(addButton(page)).toBeEnabled();
  await expect(page.locator(".insert-point__plus")).toHaveCount(4);
  await addButton(page).click();
  await feature(page).click();
  await expect(frame(page).locator("section.filler + feature-block")).toHaveCount(1);
});

test("a plus between sections opens the panel for its gap, and it closes after adding", async ({ page }) => {
  await frame(page).locator("section.hero").hover();
  const plus = page.getByRole("button", { name: "Add a section before “A native browser preview”", exact: true });
  await plus.click();
  await expect(plus).toHaveAttribute("aria-expanded", "true");
  await expect(panel(page)).toContainText("Goes before “A native browser preview”");
  // "+ Add" is not the opener here.
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await panel(page).getByRole("searchbox").fill("Feature block");
  await page.keyboard.press("ArrowDown");
  await expect(feature(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeHidden();
  await expect(frame(page).locator("main > feature-block:first-child + section.hero")).toHaveCount(1);
  await expect(plus).toHaveAttribute("aria-expanded", "false");
});
