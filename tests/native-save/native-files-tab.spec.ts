import { expect, test, type Locator, type Page } from "@playwright/test";

// The Files tab's look (slice 124 design note): a title-case header with a quiet count, one row
// height (32 px desktop, 44 px touch), a chevron slot on every row so names at a level line up,
// icons and a quiet type word by file type, and one action per row on touch. Default fixture group.
test.beforeEach(({ page }) => page.setDefaultTimeout(15_000));

const explorer = (page: Page) => page.locator("#explorer");
const row = (page: Page, path: string) => explorer(page).locator(`.file-row[data-path="${path}"]`);
const line = (page: Page, path: string) => explorer(page).locator(`.file-row-line:has(> .file-row[data-path="${path}"])`);

async function openFiles(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Files", exact: true }).click();
  await expect(row(page, "index.html")).toBeVisible();
}
const left = (page: Page, selector: string) => explorer(page).locator(selector).evaluate(element => element.getBoundingClientRect().left);

test("one head row with the switch, the search and + New, no heading or count; rows are one height with names lined up and typed icons", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFiles(page, baseURL);
  const heading = explorer(page).locator(".explorer-head");
  await expect(heading.getByRole("tab", { name: "Files", exact: true })).toHaveAttribute("aria-selected", "true");
  // No heading row and no count (S2, mock-up 05 v2).
  await expect(explorer(page).locator("#explorer-files > .files-heading")).toHaveCount(0);
  await expect(page.locator("#files-count")).toHaveCount(0);
  await expect(heading.getByRole("button", { name: "New file or folder", exact: true })).toHaveText("+ New");
  await expect(heading.getByLabel("Search files", { exact: true })).toBeVisible();
  await expect(page.locator("#revision")).toBeHidden();

  // Icons by type arrive with the explorer (the tree is drawn again then); the wide panel says the type.
  await expect(row(page, "index.html").locator(".file-icon")).toHaveAttribute("data-type", "page");
  for (const path of ["index.html", "images"]) expect((await line(page, path).boundingBox())!.height).toBe(32);
  // The page opened at start is the marked row.
  await expect(row(page, "index.html")).toHaveClass(/\bselected\b/);
  // A folder and a file at one level start their names at the same x; a child sits deeper.
  expect(await left(page, '.file-row[data-path="images"] .filename')).toBe(await left(page, '.file-row[data-path="index.html"] .filename'));
  await row(page, "images").click();
  await expect(row(page, "images")).toHaveAttribute("aria-expanded", "true");
  expect(await left(page, '.file-row[data-path="images/studio-desk.svg"] .filename')).toBeGreaterThan(await left(page, '.file-row[data-path="index.html"] .filename'));

  await expect(row(page, "robots.txt").locator(".file-icon")).toHaveAttribute("data-type", "text");
  await expect(row(page, "images/studio-desk.svg").locator(".file-icon")).toHaveAttribute("data-type", "picture");
  await expect(row(page, "index.html").locator(".file-type")).toHaveText("Page");
  // One type column for every level, where Pages shows its URLs.
  const column = (path: string) => row(page, path).locator(".file-type").evaluate(element => Math.round(element.getBoundingClientRect().left));
  expect(await column("images/studio-desk.svg")).toBe(await column("index.html"));
  await expect(explorer(page).getByRole("button", { name: "index.html", exact: true })).toBeVisible();

  // Hover shows the folder's + and ⋯ inside the row, clear of the type word.
  await line(page, "images").hover();
  await expect(line(page, "images").getByRole("button", { name: "New in images", exact: true })).toBeVisible();
  const more = (await line(page, "images").getByRole("button", { name: "Actions for images", exact: true }).boundingBox())!;
  const word = await row(page, "index.html").locator(".file-type").evaluate(element => element.getBoundingClientRect().right);
  expect(word).toBeLessThan(more.x);
});

