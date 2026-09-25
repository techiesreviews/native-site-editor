import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Deleting, renaming, moving and duplicating files as publishable drafts
// (src/file-changes.ts, the row actions in src/components/file-row-actions.ts,
// the manifest side effects in src/native-page-meta.ts), and the Pages tab's
// Rename, Duplicate and Delete. Saving commits through the real worker
// publish path to the fake GitHub (server.ts), deletions as `sha: null`.
// `native-routing` (id 530) routes its pages by folder; the starter (id 501)
// has components and is what `/__demo/external-edit` changes.
const manifestPath = ".astro-editor/native.json";
const routingRepo = "native-demo-user/native-routing";
const starterRepo = "native-demo-user/native-demo";
const note = readFileSync(resolve("fixtures/native-routing/src/pages/_parts/note.html"), "utf8");
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
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const saveTrigger = (page: Page) => page.getByRole("button", { name: "Save to GitHub", exact: true });

async function open(page: Page, baseURL: string | undefined, repo: number, file = "src/pages/index.html") {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveText(file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
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

// Opens the folders along `path` in the Files tree.
async function expand(page: Page, path: string) {
  await openFiles(page);
  for (const part of path.split("/")) {
    const folder = row(page, part).first();
    await expect(folder).toBeVisible({ timeout: 20_000 });
    if ((await folder.getAttribute("aria-expanded")) === "false") await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
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

// The browser draft of `path`, parsed.
async function draft(page: Page, path: string) {
  return page.evaluate((path) => {
    const key = Object.keys(localStorage).find((key) => key.startsWith("astro-site-editor:draft:v1:") && JSON.parse(key.slice("astro-site-editor:draft:v1:".length))[3] === path);
    return key ? JSON.parse(localStorage.getItem(key)!) : undefined;
  }, path);
}

async function saveAll(page: Page) {
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
}

test("F2 renames a file in its row; the Save panel lists one rename, and saving moves it on GitHub", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "src/pages/_parts");
  const noteRow = row(page, "note.html");
  await noteRow.focus();
  await page.keyboard.press("F2");
  const input = explorer(page).getByRole("textbox", { name: "New name for src/pages/_parts/note.html" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("note.html");
  // The name is selected without its extension.
  expect(await input.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd])).toEqual([0, 4]);
  // Escape cancels the rename only, not the explorer.
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(explorer(page)).toBeVisible();
  await expect(noteRow).toBeFocused();
  await expect(status(page)).toHaveText("Cancelled renaming src/pages/_parts/note.html");

  // Problems show as typed; Enter renames.
  await page.keyboard.press("F2");
  await page.keyboard.type("an aside");
  await expect(explorer(page).locator(".file-rename__message")).toHaveText("Use letters, digits, -, _ and . only, with / between folders.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("../aside.html");
  await expect(explorer(page).locator(".file-rename__message")).toHaveText("A name cannot be . or ..");
  await input.fill("aside.html");
  await expect(explorer(page).locator(".file-rename__message")).toHaveText("");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed src/pages/_parts/note.html to src/pages/_parts/aside.html.");
  const aside = row(page, "aside.html");
  await expect(aside).toBeFocused();
  await expect(aside).toHaveAttribute("aria-description", "renamed from src/pages/_parts/note.html, not saved to GitHub yet");
  await expect(aside.locator(".file-status")).toHaveText("R");
  await expect(row(page, "note.html")).toHaveCount(0);

  // One change in the Save panel, selected as a whole.
  await page.keyboard.press("Escape");
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel.locator(".publish-menu__file")).toHaveCount(1);
  await expect(panel.locator(".publish-menu__file")).toContainText("src/pages/_parts/note.html → src/pages/_parts/aside.html");
  await expect(panel.locator(".publish-menu__status [aria-hidden]")).toHaveText("R");
  await expect(panel.locator(".publish-menu__changes")).toContainText("Renamed, no other changes");
  await panel.locator(".publish-menu__file input").check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, routingRepo, "src/pages/_parts/aside.html")).toBe(note);
  expect(await branchFile(page, routingRepo, "src/pages/_parts/note.html")).toBeUndefined();
  // Saved, it is a file like any other.
  await page.keyboard.press("Escape");
  await expand(page, "src/pages/_parts");
  await expect(row(page, "aside.html")).not.toHaveAttribute("aria-description", /.+/);
  await expect(row(page, "note.html")).toHaveCount(0);
});

