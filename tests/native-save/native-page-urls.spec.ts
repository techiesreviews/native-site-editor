import { expect, test, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";

// A folder page (`x/index.html`) can have subpages, which are in its folder;
// a single-file page (`x.html`) has none. A page's URL can change
// (src/native-page-moves.ts, the Pages tab in components/pages-tree.ts, the
// Page block's URL field in components/page-structure.ts, Move to… in
// components/page-picker.ts): the page moves, a folder page with its whole
// folder, every root link to them follows, and the old URLs can keep
// working in `_redirects`. Everything is drafts, saved by Save to GitHub to
// the fake GitHub (server.ts): `native-routing` (id 530) and
// `native-conventions` (id 531).
const redirectsPath = "_redirects";
const routingRepo = "native-demo-user/native-routing";
const conventionsRepo = "native-demo-user/native-conventions";
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
const item = (page: Page, name: string) => explorer(page).getByRole("treeitem", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const block = (page: Page) => page.getByRole("group", { name: "Page" });
const saveTrigger = publishButton;

async function open(page: Page, baseURL: string | undefined, repo: number, file = "index.html") {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
}

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}

// A file on the fake GitHub branch, read through the worker's API.
async function branchFile(page: Page, repo: string, path: string): Promise<string | undefined> {
  const snapshot = await (await page.request.get(`/api/snapshot?${new URLSearchParams({ repo, branch: "main" })}`)).json();
  const entry = (snapshot.tree as { path: string; sha: string }[]).find((item) => item.path === path);
  if (!entry) return undefined;
  const file = await (await page.request.get(`/api/file?${new URLSearchParams({ repo, sha: entry.sha })}`)).json();
  return file.content;
}

// The browser draft of `path`, if any.
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
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
}

test("a single-file page has no subpages; a folder page's subpage is a folder in its folder, and deleting it leaves nothing to save", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);
  // /work/notes.html is one file: no Add subpage.
  await expect(explorer(page).getByRole("button", { name: "Add subpage to Notes" })).toHaveCount(0);
  await item(page, "Notes").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Actions for Notes" }).getByRole("menuitem")).toHaveText([/^Rename/, "Change URL…", "Move to…", "Duplicate", /^Delete/]);
  await page.keyboard.press("Escape");

  await item(page, "Fern & Kettle").hover();
  await explorer(page).getByRole("button", { name: "Add subpage to Fern & Kettle" }).click();
  await explorer(page).getByRole("textbox", { name: "New subpage of Fern & Kettle, title" }).fill("Draft");
  await expect(explorer(page).locator(".pages-edit__message")).toBeEmpty();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Created the page Draft at /work/fern-and-kettle/draft/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/fern-and-kettle/draft/index.html");
  await expect(frame(page).locator("main")).toBeEmpty();

  // Fern & Kettle is where it was, now with a subpage.
  await openPages(page);
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, "Draft")).toHaveAttribute("aria-level", "3");

  // Deleting it: nothing is left to save.
  await item(page, "Draft").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: "Delete the page Draft (work/fern-and-kettle/draft/index.html)?" });
  await expect(dialog).toContainText("It is not on GitHub yet, so this discards it.");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toHaveText("Deleted the page Draft.");
  await expect(item(page, "Draft")).toHaveCount(0);
  await expect(item(page, "Fern & Kettle")).not.toHaveAttribute("aria-expanded");
  expect(await draft(page, "work/fern-and-kettle/draft/index.html")).toBeUndefined();
  await expect(saveTrigger(page)).toBeDisabled();
});

