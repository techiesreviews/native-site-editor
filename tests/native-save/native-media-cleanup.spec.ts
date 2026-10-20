import { expect, test, type Page } from "@playwright/test";
import { openEditor, openMedia } from "../support/scenarios";
import { publishButton } from "./publish";

// Clean up: its count in More and the Always keep mark (slice 49; the Media tab's count and Dismiss went
// in slice 122); the review (slice 50); removing a used file and restoring it from Recently removed (slice 51).
// The starter's images/studio-desk.svg is used nowhere, so it is always counted.
test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const svg = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><title>${label}</title><rect width="40" height="40" fill="#4a7"/></svg>`;
// The starter's placeholder.svg lacks width and height, which Improve images would count on the tab
// too (slice 74); it is left as is here, so these tests count Clean up alone.
const leftAsIs = [{ picture: "images/placeholder.svg" }];
const quiet = JSON.stringify({ version: 2, collections: [], files: {}, leftAsIs });
const records = JSON.stringify({ version: 2, collections: [], files: { "images/kept.svg": { alwaysKeep: true } }, leftAsIs });
const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tab = (page: Page) => page.getByRole("tab", { name: "Media", exact: true });

/** Clean up's count in More, opening Media first when it is not shown; 0 when there is none. */
async function cleanUpCount(page: Page) {
  if (!await pane(page).isVisible()) {
    await openMedia(page);
  }
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const label = await page.getByRole("menuitem", { name: /^Clean up/ }).textContent();
  await page.keyboard.press("Escape");
  return Number(/\((\d+)\)/.exec(label ?? "")?.[1] ?? 0);
}
const expectCount = (page: Page, count: number) => expect.poll(() => cleanUpCount(page), { timeout: 15_000 }).toBe(count);

async function commit(page: Page, baseURL: string | undefined, files: [string, string][]) {
  for (const [path, content] of files)
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
}
async function open(page: Page, baseURL: string | undefined) {
  await openEditor(page, baseURL);
}
// The same address again is only a hash visit; a later visit reloads.
async function reopen(page: Page) {
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main");
}

test("Clean up in More counts unused files; neither the Media tab nor the page button shows a count", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await commit(page, baseURL, [["images/spare.svg", svg("Spare")], ["images/kept.svg", svg("Kept")], [".editor/media.json", records]]);
  await open(page, baseURL);
  await expectCount(page, 2);
  // Lex (slice 122): no number on the Media tab, no dot on the page button, nothing for screen readers either.
  await expect(page.locator(".media-count")).toHaveCount(0);
  await expect(tab(page)).toHaveAccessibleName("Media");
  await expect(tab(page)).not.toHaveAttribute("aria-describedby");
  await expect(page.locator("#explorer-toggle")).not.toHaveAttribute("aria-describedby");

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
  await expect(pane(page).getByRole("heading", { name: /^Clean up( · .+)?$/ })).toBeFocused();
  await expect(pane(page).getByRole("heading", { name: /^Clean up · \d+ B$/ })).toBeVisible();
  await expect(pane(page).getByText("Files used only from outside the site? Mark them Always keep.", { exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: /^Nothing uses these 2 files · / }).click();
  await expect(pane(page).locator(".media-cleanup__photo .media-library__name-head")).toHaveText(["spare.svg", "studio-desk.svg"]);
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

  // Clean up offers no Dismiss: there is no count on the tab to hide.
  await expect(pane(page).getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: /^Clean up( · .+)?$/ })).toHaveCount(0);
  await expect(pane(page).getByRole("button", { name: "More", exact: true })).toBeFocused();

  // A new unused file raises the count, counting everything Clean up suggests.
  await commit(page, baseURL, [["images/another.svg", svg("Another")]]);
  await reopen(page);
  await expectCount(page, 3);
  await expect(page.locator(".media-count")).toHaveCount(0);
});

test("using the unused file on a page takes it out of the count", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await commit(page, baseURL, [["images/spare.svg", svg("Spare")], [".editor/media.json", quiet]]);
  await open(page, baseURL);
  await expectCount(page, 2);
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html");
    if (model === undefined) throw new Error("Missing source model");
    const at = model.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<img src="/images/spare.svg" alt="Spare" width="40" height="40">' });
  });
  await expectCount(page, 1);
  // With nothing to suggest, Clean up in More is greyed out.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const model = editor.getMountedSource("index.html")!;
    const at = model.indexOf("</main>");
    editor.replaceActiveRange({ path: "index.html", start: at, end: at, expected: "", text: '<img src="/images/studio-desk.svg" alt="Desk" width="40" height="40">' });
  });
  await expectCount(page, 0);
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  const item = page.getByRole("menuitem", { name: /^Clean up/ });
  await expect(item).toHaveAttribute("aria-disabled", "true");
  // Greyed out with no note (Lex, 2026-10-20).
  await expect(item).toHaveAccessibleDescription("");
  await expect(item.locator(".row-menu__note")).toHaveCount(0);
});

test("removing a used file warns with its page, then allows; after publishing, Recently removed restores it and the page shows it again", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openMedia(page);
  const hero = page.frameLocator(".native-preview-frame").locator(".hero-image");
  const shown = () => hero.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth);
  await expect.poll(shown).toBeGreaterThan(0);

  // Remove file from details: the page using it is named, its picture will break, and it can be opened first.
  await pane(page).getByRole("button", { name: "Details for images/placeholder.svg", exact: true }).click();
  await pane(page).getByRole("button", { name: "More for this file", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove…", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Remove placeholder.svg?", exact: true })).toBeFocused();
  await expect(pane(page).getByText(/^1 page uses this file\. The picture on it will break/)).toBeVisible();
  await expect(pane(page).getByRole("button", { name: /^Open (Home|index\.html)$/ })).toBeVisible();
  // Cancel goes back to the file's details.
  await pane(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(pane(page).getByRole("button", { name: "More for this file", exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: "More for this file", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove…", exact: true }).click();
  await pane(page).getByRole("button", { name: "Remove file", exact: true }).click();
  await expect(page.locator(".editor-toast__text")).toContainText("Removed placeholder.svg. Restore it from More → Recently removed.");
  await expect(pane(page).locator('.media-library__card[data-path="images/placeholder.svg"]')).toHaveCount(0);

  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  expect((await page.request.get(`${baseURL}/__demo/file?path=images/placeholder.svg`)).status()).toBe(404);
  // Publish closes the explorer; open Media again.
  await page.mouse.move(0, 400);
  await openMedia(page);

  // Recently removed lists it with its date and picture; Restore brings it back to the same address.
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Recently removed", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: "Recently removed", exact: true })).toBeFocused();
  const row = pane(page).locator('.media-removed__list li[data-path="images/placeholder.svg"]');
  await expect(row).toContainText("Removed today · 30 days left");
  await expect.poll(() => row.locator("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await row.getByRole("button", { name: "Restore placeholder.svg", exact: true }).click();
  await expect(page.locator(".editor-toast__text")).toContainText("Restored placeholder.svg to images/placeholder.svg.");
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
  await expectCount(page, 2);
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
  // A tile names the file and the size it frees; the confirmation says what the check found.
  await expect(spare.locator(".media-cleanup__size")).toHaveText(/^\d+ B$/);
  const review = pane(page).getByRole("button", { name: "Review removal", exact: true });
  await expect(review).toBeDisabled();
  await pane(page).getByRole("checkbox", { name: "Select spare.svg", exact: true }).check();
  await expect(pane(page).locator(".media-cleanup__sum")).toHaveText(/^1 selected · \d+ B$/);
  await pane(page).getByRole("checkbox", { name: "Select studio-desk.svg", exact: true }).check();

  // The confirmation names the files; Keep files goes back with the choice kept.
  await review.click();
  await expect(pane(page).getByRole("heading", { name: "Remove 2 files?", exact: true })).toBeFocused();
  await expect(pane(page).getByText("Nothing on the site uses these files.", { exact: true })).toBeVisible();
  await expect(pane(page).locator('.media-cleanup__confirm [data-path="images/spare.svg"]')).toContainText("No uses found");
  await pane(page).getByRole("button", { name: "Keep files", exact: true }).click();
  await expect(pane(page).getByRole("checkbox", { name: "Select spare.svg", exact: true })).toBeChecked();
  await review.click();
  await pane(page).getByRole("button", { name: "Remove 2 files", exact: true }).click();
  await expect(pane(page).getByRole("heading", { name: /^Clean up( · .+)?$/ })).toBeFocused();
  await expect(pane(page).locator(".media-cleanup__notice")).toHaveText("Removed 2 files.Undo");
  await expect(page.locator(".editor-toast__text")).toContainText("Removed 2 files. They stay in Recently removed for 30 days.");
  await expect(pane(page).locator('.media-library__card[data-path="images/spare.svg"]')).toHaveCount(0);

  // It waits in Recently removed.
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await more("Recently removed");
  await expect(pane(page).locator('.media-removed__list li[data-path="images/spare.svg"]')).toContainText("Removed today · 30 days left");
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();

  // With nothing left to suggest, Clean up still opens for Undo, which brings both back to their addresses.
  await more("Clean up");
  // More's item has no note, but the screen still says why it is empty.
  await expect(pane(page).getByText("Nothing to clean up: every file is used or marked Always keep.", { exact: true })).toBeVisible();
  await pane(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".editor-toast__text")).toContainText("Brought back 2 files to their addresses.");
  await expect(pane(page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await pane(page).getByRole("button", { name: "Back", exact: true }).click();
  await expectCount(page, 2);
  await expect(pane(page).locator('.media-library__card[data-path="images/spare.svg"]')).toBeVisible();
  await more("Recently removed");
  await expect(pane(page).getByText(/^Nothing removed in the last 30 days\./)).toBeVisible();
});

test("on a phone the Clean up review is the media grid: three tiles a row, a ticked tile keeps its whole picture in a 3 px ring", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL!);
  await commit(page, baseURL, [...["a", "b", "c", "d"].map(name => [`images/spare-${name}.svg`, svg(name)] as [string, string]), [".editor/media.json", quiet]]);
  await open(page, baseURL);
  await openMedia(page);
  await pane(page).getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Clean up/ }).click();
  await pane(page).getByRole("button", { name: /^Nothing uses these/ }).click();
  const tiles = pane(page).locator(".media-cleanup__photo");
  await expect(tiles).toHaveCount(5);
  const boxes = await tiles.evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { top: Math.round(box.top), width: box.width, height: box.height }; }));
  expect(boxes.slice(0, 3).map(box => box.top)).toEqual([boxes[0].top, boxes[0].top, boxes[0].top]);
  expect(boxes[3].top).toBeGreaterThan(boxes[0].top);
  for (const box of boxes) expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
  const first = tiles.first();
  await first.locator(".media-library__thumbnail").click();
  await expect(first.getByRole("checkbox")).toBeChecked();
  expect(await first.evaluate(card => getComputedStyle(card, "::after").boxShadow)).toMatch(/0px 0px 0px 3px inset$/);
  // The picture still fills the tile: no band above or below it.
  const [card, picture] = await Promise.all([first.boundingBox(), first.locator("img").boundingBox()]);
  expect(picture).toEqual(card);
  await expect(pane(page).getByRole("button", { name: "Review removal", exact: true })).toBeInViewport({ ratio: 1 });
});
