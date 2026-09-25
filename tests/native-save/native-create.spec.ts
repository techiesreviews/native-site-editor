import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Creating files and folders in the explorer's Files tab (src/native-create.ts,
// src/components/create-dialog.ts), and pages and collections in its Pages tab
// (src/native-pages.ts, src/components/pages-tree.ts). A new file is a browser
// draft with no base blob; saving commits it through the real worker publish
// path to the fake GitHub (server.ts). The routing tests use `native-routing`
// (id 530), whose pages are routed by their folders; the manifest and
// conflict tests use the starter repository (id 501), which
// `/__demo/external-edit` writes to.
const indexPath = "src/pages/index.html";
const manifestPath = ".astro-editor/native.json";
const routingRepo = "native-demo-user/native-routing";
const starterRepo = "native-demo-user/native-demo";
const routingHome = readFileSync(resolve("fixtures/native-routing/src/pages/index.html"), "utf8");
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const row = (page: Page, name: string) => explorer(page).getByRole("button", { name, exact: true });
const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save to GitHub", exact: true });

async function open(page: Page, baseURL: string | undefined, repo: number, file = indexPath) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function openExplorer(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
}

async function openFiles(page: Page) {
  await openExplorer(page);
  await explorer(page).getByRole("tab", { name: "Files" }).click();
}

async function openPages(page: Page) {
  await openExplorer(page);
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}

const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const editRow = (page: Page) => explorer(page).locator(".pages-edit");
const manifestDrafts = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(".astro-editor/native.json")).length);

// Opens the folders along `path` in the tree.
async function expand(page: Page, path: string) {
  await openFiles(page);
  for (const part of path.split("/")) {
    const item = row(page, part).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    if ((await item.getAttribute("aria-expanded")) === "false") await item.click();
    await expect(item).toHaveAttribute("aria-expanded", "true");
  }
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
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
}

test("a new stylesheet registers in native.json; a new folder elsewhere holds a .gitkeep; discarding a new file removes it from the tree", async ({ page, baseURL }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await open(page, baseURL, 501);
  await expand(page, "src/styles");
  await explorer(page).getByRole("button", { name: "New in src/styles", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder in src/styles" });
  await expect(dialog.getByRole("radio", { name: "Page" })).toBeHidden();
  const name = dialog.getByRole("textbox", { name: "File name" });
  await name.fill("../x.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("A name cannot be . or ..");
  await name.fill("site.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("src/styles/site.css already exists.");
  await name.fill("print.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("Creates the empty file src/styles/print.css and adds it to the site's styles in native.json.");
  await name.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/styles/print.css");
  await expect(page.locator("#status")).toHaveText("Created src/styles/print.css.");

  // The save list has the new file and the manifest's new line.
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel.getByRole("button", { name: "New file, 1 lines. Show changes in src/styles/print.css" })).toBeVisible();
  await panel.getByRole("button", { name: `Show changes in ${manifestPath}` }).click();
  const diff = page.getByRole("dialog", { name: manifestPath });
  await expect(diff.locator(".publish-diff__code.is-add")).toContainText(['  "styles": ["src/styles/site.css", "src/styles/print.css"]']);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // A folder outside src/pages: git keeps no empty folders, so it holds a .gitkeep.
  await openFiles(page);
  await explorer(page).getByRole("button", { name: "New file or folder", exact: true }).click();
  const root = page.getByRole("dialog", { name: "New file or folder" });
  await root.getByRole("radio", { name: "Folder" }).check();
  await root.getByRole("textbox", { name: "Folder name" }).fill("notes/drafts");
  await expect(root.locator(".create-dialog__result")).toContainText("Creates notes/drafts/.gitkeep");
  await page.keyboard.press("Enter");
  await expect(root).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Created the folder notes/drafts.");
  await expect(row(page, "drafts New")).toBeFocused();
  await expect(row(page, ".gitkeep New")).toBeVisible();

  // Discarding the new stylesheet takes it out of the tree.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await openFiles(page);
  await expect(row(page, "styles")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "site.css")).toBeVisible();
  await expect(row(page, "print.css New")).toHaveCount(0);
});

test("a new file whose path appeared on GitHub meanwhile is refused on save and kept as a draft", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await openFiles(page);
  await explorer(page).getByRole("button", { name: "New file or folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder" });
  await dialog.getByRole("textbox", { name: "File name" }).fill("docs/notes.md");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "docs/notes.md");
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.type("# My notes");

  // Someone else commits the same path.
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "docs/notes.md", content: "# Their notes\n" } });
  await saveTrigger(page).click();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
  await expect(page.locator(".publish-menu__message")).toContainText("GitHub changed these files: docs/notes.md", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "docs/notes.md")).toBe("# Their notes\n");
  await page.keyboard.press("Escape");

  // Reopened, the file is GitHub's and the draft shows the conflict bar.
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "docs/notes.md", { timeout: 30_000 });
  await expect(page.locator("#content .code-editor__conflict")).toContainText("GitHub changed since this draft started.");
  await expect(page.locator("#content .view-lines")).toContainText("# My notes");
});

