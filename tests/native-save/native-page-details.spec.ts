import { expect, test, type Page } from "@playwright/test";

// Page details live in the page: the Page block's Title and Description and
// the Pages tab's Rename write the page's leading <!-- title: … --> comment
// (shared/native-project.ts `nativePageCommentEdit`), taking the manifest's
// field for the route out in the same undo step; the notice moves every
// route's details out of native.json and then offers to remove it; and a
// Files-tab rename of a page updates the links to it like Change URL.
// `native-routing` (id 530) has a manifest titling /work/fern-and-kettle/;
// `native-conventions` (id 531) has none.
const manifestPath = ".astro-editor/native.json";
const fernPath = "src/pages/work/fern-and-kettle.html";
const routingRepo = "native-demo-user/native-routing";
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
const notice = (page: Page) => page.locator(".native-preview-warning");

async function open(page: Page, baseURL: string | undefined, repo: number, file = "src/pages/index.html") {
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
  await page.getByRole("button", { name: "Save to GitHub", exact: true }).click();
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
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

test("the Page block writes the page comment and takes the manifest's field out in the same undo step; saving commits both", async ({ page, baseURL }) => {
  await open(page, baseURL, 530, fernPath);
  // The manifest's title applies, so the field shows it.
  await expect(title(page)).toHaveValue("Fern & Kettle");
  await expect(title(page)).toBeEditable();
  await expect(description(page)).toHaveValue("");
  await expect(description(page)).toHaveAttribute("placeholder", "");
  await expect(title(page)).toHaveAttribute("placeholder", "Fern and Kettle");

  await title(page).fill("Fern & Kettle café");
  await expect(status(page)).toHaveText("Title updated");
  await expect(page.locator("#content .view-lines")).toContainText("title: Fern & Kettle café");
  // The manifest's entry went with its only field; the route needs none.
  expect(JSON.parse((await draft(page, manifestPath)).content).routes).toEqual({});
  await expect(page.locator("#current-page")).toHaveText("Fern & Kettle café");
  await page.keyboard.press("Enter");

  await description(page).fill("A café identity.");
  await expect(status(page)).toHaveText("Description updated");
  await page.keyboard.press("Enter");
  expect((await draft(page, fernPath)).content).toMatch(/^<!--\ntitle: Fern & Kettle café\ndescription: A café identity\.\n-->\n<main/);
  // The comment never shows in the preview.
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");
  await expect(frame(page).locator("body")).not.toContainText("title:");

  // Undo: the description, then the title with the manifest's entry.
  await undo(page).click();
  await expect(description(page)).toHaveValue("");
  await undo(page).click();
  await expect(title(page)).toHaveValue("Fern & Kettle");
  await expect(page.locator("#content .view-lines")).not.toContainText("title:");
  expect(await draft(page, manifestPath)).toBeUndefined();
  expect(await draft(page, fernPath)).toBeUndefined();

  await title(page).fill("Fern & Kettle café");
  await page.keyboard.press("Enter");
  await description(page).fill("A café identity.");
  await page.keyboard.press("Enter");
  await saveAll(page);
  expect(await branchFile(page, routingRepo, fernPath)).toMatch(/^<!--\ntitle: Fern & Kettle café\ndescription: A café identity\.\n-->\n<main/);
  expect(JSON.parse((await branchFile(page, routingRepo, manifestPath))!).routes).toEqual({});
  await page.reload();
  await expect(title(page)).toHaveValue("Fern & Kettle café", { timeout: 30_000 });
  await expect(description(page)).toHaveValue("A café identity.");

  // Emptying both removes the comment.
  await title(page).fill("");
  await page.keyboard.press("Enter");
  await description(page).fill("");
  await expect(status(page)).toHaveText("Description removed");
  expect((await draft(page, fernPath)).content).toMatch(/^<main/);
});

test("with no manifest the Page block and the Pages tab's Rename edit the page comment", async ({ page, baseURL }) => {
  await open(page, baseURL, 531);
  await expect(title(page)).toHaveValue("Built by convention");
  await expect(title(page)).toBeEditable();
  await expect(block(page).locator(".page-structure__meta-notice")).toBeHidden();
  await title(page).fill("Built by folders");
  await expect(status(page)).toHaveText("Title updated");
  await page.keyboard.press("Enter");
  await description(page).fill("");
  await expect(status(page)).toHaveText("Description removed");
  expect((await draft(page, "src/pages/index.html")).content).toMatch(/^<!--\ntitle: Built by folders\n-->\n/);

  await openExplorer(page, "Pages");
  const note = item(page, "The first note");
  await note.focus();
  await page.keyboard.press("F2");
  const field = explorer(page).getByRole("textbox", { name: "Title of The first note" });
  await field.fill("Note one");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed The first note to Note one");
  await expect(item(page, "Note one")).toBeVisible();
  expect((await draft(page, "src/pages/notes/first-note.html")).content).toContain("title: Note one");
  const manifestDrafts = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(".astro-editor/native.json")).length);
  expect(manifestDrafts).toBe(0);
});

