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
  await expect(library(page).getByLabel("File name", { exact: true })).toHaveValue("dog-1.svg");
  await expect(count(page)).toHaveText("3 of 9 files");
});
