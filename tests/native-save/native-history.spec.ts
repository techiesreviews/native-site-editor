import { expect, test, type Page } from "@playwright/test";

// A file's History lists its commits grouped by day, newest first: each with
// its time, message and author, the current version marked. A commit's ⋯
// menu restores it (after a confirmation, in a new commit), opens it on
// GitHub or copies its link; the current version cannot be restored.
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  // A commit on GitHub that changes the home page.
  const source = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: "index.html", content: source.replace("A native browser preview", "Edited on GitHub") },
  });
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(heading(page)).toHaveText("Edited on GitHub", { timeout: 30_000 });
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

const heading = (page: Page) => page.frameLocator(".native-preview-frame").locator(".hero h1");
const panel = (page: Page) => page.getByRole("dialog", { name: "History" });
const items = (page: Page) => panel(page).locator(".commit-history__item");

test("History groups the file's commits by day and marks the current version", async ({ page }) => {
  await page.locator("#history-button").click();
  await expect(items(page)).toHaveCount(2);
  await expect(panel(page).locator(".commit-history__day")).toHaveText(["Today", /Sep 1/]);
  const [latest, first] = [items(page).nth(0), items(page).nth(1)];
  await expect(latest.locator(".commit-history__subject")).toHaveText("Edit index.html on GitHub");
  await expect(latest.locator(".commit-history__badge")).toHaveText("Current");
  await expect(latest).toHaveClass(/is-current/);
  await expect(latest.locator(".commit-history__ago")).toHaveText(/now|min/);
  await expect(latest.locator(".commit-history__author")).toContainText("native-demo-user");
  await expect(first.locator(".commit-history__subject")).toHaveText("Start the site");
  await expect(first.locator(".commit-history__badge")).toHaveCount(0);

  // The current version's menu says why it cannot be restored.
  await latest.getByRole("button", { name: "Actions for Edit index.html on GitHub" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([/Restore this version…/, "View on GitHub", "Copy commit link"]);
  await expect(menu.getByRole("menuitem", { name: /Restore this version/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(latest.getByRole("button", { name: /Actions for/ })).toBeFocused();
});

test("Restore this version… from a commit's menu asks, then restores the file in a new commit", async ({ page }) => {
  await page.locator("#history-button").click();
  await expect(items(page)).toHaveCount(2);
  await items(page).nth(1).getByRole("button", { name: "Actions for Start the site" }).click();
  await page.getByRole("menuitem", { name: "Restore this version…" }).click();
  await expect(panel(page).getByRole("heading", { name: "Restore this file?" })).toBeVisible();
  await panel(page).getByRole("button", { name: "Restore file" }).click();
  await expect(page.locator("#status")).toContainText("Restored index.html in a new commit", { timeout: 30_000 });
  await expect(heading(page)).toHaveText("A native browser preview", { timeout: 30_000 });

  await page.locator("#history-button").click();
  await expect(items(page)).toHaveCount(3);
  await expect(items(page).nth(0).locator(".commit-history__subject")).toHaveText(/^Restore index\.html from [a-f0-9]{7}/);
  await expect(items(page).nth(0).locator(".commit-history__badge")).toHaveText("Current");
});

test("choosing a commit shows that version in the preview and beside the current one, until Back to latest", async ({ page }) => {
  await page.locator("#history-button").click();
  await expect(items(page)).toHaveCount(2);
  await items(page).nth(1).locator(".commit-history__view").click();
  const bar = page.getByRole("region", { name: "Earlier version" });
  await expect(bar).toContainText("Viewing");
  await expect(bar).toContainText("Start the site");
  await expect(heading(page)).toHaveText("A native browser preview");
  await expect(items(page).nth(1)).toHaveClass(/is-shown/);
  await expect(items(page).nth(0)).not.toHaveClass(/is-shown/);
  await expect(page.locator(".code-editor__diff-labels")).toContainText("read only");
  await expect(page.locator(".code-editor__diff-labels")).toContainText("Current version · read only");

  // Nothing on the earlier version can be selected for editing.
  await page.keyboard.press("Escape");
  await heading(page).click();
  await expect(page.locator(".edit-bar")).toBeHidden();

  await bar.getByRole("button", { name: "Back to latest" }).click();
  await expect(bar).toBeHidden();
  await expect(heading(page)).toHaveText("Edited on GitHub");
  await expect(page.locator(".code-editor__diff-labels")).toHaveCount(0);
  await heading(page).click();
  await expect(page.locator(".edit-bar")).toBeVisible();
});

test("Restore this version in the bar asks, then restores the version on show in a new commit", async ({ page }) => {
  await page.locator("#history-button").click();
  await items(page).nth(1).locator(".commit-history__view").click();
  const bar = page.getByRole("region", { name: "Earlier version" });
  await bar.getByRole("button", { name: "Restore this version" }).click();
  const dialog = page.getByRole("dialog", { name: "Restore this version?" });
  await expect(dialog).toContainText("This creates a new commit.");
  await dialog.getByRole("button", { name: "Restore version" }).click();
  await expect(page.locator("#status")).toContainText("Restored index.html in a new commit", { timeout: 30_000 });
  await expect(bar).toBeHidden();
  await expect(heading(page)).toHaveText("A native browser preview");
  await expect(page.locator(".code-editor__diff-labels")).toHaveCount(0);
});
