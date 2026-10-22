import { test, expect, type Page } from "@playwright/test";

// Default fixture group. Media search waits for a pause in typing (ticket 91):
// the grid redraws 150 ms after the last keystroke, the search keeps focus and
// caret, and a thumbnail clicked while the redraw waits still opens on one click.
// The view is mounted over a fake host; the page clock is paused after mounting
// so the search's own timer only runs when the test advances it.
const library = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const thumbnails = (page: Page) => library(page).locator(".media-library__thumbnail");
const count = (page: Page) => library(page).locator("[role=status]").filter({ hasText: / of \d+ files/ });
const search = (page: Page) => library(page).getByLabel("Search media", { exact: true });

async function mountLibrary(page: Page, baseURL: string | undefined) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const paths = ["cat", "dog", "bird"].flatMap((kind) => [0, 1, 2].map((index) => `images/${kind}-${index}.svg`));
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:white;z-index:1000";
    document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() { return { key: "pause", items: paths.map((path) => ({ path, version: "A" })), metadata: {}, collections: [], usage: {} }; },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {},
      async import() { return []; },
    });
    await view.ready;
  });
  await expect(thumbnails(page)).toHaveCount(9);
  await expect(count(page)).toHaveText("9 of 9 files");
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000);
}

test("search redraws after the pause, keeping focus and caret in the field", async ({ page, baseURL }) => {
  await mountLibrary(page, baseURL);
  await search(page).click();
  await page.keyboard.type("cat");
  await page.keyboard.press("ArrowLeft");
  // The clock is paused, so nothing has redrawn yet: these hold the state at 149 ms.
  await page.clock.runFor(149);
  await expect(thumbnails(page)).toHaveCount(9);
  await expect(count(page)).toHaveText("9 of 9 files");

  await page.clock.runFor(1);
  await expect(thumbnails(page)).toHaveCount(3);
  await expect(count(page)).toHaveText("3 of 9 files");
  await expect(search(page)).toBeFocused();
  expect(await search(page).evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([2, 2]);
});

test("a thumbnail clicked while the search waits opens on the first click", async ({ page, baseURL }) => {
  await mountLibrary(page, baseURL);
  await search(page).click();
  await page.keyboard.type("dog");
  await expect(thumbnails(page)).toHaveCount(9);

  await library(page).getByRole("button", { name: "Details for images/dog-1.svg", exact: true }).click();
  await page.clock.runFor(1);
  await expect(library(page).getByLabel("File name", { exact: true })).toHaveValue("dog-1.svg");
  await expect(count(page)).toHaveText("3 of 9 files");
});

test.describe("touch search", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("a thumbnail tapped while the search waits opens on the first tap", async ({ page, baseURL }) => {
    await mountLibrary(page, baseURL);
    await search(page).tap();
    await page.keyboard.type("dog");
    await expect(search(page)).toBeFocused();
    await expect(thumbnails(page)).toHaveCount(9);

    await library(page).getByRole("button", { name: "Details for images/dog-1.svg", exact: true }).tap();
    await page.clock.runFor(1);
    await expect(library(page).getByLabel("File name", { exact: true })).toHaveValue("dog-1.svg");
    await expect(count(page)).toHaveText("3 of 9 files");
  });
});

test("selection clicked while the search waits stays selected, on the box and on its round", async ({ page, baseURL }) => {
  await mountLibrary(page, baseURL);
  const selected = library(page).locator(".media-library__bulk-count");
  await search(page).click();
  await page.keyboard.type("dog");
  await library(page).locator('.media-library__card[data-path="images/dog-1.svg"] .media-library__select').click();
  await page.clock.runFor(1);
  await expect(library(page).getByLabel("Select images/dog-1.svg", { exact: true })).toBeChecked();
  await expect(count(page)).toHaveText("3 of 9 files");
  await expect(selected).toHaveText("1 selected");

  await search(page).fill("");
  await search(page).click();
  await page.keyboard.type("dog-");
  await library(page).getByLabel("Select images/dog-2.svg", { exact: true }).click({ force: true }); // the box itself sits under its round
  await page.clock.runFor(1);
  await expect(library(page).getByLabel("Select images/dog-2.svg", { exact: true })).toBeChecked();
  await expect(library(page).getByLabel("Select images/dog-1.svg", { exact: true })).toBeChecked();
  await expect(selected).toHaveText("2 selected");
});

test("Enter, clearing and Tab apply the search at once; the count and focus follow", async ({ page, baseURL }) => {
  await mountLibrary(page, baseURL);
  await search(page).click();
  await page.keyboard.type("cat");
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("3 of 9 files");
  await expect(search(page)).toBeFocused();
  expect(await search(page).evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([3, 3]);

  await search(page).fill("");
  await expect(count(page)).toHaveText("9 of 9 files");

  await page.keyboard.type("cat");
  await page.keyboard.press("Tab");
  await expect(thumbnails(page)).toHaveCount(3);
  await expect(count(page)).toHaveText("3 of 9 files");
  await expect(library(page).locator("button:focus")).toHaveCount(1); // the next stop in Media, not the page
});

test("a press released outside Media still applies the waiting search", async ({ page, baseURL }) => {
  await mountLibrary(page, baseURL);
  await search(page).click();
  await page.keyboard.type("dog");
  const tile = await library(page).getByRole("button", { name: "Details for images/dog-1.svg", exact: true }).boundingBox();
  await page.mouse.move(tile!.x + tile!.width / 2, tile!.y + tile!.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await page.clock.runFor(149);
  await expect(thumbnails(page)).toHaveCount(9);
  await page.clock.runFor(1);
  await expect(thumbnails(page)).toHaveCount(3);
  await expect(count(page)).toHaveText("3 of 9 files");
});