test("a file deleted from its menu stays struck through with Restore; Delete, Shift+F10 and Escape work from the keyboard; saving removes it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "src/pages/_parts");
  await row(page, "note.html").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Actions for src/pages/_parts/note.html" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Rename/, "Duplicate", /^Delete/, "Copy path"]);
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete src/pages/_parts/note.html?" });
  await expect(dialog).toContainText("It is removed from GitHub when you save. Until then, Restore brings it back.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted src/pages/_parts/note.html.");
  const deleted = row(page, "note.html");
  await expect(deleted).toHaveClass(/is-deleted/);
  await expect(deleted).toHaveAttribute("aria-description", "deleted, not saved to GitHub yet");
  await expect(deleted.locator(".file-status")).toHaveText("D");
  // Its folder, with nothing else in it, is deleted too.
  await expect(row(page, "_parts")).toHaveClass(/is-deleted/);

  // Restore brings it back as it was.
  await explorer(page).getByRole("button", { name: "Restore src/pages/_parts/note.html" }).click();
  await expect(status(page)).toHaveText("Restored src/pages/_parts/note.html.");
  await expect(row(page, "note.html")).not.toHaveClass(/is-deleted/);
  expect(await draft(page, "src/pages/_parts/note.html")).toBeUndefined();

  // Shift+F10 opens the menu, Escape closes it back to the row.
  await row(page, "note.html").focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(row(page, "note.html")).toBeFocused();
  await expect(explorer(page)).toBeVisible();

  // Delete asks; Escape cancels; Enter confirms.
  await page.keyboard.press("Delete");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(explorer(page)).toBeVisible();
  await expect(row(page, "note.html")).toBeFocused();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Enter");
  await expect(row(page, "note.html")).toHaveClass(/is-deleted/);

  // Saving removes it from GitHub, and from the tree.
  await page.keyboard.press("Escape");
  await saveTrigger(page).click();
  const panel = page.locator("#publish-files");
  await expect(panel.locator(".publish-menu__file")).toHaveCount(1);
  await expect(panel.locator(".publish-menu__status [aria-hidden]")).toHaveText("D");
  await expect(panel.getByRole("button", { name: "Restore src/pages/_parts/note.html" })).toBeVisible();
  await panel.locator(".publish-menu__file input").check();
  await page.getByRole("button", { name: "Save selected files", exact: true }).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, routingRepo, "src/pages/_parts/note.html")).toBeUndefined();
  expect(await branchFile(page, routingRepo, "src/pages/index.html")).toBeDefined();
  expect(await draft(page, "src/pages/_parts/note.html")).toBeUndefined();
  await page.keyboard.press("Escape");
  await openFiles(page);
  await expect(row(page, "_parts")).toHaveCount(0);
});

test("dragging a file onto a folder moves it there; a folder cannot go inside itself; Move back returns it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "src/styles");
  await expand(page, "src/pages/_parts");
  await row(page, "note.html").dragTo(row(page, "styles"));
  await expect(status(page)).toHaveText("Moved src/pages/_parts/note.html to src/styles.");
  const moved = explorer(page).locator(".file-row[data-path='src/styles/note.html']");
  await expect(moved).toBeVisible();
  await expect(moved).toHaveAttribute("aria-description", "renamed from src/pages/_parts/note.html, not saved to GitHub yet");
  await expect(row(page, "_parts")).toHaveCount(0);

  // A folder dropped inside itself goes nowhere.
  await row(page, "src").dragTo(row(page, "styles"));
  await expect(explorer(page).locator(".file-row[data-path='src/styles/src']")).toHaveCount(0);
  await expect(row(page, "src")).toBeVisible();

  // Move back, from the row's menu.
  await explorer(page).getByRole("button", { name: "Actions for src/styles/note.html" }).click();
  await page.getByRole("menuitem", { name: "Move back to src/pages/_parts/note.html" }).click();
  await expect(status(page)).toHaveText("Moved src/styles/note.html back to src/pages/_parts/note.html.");
  await expect(moved).toHaveCount(0);
  expect(await draft(page, "src/pages/_parts/note.html")).toBeUndefined();
  expect(await draft(page, "src/styles/note.html")).toBeUndefined();
});

