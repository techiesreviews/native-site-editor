import { publishButton, showPublish } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Page details live in the page's <head>: Page settings Title and
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

// Reloads, then waits until the workspace has opened `file` again: the page
// is current, its preview shown and the repository status read, so the
// explorer toggle acts on the loaded app rather than the loading shell.
async function reloaded(page: Page, file: string) {
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText(/ with main/, { timeout: 30_000 });
}

// The browser draft of `path`, parsed.
const draft = storedDraft;

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

test("Page settings shows the page head and keeps metadata fields out of the structure sidebar", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await readSetting(page, "Title", "Native Studio");
  await readSetting(page, "Description", "A small site built from plain HTML, CSS and shared components.");
  await expect(page.locator("#structure").getByLabel("Title", { exact: true })).toHaveCount(0);
  await expect(tree(page)).toBeVisible();

  // A component no page uses shows by itself: no page, so no Page fields.
  await expand(page, "components/feature-block");
  await row(page, "feature-block.html").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/feature-block/feature-block.html");
  await expect(page.locator("#structure .sidebar-hint")).toContainText("component by itself", { timeout: 30_000 });
  const componentPath = "components/feature-block/feature-block.html";
  const before = await page.evaluate(async path => {
    const { getMountedSource } = await import('/src/components/code-editor.ts');
    return getMountedSource(path);
  }, componentPath);
  expect(before).toBe(readFileSync(resolve('fixtures/native-starter', componentPath), 'utf8'));
  const homeDraft = await draft(page, 'index.html');
  const componentDraft = await draft(page, componentPath);
  await openExplorer(page, "Pages");
  const gear = page.locator("#page-settings-toggle");
  // The refusal status is the completed handler outcome, so this negative
  // dialog assertion cannot pass before asynchronous settings work finishes.
  await expect(gear).toBeEnabled();
  await gear.click();
  await expect(status(page)).toHaveText("Open a page to edit its settings.");
  await expect(settingsDialog(page)).toBeHidden();
  expect(await draft(page, 'index.html')).toEqual(homeDraft);
  expect(await draft(page, componentPath)).toEqual(componentDraft);
  expect(await page.evaluate(async path => {
    const { getMountedSource } = await import('/src/components/code-editor.ts');
    return getMountedSource(path);
  }, componentPath)).toEqual(before);
});

test("Page settings Title keeps the first heading as its placeholder", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await openSettings(page);
  await expect(settingsDialog(page).getByLabel("Title", { exact: true })).toHaveAttribute("placeholder", "A native browser preview");
});

test("typing a title and a description writes the head, og tags along, one undo step each; back as it was, nothing to save", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await writeSetting(page, "Title", "Home & <more>");
  await expect(status(page)).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  await expect(code(page)).toContainText("<title>Home &amp; &lt;more&gt;</title>");
  await expect(page.locator("#current-page")).toHaveText("Home");
  await writeSetting(page, "Description", 'The "home" page');
  await expect(status(page)).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  const written = (await draft(page, "index.html")).content;
  expect(written).toBe(starterHome
    .replace("<title>Native Studio</title>", "<title>Home &amp; &lt;more&gt;</title>")
    .replace('<meta property="og:title" content="Native Studio">', '<meta property="og:title" content="Home &amp; &lt;more&gt;">')
    .replace(/content="A small site built from plain HTML, CSS and shared components\."/g, 'content="The &quot;home&quot; page"'));
  const publishedDetails = await page.evaluate(source => {
    const document = new DOMParser().parseFromString(source, "text/html");
    return { title: document.title, socialTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") };
  }, written);
  expect(publishedDetails).toEqual({ title: "Home & <more>", socialTitle: "Home & <more>" });
  // The head never shows in the preview.
  await expect(frame(page).locator("body")).not.toContainText('"home" page');
  await openSaveMenu(page);
  await expect(page.locator("#publish-files .publish-menu__file")).toHaveCount(1);
  await expect(page.locator("#publish-files")).toContainText("index.html");
  await closeSaveMenu(page);

  // Undo: the description, then the title.
  await undo(page).click();
  await readSetting(page, "Description", "A small site built from plain HTML, CSS and shared components.");
  await undo(page).click();
  await readSetting(page, "Title", "Native Studio");
  expect(await draft(page, "index.html")).toBeUndefined();
  await expect(saveTrigger(page)).toBeDisabled();

  // An emptied title leaves an empty <title>, and the top bar falls back to the heading.
  await open(page, baseURL, 501, "about/index.html");
  await writeSetting(page, "Title", "");
  await expect(status(page)).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  // Applying the dialog may restore the head fold; assert the actual source bytes.
  await expect.poll(async () => (await draft(page, "about/index.html"))?.content).toContain("<title></title>");
  await expect(page.locator("#current-page")).toHaveText("About this project");
});

