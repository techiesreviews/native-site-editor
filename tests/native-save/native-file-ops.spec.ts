import { publishButton, showPublish } from "./publish";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Deleting, renaming, moving and duplicating files as publishable drafts
// (src/file-changes.ts, the row actions in components/file-row-actions.ts),
// and the Pages tab's Rename, Duplicate and Delete. Saving commits through
// the real worker publish path to the fake GitHub (server.ts), deletions as
// `sha: null`. `native-routing` (id 530) routes its pages by folder; the
// starter (id 501) has components and is what `/__demo/external-edit`
// changes.
const routingRepo = "native-demo-user/native-routing";
const starterRepo = "native-demo-user/native-demo";
const note = readFileSync(resolve("fixtures/native-routing/_parts/note.html"), "utf8");
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
const saveTrigger = publishButton;

async function open(page: Page, baseURL: string | undefined, repo: number, file = "index.html") {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
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
  await showPublish(page);
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  for (const box of await panel.locator(".publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
}

test("F2 renames a file in its row; the Save panel lists one rename, and saving moves it on GitHub", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "_parts");
  const noteRow = row(page, "note.html");
  await noteRow.focus();
  await page.keyboard.press("F2");
  const input = explorer(page).getByRole("textbox", { name: "New name for _parts/note.html" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("note.html");
  // The name is selected without its extension.
  expect(await input.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd])).toEqual([0, 4]);
  // Escape cancels the rename only, not the explorer.
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(explorer(page)).toBeVisible();
  await expect(noteRow).toBeFocused();
  await expect(status(page)).toHaveText("Cancelled renaming _parts/note.html");

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
  await expect(status(page)).toHaveText("Renamed _parts/note.html to _parts/aside.html.");
  const aside = row(page, "aside.html");
  await expect(aside).toBeFocused();
  await expect(aside).toHaveAttribute("aria-description", "renamed from _parts/note.html, not saved to GitHub yet");
  await expect(aside.locator(".file-status")).toHaveText("R");
  await expect(row(page, "note.html")).toHaveCount(0);

  // One change in the Save panel, selected as a whole.
  await page.keyboard.press("Escape");
  await showPublish(page);
  const panel = page.locator("#publish-files");
  await expect(panel.locator(".publish-menu__file")).toHaveCount(1);
  await expect(panel.locator(".publish-menu__file")).toContainText("_parts/note.html → _parts/aside.html");
  await expect(panel.locator(".publish-menu__status [aria-hidden]")).toHaveText("R");
  await expect(panel.locator(".publish-menu__changes")).toContainText("Renamed, no other changes");
  await panel.locator(".publish-menu__file input").check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, routingRepo, "_parts/aside.html")).toBe(note);
  expect(await branchFile(page, routingRepo, "_parts/note.html")).toBeUndefined();
  // Saved, it is a file like any other.
  await page.keyboard.press("Escape");
  await expand(page, "_parts");
  await expect(row(page, "aside.html")).not.toHaveAttribute("aria-description", /.+/);
  await expect(row(page, "note.html")).toHaveCount(0);
});

test("a file deleted from its menu stays struck through with Restore; Delete, Shift+F10 and Escape work from the keyboard; saving removes it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "_parts");
  await row(page, "note.html").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Actions for _parts/note.html" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Rename/, "Duplicate", /^Delete/, "Copy path"]);
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete _parts/note.html?" });
  await expect(dialog).toContainText("It is removed from GitHub when you save. Until then, Restore brings it back.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted _parts/note.html.");
  const deleted = row(page, "note.html");
  await expect(deleted).toHaveClass(/is-deleted/);
  await expect(deleted).toHaveAttribute("aria-description", "deleted, not saved to GitHub yet");
  await expect(deleted.locator(".file-status")).toHaveText("D");
  // Its folder, with nothing else in it, is deleted too.
  await expect(row(page, "_parts")).toHaveClass(/is-deleted/);

  // Restore brings it back as it was.
  await explorer(page).getByRole("button", { name: "Restore _parts/note.html" }).click();
  await expect(status(page)).toHaveText("Restored _parts/note.html.");
  await expect(row(page, "note.html")).not.toHaveClass(/is-deleted/);
  expect(await draft(page, "_parts/note.html")).toBeUndefined();

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
  await showPublish(page);
  const panel = page.locator("#publish-files");
  await expect(panel.locator(".publish-menu__file")).toHaveCount(1);
  await expect(panel.locator(".publish-menu__status [aria-hidden]")).toHaveText("D");
  await expect(panel.getByRole("button", { name: "Restore _parts/note.html" })).toBeVisible();
  await panel.locator(".publish-menu__file input").check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, routingRepo, "_parts/note.html")).toBeUndefined();
  expect(await branchFile(page, routingRepo, "index.html")).toBeDefined();
  expect(await draft(page, "_parts/note.html")).toBeUndefined();
  await page.keyboard.press("Escape");
  await openFiles(page);
  await expect(row(page, "_parts")).toHaveCount(0);
});