test("the Files tab makes plain files and folders only: no Page, and a folder under src/pages holds a .gitkeep", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "src/pages");
  await explorer(page).getByRole("button", { name: "New in src/pages", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder in src/pages" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  await expect(dialog.getByRole("radio", { name: "Page" })).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Folder" }).check();
  const name = dialog.getByRole("textbox", { name: "Folder name" });
  await name.fill("work");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("src/pages/work already exists.");
  await name.fill("media");
  await expect(dialog.locator(".create-dialog__result")).toHaveText(
    "Creates src/pages/media/.gitkeep: git stores no empty folders, so the folder holds this empty file until it has others. To add pages or collections, use the Pages tab.",
  );
  // Escape closes the dialog only: the explorer stays, focus back on the +.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(explorer(page)).toBeVisible();
  await expect(explorer(page).getByRole("button", { name: "New in src/pages", exact: true })).toBeFocused();
  await expect(explorer(page).getByRole("button", { name: "New page", exact: true })).toHaveCount(0);
});

test("a native site opens the explorer on Pages: the site by URL, collections with their pages", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await page.locator("#explorer-toggle").click();
  const pagesTab = explorer(page).getByRole("tab", { name: "Pages" });
  await expect(pagesTab).toHaveAttribute("aria-selected", "true");
  await expect(explorer(page).getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "false");
  await expect(explorer(page).getByRole("tabpanel")).toHaveCount(1);
  const tree = explorer(page).getByRole("tree", { name: "PAGES" });
  await expect(tree.getByRole("treeitem")).toHaveCount(5);
  await expect(item(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(item(page, "Home")).toHaveAttribute("aria-level", "1");
  await expect(item(page, "Work")).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, "Work").locator(".pages-url").first()).toHaveText("/work/");
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-level", "2");
  await expect(item(page, "Fern & Kettle").locator(".pages-url")).toHaveText("/work/fern-and-kettle/");
  await expect(item(page, "Add page to Work")).toBeVisible();

  // Arrow keys move between the rows; Left closes a collection, Enter opens a page.
  await item(page, "Home").focus();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Work")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(item(page, "Work")).toHaveAttribute("aria-expanded", "false");
  await expect(item(page, "Fern & Kettle")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "Fern & Kettle")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(explorer(page)).toBeHidden();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/work/fern-and-kettle.html");
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");

  // Clicking a collection opens its overview page.
  await openExplorer(page);
  await expect(pagesTab).toHaveAttribute("aria-selected", "true");
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-selected", "true");
  await item(page, "Work").locator(".pages-label").first().click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/work/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Work");
});

