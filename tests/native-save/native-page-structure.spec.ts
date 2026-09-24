import { expect, test, type Page } from "@playwright/test";

// The page structure sidebar: the rendered page's elements as a tree that
// follows the preview's selection, selects in the preview, folds, and keeps
// up with route changes and structural edits.
const indexPath = "src/pages/index.html";
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const row = (page: Page, name: string | RegExp) => tree(page).getByRole("treeitem", { name, exact: typeof name === "string" });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const select = (page: Page, selector: string) =>
  page.frameLocator(".native-preview-frame").locator(selector).evaluate((el) => (el as HTMLElement).click());

test("the sidebar lists the page's elements and marks the one selected in the preview", async ({ page }) => {
  // Top level: the header component, main, the footer component.
  const top = tree(page).locator("[role='treeitem'][aria-level='1']");
  await expect(top).toHaveText(["Site header", "Main", "Site footer"]);
  // Sections are named by their first heading; one without a heading by its kind alone.
  const sections = tree(page).locator("[role='treeitem'][aria-level='2']");
  await expect(sections).toHaveText(["Section A native browser preview", "Section", "Section Scroll to verify"]);
  // A component instance is named by the heading in its shadow root, with the page's slotted text.
  await expect(row(page, "Project card Reusable cards")).toBeVisible();
  await expect(row(page, "Project card Reusable cards").locator("+ [role='group'] [role='treeitem']")).toHaveText(["Text Reusable cards", /^Paragraph/]);
  await expect(row(page, /^Image/)).toHaveAttribute("aria-level", "3");

  await select(page, ".hero h1");
  await expect(row(page, "Heading A native browser preview")).toHaveAttribute("aria-selected", "true");
  await expect(tree(page).locator("[aria-selected='true']")).toHaveCount(1);
  await select(page, "section.filler p:nth-of-type(2)");
  await expect(row(page, /^Paragraph Paragraph two of filler/)).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "Heading A native browser preview")).toHaveAttribute("aria-selected", "false");
});

test("a row selects its element in the preview, brings it into view and opens its controls", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const filler = frame.locator("section.filler");
  // The filler section starts below the first screen of the frame.
  expect((await filler.boundingBox())!.y).toBeGreaterThan(frameBox.y + frameBox.height);

  await row(page, "Section Scroll to verify").click();
  await expect(row(page, "Section Scroll to verify")).toHaveAttribute("aria-selected", "true");
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("button", { name: "Move down" })).toBeDisabled();
  await expect.poll(async () => {
    const box = (await filler.boundingBox())!;
    return box.y < frameBox.y + frameBox.height && box.y + box.height > frameBox.y;
  }).toBe(true);
  // Arrow keys walk the visible rows; Enter selects.
  await expect(row(page, "Section Scroll to verify")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "Heading Scroll to verify")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(row(page, "Heading Scroll to verify")).toHaveAttribute("aria-selected", "true");
  // Left goes to the parent; Left again folds it, Right unfolds.
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Section Scroll to verify")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row(page, "Section Scroll to verify")).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "Heading Scroll to verify")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(row(page, "Heading Scroll to verify")).toBeVisible();
  // The chevron folds without selecting.
  await row(page, "Section A native browser preview").locator(".page-structure__toggle").click();
  await expect(row(page, "Section A native browser preview")).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "Section A native browser preview")).toHaveAttribute("aria-selected", "false");
});

test("the tree follows the preview route and structural edits", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await select(page, "section.cards");
  await bar(page).getByRole("button", { name: "Duplicate" }).click();
  await expect(frame.locator("section.cards")).toHaveCount(2);
  await expect(tree(page).locator("[role='treeitem'][aria-level='2']")).toHaveText([
    "Section A native browser preview", "Section", "Section", "Section Scroll to verify",
  ]);
  // The copy is selected, so its row is marked.
  await expect(tree(page).locator("[role='treeitem'][aria-level='2']").nth(2)).toHaveAttribute("aria-selected", "true");

  // Ctrl/⌘+click follows the link in the preview; the open file stays.
  await frame.locator("site-header a", { hasText: "About" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(row(page, "Heading About this project")).toBeVisible();
  await expect(row(page, "Section Scroll to verify")).toHaveCount(0);
  await expect(tree(page).locator("[aria-selected='true']")).toHaveCount(0);
  // A row on the About page opens that file and selects there.
  await row(page, "Heading About this project").click();
  await expect(page.locator("#current-page")).toHaveText("src/pages/about.html");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(row(page, "Heading About this project")).toHaveAttribute("aria-selected", "true");
});
