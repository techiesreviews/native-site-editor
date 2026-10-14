import { test, expect, type Page } from "@playwright/test";

// Default fixture group. Arrow keys move through the library's thumbnails by
// card and by row, and Enter opens the focused image's details. The view is
// mounted over a fake host with nine images so the grid has several rows.
const library = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const thumbnails = (page: Page) => library(page).locator(".media-library__thumbnail");
const focusedIndex = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll(".media-library__thumbnail")].indexOf(document.activeElement!));

test("arrow keys browse the image grid by card and row; Enter opens details", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.evaluate(async () => {
    const { createMediaLibraryView } = await import("/src/page-builder/media-library-view.ts");
    const paths = Array.from({ length: 9 }, (_, index) => `images/key-${index}.svg`);
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:20px;background:white;z-index:1000";
    document.body.append(host);
    const view = createMediaLibraryView(host, {
      async load() { return { key: "keys", items: paths.map((path) => ({ path, version: "A" })), metadata: {}, collections: [], usage: {} }; },
      async blob() { return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], { type: "image/svg+xml" }); },
      async metadata() {}, async collections() {}, async rename() {}, async remove() {}, async openPage() {},
      async import() { return []; },
    });
    await view.ready;
  });
  await expect(thumbnails(page)).toHaveCount(9);
  // Columns as laid out: the cards that share the first card's row.
  const tops = await library(page).locator(".media-library__card").evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().top)));
  const columns = tops.filter((top) => top === tops[0]).length;
  expect(columns).toBeGreaterThan(1);
  expect(columns).toBeLessThan(9);

  await thumbnails(page).first().focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focusedIndex(page)).toBe(1);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedIndex(page)).toBe(1 + columns);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => focusedIndex(page)).toBe(1);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focusedIndex(page)).toBe(0);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(library(page).getByLabel("Default alt text", { exact: true })).toBeVisible();
  await expect(library(page).locator(".media-library__detail-name")).toHaveText("key-1.svg");
  await expect(library(page).getByRole("button", { name: "Back to grid", exact: true })).toBeFocused();
});
