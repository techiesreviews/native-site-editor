import { publishButton, showPublish } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Page details live in the page's <head>: the Page block's Title and
// Description, and the Pages tab's Rename, write its <title> and
// <meta name="description"> (og:title and og:description along; see
// shared/native-project.ts `nativePageWithDetail`) as typed, and Save to
// GitHub commits them with the page; a Files-tab rename of a page updates
// the links to it like Change URL. The starter (id 501), `native-routing`
// (id 530) and `native-conventions` (id 531).
const fernPath = "work/fern-and-kettle/index.html";
const routingRepo = "native-demo-user/native-routing";
const starterHome = readFileSync(resolve("fixtures/native-starter/index.html"), "utf8");
const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const row = (page: Page, name: string) => explorer(page).getByRole("button", { name, exact: true });
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const block = (page: Page) => page.getByRole("group", { name: "Page" });
const title = (page: Page) => block(page).getByLabel("Title");
const description = (page: Page) => block(page).getByLabel("Description");
const undo = (page: Page) => page.locator(".code-editor__undo").first();
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const code = (page: Page) => page.locator("#content .view-lines");
const saveTrigger = publishButton;
const follow = (page: Page, name: string) =>
  frame(page).locator("site-header a", { hasText: name }).click({ modifiers: ["ControlOrMeta"] });

async function open(page: Page, baseURL: string | undefined, repo: number, file = "index.html") {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
}

// The browser draft of `path`, parsed.
async function draft(page: Page, path: string) {
  return page.evaluate((path) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith("astro-site-editor:draft:v1:") && JSON.parse(key.slice("astro-site-editor:draft:v1:".length))[3] === path);
    return key ? JSON.parse(localStorage.getItem(key)!) : undefined;
  }, path);
}

// A file on the fake GitHub branch, read through the worker's API.
async function branchFile(page: Page, repo: string, path: string): Promise<string | undefined> {
  const snapshot = await (await page.request.get(`/api/snapshot?${new URLSearchParams({ repo, branch: "main" })}`)).json();
  const entry = (snapshot.tree as { path: string; sha: string }[]).find((item) => item.path === path);
  if (!entry) return undefined;
  const file = await (await page.request.get(`/api/file?${new URLSearchParams({ repo, sha: entry.sha })}`)).json();
  return file.content;
}

async function saveAll(page: Page) {
  await showPublish(page);
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
}

async function openExplorer(page: Page, tab: "Pages" | "Files") {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: tab }).click();
}

async function expand(page: Page, path: string) {
  await openExplorer(page, "Files");
  for (const part of path.split("/")) {
    const folder = row(page, part).first();
    await expect(folder).toBeVisible({ timeout: 20_000 });
    if ((await folder.getAttribute("aria-expanded")) === "false") await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
  }
}

async function openSaveMenu(page: Page) {
  await showPublish(page);
  await expect(page.locator("#publish-files")).toBeVisible();
}
async function closeSaveMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("#publish-files")).toBeHidden();
}

test("the fields show the page's head, sit above the tree, and are absent for a component alone", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await expect(block(page)).toBeVisible();
  await expect(title(page)).toHaveValue("Native Studio");
  await expect(description(page)).toHaveValue("A small site built from plain HTML, CSS and shared components.");
  await expect(title(page)).toHaveAttribute("placeholder", "A native browser preview");
  const blockBox = (await block(page).boundingBox())!;
  const treeBox = (await tree(page).boundingBox())!;
  expect(blockBox.y + blockBox.height).toBeLessThanOrEqual(treeBox.y);

  // A component no page uses shows by itself: no page, so no Page fields.
  await expand(page, "components/feature-block");
  await row(page, "feature-block.html").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/feature-block/feature-block.html");
  await expect(page.locator("#structure .sidebar-hint")).toContainText("component by itself", { timeout: 30_000 });
  await expect(block(page)).toBeHidden();
});

test("typing a title and a description writes the head, og tags along, one undo step each; back as it was, nothing to save", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await title(page).fill("Home & <more>");
  await expect(status(page)).toHaveText("Title updated");
  await expect(code(page)).toContainText("<title>Home &amp; &lt;more></title>");
  await expect(page.locator("#current-page")).toHaveText("Home");
  await page.keyboard.press("Enter");
  await description(page).fill('The "home" page');
  await expect(status(page)).toHaveText("Description updated");
  await page.keyboard.press("Enter");
  const written = (await draft(page, "index.html")).content;
  expect(written).toBe(starterHome
    .replace("<title>Native Studio</title>", "<title>Home &amp; &lt;more></title>")
    .replace('<meta property="og:title" content="Native Studio">', '<meta property="og:title" content="Home &amp; <more>">')
    .replace(/content="A small site built from plain HTML, CSS and shared components\."/g, 'content="The &quot;home&quot; page"'));
  // The head never shows in the preview.
  await expect(frame(page).locator("body")).not.toContainText('"home" page');
  await openSaveMenu(page);
  await expect(page.locator("#publish-files .publish-menu__file")).toHaveCount(1);
  await expect(page.locator("#publish-files")).toContainText("index.html");
  await closeSaveMenu(page);

  // Undo: the description, then the title.
  await undo(page).click();
  await expect(description(page)).toHaveValue("A small site built from plain HTML, CSS and shared components.");
  await undo(page).click();
  await expect(title(page)).toHaveValue("Native Studio");
  expect(await draft(page, "index.html")).toBeUndefined();
  await expect(saveTrigger(page)).toBeDisabled();

  // An emptied title leaves an empty <title>, and the top bar falls back to the heading.
  await open(page, baseURL, 501, "about/index.html");
  await title(page).fill("");
  await expect(status(page)).toHaveText("Title removed");
  await expect(code(page)).toContainText("<title></title>");
  await expect(page.locator("#current-page")).toHaveText("About this project");
});

