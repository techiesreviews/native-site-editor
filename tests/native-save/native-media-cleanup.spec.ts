import { expect, test, type Page } from "@playwright/test";
import { publishButton } from "./publish";

// Clean up: the Media tab's count, Dismiss, and the Always keep mark (slice 49); removing a used file
// and restoring it from Recently removed (slice 51).
// The starter's images/studio-desk.svg is used nowhere, so it is always counted.
test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const svg = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><title>${label}</title><rect width="40" height="40" fill="#4a7"/></svg>`;
const records = JSON.stringify({ version: 2, collections: [], files: { "images/kept.svg": { alwaysKeep: true } } });
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const toggleCount = (page: Page) => page.locator("#explorer-toggle > .media-count");
const tab = (page: Page) => page.getByRole("tab", { name: "Media", exact: true });

async function commit(page: Page, baseURL: string | undefined, files: [string, string][]) {
  for (const [path, content] of files)
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
}
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
}
// The same address again is only a hash visit; a later visit reloads.
async function reopen(page: Page) {
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
}

test("the Media tab counts unused files from anywhere; Dismiss hides the count until a new unused file appears", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await commit(page, baseURL, [["images/spare.svg", svg("Spare")], ["images/kept.svg", svg("Kept")], [".editor/media.json", records]]);
  await open(page, baseURL);
  // Before Media ever opens, the button that opens it shows the count.
  await expect(toggleCount(page)).toHaveText("2");
  await expect(page.locator("#explorer-toggle")).toHaveAccessibleDescription("2 files to clean up");
  await page.locator("#explorer-toggle").click();
  await expect(tab(page)).toHaveAccessibleDescription("2 files to clean up");
  await expect(tab(page).locator(".media-count")).toHaveText("2");
  await tab(page).click();

  // Clean up in More shows the same count and opens what it would suggest; the Always keep file is not among them.
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clean up (2)", exact: true }).click();
  const panel = pane(page).getByRole("region", { name: "Clean up", exact: true });
  await expect(panel.getByRole("heading", { name: "Clean up", exact: true })).toBeFocused();
  await expect(panel.locator(".media-count")).toHaveText("2");
  await expect(panel.locator("li")).toHaveText(["spare.svg", "studio-desk.svg"]);
  const kept = pane(page).locator('.media-library__card[data-path="images/kept.svg"]');
  await expect(kept.getByRole("img", { name: "Always keep", exact: true })).toBeVisible();
  await expect(pane(page).locator('.media-library__card[data-path="images/spare.svg"] .media-library__keep')).toHaveCount(0);
  await kept.getByRole("button", { name: "Details for images/kept.svg", exact: true }).click();
  await expect(pane(page).getByText("Always keep: Clean up never suggests this file.", { exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();

  // Dismiss hides the count everywhere, also after a reload; Clean up keeps its count.
  await panel.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Clean up", exact: true })).toBeFocused();
  await expect(tab(page).locator(".media-count")).toBeHidden();
  await expect(toggleCount(page)).toBeHidden();
  await expect(tab(page)).toHaveAccessibleDescription("");
  await expect(panel.getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(pane(page).getByRole("button", { name: "More", exact: true })).toBeFocused();
  await reopen(page);
  await page.locator("#explorer-toggle").click();
  await tab(page).click();
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Clean up (2)", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggleCount(page)).toBeHidden();

  // A new unused file brings the count back, counting everything Clean up suggests.
  await commit(page, baseURL, [["images/another.svg", svg("Another")]]);
  await reopen(page);
  await expect(toggleCount(page)).toHaveText("3");
  await expect(page.locator("#explorer-toggle")).toHaveAccessibleDescription("3 files to clean up");
});

test("using the unused file on a page takes it out of the count", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await commit(page, baseURL, [["images/spare.svg", svg("Spare")]]);
  await open(page, baseURL);
  await expect(toggleCount(page)).toHaveText("2");
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html");
    if (model === undefined) throw new Error("Missing source model");
    const at = model.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<img src="/images/spare.svg" alt="Spare">' });
  });
  await expect(toggleCount(page)).toHaveText("1");
  // With nothing to suggest, Clean up in More says why.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html")!;
    const at = model.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<img src="/images/studio-desk.svg" alt="Desk">' });
  });
  await expect(toggleCount(page)).toBeHidden();
  await page.locator("#explorer-toggle").click();
  await tab(page).click();
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const item = page.getByRole("menuitem", { name: /^Clean up/ });
  await expect(item).toHaveAttribute("aria-disabled", "true");
  await expect(item).toHaveAccessibleDescription("Nothing to clean up: every file is used or marked Always keep.");
});

test("removing a used file warns with its page, then allows; after publishing, Recently removed restores it and the page shows it again", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer-toggle").click();
  await tab(page).click();
  const hero = page.frameLocator(".native-preview-frame").locator(".hero-image");
  const shown = () => hero.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth);
  await expect.poll(shown).toBeGreaterThan(0);

  // Remove file from details: the page using it is named, its picture will break, and it can be opened first.
  await pane(page).getByRole("button", { name: "Details for images/placeholder.svg", exact: true }).click();
  await pane(page).getByRole("button", { name: "Remove file…", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Remove placeholder.svg?", exact: true })).toBeFocused();
  await expect(pane(page).getByText(/^1 page uses this file\. The picture on it will break/)).toBeVisible();
  await expect(pane(page).getByRole("button", { name: /^Open (Home|index\.html)$/ })).toBeVisible();
  // Cancel goes back to the file's details.
  await pane(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "Remove file…", exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: "Remove file…", exact: true }).click();
  await pane(page).getByRole("button", { name: "Remove file", exact: true }).click();
  await expect(pane(page).locator(".media-library__message")).toContainText("Removed placeholder.svg. Restore it from More → Recently removed.");
  await expect(pane(page).locator('.media-library__card[data-path="images/placeholder.svg"]')).toHaveCount(0);

  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await page.request.get(`${baseURL}/__demo/file?path=images/placeholder.svg`)).status()).toBe(404);
  // Publish closes the explorer; open Media again.
  await page.mouse.move(0, 400);
  await page.locator("#explorer-toggle").click();
  await tab(page).click();

  // Recently removed lists it with its date and picture; Restore brings it back to the same address.
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Recently removed", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Recently removed", exact: true })).toBeFocused();
  const row = pane(page).locator('.media-removed__list li[data-path="images/placeholder.svg"]');
  await expect(row).toContainText("Removed today · 30 days left");
  await expect.poll(() => row.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await row.getByRole("button", { name: "Restore placeholder.svg", exact: true }).click();
  await expect(pane(page).locator(".media-library__message")).toContainText("Restored placeholder.svg to images/placeholder.svg.");
  await expect(row).toHaveCount(0);
  await expect(pane(page).getByText(/^Nothing removed in the last 30 days\./)).toBeVisible();
  await expect.poll(shown).toBeGreaterThan(0);
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(pane(page).locator('.media-library__card[data-path="images/placeholder.svg"]')).toBeVisible();

  // Published again, the old file is back on GitHub without a new upload.
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await page.request.get(`${baseURL}/__demo/file?path=images/placeholder.svg`)).ok()).toBe(true);
});
