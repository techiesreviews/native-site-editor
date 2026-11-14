import { test, expect, type Page } from "@playwright/test";

// On a phone with no project open (Lex, 2026-11-14): the page button's panel never shows an empty box. It says no project
// is open and offers the project list, and so does the welcome's Choose a project; a project chosen there shows its pages,
// media and files.
const explorer = (page: Page) => page.locator("#explorer");
const projects = (page: Page) => page.locator("#repository-actions");
// The project list opened by Choose a project: the focus on a project, and still open after the pointer leaves it (a finger's
// scroll ends in pointerleave too).
async function stays(page: Page) {
  await expect(projects(page).getByText("native-demo", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".repository-menu__repo")))).toBe(true);
  await projects(page).dispatchEvent("pointerleave");
  await page.waitForTimeout(400); // fixed-wait: past the 180 ms an unpinned menu waits before it closes (dropdown.ts)
  await expect(projects(page)).toBeVisible();
}

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
  await stays(page);
  await page.keyboard.press("Escape");
  await expect(projects(page)).toBeHidden();

  // The welcome's button opens the project list too.
  await page.locator(".welcome").getByRole("button", { name: "Choose a project", exact: true }).tap();
  await stays(page);
  await projects(page).getByText("native-demo", { exact: true }).tap();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });

  // Chosen, the panel holds the project's Pages, Media and Files.
  await expect(explorer(page)).toBeHidden();
  await page.locator("#explorer-toggle").tap();
  await expect(explorer(page).getByRole("tab")).toHaveText(["Pages", /^Media\d*$/, "Files"]);
  await expect(explorer(page).getByText("No project open yet.", { exact: false })).toBeHidden();
  await context.close();
});

test("at 1280 px, the welcome's Choose a project opens the project list, held open with the focus on a project", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(baseURL!);
  await page.locator(".welcome").getByRole("button", { name: "Choose a project", exact: true }).click();
  await stays(page);
});

test("with the project list not loaded, Choose a project from the keyboard puts the focus on Reload repositories", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/repositories**", (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.goto(baseURL!);
  await page.locator("#explorer-toggle").click();
  const choose = explorer(page).getByRole("button", { name: "Choose a project", exact: true });
  await choose.focus();
  await page.keyboard.press("Enter");
  await expect(projects(page).getByRole("button", { name: "Reload repositories", exact: true })).toBeFocused();
});
