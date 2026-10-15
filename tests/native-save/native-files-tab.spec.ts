import { expect, test, type Page } from "@playwright/test";

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

test("the header names the tab and counts the files; rows are one height with names lined up and typed icons", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFiles(page, baseURL);
  const heading = explorer(page).locator("#explorer-files > .files-heading");
  await expect(heading.getByRole("heading", { name: "Files", exact: true })).toHaveCSS("text-transform", "none");
  // "Files 46", as Pages shows "Pages 11"; the tooltip says it in words, with the version.
  await expect(page.locator("#files-count")).toHaveText(/^\d+$/);
  await expect(page.locator("#files-count")).toHaveAttribute("title", /^\d+ files\nVersion [0-9a-f]{40}$/);
  await expect(heading.getByRole("button", { name: "New file or folder", exact: true })).toHaveText("+ New");
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

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("rows are 44 px with one ⋯ each; a folder's menu still adds", async ({ page, baseURL }) => {
    await openFiles(page, baseURL);
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