test("dragging a file onto a folder moves it there; a folder cannot go inside itself; Move back returns it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await expand(page, "styles");
  await expand(page, "_parts");
  await row(page, "note.html").dragTo(row(page, "styles"));
  await expect(status(page)).toHaveText("Moved _parts/note.html to styles.");
  const moved = explorer(page).locator(".file-row[data-path='styles/note.html']");
  await expect(moved).toBeVisible();
  await expect(moved).toHaveAttribute("aria-description", "renamed from _parts/note.html, not saved to GitHub yet");
  await expect(row(page, "_parts")).toHaveCount(0);

  // A folder dropped inside itself goes nowhere.
  await row(page, "work").dragTo(row(page, "work"));
  await expect(explorer(page).locator(".file-row[data-path='work/work']")).toHaveCount(0);
  await expect(row(page, "work")).toBeVisible();

  // Move back, from the row's menu.
  await explorer(page).getByRole("button", { name: "Actions for styles/note.html" }).click();
  await page.getByRole("menuitem", { name: "Move back to _parts/note.html" }).click();
  await expect(status(page)).toHaveText("Moved styles/note.html back to _parts/note.html.");
  await expect(moved).toHaveCount(0);
  expect(await draft(page, "_parts/note.html")).toBeUndefined();
  expect(await draft(page, "styles/note.html")).toBeUndefined();
});

test("renaming a single-file page changes its URL, updates its links and keeps it open there; Undo takes it back", async ({ page, baseURL }) => {
  await open(page, baseURL, 530, "work/notes.html");
  await expect(frame(page).locator("h1")).toHaveText("Notes");
  await expand(page, "work");
  await row(page, "notes.html").focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("journal");
  await page.keyboard.press("Enter");
  // The page's URL changes, and another page links to it: that is said first.
  const dialog = page.getByRole("dialog", { name: "Rename work/notes.html to work/journal.html?" });
  await expect(dialog).toContainText("Its URL changes from /work/notes.html to /work/journal.html.");
  await expect(dialog).toContainText("Updates 1 link in 1 file.");
  await dialog.getByRole("button", { name: "Rename" }).click();
  await expect(status(page)).toHaveText("Renamed work/notes.html to work/journal.html — 1 link updated in 1 file; /work/notes.html redirects there.");
  expect((await draft(page, "work/index.html")).content).toContain('href="/work/journal.html"');
  expect((await draft(page, "_redirects")).content).toBe("/work/notes.html /work/journal.html 301\n");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/journal.html");
  await expect(page.locator("#current-page")).toHaveText("Notes");
  await expect(frame(page).locator("h1")).toHaveText("Notes");
  await openPages(page);
  await expect(item(page, "Notes")).toHaveAttribute("aria-description", "/work/journal.html");

  // Undo right after takes the rename, the link and the redirect back.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/notes.html");
  await expect(status(page)).toHaveText("Undid renaming work/notes.html to work/journal.html.");
  for (const path of ["work/journal.html", "work/notes.html", "work/index.html", "_redirects"])
    expect(await draft(page, path), path).toBeUndefined();
});

test("components are deleted and renamed like any folder, saved in one commit; the home page is kept", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await expand(page, "components");
  await row(page, "card-note").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete the folder components/card-note and its 2 files?" });
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the folder components/card-note and its 2 files.");

  await row(page, "site-button").focus();
  await page.keyboard.press("F2");
  await explorer(page).getByRole("textbox", { name: "New name for components/site-button" }).fill("buttons");
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Renamed the folder components/site-button to components/buttons.");

  // The home page cannot be deleted.
  await openFiles(page);
  await row(page, "index.html").first().focus();
  await page.keyboard.press("Delete");
  await expect(page.locator("#notice")).toHaveText("The home page index.html cannot be deleted: the site needs a page at /.");

  // Saved together: the deletions and the rename in one commit.
  await page.keyboard.press("Escape");
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "components/card-note/card-note.html")).toBeUndefined();
  expect(await branchFile(page, starterRepo, "components/buttons/site-button.html")).toBeDefined();
  expect(await branchFile(page, starterRepo, "components/site-button/site-button.html")).toBeUndefined();
});

