import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Page block in the structure sidebar: the title and description of the
// route on show, applied as typed into the page's leading comment, which
// Save to GitHub lists and commits with the page. A title the manifest still
// gives the route wins, shows in the field, and goes from the manifest when
// the field is edited.
const indexPath = "src/pages/index.html";
const manifestPath = ".astro-editor/native.json";
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;
const manifestSource = readFileSync(resolve("fixtures/native-starter", manifestPath), "utf8");

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const block = (page: Page) => page.getByRole("group", { name: "Page" });
const title = (page: Page) => block(page).getByLabel("Title");
const description = (page: Page) => block(page).getByLabel("Description");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save to GitHub", exact: true });
const changesDialog = (page: Page) => page.getByRole("dialog", { name: manifestPath });
const code = (page: Page) => page.locator("#content .view-lines");

async function openSaveMenu(page: Page) {
  await saveTrigger(page).click();
  await expect(page.locator("#publish-files")).toBeVisible();
}
async function closeSaveMenu(page: Page) {
  if (await changesDialog(page).isVisible()) {
    await page.keyboard.press("Escape");
    await expect(changesDialog(page)).toBeHidden();
  }
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
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  await page.getByRole("tab", { name: "Files" }).click();
  for (const part of ["src", "components", "feature-block", "feature-block.html"]) {
    const item = page.locator("#explorer").getByRole("button", { name: part, exact: true }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (part === "feature-block.html" || (await item.getAttribute("aria-expanded")) === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/components/feature-block/feature-block.html");
  await expect(page.locator("#structure .sidebar-hint")).toContainText("component by itself", { timeout: 30_000 });
  await expect(block(page)).toBeHidden();
});

test("typing a title writes the page's comment; emptying both fields removes it", async ({ page }) => {
  await title(page).fill("Home");
  await expect(page.locator("#status")).toHaveText("Title updated");
  await expect(code(page)).toContainText("title: Home");
  await openSaveMenu(page);
  await expect(page.locator("#publish-files")).toContainText(indexPath);
  await expect(page.locator("#publish-files")).not.toContainText(manifestPath);
  await expect(page.locator("#publish-files .publish-menu__changes")).toHaveText("3 added, 0 removed");
  await closeSaveMenu(page);

  await description(page).fill("The home page");
  await expect(page.locator("#status")).toHaveText("Description updated");
  await expect(code(page)).toContainText("description: The home page");
  // The comment is not part of the page on show.
  await expect(page.frameLocator(".native-preview-frame").locator("body")).not.toContainText("The home page");

  await title(page).fill("");
  await expect(page.locator("#status")).toHaveText("Title removed");
  await description(page).fill("");
  await expect(page.locator("#status")).toHaveText("Description removed");
  await expect(code(page)).not.toContainText("<!--");
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
  await expect(page.locator("#publish-files .publish-menu__file")).toHaveCount(2);
});

test("a typed title survives a reload, and saving commits it in the page", async ({ page }) => {
  await title(page).fill("Home");
  await expect(page.locator("#status")).toHaveText("Title updated");
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(title(page)).toHaveValue("Home");

  await openSaveMenu(page);
  const files = page.locator("#publish-files .publish-menu__file");
  await expect(files).toHaveCount(1);
  await expect(files).toContainText(indexPath);
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
});

test("a manifest draft is not rebased onto a manifest that changed on GitHub: fields it titles close until the conflict is settled", async ({ page, baseURL }) => {
  // The manifest titles the home page on GitHub.
  const titled = manifestSource.replace('"/": "src/pages/index.html"', '"/": { "file": "src/pages/index.html", "title": "Home" }');
  expect(titled).not.toBe(manifestSource);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: manifestPath, content: titled } });
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(title(page)).toHaveValue("Home");
  // Editing it writes the comment and takes the title out of the manifest: a manifest draft.
  await title(page).fill("Start");
  await expect(page.locator("#status")).toHaveText("Title updated");

  // A teammate gives About a title on the branch, so the manifest draft's base is stale.
  const changed = titled.replace('"/about/": "src/pages/about.html"', '"/about/": { "file": "src/pages/about.html", "title": "About us" }');
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: manifestPath, content: changed } });
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  // GitHub's manifest titles both pages: their fields show that, closed, with the notice.
  const notice = block(page).getByRole("status");
  await expect(notice).toHaveText("The manifest changed on GitHub. Open .astro-editor/native.json to review.");
  await expect(title(page)).toHaveValue("Home");
  await expect(title(page)).toBeDisabled();
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Heading About this project" })).toBeVisible();
  await expect(title(page)).toHaveValue("About us");
  await expect(title(page)).toBeDisabled();

  // Opening the manifest shows the code editor's conflict bar; discarding the
  // draft settles it and the fields open again on GitHub's text.
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files" }).click();
  for (const part of [".astro-editor", "native.json"]) {
    const item = page.locator("#explorer").getByRole("button", { name: part, exact: true }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (part === "native.json" || (await item.getAttribute("aria-expanded")) === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", manifestPath);
  await expect(page.locator("#content .code-editor__conflict")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#editor-toolbar-host").getByRole("button", { name: "Discard changes" }).click();
  await expect(page.locator("#content .code-editor__conflict")).toBeHidden();
  await expect(notice).toBeHidden();
  await expect(title(page)).toBeEnabled();
  await expect(title(page)).toHaveValue("About us");
  await expect(changesDialog(page)).toBeHidden();
});
