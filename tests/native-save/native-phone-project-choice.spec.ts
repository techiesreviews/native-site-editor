import { test, expect, type Page } from "@playwright/test";

// On a phone with no project open (Lex, 2026-11-14): the page button's panel never shows an empty box. It says no project
// is open and offers the project list, and so does the welcome's Choose a project; a project chosen there shows its pages,
// media and files.
const explorer = (page: Page) => page.locator("#explorer");
const projects = (page: Page) => page.locator("#repository-actions");

test("at 390 px with no project open, the panel and the welcome lead to the project list, and a project chosen shows Pages, Media and Files", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open a project" })).toBeVisible({ timeout: 30_000 });

  // The page button's panel: what to do, not an empty search box.
  await page.locator("#explorer-toggle").tap();
  await expect(explorer(page)).toBeVisible();
  await expect(explorer(page).getByText("No project open yet.", { exact: false })).toBeVisible();
  await expect(explorer(page).getByLabel("Search files", { exact: true })).toBeHidden();
  await explorer(page).getByRole("button", { name: "Choose a project", exact: true }).tap();
  await expect(explorer(page)).toBeHidden();
  await expect(projects(page).getByText("native-demo", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(projects(page)).toBeHidden();

  // The welcome's button opens the project list too.
  await page.locator(".welcome").getByRole("button", { name: "Choose a project", exact: true }).tap();
  await expect(projects(page).getByText("native-demo", { exact: true })).toBeVisible();
  await projects(page).getByText("native-demo", { exact: true }).tap();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });

  // Chosen, the panel holds the project's Pages, Media and Files.
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").tap();
  await expect(explorer(page).getByRole("tab")).toHaveText(["Pages", /^Media\d*$/, "Files"]);
  await expect(explorer(page).getByText("No project open yet.", { exact: false })).toBeHidden();
  await context.close();
});
