// Newest first (media-manager slice 103): a file just added leads Media, comes into view with a brief
// ring and says when it was added; in the picker it leads the grid and is chosen, so Use is one tap.
// Default fixture: images/placeholder.svg and images/studio-desk.svg, no records yet.
import { test, expect, type Browser, type Page } from "@playwright/test";
import { openEditor, openMedia, openImagePicker } from "../support/scenarios";
import { storedDraft } from "./drafts";

const pane = (page: Page) => page.getByRole("region", { name: "Media", exact: true });
const tray = (page: Page) => pane(page).getByRole("region", { name: "Files being added", exact: true });
const cards = (page: Page) => pane(page).locator(".media-library__card");
const tileNames = (page: Page) => cards(page).evaluateAll(all => all.map(card => (card as HTMLElement).dataset.path));
const svg = (fill: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="${fill}"/></svg>`);
const file = (name: string, fill = "teal") => ({ name, mimeType: "image/svg+xml", buffer: svg(fill) });

async function open(page: Page, baseURL: string | undefined) {
  await openEditor(page, baseURL);
  await openMedia(page);
  await expect(pane(page).getByRole("button", { name: "Details for images/studio-desk.svg", exact: true })).toBeVisible();
}
const add = (page: Page, files: ReturnType<typeof file>[]) => pane(page).locator('input[name="media-upload"]').setInputFiles(files);

async function addAndSee(browser: Browser, baseURL: string | undefined, phone: boolean) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await open(page, baseURL);
  // Enough files that the grid scrolls; then look at the bottom, as after browsing.
  await add(page, Array.from({ length: 14 }, (_, index) => file(`a-${String(index).padStart(2, "0")}.svg`)));
  await expect(tray(page).getByRole("status")).toHaveText("Added 14 files");
  await cards(page).last().scrollIntoViewIfNeeded();
  // A phone's grid is taller than its screen; a desktop shows every tile.
  if (phone) await expect(cards(page).first()).not.toBeInViewport();
  // A name that sorts last by name still leads: it is the newest.
  await add(page, [file("zebra.svg", "black")]);
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await expect.poll(async () => (await tileNames(page))[0]).toBe("media/images/zebra.svg");
  const zebra = cards(page).first();
  await expect(zebra).toBeInViewport();
  await expect(zebra).toHaveClass(/\bis-new\b/);
  // Older files without a date (the site's own) follow the dated ones.
  expect((await tileNames(page)).slice(-2)).toEqual(["images/placeholder.svg", "images/studio-desk.svg"]);
  // The record keeps the date; File details shows it.
  const records = JSON.parse((await storedDraft(page, ".editor/media.json"))!.content) as { files: Record<string, { added?: string }> };
  const added = Date.parse(records.files["media/images/zebra.svg"].added ?? "");
  expect(Math.abs(Date.now() - added)).toBeLessThan(5 * 60_000);
  await zebra.getByRole("button", { name: "Details for media/images/zebra.svg", exact: true }).click();
  await expect(pane(page).locator(".media-detail__note").first()).toHaveText(/^Added \S+ \S+/);
  await context.close();
}

test("a file added on a desktop leads Media, wears a ring and shows when it was added", async ({ browser, baseURL }) => {
  await addAndSee(browser, baseURL, false);
});

test("a file added on a phone leads Media and comes into view from far down the grid", async ({ browser, baseURL }) => {
  await addAndSee(browser, baseURL, true);
});

test("a file added while the kind hides it is one tap away: Show new files brings it in, first and ringed", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, baseURL);
  await pane(page).getByRole("button", { name: /^Filter/ }).click();
  await page.getByRole("menuitemradio", { name: "Video", exact: true }).click();
  await add(page, [file("zebra.svg")]);
  await expect(tray(page).getByRole("status")).toHaveText("Added 1 file");
  await tray(page).getByRole("button", { name: "Show new files", exact: true }).click();
  await expect.poll(async () => (await tileNames(page))[0]).toBe("media/images/zebra.svg");
  await expect(cards(page).first()).toHaveClass(/\bis-new\b/);
});

test("in the picker a file just added leads the grid, in view and chosen, so Use is one tap", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page, baseURL);
  const picker = await openImagePicker(page, ".hero img");
  await picker.locator('input[name="media-upload"]').setInputFiles([file("zebra.svg")]);
  const first = picker.locator(".media-library__grid > *").first();
  await expect(first).toContainText("zebra.svg");
  await expect(first).toBeInViewport();
  await expect(picker.getByRole("button", { name: "Choose zebra.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { name: "Use image", exact: true })).toBeEnabled();
  // Ready, it wears the brief ring, which then goes.
  await expect(first).toHaveClass(/\bis-new\b/);
  await expect(first).not.toHaveClass(/\bis-new\b/, { timeout: 5_000 });
  // A second addition in the same picker leads the first and is the one chosen.
  await picker.locator('input[name="media-upload"]').setInputFiles([file("apple.svg", "olive")]);
  await expect(picker.locator(".media-library__grid > *").first()).toContainText("apple.svg");
  await expect(picker.locator(".media-library__grid > *").nth(1)).toContainText("zebra.svg");
  await expect(picker.getByRole("button", { name: "Choose apple.svg", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.locator(".media-library__grid > *").first()).toBeInViewport();
});