test("a collection, a page in it and a sub-collection are made in place, route at once, and save with their titles", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);

  // + New ▾ → Collection: an editable row, the URL following the name.
  const newButton = explorer(page).getByRole("button", { name: "+ New" });
  await newButton.click();
  await expect(newButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitem")).toHaveText(["Page", "Collection"]);
  await page.getByRole("menuitem", { name: "Collection" }).click();
  const name = explorer(page).getByRole("textbox", { name: "New collection name" });
  await expect(name).toBeFocused();
  await name.pressSequentially("Work");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/work/");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("The URL /work/ is taken by src/pages/work/index.html.");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("Vidéos");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/videos/");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("Creates src/pages/videos/index.html");
  await name.fill("Videos");
  await page.keyboard.press("Enter");

  // The collection is made with its overview page; the explorer stays open on it.
  await expect(page.locator("#status")).toHaveText("Created the collection Videos at /videos/, with its overview page src/pages/videos/index.html.");
  await expect(explorer(page)).toBeVisible();
  await expect(editRow(page)).toHaveCount(0);
  await expect(item(page, "Videos")).toBeFocused();
  await expect(item(page, "Videos")).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, "Videos").locator(".file-new").first()).toHaveText("New");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/videos/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Videos");

  // + Add page in it: the URL is the collection's, the page opens.
  await item(page, "Add page to Videos").click();
  const title = explorer(page).getByRole("textbox", { name: "New page title" });
  await expect(title).toBeFocused();
  await title.pressSequentially("My first video");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/videos/my-first-video/");
  await page.keyboard.press("Enter");
  await expect(explorer(page)).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Created the page My first video at /videos/my-first-video/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/videos/my-first-video.html");
  await expect(frame(page).locator("h1")).toHaveText("My first video");
  await expect(page.getByRole("group", { name: "Page" }).getByLabel("Title")).toHaveValue("My first video");

  // The same title again is refused; the URL can be changed by hand, and
  // then no longer follows the title. Escape cancels.
  await openPages(page);
  await expect(item(page, "My first video")).toHaveAttribute("aria-selected", "true");
  await item(page, "Add page to Videos").click();
  await title.pressSequentially("My first video");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("The URL /videos/my-first-video/ is taken by src/pages/videos/my-first-video.html.");
  await editRow(page).getByRole("button", { name: "URL /videos/my-first-video/, change it" }).click();
  const slug = explorer(page).getByRole("textbox", { name: "URL of the new page, after /videos/" });
  await expect(slug).toBeFocused();
  await slug.fill("second-take");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("Creates src/pages/videos/second-take.html");
  await title.fill("Another title");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("Creates src/pages/videos/second-take.html");
  await page.keyboard.press("Escape");
  await expect(editRow(page)).toHaveCount(0);
  await expect(explorer(page)).toBeVisible();
  await expect(item(page, "Add page to Videos")).toBeFocused();

  // The keyboard: Shift+F10 on the collection opens its menu; Add sub-collection.
  await item(page, "Videos").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Add page", "Add sub-collection", /^Rename/, /^Delete/]);
  await expect(menu.getByRole("menuitem", { name: "Add page" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const sub = explorer(page).getByRole("textbox", { name: "New collection name" });
  await expect(sub).toBeFocused();
  await page.keyboard.type("Tutorials");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/videos/tutorials/");
  await page.keyboard.press("Enter");
  await expect(item(page, "Tutorials")).toBeFocused();
  await expect(item(page, "Tutorials")).toHaveAttribute("aria-level", "2");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/videos/tutorials/index.html");
  await expect(item(page, "Videos").locator(".pages-count").first()).toHaveText("· 1");

  // The page is a route of the site: clicking it in the tree shows it.
  await item(page, "My first video").click();
  await expect(frame(page).locator("h1")).toHaveText("My first video");

  // Saving commits the three new files and the manifest's titles together.
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, routingRepo, "src/pages/videos/index.html")).toBe('<main class="page" data-key="main">\n  <section class="hero" data-key="hero">\n    <h1 data-key="title">Videos</h1>\n  </section>\n</main>\n');
  expect(await branchFile(page, routingRepo, "src/pages/videos/my-first-video.html")).toBe('<main class="page" data-key="main">\n  <section class="hero" data-key="hero">\n    <h1 data-key="title">My first video</h1>\n  </section>\n</main>\n');
  expect(await branchFile(page, routingRepo, "src/pages/videos/tutorials/index.html")).toContain("<h1 data-key=\"title\">Tutorials</h1>");
  expect(JSON.parse((await branchFile(page, routingRepo, manifestPath))!).routes).toEqual({
    "/work/fern-and-kettle/": { title: "Fern & Kettle" },
    "/videos/": { title: "Videos" },
    "/videos/my-first-video/": { title: "My first video" },
    "/videos/tutorials/": { title: "Tutorials" },
  });
  await page.keyboard.press("Escape");
  await openPages(page);
  await expect(item(page, "Videos").locator(".file-new")).toHaveCount(0);
});

