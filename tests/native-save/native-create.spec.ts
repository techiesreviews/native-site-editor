import { openPageSettingsFromPages } from "./settings-entry";
import { publishButton, showPublish } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Creating files and folders in the explorer's Files tab (src/native-create.ts,
// components/create-dialog.ts), and pages and static card grids in its Pages tab
// (src/native-pages.ts, components/pages-tree.ts). A new file is a browser
// draft with no base blob; saving commits it through the real worker publish
// path to the fake GitHub (server.ts). The routing tests use `native-routing`
// (id 530), whose pages are routed by their folders; the conflict test uses
// the starter repository (id 501), which `/__demo/external-edit` writes to.
const indexPath = "index.html";
const routingRepo = "native-demo-user/native-routing";
const starterRepo = "native-demo-user/native-demo";
const routingHome = readFileSync(resolve("fixtures/native-routing/index.html"), "utf8");
// A new page as the Pages tab makes it: the home page's document with its
// title, no description and an empty <main> (src/native-create.ts).
const newPage = (title: string) => routingHome
  .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  .replace(/(<meta name="description" content=")[^"]*"/, '$1"')
  .replace(/(<main[^>]*>)[\s\S]*<\/main>/, "$1\n</main>");
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
const saveTrigger = publishButton;

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

// Opens a page row in the Pages tree (rows start collapsed unless they lead to the open page).
async function expandRow(page: Page, name: string) {
  const treeRow = item(page, name);
  await treeRow.focus();
  if ((await treeRow.getAttribute("aria-expanded")) === "false") await page.keyboard.press("ArrowRight");
  await expect(treeRow).toHaveAttribute("aria-expanded", "true");
}
async function expectPageTitle(page: Page, title: string) {
  await openPages(page);
  await openPageSettingsFromPages(page);
  const panel = page.getByRole("dialog", { name: "Page settings", exact: true });
  await expect(panel.getByLabel("Title", { exact: true })).toHaveValue(title);
  await panel.locator(".site-settings__footer").getByRole("button", { name: "Cancel", exact: true }).click();
}

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
  await showPublish(page);
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
}

test("a new stylesheet is a file like any other; a new folder holds a .gitkeep; discarding a new file removes it from the tree", async ({ page, baseURL }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await open(page, baseURL, 501);
  await expand(page, "styles");
  await explorer(page).getByRole("button", { name: "New in styles", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder in styles" });
  await expect(dialog.getByRole("radio", { name: "Page" })).toBeHidden();
  const name = dialog.getByRole("textbox", { name: "File name" });
  await name.fill("../x.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("A name cannot be . or ..");
  await name.fill("site.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("styles/site.css already exists.");
  await name.fill("print.css");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("Creates the empty file styles/print.css.");
  await name.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/print.css");
  await expect(page.locator("#status")).toHaveText("Created styles/print.css.");

  // The save list has the new file alone: nothing registers it.
  await showPublish(page);
  const panel = page.locator("#publish-files");
  await expect(panel.getByRole("button", { name: "New file, 1 lines. Show changes in styles/print.css" })).toBeVisible();
  await expect(panel.locator(".publish-menu__file")).toHaveCount(1);
  await page.keyboard.press("Escape");

  // A folder: git keeps no empty folders, so it holds a .gitkeep.
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
  await page.getByRole("dialog", { name: /^Discard \d+ unsaved change/ }).getByRole("button", { name: "Discard all" }).click();
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
  await showPublish(page);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("GitHub changed these files: docs/notes.md", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "docs/notes.md")).toBe("# Their notes\n");
  await page.keyboard.press("Escape");

  // Reopened, the file is GitHub's and the draft shows the conflict bar.
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "docs/notes.md", { timeout: 30_000 });
  await expect(page.locator("#content .code-editor__conflict")).toContainText("GitHub changed since this draft started.");
  await expect(page.locator("#content .view-lines")).toContainText("# My notes");
});

test("the Files tab makes plain files and folders only: no Page, and a folder among the pages holds a .gitkeep", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "work");
  await explorer(page).getByRole("button", { name: "New in work", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder in work" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  await expect(dialog.getByRole("radio", { name: "Page" })).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Folder" }).check();
  const name = dialog.getByRole("textbox", { name: "Folder name" });
  await name.fill("fern-and-kettle");
  await expect(dialog.locator(".create-dialog__result")).toHaveText("work/fern-and-kettle already exists.");
  await name.fill("media");
  await expect(dialog.locator(".create-dialog__result")).toHaveText(
    "Creates work/media/.gitkeep: git stores no empty folders, so the folder holds this empty file until it has others. To add pages and subpages, use the Pages tab.",
  );
  // Escape closes the dialog only: the explorer stays, focus back on the +.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(explorer(page)).toBeVisible();
  await expect(explorer(page).getByRole("button", { name: "New in work", exact: true })).toBeFocused();
  await expect(explorer(page).getByRole("button", { name: "New page", exact: true })).toHaveCount(0);
});