test("the Page block's URL changes a page's URL: links in pages and the header nav follow, the old URL redirects, Undo takes it all back, Save commits it", async ({ page, baseURL }) => {
  const notePath = "notes/first-note/index.html";
  await open(page, baseURL, 531, notePath);
  const url = block(page).getByRole("textbox", { name: "URL", exact: true });
  await expect(url).toHaveValue("/notes/first-note/");
  const message = block(page).locator(".url-change__message");
  const keep = block(page).getByRole("checkbox", { name: /^Keep the old URL working/ });

  // Checked as typed.
  await url.fill("/notes/Bad URL/");
  await expect(message).toHaveText("Use letters, digits, -, _ and . in the URL, with / between parts.");
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await url.fill("/");
  await expect(message).toHaveText("/ is the home page's URL.");
  await url.fill("/404.html");
  await expect(message).toContainText("/404.html is the page shown for addresses the site does not have.");
  // Escape cancels.
  await url.press("Escape");
  await expect(url).toHaveValue("/notes/first-note/");
  await expect(message).toBeHidden();

  await url.fill("/notes/hello/");
  await expect(message).toHaveText("Moves notes/first-note/index.html to notes/hello/index.html; updates 2 links in 2 files.");
  await expect(keep).toBeChecked();
  await expect(keep).toHaveAccessibleName("Keep the old URL working (/notes/first-note/ redirects to /notes/hello/)");
  await url.press("Enter");
  await expect(status(page)).toHaveText("URL changed to /notes/hello/ — 2 links updated in 2 files; /notes/first-note/ redirects there.");
  // The page stays open where it went, under the same name; the preview follows.
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/hello/index.html");
  await expect(page.locator("#current-page")).toHaveText("The first note");
  await expect(frame(page).locator("h1")).toHaveText("First note");
  await expect(frame(page).locator("site-header nav a")).toHaveAttribute("href", "/notes/hello/");
  await expect(url).toHaveValue("/notes/hello/");
  expect((await draft(page, "index.html")).content).toContain('<a href="/notes/hello/" data-key="note-link">First note</a>');
  expect((await draft(page, "components/site-header/site-header.html")).content).toContain('<a href="/notes/hello/" data-key="nav-note">Notes</a>');
  expect((await draft(page, redirectsPath)).content).toBe("/notes/first-note/ /notes/hello/ 301\n");
  expect((await draft(page, "notes/hello/index.html")).movedFrom).toBe(notePath);

  // Undo takes every file back.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(status(page)).toHaveText("Undid changing the URL of The first note to /notes/hello/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", notePath);
  await expect(url).toHaveValue("/notes/first-note/");
  for (const path of ["index.html", "components/site-header/site-header.html", redirectsPath, "notes/hello/index.html", notePath])
    expect(await draft(page, path), path).toBeUndefined();

  // Again, saved: one commit with the move, the links and the redirect.
  await url.fill("/notes/hello/");
  await url.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/hello/index.html");
  await saveAll(page);
  expect(await branchFile(page, conventionsRepo, notePath)).toBeUndefined();
  expect(await branchFile(page, conventionsRepo, "notes/hello/index.html")).toContain("<title>The first note</title>");
  expect(await branchFile(page, conventionsRepo, "index.html")).toContain('<a href="/notes/hello/" data-key="note-link">First note</a>');
  expect(await branchFile(page, conventionsRepo, "components/site-header/site-header.html")).toContain('href="/notes/hello/"');
  expect(await branchFile(page, conventionsRepo, redirectsPath)).toBe("/notes/first-note/ /notes/hello/ 301\n");
});