test("the fields follow the preview's page and keep what was typed on each page", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await writeSetting(page, "Title", "Home");
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Section About this project" })).toBeVisible();
  await readSetting(page, "Title", "About this project");
  await writeSetting(page, "Title", "About");
  await writeSetting(page, "Description", "Who made this");
  await follow(page, "Home");
  await expect(tree(page).getByRole("treeitem", { name: "Section A native browser preview" })).toBeVisible();
  await readSetting(page, "Title", "Home");
  await follow(page, "About");
  await expect(tree(page).getByRole("treeitem", { name: "Section About this project" })).toBeVisible();
  await readSetting(page, "Title", "About");
  await readSetting(page, "Description", "Who made this");
  await openSaveMenu(page);
  await expect(page.locator("#publish-files .publish-menu__file")).toHaveCount(2);
});

test("a typed title survives a reload, and saving commits it in the page", async ({ page, baseURL }) => {
  await open(page, baseURL, 530, fernPath);
  await readSetting(page, "Title", "Fern & Kettle");
  await writeSetting(page, "Title", "Fern & Kettle café");
  await expect(status(page)).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
  await reloaded(page, fernPath);
  await readSetting(page, "Title", "Fern & Kettle café");
  await saveAll(page);
  expect(await branchFile(page, routingRepo, fernPath)).toContain("<title>Fern &amp; Kettle café</title>");
  await expect(saveTrigger(page)).toBeDisabled();
  // Saved on the branch: a fresh load reads it from GitHub, with no draft left.
  await reloaded(page, fernPath);
  await expect(status(page)).toContainText("Up to date with main");
  await readSetting(page, "Title", "Fern & Kettle café");
  await expect(page.locator("#current-page")).toHaveText("Fern & Kettle café");
  await expect(saveTrigger(page)).toBeDisabled();
});

test("a description a page lacks is added after its title; the Pages tab's Rename writes the title", async ({ page, baseURL }) => {
  await open(page, baseURL, 531, "notes/first-note/index.html");
  await readSetting(page, "Title", "The first note");
  await readSetting(page, "Description", "");
  await writeSetting(page, "Description", "Notes, the first.");
  await expect(status(page)).toHaveText("Page settings applied as a draft. Save to GitHub to keep them.");
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

const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "Page settings", exact: true });
async function openSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.locator("#explorer").getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  await expect(settingsDialog(page)).toBeVisible();
}
async function readSetting(page: Page, label: string, value: string) {
  await openSettings(page);
  await expect(settingsDialog(page).getByLabel(label, { exact: true })).toHaveValue(value);
  await settingsDialog(page).locator(".site-settings__footer").getByRole("button", { name: "Cancel", exact: true }).click();
}
async function writeSetting(page: Page, label: string, value: string) {
  await openSettings(page);
  await settingsDialog(page).getByLabel(label, { exact: true }).fill(value);
  const apply = settingsDialog(page).getByRole("button", { name: "Apply page settings", exact: true });
  // Exercise the dialog keyboard path rather than pressing Enter after close.
  for (let step = 0; step < 30 && !await apply.evaluate(el => el === document.activeElement); step++) await page.keyboard.press("Tab");
  await expect(apply).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(settingsDialog(page)).toBeHidden();
  await expect(page.locator("#explorer-toggle")).toBeFocused();
}
