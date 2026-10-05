import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// A site read from its files (shared/native-project.ts) over
// `fixtures/native-conventions`, served as the `native-conventions`
// repository (id 531): index.html engages native mode, the components are
// found in components/<tag>/<tag>.html, the shared styles are the
// styles/site.css the pages link (which imports two layer files), and the
// pages' titles are their <title>s.
const indexPath = "index.html";
const hash = (file: string) => `#repo=531&branch=main&file=${encodeURIComponent(file)}`;
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });

// Opens a page row in the Pages tree (rows start collapsed unless they lead to the open page).
async function expandRow(page: Page, name: string) {
  const row = item(page, name);
  await row.focus();
  if ((await row.getAttribute("aria-expanded")) === "false") await page.keyboard.press("ArrowRight");
  await expect(row).toHaveAttribute("aria-expanded", "true");
}

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${hash(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}

test("a site previews its components and the styles its pages link", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(page.locator(".native-preview-warning")).toBeHidden();
  await expect(frame(page).locator("h1")).toHaveText("Found where they are");

  // styles/site.css imports base.css and layout.css into layers.
  await expect(frame(page).locator("h1")).toHaveCSS("color", "rgb(47, 109, 58)");
  await expect(frame(page).locator("body")).toHaveCSS("background-color", "rgb(246, 247, 243)");

  // Both components render, each with the shared styles and its own sheet.
  const header = frame(page).locator("site-header .site-header");
  await expect(header.locator(".brand")).toHaveText("Conventions");
  await expect(header).toHaveCSS("border-bottom-width", "3px");
  const card = frame(page).locator("promo-card .promo-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("background-color", "rgb(255, 250, 230)");
  await expect(card).toHaveCSS("border-top-left-radius", "12px");
  await expect(frame(page).locator("promo-card [slot=title]")).toHaveText("Components by convention");

  // The head is not shown.
  await expect(frame(page).locator("body")).not.toContainText("Built by convention");

  // The nested page is routed by its folder.
  await frame(page).getByRole("link", { name: "First note", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("First note");
  await expect(frame(page).locator("site-header .brand")).toHaveText("Conventions");
});

test("Page settings shows the page's title and description, editable", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openSettings(page);
  const title = settingsDialog(page).getByLabel("Title", { exact: true });
  const description = settingsDialog(page).getByLabel("Description", { exact: true });
  await expect(title).toHaveValue("Built by convention");
  await expect(description).toHaveValue("A site read from its files: its pages, components and styles are found where they are.");
  await expect(title).toBeEditable();
  await expect(description).toBeEditable();
  await settingsDialog(page).locator(".site-settings__footer").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#structure").getByLabel("Title", { exact: true })).toHaveCount(0);

  // Selecting a preview element still opens the page source at it.
  await frame(page).locator("h1").click();
  await expect(page.locator(".native-preview-frame")).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);

  await open(page, baseURL, "notes/first-note/index.html");
  await readSetting(page, "Title", "The first note");
  await readSetting(page, "Description", "");
});

test("the Pages tab labels pages by their titles, and a new page is a folder of its own", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPages(page);
  await expect(item(page, "Home")).toHaveAttribute("aria-selected", "true");
  // Notes does not lead to the open page (Home), so it starts collapsed.
  await expect(item(page, "Notes")).toHaveAttribute("aria-expanded", "false");
  await expandRow(page, "Notes");
  await expect(item(page, "The first note").locator(".pages-url")).toHaveText("/notes/first-note/");

  // Notes is a folder with no page of its own.
  await expect(item(page, "Notes")).toHaveAttribute("aria-description", "/notes/, no page, 1 subpage");
  await expect(item(page, "Notes").locator(".pages-note").first()).toHaveText("(no page)");

  // A page added to Notes is notes/<slug>/index.html, titled in its head.
  await item(page, "Notes").hover();
  await explorer(page).getByRole("button", { name: "Add subpage to Notes" }).click();
  const newTitle = explorer(page).getByRole("textbox", { name: "New subpage of Notes, title" });
  await newTitle.pressSequentially("Second note");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Created the page Second note at /notes/second-note/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/second-note/index.html");
  await expect(page.locator("#current-page")).toHaveText("Second note");
  // It is built from the home page: its header, its own title, an empty <main>.
  await expect(frame(page).locator("site-header .brand")).toHaveText("Conventions");
  await expect(frame(page).locator("main")).toBeEmpty();
  await readSetting(page, "Title", "Second note");
  // The title is in the file; the code pane shows the page's <head> folded on first view.
  await expect.poll(async () => (await storedDraft(page, "notes/second-note/index.html"))?.content).toContain("<title>Second note</title>");
  await expect(page.locator("#content .view-lines")).toContainText("<head>");
  await expect(page.locator("#content .view-lines")).not.toContainText("<title>");
  await openPages(page);
  await expect(item(page, "Second note")).toBeVisible();
});

