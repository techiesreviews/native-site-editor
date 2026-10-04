import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Alt+Up and Alt+Down move the selected section one sibling position from
// the preview, the edit bar and the page structure sidebar: one undo step,
// nothing at the ends; ordinary elements also move among their siblings.
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

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string) => tree(page).getByRole("treeitem", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const sectionOrder = (page: Page) => frame(page).locator("main > section").evaluateAll((els) => els.map((el) => el.className));
const select = (page: Page, selector: string) => frame(page).locator(selector).evaluate((el) => (el as HTMLElement).click());
async function undo(page: Page) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
}

test("Alt+Up/Down in the preview moves the selected section as one undo step and stops at the ends", async ({ page }) => {
  await select(page, "section.cards");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(bar(page).getByRole("button", { name: "Move up" })).toBeDisabled();
  // First already: nothing happens, and nothing to undo but the one move.
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["cards", "hero", "filler"]);
  await expect(status(page)).toHaveText("");
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  await select(page, "section.cards");
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(bar(page).getByRole("button", { name: "Move down" })).toBeDisabled();
  await page.locator(".native-preview-frame").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // A heading is an atom: it stays where it is and the key is not intercepted
  // (the click also starts typing in it, where Alt+arrows belong to the caret).
  await frame(page).locator(".hero h1").click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(frame(page).locator("section.hero > h1:first-child")).toHaveCount(1);
  await expect(status(page)).toHaveText("");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("Alt+Up/Down with focus in the edit bar moves the section and keeps focus on the same button", async ({ page }) => {
  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "Duplicate" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(bar(page).getByRole("button", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(bar(page).getByRole("button", { name: "Duplicate" })).toBeFocused();
  // Two moves, two undo steps.
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // Ordinary paragraphs move among their siblings without moving the section.
  await select(page, "section.filler p:nth-of-type(2)");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await status(page).evaluate((el) => { el.textContent = ""; });
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(status(page)).toHaveText("Element moved");
  await expect(bar(page).getByRole("button", { name: "Bold" })).toBeFocused();
  await expect.poll(() => frame(page).locator("section.filler > p").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-key")))).toEqual(["filler-2", "filler-1", "filler-3", "filler-4", "filler-5"]);
  const first = indexSource.match(/<p data-key="filler-1">[^<]*<\/p>/)![0];
  const second = indexSource.match(/<p data-key="filler-2">[^<]*<\/p>/)![0];
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource.replace(`${first}\n    ${second}`, `${second}\n    ${first}\n    `));
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("Alt+Up/Down on a page structure row moves the section and keeps its row focused", async ({ page }) => {
  const sections = tree(page).locator("[role='treeitem'][aria-level='2']");
  await row(page, "Section").click();
  await expect(row(page, "Section")).toBeFocused();
  // The bar shows once the page's source is mounted, which the move needs.
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(sections).toHaveText(["Section A native browser preview", "Section Scroll to verify", "Section"]);
  await expect(row(page, "Section")).toBeFocused();
  await expect(row(page, "Section")).toHaveAttribute("aria-selected", "true");
  // Last already: nothing happens and focus stays put.
  const edgeSource = await editorText(page, "#content");
  await row(page, "Section").focus();
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("");
  await expect.poll(() => editorText(page, "#content")).toBe(edgeSource);
  await row(page, "Section").focus();
  await expect(row(page, "Section")).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect(status(page)).toHaveText("Moved up");
  await expect(row(page, "Section")).toBeFocused();
  await undo(page);
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);

  // Ordinary heading moves consume the key and preserve the selected row.
  await row(page, "Section A native browser preview").locator(".page-structure__toggle").click();
  await row(page, "Heading A native browser preview").click();
  await status(page).evaluate((el) => { el.textContent = ""; });
  await page.keyboard.press("Alt+ArrowDown");
  await expect(status(page)).toHaveText("Element moved");
  await expect(row(page, "Heading A native browser preview")).toBeFocused();
  await expect(frame(page).locator("section.hero > p:first-child + h1")).toHaveCount(1);
  const heading = indexSource.match(/    <h1[^>]*>[^<]*<\/h1>\n/)![0];
  const paragraph = indexSource.match(/    <p[^>]*class="lead"[^>]*>[^<]*<\/p>\n/)![0];
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource.replace(heading + paragraph, "    \n" + paragraph + heading));
  await undo(page);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});

test("Alt+Down on a page structure row while a component file is open opens the page first, then moves the section", async ({ page }) => {
  // Shared parts open their template only after explicit Edit component intent.
  await row(page, "Section").locator(".page-structure__toggle").click();
  await tree(page).getByRole("treeitem", { name: /^Project card Reusable cards(?: Edit component Disconnect this instance)?$/ }).locator(".page-structure__label").click();
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await frame(page).locator("project-card article").first().click({position:{x:5,y:5}});
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/project-card/project-card.html");
  await expect(tree(page)).toBeVisible();
  // Focus the section's row without clicking it (a click would open the page by itself).
  await row(page, "Section").evaluate((el) => (el as HTMLElement).focus());
  await expect(row(page, "Section")).toBeFocused();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "filler", "cards"]);
  await expect(status(page)).toHaveText("Moved down");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(row(page, "Section")).toBeFocused();
  await undo(page);
  await expect.poll(() => sectionOrder(page)).toEqual(["hero", "cards", "filler"]);
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
});