test("undo or discard of a new page takes its manifest entry with it; discarding the manifest takes the pages it titles", async ({ page, baseURL }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await open(page, baseURL, 530);
  const create = async (text: string) => {
    await openPages(page);
    await explorer(page).getByRole("button", { name: "+ New" }).click();
    await page.getByRole("menuitem", { name: "Page" }).click();
    await explorer(page).getByRole("textbox", { name: "New page title" }).fill(text);
    await page.keyboard.press("Enter");
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", `src/pages/${text.toLowerCase().replace(/ /g, "-")}.html`);
    await expect(frame(page).locator("h1")).toHaveText(text);
    expect(await manifestDrafts(page)).toBe(1);
  };
  const gone = async (text: string) => {
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
    await expect(frame(page).locator("h1")).toHaveText("Routed by folders");
    await expect(page.locator(".native-preview-warning")).toBeHidden();
    expect(await manifestDrafts(page)).toBe(0);
    await openPages(page);
    await expect(item(page, text)).toHaveCount(0);
    await page.keyboard.press("Escape");
  };

  // Undo right after creating takes back the page and its title.
  await create("Draft page");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Undid creating the page Draft page.");
  await gone("Draft page");

  // So does Discard changes on the new page.
  await create("Draft page");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await gone("Draft page");

  // A collection: Ctrl+Z from the tree, where it is focused, takes it back.
  await openPages(page);
  await explorer(page).getByRole("button", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Collection" }).click();
  await explorer(page).getByRole("textbox", { name: "New collection name" }).fill("Videos");
  await page.keyboard.press("Enter");
  await expect(item(page, "Videos")).toBeFocused();
  expect(await manifestDrafts(page)).toBe(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#status")).toHaveText("Undid creating the collection Videos.");
  await gone("Videos");

  // Discarding the manifest's draft discards the new page it titles.
  await create("Other page");
  await openFiles(page);
  await expand(page, ".astro-editor");
  await row(page, "native.json").click();
  await expect(page.locator("#content .view-lines")).toContainText('"/other-page/": { "title": "Other page" }');
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.locator("#status")).toHaveText("Discarded native.json's changes and the new page src/pages/other-page.html.");
  await expect(page.locator(".native-preview-warning")).toBeHidden();
  expect(await manifestDrafts(page)).toBe(0);
  await openPages(page);
  await expect(item(page, "Other page")).toHaveCount(0);
});

test("metadata for a route no page gives offers Remove entry and Create the page", async ({ page, baseURL }) => {
  const orphaned = readFileSync(resolve("fixtures/native-starter/.astro-editor/native.json"), "utf8")
    .replace('"/about/": "src/pages/about.html"', '"/about/": "src/pages/about.html",\n    "/videos/": { "title": "Videos" }');
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: manifestPath, content: orphaned } });
  await open(page, baseURL, 501);
  const warning = page.locator(".native-preview-warning");
  await expect(warning).toContainText("native.json has metadata for /videos/, but no page gives that route");
  await warning.getByRole("button", { name: "Remove the entry for /videos/ from native.json" }).click();
  await expect(warning).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Removed the entry for /videos/ from native.json.");
  expect(await manifestDrafts(page)).toBe(1);

  // Reloaded with the draft discarded, the other fix: the page is made.
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.includes(".astro-editor/native.json")) localStorage.removeItem(key); });
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(warning).toContainText("native.json has metadata for /videos/");
  await warning.getByRole("button", { name: "Create the page /videos/" }).click();
  await expect(warning).toBeHidden();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "src/pages/videos.html");
  await expect(frame(page).locator("h1")).toHaveText("Videos");
  await expect(page.locator("#status")).toHaveText("Created the page src/pages/videos.html at /videos/.");
});