test("renaming a page re-keys its title to the new URL and keeps it open there; Undo takes it back", async ({ page, baseURL }) => {
  await open(page, baseURL, 530, "src/pages/work/fern-and-kettle.html");
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");
  await expand(page, "src/pages/work");
  await row(page, "fern-and-kettle.html").focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("fern");
  await page.keyboard.press("Enter");
  // The page's URL changes, and another page links to it: that is said first.
  const dialog = page.getByRole("dialog", { name: "Rename src/pages/work/fern-and-kettle.html to src/pages/work/fern.html?" });
  await expect(dialog).toContainText("Its URL changes. 1 page links to #/work/fern-and-kettle/; those links are not updated.");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(status(page)).toHaveText("Renamed src/pages/work/fern-and-kettle.html to src/pages/work/fern.html.");
  await expect(page.locator("#current-page")).toHaveText("src/pages/work/fern.html");
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");
  await expect(page.getByRole("group", { name: "Page" }).getByLabel("Title")).toHaveValue("Fern & Kettle");
  expect(JSON.parse((await draft(page, manifestPath)).content).routes).toEqual({ "/work/fern/": { title: "Fern & Kettle" } });
  await openPages(page);
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-description", "/work/fern/");

  // Undo right after takes the rename and the manifest's change back.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveText("src/pages/work/fern-and-kettle.html");
  await expect(status(page)).toHaveText("Undid renaming src/pages/work/fern-and-kettle.html to src/pages/work/fern.html.");
  expect(await draft(page, manifestPath)).toBeUndefined();
  expect(await draft(page, "src/pages/work/fern.html")).toBeUndefined();
  expect(await draft(page, "src/pages/work/fern-and-kettle.html")).toBeUndefined();
  await expect(page.getByRole("group", { name: "Page" }).getByLabel("Title")).toHaveValue("Fern & Kettle");
});

test("deleting a component takes it out of native.json; renaming its folder names the new path; home and native.json are kept", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await expand(page, "src/components");
  await row(page, "card-note").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete the folder src/components/card-note and its 2 files?" });
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the folder src/components/card-note and its 2 files.");
  expect(Object.keys(JSON.parse((await draft(page, manifestPath)).content).components)).not.toContain("card-note");

  // A component's folder renamed: the manifest names the template's new path.
  await row(page, "site-button").focus();
  await page.keyboard.press("F2");
  await explorer(page).getByRole("textbox", { name: "New name for src/components/site-button" }).fill("buttons");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed the folder src/components/site-button to src/components/buttons.");
  expect(JSON.parse((await draft(page, manifestPath)).content).components["site-button"]).toBe("src/components/buttons/site-button.html");

  // The home page and the manifest cannot be deleted.
  await expand(page, "src/pages");
  await row(page, "index.html").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("#notice")).toHaveText("The home page src/pages/index.html cannot be deleted: the site needs a page at /.");
  await expand(page, ".astro-editor");
  await row(page, "native.json").focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("#notice")).toHaveText(".astro-editor/native.json cannot be deleted: it defines the site.");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Saved together: the deletions, the rename and the manifest in one commit.
  await page.keyboard.press("Escape");
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "src/components/card-note/card-note.html")).toBeUndefined();
  expect(await branchFile(page, starterRepo, "src/components/buttons/site-button.html")).toBeDefined();
  expect(await branchFile(page, starterRepo, "src/components/site-button/site-button.html")).toBeUndefined();
  const saved = JSON.parse((await branchFile(page, starterRepo, manifestPath))!);
  expect(saved.components["card-note"]).toBeUndefined();
  expect(saved.components["site-button"]).toBe("src/components/buttons/site-button.html");
});

