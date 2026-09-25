import { expect, test, type Page } from "@playwright/test";

// A native site with no `.astro-editor/native.json` (shared/native-project.ts)
// over `fixtures/native-conventions`, served as the `native-conventions`
// repository (id 531): src/pages/index.html engages native mode, the
// components are found in src/components/<tag>/<tag>.html, the shared styles
// are src/styles/site.css (which imports two layer files), and the pages'
// titles come from their leading <!-- title: … --> comments.
const indexPath = "src/pages/index.html";
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
const block = (page: Page) => page.getByRole("group", { name: "Page" });

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${hash(file)}`);
  await expect(page.locator("#current-page")).toHaveText(file, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

async function openPages(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await expect(explorer(page)).toBeVisible();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
}

test("a site with no manifest previews its components and styles by convention", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(page.locator(".native-preview-error")).toBeHidden();
  await expect(page.locator(".native-preview-warning")).toBeHidden();
  await expect(frame(page).locator("h1")).toHaveText("No manifest here");

  // src/styles/site.css imports base.css and layout.css into layers.
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

  // The page comment is not shown.
  await expect(frame(page).locator("body")).not.toContainText("Built by convention");

  // The nested page is routed by its folder.
  await frame(page).getByRole("link", { name: "First note", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame(page).locator("h1")).toHaveText("First note");
  await expect(frame(page).locator("site-header .brand")).toHaveText("Conventions");
});

test("the Page block shows the page comment's title and description, read-only", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const title = block(page).getByLabel("Title");
  const description = block(page).getByLabel("Description");
  await expect(title).toHaveValue("Built by convention");
  await expect(description).toHaveValue("A site with no native.json: its pages, components and styles are found where they are.");
  await expect(title).not.toBeEditable();
  await expect(description).not.toBeEditable();
  await expect(block(page).locator(".page-structure__meta-notice")).toHaveText("From the page's leading <!-- title: … --> comment; edit it in the page source.");

  // Selecting a preview element still opens the page source at it.
  await frame(page).locator("h1").click();
  await expect(page.locator(".native-preview-frame")).toBeVisible();
  await expect(page.locator("#current-page")).toHaveText(indexPath);

  await open(page, baseURL, "src/pages/notes/first-note.html");
  await expect(title).toHaveValue("The first note");
  await expect(description).toHaveValue("");
});

test("the Pages tab labels pages by their comment titles, and a new page needs no manifest", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPages(page);
  await expect(item(page, "Home")).toHaveAttribute("aria-selected", "true");
  await expect(item(page, "Notes")).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, "The first note").locator(".pages-url")).toHaveText("/notes/first-note/");

  // A page added to Notes is only its file: there is no manifest to title it in.
  await item(page, "Add page to Notes").click();
  const newTitle = explorer(page).getByRole("textbox", { name: "New page title" });
  await newTitle.pressSequentially("Second note");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Created the page Second note at /notes/second-note/.");
  await expect(page.locator("#current-page")).toHaveText("src/pages/notes/second-note.html");
  await expect(frame(page).locator("h1")).toHaveText("Second note");
  // It is built from the home page, without the home page's comment.
  await expect(block(page).getByLabel("Title")).toHaveValue("");
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes(".astro-editor/native.json")).length);
  expect(drafts).toBe(0);
  await openPages(page);
  await expect(item(page, "Second note")).toBeVisible();
});