test("the type icons arriving leave a rename being typed as it is", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/file-type-icons*", async route => { await held; await route.continue(); });
  await openFiles(page, baseURL);
  await expect(row(page, "robots.txt").locator(".file-icon")).not.toHaveAttribute("data-type", /./);
  await row(page, "robots.txt").focus();
  await page.keyboard.press("F2");
  const field = explorer(page).getByRole("textbox", { name: "New name for robots.txt", exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type("-old");
  release();
  await expect(row(page, "index.html").locator(".file-icon")).toHaveAttribute("data-type", "page");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("robots.txt-old");
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(row(page, "robots.txt").locator(".file-type")).toHaveText("Text");
});

test("coming back to Files marks the file opened elsewhere, and only it", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFiles(page, baseURL);
  await row(page, "about").click();
  await expect(row(page, "about/index.html")).toBeVisible();
  await expect(row(page, "index.html")).toHaveClass(/\bselected\b/);
  const marked = () => explorer(page).locator(".file-row.selected");
  const showFiles = async () => {
    if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
    const tab = explorer(page).getByRole("tab", { name: "Files", exact: true });
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  };

  // Opened by its address with the explorer closed (the repository reloads, folders close).
  await page.keyboard.press("Escape");
  await expect(explorer(page)).toBeHidden();
  await page.evaluate(() => { location.hash = "#repo=501&branch=main&file=about%2Findex.html"; });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  await showFiles();
  await expect(marked()).toHaveCount(0);
  if ((await row(page, "about").getAttribute("aria-expanded")) !== "true") await row(page, "about").click();
  await expect(marked()).toHaveCount(1);
  await expect(row(page, "about/index.html")).toHaveClass(/\bselected\b/);

  // Opened from the Pages tab, both rows already drawn: choosing Files again moves the mark.
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Pages", exact: true }).click();
  await explorer(page).locator(".pages-row", { hasText: "Home" }).first().click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await showFiles();
  await expect(marked()).toHaveCount(1);
  await expect(row(page, "index.html")).toHaveClass(/\bselected\b/);
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("rows are 44 px with one ⋯ each; a folder's menu still adds", async ({ page, baseURL }) => {
    await openFiles(page, baseURL);
    // Opened again on touch, the cursor stays out of the search: its keyboard would cover the list.
    await page.locator("#explorer-toggle").press("Escape");
    await expect(explorer(page)).toBeHidden();
    await page.locator("#explorer-toggle").tap();
    await expect(row(page, "index.html")).toBeVisible();
    await expect(explorer(page).getByLabel("Search files", { exact: true })).not.toBeFocused();
    for (const path of ["index.html", "images"]) expect((await line(page, path).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(line(page, "images").getByRole("button", { name: "New in images", exact: true })).toBeHidden();
    const more = line(page, "images").getByRole("button", { name: "Actions for images", exact: true });
    const box = (await more.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    // The narrow panel has no type word.
    await expect(row(page, "index.html").locator(".file-type")).toBeHidden();
    await more.tap();
    await expect(page.getByRole("menuitem", { name: "New file…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Upload files…" })).toBeVisible();
  });
});

test("the search lists every file whose name or folder has it, closed folders too; one opens on a click and the page button names it by folder and name", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFiles(page, baseURL);
  await explorer(page).getByLabel("Search files", { exact: true }).fill("site.css");
  const found = explorer(page).getByRole("list", { name: "Files found", exact: true });
  await expect(found.locator('.file-row[data-path="styles/site.css"]')).toBeVisible();
  await expect(explorer(page).locator("#files")).toBeHidden();
  // A screen reader hears what the search found (a polite live region), as the list shows it.
  const said = explorer(page).locator("#explorer-files [role='status']");
  await expect(said).toHaveText("1 file found");
  // A found row has the tree's actions: its menu renames it in place, and so does F2.
  const siteRow = found.locator('.file-row[data-path="styles/site.css"]');
  await siteRow.click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for styles/site.css" }).getByRole("menuitem", { name: /^Rename/ }).click();
  const rename = found.getByRole("textbox", { name: "New name for styles/site.css", exact: true });
  await expect(rename).toHaveValue("site.css");
  await rename.press("Escape");
  await expect(siteRow).toBeFocused();
  await page.keyboard.press("F2");
  await expect(rename).toBeFocused();
  await rename.press("Escape");
  // A found row shows keyboard focus as the tree's rows do.
  await explorer(page).getByLabel("Search files", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(found.locator(".file-row").first()).toBeFocused();
  await expect(found.locator(".file-row-line").first()).toHaveCSS("outline-style", "solid");
  await found.locator('.file-row[data-path="styles/site.css"]').click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(page.locator("#current-page")).toHaveText("styles/site.css");
  await expect(page.locator("#current-page .folder-part")).toHaveText("styles");
  await expect(page.locator("#current-page .file-part")).toHaveText("site.css");
  // Opened again, the panel starts afresh (mock-up 05 v2): the search empty with the cursor in it, the tree back.
  if (await explorer(page).isVisible()) await page.locator("#explorer-toggle").press("Escape");
  await expect(explorer(page)).toBeHidden();
  await page.locator("#explorer-toggle").click();
  await expect(explorer(page).getByLabel("Search files", { exact: true })).toHaveValue("");
  await expect(explorer(page).getByLabel("Search files", { exact: true })).toBeFocused();
  await expect(found).toBeHidden();
  await expect(row(page, "index.html")).toBeVisible();
  await expect(said).toHaveText("");
  // Nothing found says so, to a screen reader too; clearing the search shows the tree again.
  await explorer(page).getByLabel("Search files", { exact: true }).fill("zzzz");
  await expect(found).toHaveText("No file matches");
  await expect(said).toHaveText("No file matches");
  await explorer(page).getByLabel("Search files", { exact: true }).fill("");
  await expect(found).toBeHidden();
  await expect(said).toHaveText("");
  await expect(row(page, "index.html")).toBeVisible();
  // A tab switch starts the search afresh.
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Pages", exact: true }).click();
  await expect(explorer(page).getByLabel("Search pages", { exact: true })).toHaveValue("");
});

test("found files drawn again keep the focus on the row that had it; very many matches draw the first 200 and count the rest", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  for (let i = 1; i <= 201; i++)
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: `notes/n-${String(i).padStart(3, "0")}.txt`, content: `${i}\n` } })).status()).toBe(204);
  await openFiles(page, baseURL);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  const found = explorer(page).getByRole("list", { name: "Files found", exact: true });
  await search.fill("site");
  // A copy made from a found row takes the focus among the found files, and so does a file renamed there.
  await found.locator('.file-row[data-path="styles/site.css"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for styles/site.css" }).getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#status")).toContainText("Duplicated styles/site.css as styles/site-copy.css");
  await expect(found.locator('.file-row[data-path="styles/site-copy.css"]')).toBeFocused();
  await page.keyboard.press("F2");
  const rename = found.getByRole("textbox", { name: "New name for styles/site-copy.css", exact: true });
  await rename.fill("site-main.css");
  await rename.press("Enter");
  await expect(found.locator('.file-row[data-path="styles/site-main.css"]')).toBeFocused();
  // Deleting a found file keeps the search; the focus stays among the found files.
  await found.locator('.file-row[data-path="styles/site-main.css"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for styles/site-main.css" }).getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: /^Delete styles\/site-main\.css/ });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(found.locator('.file-row[data-path="styles/site-main.css"]')).toHaveCount(0);
  await expect(search).toHaveValue("site");
  await expect(found).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest("#files-found, #explorer-search")))).toBe(true);
  // A copy the search leaves out shows in the tree, its folder opened, the search started afresh.
  await search.fill("site.css");
  await found.locator('.file-row[data-path="styles/site.css"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for styles/site.css" }).getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#status")).toContainText("Duplicated styles/site.css as styles/site-copy.css");
  await expect(search).toHaveValue("");
  await expect(explorer(page).locator('#files .file-row[data-path="styles/site-copy.css"]')).toBeVisible();
  await expect(explorer(page).locator("#files-found")).toBeHidden();
  await search.fill("notes/n-");
  await expect(found.locator(".file-row")).toHaveCount(200);
  await expect(found.locator("li").last()).toHaveText("1 more file matches");
});

