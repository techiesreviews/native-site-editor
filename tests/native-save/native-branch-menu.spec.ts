import { expect, test, type Page } from "@playwright/test";

// The open repository's row in the project selector names its branch, and
// a flyout out of the row lists the branches (the current one checked) with
// Refresh from GitHub: hovering the row opens it, as ArrowRight, Enter or a
// click does with the focus in it; Esc and ArrowLeft go back to the row.
// Choosing a branch switches the workspace to it. The fake GitHub's second
// branch comes from `/__demo/branch` (server.ts).
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  // A branch whose home page says something else, then the branches again.
  await page.request.post(`${baseURL}/__demo/branch`, {
    data: { name: "feature", path: "index.html", content: (await file(page, baseURL, "index.html")).replace("A native browser preview", "Feature branch preview") },
  });
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(heading(page)).toHaveText("A native browser preview", { timeout: 30_000 });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const heading = (page: Page) => page.frameLocator(".native-preview-frame").locator(".hero h1");
const repoRow = (page: Page) => page.locator('.repository-menu__repo[aria-current="true"]');
const flyout = (page: Page) => page.getByRole("menu", { name: "Branches" });
const branchItem = (page: Page, name: string) => flyout(page).getByRole("menuitemradio", { name });
async function file(page: Page, baseURL: string | undefined, path: string) {
  return (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
}
async function openMenu(page: Page) {
  await page.locator(".repository-menu__trigger").click();
  await expect(repoRow(page)).toBeVisible();
}

test("hovering the open repository's row lists its branches beside the menu, and choosing one switches to it", async ({ page }) => {
  await openMenu(page);
  // The row names the branch, and says it opens more.
  await expect(repoRow(page).locator(".repository-menu__repo-owner")).toHaveText("native-demo-user · private · ⑂ main");
  await expect(repoRow(page)).toHaveAttribute("aria-haspopup", "menu");
  await expect(repoRow(page).locator(".repository-menu__more")).toHaveText("›");
  await expect(flyout(page)).toBeHidden();

  await repoRow(page).hover();
  await expect(flyout(page)).toBeVisible();
  await expect(repoRow(page)).toHaveAttribute("aria-expanded", "true");
  await expect(flyout(page).getByRole("menuitemradio")).toHaveText(["main✓", "feature"]);
  await expect(branchItem(page, "main")).toHaveAttribute("aria-checked", "true");
  await expect(branchItem(page, "feature")).toHaveAttribute("aria-checked", "false");
  await expect(flyout(page).getByRole("menuitem", { name: "Refresh from GitHub" })).toBeEnabled();
  // Beside the dropdown, to its right, top-aligned with the row.
  const menu = (await page.locator("#repository-actions").boundingBox())!;
  const row = (await repoRow(page).boundingBox())!;
  const beside = (await flyout(page).boundingBox())!;
  expect(beside.x).toBeGreaterThanOrEqual(menu.x + menu.width);
  expect(beside.x).toBeLessThan(menu.x + menu.width + 12);
  expect(Math.abs(beside.y - row.y)).toBeLessThan(10);

  // The pointer on its way to the flyout, across the rest of the menu, keeps it open.
  await page.mouse.move(row.x + row.width - 4, row.y + row.height + 30, { steps: 4 });
  await page.mouse.move(beside.x + 20, beside.y + 50, { steps: 4 });
  await page.waitForTimeout(400);
  await expect(flyout(page)).toBeVisible();

  await branchItem(page, "feature").click();
  await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
  await expect(heading(page)).toHaveText("Feature branch preview");
  await expect(page.locator("#repository-actions")).toBeHidden();
  await expect(flyout(page)).toBeHidden();

  // Leaving the row and the flyout closes it, after a moment.
  await openMenu(page);
  await expect(repoRow(page).locator(".repository-menu__repo-owner")).toHaveText("native-demo-user · private · ⑂ feature");
  await repoRow(page).hover();
  await expect(branchItem(page, "feature")).toHaveAttribute("aria-checked", "true");
  await expect(branchItem(page, "main")).toHaveAttribute("aria-checked", "false");
  await page.locator(".repository-menu__accounts").hover();
  await expect(flyout(page)).toBeHidden();
  await expect(page.locator("#repository-actions")).toBeVisible();

  // Closing the menu closes the flyout with it.
  await repoRow(page).hover();
  await expect(flyout(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("#repository-actions")).toBeHidden();
  await expect(flyout(page)).toBeHidden();
});

test("the branch flyout works from the keyboard, and its Refresh reads the branch again", async ({ page, baseURL }) => {
  await openMenu(page);
  await repoRow(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(flyout(page)).toBeVisible();
  await expect(branchItem(page, "main")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(branchItem(page, "feature")).toBeFocused();
  // Up from the first branch reaches Refresh, in the flyout's corner.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(flyout(page).getByRole("menuitem", { name: "Refresh from GitHub" })).toBeFocused();
  // Esc goes back to the row, the menu staying open; so does ArrowLeft.
  await page.keyboard.press("Escape");
  await expect(flyout(page)).toBeHidden();
  await expect(repoRow(page)).toBeFocused();
  await expect(page.locator("#repository-actions")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(branchItem(page, "main")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(flyout(page)).toBeHidden();
  await expect(repoRow(page)).toBeFocused();
  // Enter on a branch switches to it.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
  await expect(heading(page)).toHaveText("Feature branch preview");

  // Back on main, a commit on GitHub shows once Refresh reads the branch again.
  await openMenu(page);
  await repoRow(page).click();
  await expect(branchItem(page, "feature")).toBeFocused();
  await branchItem(page, "main").click();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(heading(page)).toHaveText("A native browser preview");
  const index = await file(page, baseURL, "index.html");
  await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: "index.html", content: index.replace("A native browser preview", "Refreshed from GitHub") },
  });
  await openMenu(page);
  await repoRow(page).hover();
  await flyout(page).getByRole("menuitem", { name: "Refresh from GitHub" }).click();
  await expect(heading(page)).toHaveText("Refreshed from GitHub", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(page.locator("#repository-actions")).toBeHidden();
});
