import { expect, test, type Page } from "@playwright/test";
import { publishButton } from "./publish";

// Clean up: the Media tab's count, Dismiss, and the Always keep mark (slice 49); the review (slice 50);
// removing a used file and restoring it from Recently removed (slice 51).
// The starter's images/studio-desk.svg is used nowhere, so it is always counted.
test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const svg = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><title>${label}</title><rect width="40" height="40" fill="#4a7"/></svg>`;
// The starter's placeholder.svg lacks width and height, which Improve images would count on the tab
// too (slice 74); it is left as is here, so these tests count Clean up alone.
const leftAsIs = [{ picture: "images/placeholder.svg" }];
const quiet = JSON.stringify({ version: 2, collections: [], files: {}, leftAsIs });
const records = JSON.stringify({ version: 2, collections: [], files: { "images/kept.svg": { alwaysKeep: true } }, leftAsIs });
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

  // The Always keep file shows its mark on its tile and in details.
  const kept = pane(page).locator('.media-library__card[data-path="images/kept.svg"]');
  await expect(kept.getByRole("img", { name: "Always keep", exact: true })).toBeVisible();
  await expect(pane(page).locator('.media-library__card[data-path="images/spare.svg"] .media-library__keep')).toHaveCount(0);
  await kept.getByRole("button", { name: "Details for images/kept.svg", exact: true }).click();
  await expect(pane(page).getByText("Always keep: Clean up never suggests this file.", { exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();

  // Clean up in More shows the same count and opens the review; the Always keep file is not suggested.
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clean up (2)", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Clean up", exact: true })).toBeFocused();
  await expect(pane(page).getByText(/^Files used only from outside the site .* Mark them Always keep\.$/)).toBeVisible();
  await pane(page).getByRole("button", { name: /^Nothing uses these 2 files · / }).click();
  await expect(pane(page).locator(".media-cleanup__photo strong")).toHaveText(["spare.svg", "studio-desk.svg"]);
  // Each file is chosen on its own; Select all and Clear selection follow what is checked now.
  const pick = (name: string) => pane(page).getByRole("checkbox", { name: `Select ${name}`, exact: true });
  const sum = pane(page).locator(".media-cleanup__sum");
  await pick("spare.svg").check();
  await pick("studio-desk.svg").check();
  await expect(sum).toHaveText(/^2 selected · /);
  await pane(page).getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(pick("spare.svg")).not.toBeChecked();
  await expect(pick("studio-desk.svg")).not.toBeChecked();
  await expect(sum).toHaveText("0 selected · 0 B");
  await pane(page).getByRole("button", { name: "Select all", exact: true }).click();
  await pick("spare.svg").uncheck();
  await pane(page).getByRole("button", { name: "Select all", exact: true }).click();
  await expect(pick("spare.svg")).toBeChecked();
  await expect(pick("studio-desk.svg")).toBeChecked();
  await expect(sum).toHaveText(/^2 selected · /);
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();

  // Dismiss hides the count everywhere, also after a reload; Clean up keeps its count.
  await pane(page).getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Clean up", exact: true })).toBeFocused();
  await expect(tab(page).locator(".media-count")).toBeHidden();
  await expect(toggleCount(page)).toBeHidden();
  await expect(tab(page)).toHaveAccessibleDescription("");
  await expect(pane(page).getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Clean up", exact: true })).toHaveCount(0);
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
  await commit(page, baseURL, [["images/spare.svg", svg("Spare")], [".editor/media.json", quiet]]);
  await open(page, baseURL);
  await expect(toggleCount(page)).toHaveText("2");
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html");
    if (model === undefined) throw new Error("Missing source model");
    const at = model.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<img src="/images/spare.svg" alt="Spare" width="40" height="40">' });
  });
  await expect(toggleCount(page)).toHaveText("1");
  // With nothing to suggest, Clean up in More says why.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html")!;
    const at = model.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<img src="/images/studio-desk.svg" alt="Desk" width="40" height="40">' });
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

test("unused images appear in Clean up; removing them puts them in Recently removed, and Undo brings them back", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await commit(page, baseURL, [["images/spare.svg", svg("Spare")], [".editor/media.json", quiet]]);
  await open(page, baseURL);
  await expect(toggleCount(page)).toHaveText("2");
  await page.locator("#explorer-toggle").click();
  await tab(page).click();
  const more = async (item: string | RegExp) => {
    await pane(page).getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: item, exact: typeof item === "string" }).click();
  };

  // The group card shows its pictures, count and size; the review shows each file larger, chosen on its own.
  await more("Clean up (2)");
  const group = pane(page).getByRole("button", { name: /^Nothing uses these 2 files · \d+ (B|KB)$/ });
  await expect(group.locator("img")).toHaveCount(2);
  await group.click();
  await expect(pane(page).getByRole("heading", { name: "Nothing uses these", exact: true })).toBeFocused();
  const spare = pane(page).locator('.media-cleanup__photo[data-path="images/spare.svg"]');
  await expect.poll(() => spare.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(spare).toContainText("No uses found");
  const review = pane(page).getByRole("button", { name: "Review removal", exact: true });
  await expect(review).toBeDisabled();
  await pane(page).getByRole("checkbox", { name: "Select spare.svg", exact: true }).check();
  await expect(pane(page).locator(".media-cleanup__sum")).toHaveText(/^1 selected · \d+ B$/);
  await pane(page).getByRole("checkbox", { name: "Select studio-desk.svg", exact: true }).check();

  // The confirmation names the files; Keep files goes back with the choice kept.
  await review.click();
  await expect(pane(page).getByRole("heading", { name: "Remove 2 files?", exact: true })).toBeFocused();
  await expect(pane(page).getByText("Nothing on the site uses these files.", { exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: "Keep files", exact: true }).click();
  await expect(pane(page).getByRole("checkbox", { name: "Select spare.svg", exact: true })).toBeChecked();
  await review.click();
  await pane(page).getByRole("button", { name: "Remove 2 files", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Clean up", exact: true })).toBeFocused();
  await expect(pane(page).locator(".media-cleanup__notice")).toHaveText("Removed 2 files.Undo");
  await expect(pane(page).locator(".media-library__message")).toContainText("Removed 2 files. They stay in Recently removed for 30 days.");
  await expect(pane(page).locator('.media-library__card[data-path="images/spare.svg"]')).toHaveCount(0);
  await expect(toggleCount(page)).toBeHidden();

  // It waits in Recently removed.
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await more("Recently removed");
  await expect(pane(page).locator('.media-removed__list li[data-path="images/spare.svg"]')).toContainText("Removed today · 30 days left");
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();

  // With nothing left to suggest, Clean up still opens for Undo, which brings both back to their addresses.
  await more("Clean up");
  await pane(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(pane(page).locator(".media-library__message")).toContainText("Brought back 2 files to their addresses.");
  await expect(pane(page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await expect(toggleCount(page)).toHaveText("2");
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(pane(page).locator('.media-library__card[data-path="images/spare.svg"]')).toBeVisible();
  await more("Recently removed");
  await expect(pane(page).getByText(/^Nothing removed in the last 30 days\./)).toBeVisible();
});