test("a folder made while the search hides it is in view, with focus on it, once the dialog closes", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  await search.fill("site.css");
  await expect(explorer(page).locator("#files")).toBeHidden();
  await explorer(page).getByRole("button", { name: "New file or folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder" });
  await dialog.getByRole("radio", { name: "Folder" }).check();
  await dialog.getByRole("textbox", { name: "Folder name" }).fill("campaign");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(search).toHaveValue("");
  await expect(row(page, "campaign")).toBeVisible();
  await expect(row(page, "campaign")).toBeFocused();
});

test("in a repository with no site the search narrows the rows drawn, and clearing it brings every row back", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name: "search-notes", kind: "no-site" }] } });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find(repo => repo.name === "search-notes")!.id}&branch=main`);
  await page.reload();
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  const readme = explorer(page).getByRole("button", { name: "README.md", exact: true });
  await expect(readme).toBeVisible({ timeout: 30_000 });
  await explorer(page).getByLabel("Search files", { exact: true }).fill("readme");
  await expect(explorer(page).locator("#explorer-files [role='status']")).toHaveText("1 found");
  await explorer(page).getByLabel("Search files", { exact: true }).fill("zzzz");
  await expect(readme).toBeHidden();
  await expect(explorer(page).getByRole("list", { name: "Files found", exact: true })).toHaveText("No file matches");
  await expect(explorer(page).locator("#explorer-files [role='status']")).toHaveText("No file matches");
  await explorer(page).getByLabel("Search files", { exact: true }).fill("");
  await expect(readme).toBeVisible();
  // A file in a folder: the folder's name or the whole path finds it, with its folder kept.
  await explorer(page).getByRole("button", { name: "New file or folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New file or folder" });
  await dialog.getByRole("textbox", { name: "File name" }).fill("documentation/guide.md");
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "documentation/guide.md");
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  // A folder opened and closed again: the search opens it on the way to what it finds.
  if (!(await row(page, "documentation/guide.md").isVisible())) await row(page, "documentation").click();
  await expect(row(page, "documentation/guide.md")).toBeVisible();
  await row(page, "documentation").click();
  await expect(row(page, "documentation/guide.md")).toBeHidden();
  for (const words of ["documentation", "documentation/guide"]) {
    await explorer(page).getByLabel("Search files", { exact: true }).fill(words);
    await expect(row(page, "documentation/guide.md")).toBeVisible();
    await expect(row(page, "documentation")).toBeVisible();
    await expect(readme).toBeHidden();
  }
  // Cleared, the folder is closed again, as it was.
  await explorer(page).getByLabel("Search files", { exact: true }).fill("");
  await expect(row(page, "documentation/guide.md")).toBeHidden();
  await expect(row(page, "documentation")).toHaveAttribute("aria-expanded", "false");
});

// After the person adds something in Files (a copy, a rename, a move, an upload, Move back, Discard changes), it is in view:
// a search that would hide it starts afresh (ux-rulebook B12).
async function openNoSite(page: Page, baseURL: string | undefined, name: string) {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name, kind: "no-site" }] } });
  const repos = (await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json()) as { id: number; name: string }[];
  await page.goto(`${baseURL}/#repo=${repos.find(repo => repo.name === name)!.id}&branch=main`);
  await page.reload();
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(row(page, "README.md")).toBeVisible({ timeout: 30_000 });
}