test("a native site opens the explorer on Pages: the site by URL, each page with its subpages", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await page.locator("#explorer-toggle").click();
  const pagesTab = explorer(page).getByRole("tab", { name: "Pages" });
  await expect(pagesTab).toHaveAttribute("aria-selected", "true");
  await expect(explorer(page).getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "false");
  await expect(explorer(page).getByRole("tabpanel")).toHaveCount(1);
  const tree = explorer(page).getByRole("tree", { name: "PAGES" });
  // Rows start collapsed, so only the two top-level rows show until Work is opened.
  await expect(tree.getByRole("treeitem")).toHaveCount(2);
  await expect(item(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(item(page, "Home")).toHaveAttribute("aria-level", "1");
  await expect(item(page, "Work")).toHaveAttribute("aria-expanded", "false");
  await expect(item(page, "Work").locator(".pages-url").first()).toHaveText("/work/");
  await expandRow(page, "Work");
  await expect(tree.getByRole("treeitem")).toHaveCount(4);
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-level", "2");
  await expect(item(page, "Fern & Kettle").locator(".pages-url")).toHaveText("/work/fern-and-kettle/");
  await expect(explorer(page).getByRole("button", { name: "Add subpage to Work" })).toHaveCount(1);
  await expect(explorer(page).getByRole("button", { name: "+ New page" })).toBeVisible();

  // Arrow keys move between the rows; Left closes a page's subpages, Enter opens a page.
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
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/fern-and-kettle/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");

  // Clicking a page with subpages opens it.
  await openExplorer(page);
  await expect(pagesTab).toHaveAttribute("aria-selected", "true");
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-selected", "true");
  await item(page, "Work").locator(".pages-label").first().click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/index.html");
  await expect(frame(page).locator("h1")).toHaveText("Work");
});

test("a page, a subpage under it and another are made in place as folders of their own, route at once, and save with their titles", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);

  // + New page: an editable row, the URL following the title.
  await explorer(page).getByRole("button", { name: "+ New page" }).click();
  const name = explorer(page).getByRole("textbox", { name: "New page title" });
  await expect(name).toBeFocused();
  await name.pressSequentially("Work");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/work/");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("The URL /work/ is taken by work/index.html.");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("Vidéos");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/videos/");
  await expect(editRow(page).locator(".pages-edit__message")).toBeEmpty();
  await name.fill("Videos");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Created the page Videos at /videos/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "videos/index.html");
  await expect(frame(page).locator("main")).toBeEmpty();
  await expectPageTitle(page, "Videos");

  // Its + adds a subpage in its folder.
  await openPages(page);
  await expect(item(page, "Videos").locator(".file-new").first()).toHaveText("New");
  await item(page, "Videos").hover();
  await explorer(page).getByRole("button", { name: "Add subpage to Videos" }).click();
  const title = explorer(page).getByRole("textbox", { name: "New subpage of Videos, title" });
  await expect(title).toBeFocused();
  await title.pressSequentially("My first video");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/videos/my-first-video/");
  await expect(editRow(page).locator(".pages-edit__message")).toBeEmpty();
  await page.keyboard.press("Enter");
  await expect(explorer(page)).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Created the page My first video at /videos/my-first-video/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "videos/my-first-video/index.html");
  await expectPageTitle(page, "My first video");

  // The same title again is refused; the URL can be changed by hand, and
  // then no longer follows the title. Escape cancels.
  await openPages(page);
  await expect(item(page, "My first video")).toHaveAttribute("aria-selected", "true");
  await expect(item(page, "Videos")).toHaveAttribute("aria-expanded", "true");
  await item(page, "Videos").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Page settings…", "Navigation…", "Add subpage", /^Rename/, "Change URL…", "Move to…", "Duplicate", "Discard changes", /^Delete/]);
  await expect(menu.getByRole("menuitem", { name: "Page settings…", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Navigation…", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Add subpage" })).toBeFocused();
  await page.keyboard.press("Enter");
  await title.pressSequentially("My first video");
  await expect(editRow(page).locator(".pages-edit__message")).toHaveText("The URL /videos/my-first-video/ is taken by videos/my-first-video/index.html.");
  await editRow(page).getByRole("button", { name: "URL /videos/my-first-video/, change it" }).click();
  const slug = explorer(page).getByRole("textbox", { name: "URL of the new page, after /videos/" });
  await expect(slug).toBeFocused();
  await slug.fill("second-take");
  await expect(editRow(page).locator(".pages-edit__message")).toBeEmpty();
  await title.fill("Another title");
  await expect(editRow(page).locator(".pages-edit__message")).toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(editRow(page)).toHaveCount(0);
  await expect(explorer(page)).toBeVisible();
  await expect(item(page, "Videos")).toBeFocused();

  // Another subpage, from the keyboard.
  await page.keyboard.press("Shift+F10");
  await expect(menu.getByRole("menuitem", { name: "Page settings…", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Navigation…", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Add subpage", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Tutorials");
  await expect(editRow(page).locator(".pages-edit__url-button")).toHaveText("/videos/tutorials/");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "videos/tutorials/index.html");

  // The page is a route of the site: clicking it in the tree shows it.
  await openPages(page);
  await expect(item(page, "Tutorials")).toHaveAttribute("aria-level", "2");
  await item(page, "My first video").locator(".pages-label").click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "videos/my-first-video/index.html");

  // Saving commits the three new files, each titled in its own <title>.
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, routingRepo, "videos/index.html")).toBe(newPage("Videos"));
  expect(await branchFile(page, routingRepo, "videos/my-first-video/index.html")).toBe(newPage("My first video"));
  expect(await branchFile(page, routingRepo, "videos/tutorials/index.html")).toContain("<title>Tutorials</title>");
  await page.keyboard.press("Escape");
  await openPages(page);
  await expect(item(page, "Videos").locator(".file-new")).toHaveCount(0);
});