test("the Pages tab renames a title in place, duplicates a page, and deletes a page with its subpages", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);
  // Rename: the title, typed in the row, goes into the page's <title>.
  await item(page, "Fern & Kettle").focus();
  await page.keyboard.press("F2");
  const title = explorer(page).getByRole("textbox", { name: "Title of Fern & Kettle" });
  await expect(title).toBeFocused();
  await title.fill("Fern & Kettle café");
  await page.keyboard.press("Enter");
  await expect(item(page, "Fern & Kettle café")).toBeFocused();
  await expect(status(page)).toHaveText("Renamed Fern & Kettle to Fern & Kettle café");
  expect((await draft(page, "work/fern-and-kettle/index.html")).content).toContain("<title>Fern &amp; Kettle café</title>");

  // Duplicate, from the row's menu: a titled copy beside it.
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Actions for Fern & Kettle café" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Add subpage", /^Rename/, "Change URL…", "Move to…", "Duplicate", /^Delete/]);
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/fern-and-kettle-copy/index.html");
  await expect(status(page)).toHaveText("Duplicated Fern & Kettle café as Fern & Kettle café (copy) at /work/fern-and-kettle-copy/.");
  await expect(frame(page).locator("h1")).toHaveText("Fern and Kettle");

  // Delete the copy with the Delete key.
  await openPages(page);
  await item(page, "Fern & Kettle café (copy)").focus();
  await page.keyboard.press("Delete");
  const deletePage = page.getByRole("dialog", { name: "Delete the page Fern & Kettle café (copy) (work/fern-and-kettle-copy/index.html)?" });
  await expect(deletePage).toContainText("It is not on GitHub yet, so this discards it.");
  await deletePage.getByRole("button", { name: "Delete" }).click();
  await expect(item(page, "Fern & Kettle café (copy)")).toHaveCount(0);
  expect(await draft(page, "work/fern-and-kettle-copy/index.html")).toBeUndefined();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");

  // Home has no Delete.
  await openPages(page);
  await item(page, "Home").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Actions for Home" }).getByRole("menuitem")).toHaveText(["Add subpage", /^Rename/, "Duplicate"]);
  await page.keyboard.press("Escape");

  // Delete a page with its subpages.
  await explorer(page).getByRole("button", { name: "Actions for Work" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteWork = page.getByRole("dialog", { name: "Delete Work?" });
  await expect(deleteWork).toContainText("1 page links to these pages; those links will lead nowhere.");
  await expect(deleteWork.getByRole("button", { name: "Delete only this page" })).toBeFocused();
  await deleteWork.getByRole("button", { name: "Delete Work and its 2 subpages" }).click();
  await expect(status(page)).toHaveText("Deleted Work and its 2 subpages.");
  await expect(item(page, "Work")).toHaveCount(0);
  await expect(item(page, "Fern & Kettle café")).toHaveCount(0);
  await openFiles(page);
  await expect(row(page, "work")).toHaveClass(/is-deleted/);
});

test("deleting a file that changed on GitHub since it was loaded is refused on save and kept", async ({ page, baseURL }) => {
  await open(page, baseURL, 501);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "styles/sections.css", content: "/* changed on GitHub */\n" } });
  await expand(page, "styles");
  await row(page, "sections.css").focus();
  await page.keyboard.press("Delete");
  await page.getByRole("dialog", { name: "Delete styles/sections.css?" }).getByRole("button", { name: "Delete" }).click();
  await page.keyboard.press("Escape");
  await saveAll(page);
  await expect(page.locator(".publish-menu__message")).toContainText("GitHub changed these files: styles/sections.css", { timeout: 30_000 });
  expect(await branchFile(page, starterRepo, "styles/sections.css")).toBe("/* changed on GitHub */\n");
  expect((await draft(page, "styles/sections.css"))?.deleted).toBe(true);
});
