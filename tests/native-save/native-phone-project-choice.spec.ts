import { test, expect, type Page } from "@playwright/test";

// The root opens the project overview on phone and desktop; only a chosen project exposes its page controls.
const explorer = (page: Page) => page.locator("#explorer");
const projects = (page: Page) => page.locator("#repository-actions");
test("at 390 px the overview opens a project and then shows Pages, Media and Files", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("searchbox", { name: "Search projects" })).toBeVisible();
  await expect(page.locator("#explorer-toggle")).toBeHidden();
  await page.getByRole("button", { name: "Continue editing", exact: true }).tap();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });

  // Chosen, the panel holds the project's Pages, Media and Files.
  await expect(explorer(page)).toBeHidden();
  await page.locator("#explorer-toggle").tap();
  await expect(explorer(page).getByRole("tab")).toHaveText(["Pages", /^Media\d*$/, "Files"]);
  await expect(explorer(page).getByText("No project open yet.", { exact: false })).toBeHidden();
  await context.close();
});

test("at 1280 px the overview's top bar opens the project menu", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(baseURL!);
  await expect(page.getByRole("searchbox", { name: "Search projects" })).toBeVisible();
  await page.locator(".repository-menu__trigger").click();
  await expect(projects(page).getByText("native-demo", { exact: true })).toBeVisible();
});

test("with the project list unavailable, the top bar keeps Reload repositories reachable", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/repositories**", (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.goto(baseURL!);
  await page.locator(".repository-menu__trigger").click();
  await expect(projects(page).getByRole("button", { name: "Reload repositories", exact: true })).toBeVisible();
});