// Opens the folders along `path` in the Files tree.
async function expand(page: Page, path: string) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Files" }).click();
  for (const part of path.split("/")) {
    const folder = explorer(page).getByRole("button", { name: part, exact: true }).first();
    await expect(folder).toBeVisible({ timeout: 20_000 });
    if ((await folder.getAttribute("aria-expanded")) === "false") await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
  }
}

test("moved, renamed and deleted files are found where they are now", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const row = (name: string) => explorer(page).getByRole("button", { name, exact: true });
  const card = frame(page).locator("promo-card .promo-card");
  await expect(card).toBeVisible();

  // A component's template moved out of its folder is the flat component of the same tag.
  await expand(page, "components/promo-card");
  await row("promo-card.html").dragTo(row("components"));
  await expect(page.locator("#status")).toHaveText("Moved components/promo-card/promo-card.html to components.");
  await expect(card).toBeVisible();
  await expect(frame(page).locator("promo-card [slot=title]")).toHaveText("Components by convention");
  // Its stylesheet stayed in the folder, so only the shared styles reach it now.
  await expect(card).toHaveCSS("background-color", "rgb(255, 250, 230)");
  await expect(card).toHaveCSS("border-top-left-radius", "0px");

  // Renaming a shared stylesheet updates its authored references atomically.
  const pageSource = () => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
  const beforeRename = await pageSource();
  expect(beforeRename).toContain('href="/styles/site.css"');
  await expand(page, "styles");
  await row("site.css").focus();
  await page.keyboard.press("F2");
  await explorer(page).getByRole("textbox", { name: "New name for styles/site.css" }).fill("main.css");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Renamed styles/site.css to styles/main.css.");
  await expect.poll(pageSource).toBe(beforeRename!.replace('href="/styles/site.css"', 'href="/styles/main.css"'));
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(frame(page).locator("h1")).toHaveCSS("color", "rgb(47, 109, 58)");
  // Undo restores both the file and its exact original page reference.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(pageSource).toBe(beforeRename);
  await expect(frame(page).locator("h1")).toHaveCSS("color", "rgb(47, 109, 58)");

  // A component deleted is no longer one.
  await expand(page, "components");
  await row("site-header").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete the folder components/site-header and its 2 files?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#status")).toHaveText("Deleted the folder components/site-header and its 2 files.");
  await expect(frame(page).locator("site-header .site-header")).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(page.locator(".native-preview-error")).toBeHidden();
});

test("the Pages tab's Rename is enabled, and Duplicate titles the copy in its head", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPages(page);
  await expandRow(page, "Notes");
  const note = item(page, "The first note");
  await note.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Actions for The first note" });
  await expect(menu.getByRole("menuitem", { name: /^Rename/ })).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(note).toBeFocused();

  // Duplicate: the copy's <title> carries its title.
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/first-note-copy/index.html");
  // The top bar names it by its title, not its heading.
  await expect(page.locator("#current-page")).toHaveText("The first note (copy)");
  await expect(page.locator("#status")).toHaveText("Duplicated The first note as The first note (copy) at /notes/first-note-copy/.");
  await expect(frame(page).locator("h1")).toHaveText("First note");
  await readSetting(page, "Title", "The first note (copy)");
  await openPages(page);
  await expect(item(page, "The first note (copy)")).toBeVisible();
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