test("in a repository with no site, a copy or a rename the search would hide is in view and focused, the search started afresh", async ({ page, baseURL }) => {
  await openNoSite(page, baseURL, "search-adds");
  const search = explorer(page).getByLabel("Search files", { exact: true });
  await search.fill("README.md");
  await row(page, "README.md").click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for README.md" }).getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#status")).toContainText("Duplicated README.md as README-copy.md");
  await expect(search).toHaveValue("");
  await expect(row(page, "README-copy.md")).toBeVisible();
  await expect(row(page, "README-copy.md")).toBeFocused();
  // A rename the search finds, to a name it does not.
  await search.fill("README-copy");
  await expect(row(page, "README.md")).toBeHidden();
  await row(page, "README-copy.md").focus();
  await page.keyboard.press("F2");
  const rename = explorer(page).getByRole("textbox", { name: "New name for README-copy.md", exact: true });
  await rename.fill("notes.md");
  await submitRename(rename);
  await expect(search).toHaveValue("");
  await expect(row(page, "notes.md")).toBeVisible();
  await expect(row(page, "notes.md")).toBeFocused();
  await expect(row(page, "README.md")).toBeVisible();
});

test("at 390 px, a file uploaded while the search would hide it is in view, the search started afresh", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFiles(page, baseURL);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  await search.fill("site.css");
  await expect(explorer(page).getByRole("list", { name: "Files found", exact: true }).locator('.file-row[data-path="styles/site.css"]')).toBeVisible();
  // Dropped on the head row, it goes to the top of the repository.
  await explorer(page).locator(".explorer-head").evaluate((head) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["%PDF-1.4\n"], "Guide.pdf", { type: "application/pdf" }));
    for (const type of ["dragenter", "dragover", "drop"]) head.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#status")).toContainText("Added guide.pdf.");
  await expect(search).toHaveValue("");
  await expect(row(page, "guide.pdf")).toBeVisible();
  await expect(explorer(page).locator("#files-found")).toBeHidden();
});

