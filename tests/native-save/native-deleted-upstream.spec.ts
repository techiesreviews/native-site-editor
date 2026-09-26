import { expect, test, type Page } from "@playwright/test";
import { publishButton, showPublish } from "./publish";

// Drafts of files GitHub deleted since they began (src/file-changes.ts
// settleDeletedUpstream), over `native-conventions` (id 531): a browser
// still holding edits of a stylesheet and of another file from before they
// were deleted. Such a draft is not saved as it is; Discard draft or Keep as
// new file settles it, from the Save panel or the code editor, and the rest
// saves.
const indexPath = "index.html";
const stalePath = "styles/old.css";
const notesPath = "docs/notes.md";
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
const panel = (page: Page) => page.locator("#publish-files");
const saveTrigger = publishButton;
const saveSubmit = publishButton;
const row = (page: Page, path: string) => panel(page).locator(".publish-menu__file", { hasText: path });

async function open(page: Page, baseURL: string | undefined, file = indexPath) {
  await page.goto(`${baseURL}/${hash(file)}`);
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

// Drafts as a browser kept them: edits that began from blobs GitHub has since deleted.
async function seedStaleDrafts(page: Page) {
  await page.evaluate(([stale, notes]) => {
    const scope = { account: "native-demo-user", repoId: 531, repo: "native-demo-user/native-conventions", branch: "main" };
    for (const [path, original, content] of [
      [stale, "h1 { color: red; }\n", "h1 { color: blue; }\n"],
      [notes, "# Notes\n", "# Notes\n\nKept from an old draft.\n"],
    ]) {
      const key = "astro-site-editor:draft:v1:" + JSON.stringify([scope.account, scope.repoId, scope.branch, path]);
      localStorage.setItem(key, JSON.stringify({ ...scope, version: 1, path, baseSha: "a".repeat(40), original, content, updatedAt: Date.now() }));
    }
  }, [stalePath, notesPath]);
}

async function openSaveMenu(page: Page) {
  await showPublish(page);
  await expect(panel(page)).toBeVisible();
}

test("in Save to GitHub, a draft of a deleted file says so and is discarded or kept as a new file; then the rest saves", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await seedStaleDrafts(page);
  await open(page, baseURL);
  // The stylesheet is not on GitHub: the site loads as it is whatever the old draft says.
  await expect(frame(page).locator("h1")).toHaveText("Found where they are", { timeout: 30_000 });
  await expect(page.locator(".native-preview-error")).toBeHidden();

  await openSaveMenu(page);
  for (const path of [stalePath, notesPath]) {
    await expect(row(page, path).getByRole("checkbox")).toBeDisabled();
    await expect(row(page, path).getByRole("checkbox")).not.toBeChecked();
  }
  await expect(panel(page).locator(".publish-menu__note", { hasText: "Deleted on GitHub" })).toHaveCount(2);

  await panel(page).getByRole("button", { name: `Discard the draft of ${stalePath}` }).click();
  await expect(row(page, stalePath)).toHaveCount(0);
  await panel(page).getByRole("button", { name: `Keep ${notesPath} as a new file` }).click();
  await expect(panel(page).getByRole("button", { name: `Show changes in ${notesPath}` })).toHaveText(/New file, 4 lines/);
  const notes = row(page, notesPath).getByRole("checkbox");
  await expect(notes).toBeEnabled();
  await notes.check();
  await saveSubmit(page).click();
  await expect(panel(page).locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });

  // Reloaded: nothing is left to save, the notes are back on GitHub and the stylesheet is not.
  await open(page, baseURL, notesPath);
  await expect(page.locator("#content .view-lines")).toContainText("Kept from an old draft.");
  await expect(page.locator("#content .code-editor__conflict")).toBeHidden();
  await expect(saveTrigger(page)).toBeDisabled();
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("astro-site-editor:draft:v1:")).length);
  expect(drafts).toBe(0);
  await open(page, baseURL);
  await expect(frame(page).locator("h1")).toHaveText("Found where they are", { timeout: 30_000 });
});

test("opened in the code editor, a draft of a deleted file offers Discard draft and Keep as new file", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await seedStaleDrafts(page);
  await open(page, baseURL, notesPath);
  const bar = page.locator("#content .code-editor__conflict");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("GitHub deleted this file since this draft started.");
  await expect(page.locator("#content .view-lines")).toContainText("Kept from an old draft.");
  await bar.getByRole("button", { name: "Keep as new file" }).click();
  await expect(page.locator("#status")).toContainText(`Kept ${notesPath} as a new file.`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", notesPath);
  await expect(page.locator("#content .code-editor__conflict")).toBeHidden();
  await expect(page.locator("#content .view-lines")).toContainText("Kept from an old draft.");

  // The stylesheet's draft, opened from its path, is discarded; the home page opens.
  await open(page, baseURL, stalePath);
  await expect(page.locator("#content .code-editor__conflict")).toContainText("GitHub deleted this file since this draft started.");
  await page.locator("#content .code-editor__conflict").getByRole("button", { name: "Discard draft" }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText(`Discarded the draft of ${stalePath}.`);

  await openSaveMenu(page);
  await expect(row(page, stalePath)).toHaveCount(0);
  await expect(panel(page).locator(".publish-menu__note", { hasText: "Deleted on GitHub" })).toHaveCount(0);
  await row(page, notesPath).getByRole("checkbox").check();
  await saveSubmit(page).click();
  await expect(panel(page).locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await expect(frame(page).locator("h1")).toHaveText("Found where they are");
});