test("the Pages tab renames a title in place, duplicates a page, and deletes a page or a collection", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);
  // Rename: the manifest's title, typed in the row.
  await item(page, "Fern & Kettle").focus();
  await page.keyboard.press("F2");
  const title = explorer(page).getByRole("textbox", { name: "Title of Fern & Kettle" });
  await expect(title).toBeFocused();
  await title.fill("Fern & Kettle café");
  await page.keyboard.press("Enter");
  await expect(item(page, "Fern & Kettle café")).toBeFocused();
  await expect(status(page)).toHaveText("Renamed Fern & Kettle to Fern & Kettle café");
  expect(JSON.parse((await draft(page, manifestPath)).content).routes["/work/fern-and-kettle/"]).toEqual({ title: "Fern & Kettle café" });

  // Duplicate, from the row's menu: a titled copy beside it.
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Actions for Fern & Kettle café" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Rename/, "Duplicate", /^Delete/]);
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#current-page")).toHaveText("src/pages/work/fern-and-kettle-copy.html");
  await expect(status(page)).toHaveText("Duplicated Fern & Kettle café as Fern & Kettle café (copy) at /work/fern-and-kettle-copy/.");
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");

  // Delete the copy with the Delete key.
  await openPages(page);
  await item(page, "Fern & Kettle café (copy)").focus();
  await page.keyboard.press("Delete");
  const deletePage = page.getByRole("dialog", { name: "Delete the page Fern & Kettle café (copy) (src/pages/work/fern-and-kettle-copy.html)?" });
  await expect(deletePage).toContainText("It is not on GitHub yet, so this discards it.");
  await deletePage.getByRole("button", { name: "Delete" }).click();
  await expect(item(page, "Fern & Kettle café (copy)")).toHaveCount(0);
  expect(await draft(page, "src/pages/work/fern-and-kettle-copy.html")).toBeUndefined();
  expect(Object.keys(JSON.parse((await draft(page, manifestPath)).content).routes)).toEqual(["/work/fern-and-kettle/"]);
  await expect(page.locator("#current-page")).toHaveText("src/pages/index.html");

  // Home has no Delete.
  await openPages(page);
  await item(page, "Home").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Actions for Home" }).getByRole("menuitem")).toHaveText([/^Rename/, "Duplicate"]);
  await page.keyboard.press("Escape");

  // Delete a collection with its pages.
  await explorer(page).getByRole("button", { name: "Actions for Work" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteCollection = page.getByRole("dialog", { name: "Delete the collection Work and its 2 pages?" });
  await expect(deleteCollection).toContainText("1 page links to these pages; those links will lead nowhere.");
  await deleteCollection.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the folder src/pages/work and its 2 files.");
  await expect(item(page, "Work")).toHaveCount(0);
  await expect(item(page, "Fern & Kettle café")).toHaveCount(0);
  expect(JSON.parse((await draft(page, manifestPath)).content).routes ?? {}).toEqual({});
  await expand(page, "src/pages");
  await expect(row(page, "work")).toHaveClass(/is-deleted/);
});

test("deleting a file that changed on GitHub since it was loaded is refused on save and kept", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "src/styles/sections.css", content: "/* changed on GitHub */\n" } });
  await expand(page, "src/styles");
  await row(page, "sections.css").focus();
  await page.keyboard.press("Delete");
  await page.getByRole("dialog", { name: "Delete src/styles/sections.css?" }).getByRole("button", { name: "Delete" }).click();
  await page.keyboard.press("Escape");
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("GitHub changed these files: src/styles/sections.css", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "src/styles/sections.css")).toBe("/* changed on GitHub */\n");
  expect((await draft(page, "src/styles/sections.css"))?.deleted).toBe(true);
});