test("a file dropped on the found files' empty space, or where no file matches, goes to the top of the repository", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  const found = explorer(page).locator("#files-found");
  // Dropped on `target`: whether the found files showed where it would go, before taking it.
  const drop = (target: Locator, name: string) => target.evaluate((element, name) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["%PDF-1.4\n"], name, { type: "application/pdf" }));
    const send = (type: string) => element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    send("dragenter");
    send("dragover");
    const marked = document.getElementById("files-found")!.classList.contains("is-drop-target");
    send("drop");
    return marked;
  }, name);
  // The list's own empty space, under the one file found.
  await search.fill("site.css");
  await expect(found.locator('.file-row[data-path="styles/site.css"]')).toBeVisible();
  expect(await drop(found, "Guide.pdf")).toBe(true);
  await expect(page.locator("#status")).toContainText("Added guide.pdf.");
  await expect(search).toHaveValue("");
  await expect(row(page, "guide.pdf")).toBeVisible();
  // Where no file matches.
  await search.fill("no such file");
  await expect(found.getByText("No file matches")).toBeVisible();
  expect(await drop(found.getByText("No file matches"), "Second.pdf")).toBe(true);
  await expect(page.locator("#status")).toContainText("Added second.pdf.");
  await expect(search).toHaveValue("");
  await expect(row(page, "second.pdf")).toBeVisible();
});

