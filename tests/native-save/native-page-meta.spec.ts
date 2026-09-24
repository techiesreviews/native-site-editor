import { expect, test, type Page } from "@playwright/test";

// The Page block in the structure sidebar: the manifest's title and
// description for the route on show, applied as typed into a draft of
// `.astro-editor/native.json` that Save to GitHub lists and commits.
const indexPath = "src/pages/index.html";
const manifestPath = ".astro-editor/native.json";
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const block = (page: Page) => page.getByRole("group", { name: "Page" });
const title = (page: Page) => block(page).getByLabel("Title");
const description = (page: Page) => block(page).getByLabel("Description");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save to GitHub", exact: true });
const diffAdded = (page: Page) => page.locator("#publish-files .publish-menu__diff-line.is-add");
const diffRemoved = (page: Page) => page.locator("#publish-files .publish-menu__diff-line.is-del");

async function openSaveMenu(page: Page) {
  await saveTrigger(page).click();
  await expect(page.locator("#publish-files")).toBeVisible();
}
async function closeSaveMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("#publish-files")).toBeHidden();
}
const follow = (page: Page, name: string) =>
  page.frameLocator(".native-preview-frame").locator("site-header a", { hasText: name }).click({ modifiers: ["ControlOrMeta"] });

test("the fields are empty for a bare route and absent for a component alone", async ({ page }) => {
  await expect(block(page)).toBeVisible();
  await expect(title(page)).toHaveValue("");
  await expect(description(page)).toHaveValue("");
  // The block sits above the tree.
  const blockBox = (await block(page).boundingBox())!;
  const treeBox = (await tree(page).boundingBox())!;
  expect(blockBox.y + blockBox.height).toBeLessThanOrEqual(treeBox.y);

  // A component no page uses shows by itself: no route, so no Page fields.
  await page.locator("#explorer-toggle").click();
  for (const part of ["src", "components", "feature-block", "feature-block.html"]) {
    const item = page.locator("#explorer").getByRole("button", { name: part, exact: true }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (part === "feature-block.html" || (await item.getAttribute("aria-expanded")) === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveText("src/components/feature-block/feature-block.html");
  await expect(page.locator("#structure .sidebar-hint")).toContainText("component by itself", { timeout: 30_000 });
  await expect(block(page)).toBeHidden();
});

test("typing a title writes the object form into a manifest draft; emptying both fields restores the bare route", async ({ page }) => {
  await title(page).fill("Home");
  await expect(page.locator("#status")).toHaveText("Title updated");
  await openSaveMenu(page);
  await expect(page.locator("#publish-files")).toContainText(manifestPath);
  await expect(diffRemoved(page)).toContainText('"/": "src/pages/index.html",');
  await expect(diffAdded(page)).toContainText('"/": { "file": "src/pages/index.html", "title": "Home" },');
  await expect(page.locator("#publish-files .publish-menu__changes")).toContainText("1 added, 1 removed");
  await closeSaveMenu(page);

  await description(page).fill("The home page");
  await expect(page.locator("#status")).toHaveText("Description updated");
  await openSaveMenu(page);
  await expect(diffAdded(page)).toContainText('"/": { "file": "src/pages/index.html", "title": "Home", "description": "The home page" },');
  await closeSaveMenu(page);

  // Emptying one field removes it; emptying the other leaves the bare route, so no draft.
  await title(page).fill("");
  await expect(page.locator("#status")).toHaveText("Title removed");
  await openSaveMenu(page);
  await expect(diffAdded(page)).toContainText('"/": { "file": "src/pages/index.html", "description": "The home page" },');
  await closeSaveMenu(page);
  await description(page).fill("");
  await expect(page.locator("#status")).toHaveText("Description removed");
  await saveTrigger(page).hover();
  await expect(saveTrigger(page)).toBeDisabled();
});

test("the fields follow the preview route and keep what was typed on each page", async ({ page }) => {
  await title(page).fill("Home");
  await page.keyboard.press("Enter");
  await expect(title(page)).not.toBeFocused();
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Heading About this project" })).toBeVisible();
  await expect(title(page)).toHaveValue("");
  await title(page).fill("About");
  await description(page).fill("Who made this");
  await follow(page, "Home");
  await expect(tree(page).getByRole("treeitem", { name: "Heading A native browser preview" })).toBeVisible();
  await expect(title(page)).toHaveValue("Home");
  await expect(description(page)).toHaveValue("");
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Heading About this project" })).toBeVisible();
  await expect(title(page)).toHaveValue("About");
  await expect(description(page)).toHaveValue("Who made this");
  await openSaveMenu(page);
  await expect(diffAdded(page)).toHaveCount(2);
  await expect(diffAdded(page).nth(0)).toContainText('"/": { "file": "src/pages/index.html", "title": "Home" },');
  await expect(diffAdded(page).nth(1)).toContainText('"/about/": { "file": "src/pages/about.html", "title": "About", "description": "Who made this" }');
});

test("a typed title survives a reload, and saving the manifest commits it", async ({ page }) => {
  await title(page).fill("Home");
  await expect(page.locator("#status")).toHaveText("Title updated");
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(title(page)).toHaveValue("Home");

  await openSaveMenu(page);
  const files = page.locator("#publish-files .publish-menu__file");
  await expect(files).toHaveCount(1);
  await expect(files).toContainText(manifestPath);
  await files.locator("input").check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await closeSaveMenu(page);
  await expect(title(page)).toHaveValue("Home");
  await saveTrigger(page).hover();
  await expect(saveTrigger(page)).toBeDisabled();
  // Saved on the branch: a fresh load reads it from GitHub, with no draft left.
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(title(page)).toHaveValue("Home");
  await expect(saveTrigger(page)).toBeDisabled();
  // And a change on top of the committed text is a fresh draft against it.
  await description(page).fill("The home page");
  await openSaveMenu(page);
  await expect(diffRemoved(page)).toContainText('"/": { "file": "src/pages/index.html", "title": "Home" },');
  await expect(diffAdded(page)).toContainText('"title": "Home", "description": "The home page" },');
});