test("changing the URL of a page with subpages in the Pages tab moves its folder and the links to everything in it", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);

  // Escape cancels a URL being changed.
  await item(page, "Notes").hover();
  await explorer(page).getByRole("button", { name: "Change the URL of Notes, /work/notes.html" }).click();
  const notesUrl = explorer(page).getByRole("textbox", { name: "URL of Notes" });
  await expect(notesUrl).toBeFocused();
  await notesUrl.fill("/x/");
  await page.keyboard.press("Escape");
  await expect(notesUrl).toHaveCount(0);
  await expect(item(page, "Notes")).toBeFocused();
  await expect(status(page)).toHaveText("Cancelled changing the URL of Notes");
  await expect(explorer(page)).toBeVisible();

  // Work and its two subpages, from the row's menu.
  await item(page, "Work").focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Change URL…" }).click();
  const url = explorer(page).getByRole("textbox", { name: "URL of Work" });
  await expect(url).toHaveValue("/work/");
  await url.fill("/work/fern-and-kettle/deep/");
  await expect(explorer(page).locator(".url-change__message")).toHaveText("A page cannot go under itself or its own subpages.");
  await url.fill("/projects/");
  await expect(explorer(page).locator(".url-change__message")).toHaveText("Moves work/index.html to projects/index.html with its 2 subpages; updates 3 links in 2 files.");
  await expect(explorer(page).getByRole("checkbox", { name: /^Keep the old URL working/ })).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("URL changed to /projects/ — 3 links updated in 2 files; /work/ redirects there.");
  await expect(item(page, "Work").locator(".pages-url").first()).toHaveText("/projects/");
  await expect(item(page, "Fern & Kettle").locator(".pages-url")).toHaveText("/projects/fern-and-kettle/");
  await expect(item(page, "Notes").locator(".pages-url")).toHaveText("/projects/notes.html");
  expect((await draft(page, redirectsPath)).content).toBe("/work/ /projects/ 301\n/work/fern-and-kettle/ /projects/fern-and-kettle/ 301\n/work/notes.html /projects/notes.html 301\n");

  // The home page links to the new URL; the preview follows it there.
  await page.keyboard.press("Escape");
  await frame(page).locator('[data-key="work-link"]').click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("Work");

  await saveAll(page);
  for (const path of ["work/index.html", "work/fern-and-kettle/index.html", "work/notes.html"])
    expect(await branchFile(page, routingRepo, path), path).toBeUndefined();
  expect(await branchFile(page, routingRepo, "index.html")).toContain('href="/projects/"');
  expect(await branchFile(page, routingRepo, "projects/index.html")).toContain('href="/projects/fern-and-kettle/"');
  // A relative link needs no change.
  expect(await branchFile(page, routingRepo, "projects/fern-and-kettle/index.html")).toContain('href="../"');
  // A subpage's canonical and og:url follow it too.
  expect(await branchFile(page, routingRepo, "projects/fern-and-kettle/index.html")).toContain('<link rel="canonical" href="https://routing.example/projects/fern-and-kettle/">');
  expect(await branchFile(page, routingRepo, "projects/fern-and-kettle/index.html")).toContain('<meta property="og:url" content="https://routing.example/projects/fern-and-kettle/">');
  expect(await branchFile(page, routingRepo, "projects/notes.html")).toBeDefined();
  expect(await branchFile(page, routingRepo, redirectsPath)).toContain("/work/ /projects/ 301\n");
});