test("a file dropped on a found file marks that row and goes into its folder: a found file dragged there, or one from the computer", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  await settled(page);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  const found = explorer(page).locator("#files-found");
  const foundRow = (path: string) => found.locator(`.file-row[data-path="${path}"]`);
  await search.fill("s");
  await expect(foundRow("robots.txt")).toBeVisible();
  // Over the found row `onto`, a found file (`source`) or a file from the computer (`upload`): what shows the drop mark (a row's
  // path, or the id of a list), and whether it can be seen (the hidden tree cannot).
  const over = (onto: string, from: { source?: string; upload?: string }) => foundRow(onto).evaluate((target, from) => {
    const transfer = new DataTransfer();
    if (from.upload) transfer.items.add(new File(["%PDF-1.4\n"], from.upload, { type: "application/pdf" }));
    const send = (element: Element, type: string) => element.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    if (from.source) send(document.querySelector(`#files-found .file-row[data-path="${from.source}"]`)!, "dragstart");
    send(target, "dragenter");
    send(target, "dragover");
    const marked = document.querySelector<HTMLElement>("#explorer .is-drop-target");
    const result = { mark: marked?.querySelector<HTMLElement>(":scope > .file-row")?.dataset.path ?? marked?.id, seen: Boolean(marked?.checkVisibility()) };
    send(target, "drop");
    return result;
  }, from);
  // On a found file at the top of the repository, the found files' own space is marked: the file goes to the top.
  expect(await over("robots.txt", { upload: "Notes.pdf" })).toEqual({ mark: "files-found", seen: true });
  await expect(page.locator("#status")).toContainText("Added notes.pdf.");
  await expect(foundRow("notes.pdf")).toBeVisible();
  // A found file dragged onto one in another folder (a move refused on a slow machine, as a rename can be, is sent again).
  await expect(async () => {
    if (await foundRow("robots.txt").isVisible() && !(await foundRow("styles/robots.txt").isVisible()))
      expect(await over("styles/site.css", { source: "robots.txt" })).toEqual({ mark: "styles/site.css", seen: true });
    await expect(foundRow("styles/robots.txt")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(found.locator(".is-drop-target")).toHaveCount(0);
  // A file from the computer.
  expect(await over("styles/site.css", { upload: "Guide.pdf" })).toEqual({ mark: "styles/site.css", seen: true });
  await expect(page.locator("#status")).toContainText("Added styles/guide.pdf.");
  await expect(foundRow("styles/guide.pdf")).toBeVisible();
  await expect(search).toHaveValue("s");
});

test("deleting a new file at the top of the tree puts the focus on the row after it", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  await settled(page);
  await row(page, "robots.txt").click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for robots.txt" }).getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(row(page, "robots-copy.txt")).toBeFocused();
  // Not on GitHub, the copy's row goes with it: the next row takes the focus (ux-rulebook B2).
  await row(page, "robots-copy.txt").click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for robots-copy.txt" }).getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete robots-copy.txt?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row(page, "robots-copy.txt")).toHaveCount(0);
  await expect(row(page, "robots.txt")).toBeFocused();
});

// A rename begun while the page is still loading is refused ("The repository changed meanwhile"): these wait for the preview,
// and a rename refused all the same (a slow machine) is sent again.
const settled = (page: Page) => expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
async function submitRename(input: Locator) {
  await expect(async () => {
    if (await input.isVisible()) await input.press("Enter");
    await expect(input).toBeHidden({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

test("a rename or a copy that finishes after the person typed another search leaves that search alone", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  await settled(page);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  const found = explorer(page).getByRole("list", { name: "Files found", exact: true });
  // The renamed or copied file is shown a frame after the change is made: frames wait from here until `releaseFrames`, so
  // the person types another search while the change is still finishing (a slow read held in the controller is covered by
  // tests/file-operations-controller.test.ts).
  const holdFrames = () => page.evaluate(() => {
    const frame = window.requestAnimationFrame.bind(window), waiting: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => { waiting.push(callback); return 0; };
    window.addEventListener("release-frames", () => { window.requestAnimationFrame = frame; waiting.forEach(callback => frame(callback)); }, { once: true });
  });
  const releaseFrames = () => page.evaluate(() => window.dispatchEvent(new Event("release-frames")));
  const searchStays = async () => {
    await expect(search).toHaveValue("index");
    await expect(found.locator('.file-row[data-path="index.html"]')).toBeVisible();
    await expect(search).toBeFocused();
  };

  await search.fill("robots");
  await found.locator('.file-row[data-path="robots.txt"]').focus();
  await page.keyboard.press("F2");
  const rename = found.getByRole("textbox", { name: "New name for robots.txt", exact: true });
  await rename.fill("crawl.txt");
  await holdFrames();
  await submitRename(rename);
  await expect(page.locator("#status")).toContainText("Renamed robots.txt to crawl.txt");
  await search.fill("index");
  await releaseFrames();
  await searchStays();

  await search.fill("crawl");
  await found.locator('.file-row[data-path="crawl.txt"]').click({ button: "right" });
  await holdFrames();
  await page.getByRole("menu", { name: "Actions for crawl.txt" }).getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator("#status")).toContainText("Duplicated crawl.txt as crawl-copy.txt");
  await search.fill("index");
  await releaseFrames();
  await searchStays();
});

test("Move back and Discard changes bring a renamed file back in view where the search would hide it", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  await settled(page);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  const found = explorer(page).getByRole("list", { name: "Files found", exact: true });
  const renameRobots = async () => {
    await search.fill("robots");
    await found.locator('.file-row[data-path="robots.txt"]').focus();
    await page.keyboard.press("F2");
    const rename = found.getByRole("textbox", { name: "New name for robots.txt", exact: true });
    await rename.fill("crawl.txt");
    await submitRename(rename);
    // Renamed to a name the search leaves out: the tree shows it, focused.
    await expect(search).toHaveValue("");
    await expect(row(page, "crawl.txt")).toBeFocused();
    await search.fill("crawl");
  };
  await renameRobots();
  await found.locator('.file-row[data-path="crawl.txt"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for crawl.txt" }).getByRole("menuitem", { name: "Move back to robots.txt" }).click();
  await expect(page.locator("#status")).toContainText("Moved crawl.txt back to robots.txt.");
  await expect(search).toHaveValue("");
  await expect(row(page, "robots.txt")).toBeVisible();

  await renameRobots();
  await found.locator('.file-row[data-path="crawl.txt"]').click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for crawl.txt" }).getByRole("menuitem", { name: "Discard changes" }).click();
  await page.getByRole("dialog", { name: "Discard the changes to robots.txt → crawl.txt?" }).getByRole("button", { name: "Discard" }).click();
  await expect(page.locator("#status")).toContainText("Discarded the changes to crawl.txt.");
  await expect(search).toHaveValue("");
  await expect(row(page, "robots.txt")).toBeVisible();
});

test("an Undo or a Redo that brings a file back where the search would hide it shows it, the search started afresh", async ({ page, baseURL }) => {
  await openFiles(page, baseURL);
  await settled(page);
  const search = explorer(page).getByLabel("Search files", { exact: true });
  const found = explorer(page).getByRole("list", { name: "Files found", exact: true });
  await search.fill("robots");
  await found.locator('.file-row[data-path="robots.txt"]').focus();
  await page.keyboard.press("F2");
  const rename = found.getByRole("textbox", { name: "New name for robots.txt", exact: true });
  await rename.fill("crawl.txt");
  await submitRename(rename);
  await expect(row(page, "crawl.txt")).toBeFocused();
  await search.fill("crawl");
  await expect(found.locator('.file-row[data-path="crawl.txt"]')).toBeVisible();
  // Undo brings robots.txt back, which "crawl" leaves out.
  await page.locator(".code-editor__undo").first().click();
  await expect(search).toHaveValue("");
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(row(page, "robots.txt")).toBeVisible();
  // Redo brings crawl.txt back, which "robots" leaves out.
  await search.fill("robots");
  await expect(found.locator('.file-row[data-path="robots.txt"]')).toBeVisible();
  await page.locator(".code-editor__redo").first().click();
  await expect(search).toHaveValue("");
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(row(page, "crawl.txt")).toBeVisible();
});