test("Move page details into the pages, then Remove native.json: the site still previews and saves without it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expect(notice(page)).toContainText("native.json gives 1 page its title or description.");
  await notice(page).getByRole("button", { name: "Move page details into the pages" }).click();
  await expect(status(page)).toHaveText("Moved the titles and descriptions of 1 page into the pages; native.json now says nothing the files do not, so it can be removed.");
  expect((await draft(page, fernPath)).content).toMatch(/^<!--\ntitle: Fern & Kettle\n-->\n<main/);
  expect(JSON.parse((await draft(page, manifestPath)).content).routes).toEqual({});

  // Undo takes the whole move back.
  await undo(page).click();
  expect(await draft(page, fernPath)).toBeUndefined();
  expect(await draft(page, manifestPath)).toBeUndefined();
  await expect(notice(page)).toContainText("native.json gives 1 page its title or description.");
  await notice(page).getByRole("button", { name: "Move page details into the pages" }).click();

  await expect(notice(page)).toContainText("native.json says nothing the files do not already say.");
  await notice(page).getByRole("button", { name: "Remove native.json" }).click();
  await expect(status(page)).toContainText("Deleted .astro-editor/native.json");
  expect((await draft(page, manifestPath)).deleted).toBe(true);
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(frame(page).locator("h1")).toHaveText("Routed by folders");
  await expect(notice(page)).toBeHidden();

  await saveAll(page);
  expect(await branchFile(page, routingRepo, manifestPath)).toBeUndefined();
  expect(await branchFile(page, routingRepo, fernPath)).toMatch(/^<!--\ntitle: Fern & Kettle\n-->\n/);

  // A fresh load: native by its home page, the title from the comment.
  await page.goto(`${baseURL}/#repo=530&branch=main&file=${encodeURIComponent(fernPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", fernPath, { timeout: 30_000 });
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle", { timeout: 30_000 });
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(title(page)).toHaveValue("Fern & Kettle");
  await expect(page.locator("#current-page")).toHaveText("Fern & Kettle");
});

test("the Files tab deletes native.json only when the site has a home page, saying what goes with it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, ".astro-editor");
  await row(page, "native.json").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete .astro-editor/native.json?" });
  await expect(dialog).toContainText("what native.json adds (page titles and descriptions");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted .astro-editor/native.json.");
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(frame(page).locator("h1")).toHaveText("Routed by folders");
});

test("renaming a page in the Files tab updates the links to it and can keep its old URL working", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "src/pages/work");
  await row(page, "fern-and-kettle.html").focus();
  await page.keyboard.press("F2");
  await explorer(page).getByRole("textbox", { name: `New name for ${fernPath}` }).fill("fern.html");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: `Rename ${fernPath} to src/pages/work/fern.html?` });
  await expect(dialog).toContainText("Its URL changes from /work/fern-and-kettle/ to /work/fern/.");
  await expect(dialog).toContainText("Updates 1 link in 1 file.");
  const keep = dialog.getByRole("checkbox", { name: "Keep the old URL working (/work/fern-and-kettle/ redirects to /work/fern/)" });
  await expect(keep).toBeChecked();
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(status(page)).toHaveText(`Renamed ${fernPath} to src/pages/work/fern.html — 1 link updated in 1 file; /work/fern-and-kettle/ redirects there.`);
  expect((await draft(page, "src/pages/work/index.html")).content).toContain('href="#/work/fern/"');
  expect((await draft(page, "src/public/_redirects")).content).toBe("/work/fern-and-kettle/ /work/fern/ 301\n");
  await page.keyboard.press("Escape");
  await expect(explorer(page)).toBeHidden();
  // The manifest's title followed the page to its new URL.
  expect(JSON.parse((await draft(page, manifestPath)).content).routes).toEqual({ "/work/fern/": { title: "Fern & Kettle" } });
  // The updated link leads to the page at its new URL.
  await frame(page).getByRole("link", { name: "Our work" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Work");
  await frame(page).getByRole("link", { name: "Fern and Kettle" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");
  await expect(page.locator(".native-preview-error")).toBeHidden();
});