test("Move to… from the keyboard puts a page under another; the confirmation says the new URL and offers the redirect", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);
  await item(page, "Notes").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Actions for Notes" });
  for (let n = 0; n < 2; n++) await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Move to…" })).toBeFocused();
  await page.keyboard.press("Enter");

  const picker = page.getByRole("dialog", { name: "Move Notes to…" });
  const places = picker.getByRole("tree");
  await expect(places.getByRole("treeitem")).toHaveText([/^Top level/, /^Work/, /^Fern & Kettle/, /^Notes/]);
  await expect(places.getByRole("treeitem", { name: "Top level" })).toBeFocused();
  await expect(places.getByRole("treeitem", { name: "Work" })).toHaveAttribute("aria-disabled", "true");
  await expect(places.getByRole("treeitem", { name: "Notes" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ArrowDown");
  await expect(picker).toContainText("It is there now.");
  await page.keyboard.press("ArrowDown");
  await expect(places.getByRole("treeitem", { name: "Fern & Kettle" })).toBeFocused();
  await page.keyboard.press("Enter");

  const confirm = page.getByRole("dialog", { name: "Move Notes to /work/fern-and-kettle/notes.html?" });
  await expect(confirm).toContainText("Its URL changes from /work/notes.html to /work/fern-and-kettle/notes.html.");
  await expect(confirm).toContainText("Moves work/notes.html to work/fern-and-kettle/notes.html; updates 1 link in 1 file.");
  await expect(confirm.getByRole("checkbox", { name: /^Keep the old URL working/ })).toBeChecked();
  await expect(confirm.getByRole("button", { name: "Move" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("URL changed to /work/fern-and-kettle/notes.html — 1 link updated in 1 file; /work/notes.html redirects there.");
  await expect(item(page, "Notes")).toHaveAttribute("aria-level", "3");
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-expanded", "true");
  expect((await draft(page, "work/fern-and-kettle/notes.html")).movedFrom).toBe("work/notes.html");
  expect((await draft(page, redirectsPath)).content).toBe("/work/notes.html /work/fern-and-kettle/notes.html 301\n");

  // Moved to the top level, without the redirect: the redirect line follows it there.
  await item(page, "Notes").focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Move to…" }).click();
  await page.keyboard.press("Enter");
  const back = page.getByRole("dialog", { name: "Move Notes to /notes.html?" });
  // Not on GitHub at /work/fern-and-kettle/notes.html: nothing to keep working there.
  await expect(back.getByRole("checkbox")).toBeHidden();
  await back.getByRole("button", { name: "Move" }).click();
  await expect(status(page)).toHaveText("URL changed to /notes.html — 1 link updated in 1 file.");
  await expect(item(page, "Notes")).toHaveAttribute("aria-level", "1");
  await expect(item(page, "Fern & Kettle")).not.toHaveAttribute("aria-expanded");
  expect((await draft(page, "notes.html")).movedFrom).toBe("work/notes.html");
  expect((await draft(page, redirectsPath)).content).toBe("/work/notes.html /notes.html 301\n");
});

test("dragging a page onto another makes it a subpage; onto the line between rows it moves to that level", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);
  const fern = item(page, "Fern & Kettle").locator(".pages-row");

  // Onto itself: nothing happens.
  await fern.dragTo(fern);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Onto Home: a page at the top level; the link to it follows.
  await fern.dragTo(item(page, "Home").locator(".pages-row"));
  const confirm = page.getByRole("dialog", { name: "Move Fern & Kettle to /fern-and-kettle/?" });
  await expect(confirm).toContainText("updates 1 link in 1 file.");
  await confirm.getByRole("checkbox", { name: /^Keep the old URL working/ }).uncheck();
  await confirm.getByRole("button", { name: "Move" }).click();
  await expect(status(page)).toHaveText("URL changed to /fern-and-kettle/ — 1 link updated in 1 file.");
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-level", "1");
  expect((await draft(page, "work/index.html")).content).toContain('href="/fern-and-kettle/"');
  expect(await draft(page, redirectsPath)).toBeUndefined();

  // Onto the line above Notes: Notes's level, /work/, where it was: nothing left to save.
  const notes = item(page, "Notes").locator(".pages-row").first();
  await fern.dragTo(notes, { targetPosition: { x: 40, y: 2 } });
  const back = page.getByRole("dialog", { name: "Move Fern & Kettle to /work/fern-and-kettle/?" });
  await back.getByRole("button", { name: "Move" }).click();
  await expect(status(page)).toHaveText("URL changed to /work/fern-and-kettle/ — 1 link updated in 1 file.");
  await expect(item(page, "Fern & Kettle")).toHaveAttribute("aria-level", "2");
  for (const path of ["work/index.html", "work/fern-and-kettle/index.html", "fern-and-kettle/index.html"])
    expect(await draft(page, path), path).toBeUndefined();
});

test("deleting a page with subpages can keep them: the folder is then a row with no page, whose Create page brings it back", async ({ page, baseURL }) => {
  await open(page, baseURL, 530);
  await openPages(page);
  await item(page, "Work").focus();
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog", { name: "Delete Work?" });
  await expect(dialog).toContainText("Work (/work/) has 2 subpages.");
  await dialog.getByRole("button", { name: "Delete only this page" }).click();
  await expect(status(page)).toHaveText("Deleted the page Work.");
  await expect(item(page, "Work")).toHaveAttribute("aria-description", "/work/, no page, 2 subpages");
  await expect(item(page, "Fern & Kettle")).toBeVisible();
  expect((await draft(page, "work/index.html")).deleted).toBe(true);
  expect(await draft(page, "work/notes.html")).toBeUndefined();
  // Create page on it brings the deleted page back.
  await item(page, "Work").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Create page", "Add subpage"]);
  await page.getByRole("menuitem", { name: "Create page" }).click();
  await expect(status(page)).toHaveText("Restored work/index.html.");
  expect(await draft(page, "work/index.html")).toBeUndefined();
});

test("Create page on a folder with no page makes its index.html from the home page, titled in its head", async ({ page, baseURL }) => {
  await open(page, baseURL, 531);
  await openPages(page);
  await item(page, "Notes").locator(".pages-row").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Create page" }).click();
  await expect(status(page)).toHaveText("Created the page Notes at /notes/.");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "notes/index.html");
  await expect(block(page).getByLabel("Title")).toHaveValue("Notes");
  const made = (await draft(page, "notes/index.html")).content;
  expect(made).toContain("<title>Notes</title>");
  expect(made).toContain('<site-header data-key="header"></site-header>');
});