test("the fields follow the preview's page and keep what was typed on each page", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await title(page).fill("Home");
  await page.keyboard.press("Enter");
  await expect(title(page)).not.toBeFocused();
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Heading About this project" })).toBeVisible();
  await expect(title(page)).toHaveValue("About this project");
  await title(page).fill("About");
  await description(page).fill("Who made this");
  await follow(page, "Home");
  await expect(tree(page).getByRole("treeitem", { name: "Heading A native browser preview" })).toBeVisible();
  await expect(title(page)).toHaveValue("Home");
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Heading About this project" })).toBeVisible();
  await expect(title(page)).toHaveValue("About");
  await expect(description(page)).toHaveValue("Who made this");
  await openSaveMenu(page);
  await expect(page.locator("#publish-files .publish-menu__file")).toHaveCount(2);
});

test("a typed title survives a reload, and saving commits it in the page", async ({ page, baseURL }) => {
  await open(page, baseURL, 530, fernPath);
  await expect(title(page)).toHaveValue("Fern & Kettle");
  await title(page).fill("Fern & Kettle café");
  await expect(status(page)).toHaveText("Title updated");
  await page.reload();
  await expect(title(page)).toHaveValue("Fern & Kettle café", { timeout: 30_000 });
  await saveAll(page);
  expect(await branchFile(page, routingRepo, fernPath)).toContain("<title>Fern &amp; Kettle café</title>");
  await expect(saveTrigger(page)).toBeDisabled();
  // Saved on the branch: a fresh load reads it from GitHub, with no draft left.
  await page.reload();
  await expect(title(page)).toHaveValue("Fern & Kettle café", { timeout: 30_000 });
  await expect(page.locator("#current-page")).toHaveText("Fern & Kettle café");
  await expect(saveTrigger(page)).toBeDisabled();
});

test("a description a page lacks is added after its title; the Pages tab's Rename writes the title", async ({ page, baseURL }) => {
  await open(page, baseURL, 531, "notes/first-note/index.html");
  await expect(title(page)).toHaveValue("The first note");
  await expect(description(page)).toHaveValue("");
  await description(page).fill("Notes, the first.");
  await expect(status(page)).toHaveText("Description updated");
  await page.keyboard.press("Enter");
  expect((await draft(page, "notes/first-note/index.html")).content).toContain('  <title>The first note</title>\n  <meta name="description" content="Notes, the first.">\n');

  await openExplorer(page, "Pages");
  const note = item(page, "The first note");
  await note.focus();
  await page.keyboard.press("F2");
  const field = explorer(page).getByRole("textbox", { name: "Title of The first note" });
  await field.fill("Note one");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed The first note to Note one");
  await expect(item(page, "Note one")).toBeVisible();
  expect((await draft(page, "notes/first-note/index.html")).content).toContain("<title>Note one</title>");
});

test("renaming a page's folder in the Files tab updates the links to it and can keep its old URL working", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "work");
  await row(page, "fern-and-kettle").focus();
  await page.keyboard.press("F2");
  await explorer(page).getByRole("textbox", { name: "New name for work/fern-and-kettle" }).fill("fern");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Rename work/fern-and-kettle to work/fern?" });
  await expect(dialog).toContainText("Its URL changes from /work/fern-and-kettle/ to /work/fern/.");
  await expect(dialog).toContainText("Updates 1 link in 1 file.");
  const keep = dialog.getByRole("checkbox", { name: "Keep the old URL working (/work/fern-and-kettle/ redirects to /work/fern/)" });
  await expect(keep).toBeChecked();
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(status(page)).toHaveText("Renamed the folder work/fern-and-kettle to work/fern — 1 link updated in 1 file; /work/fern-and-kettle/ redirects there.");
  expect((await draft(page, "work/index.html")).content).toContain('href="/work/fern/"');
  expect((await draft(page, "_redirects")).content).toBe("/work/fern-and-kettle/ /work/fern/ 301\n");
  // The page's own address follows it, on the host it names (the site has no address set).
  const moved = (await draft(page, "work/fern/index.html")).content;
  expect(moved).toContain('<link rel="canonical" href="https://routing.example/work/fern/">');
  expect(moved).toContain('<meta property="og:url" content="https://routing.example/work/fern/">');
  await page.keyboard.press("Escape");
  await expect(explorer(page)).toBeHidden();
  // The updated link leads to the page at its new URL.
  await frame(page).getByRole("link", { name: "Our work" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Work");
  await frame(page).getByRole("link", { name: "Fern and Kettle" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");
  await expect(page.locator(".native-preview-error")).toBeHidden();
});