test("undo or discard of a new page takes it back; undoing a subpage leaves its parent as it was", async ({ page, baseURL }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await open(page, baseURL, 530);
  const create = async (text: string) => {
    await openPages(page);
    await explorer(page).getByRole("button", { name: "+ New page" }).click();
    await explorer(page).getByRole("textbox", { name: "New page title" }).fill(text);
    await page.keyboard.press("Enter");
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", `${text.toLowerCase().replace(/ /g, "-")}/index.html`);
    await expectPageTitle(page, text);
  };
  const gone = async (text: string) => {
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
    await expect(frame(page).locator("h1")).toHaveText("Routed by folders");
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
  await page.getByRole("dialog", { name: /^Discard \d+ unsaved change/ }).getByRole("button", { name: "Discard all" }).click();
  await gone("Draft page");

  // A subpage: Undo takes it back, and its parent stays as it was.
  await create("Videos");
  await openPages(page);
  await item(page, "Videos").focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Add subpage" }).click();
  await explorer(page).getByRole("textbox", { name: "New subpage of Videos, title" }).fill("Intro");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "videos/intro/index.html");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#status")).toHaveText("Undid creating the page Intro.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "videos/index.html");
  await expectPageTitle(page, "Videos");
  await openPages(page);
  await expect(item(page, "Intro")).toHaveCount(0);
  await expect(item(page, "Videos")).not.toHaveAttribute("aria-expanded");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.getByRole("dialog", { name: /^Discard \d+ unsaved change/ }).getByRole("button", { name: "Discard all" }).click();
  await gone("Videos");
});
