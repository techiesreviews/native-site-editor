import { expect, test, type Locator, type Page } from "@playwright/test";

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await expect(page.locator("#explorer")).toBeVisible();
}
async function painted(overlay: Locator, opacity: string) {
  await expect(overlay).toHaveCSS("opacity", opacity);
  // The overlay box never moves or blocks the row; its buttons keep a stable hit target.
  await expect(overlay).toHaveCSS("pointer-events", "none");
  await expect(overlay.locator("> button").first()).toHaveCSS("pointer-events", "auto");
}

test("Pages and Files overlay existing actions without shrinking names, and keep keyboard menus", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Pages", exact: true }).click();
  const current = page.locator(".pages-row.is-current").first();
  const overlay = current.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(overlay, "0");
  await expect(overlay).toHaveCSS("position", "absolute");
  const nameWidth = (await current.locator(".pages-label").boundingBox())!.width;
  await current.hover();
  await painted(overlay, "1");
  expect((await current.locator(".pages-label").boundingBox())!.width).toBe(nameWidth);
  const pageItem = current.locator("..");
  await pageItem.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pageItem).toBeFocused();

  await page.locator("#explorer").getByRole("tab", { name: "Files", exact: true }).click();
  const fileLine = page.locator("#explorer .file-row-line.row-action-host:not(.is-folder)").filter({ visible: true }).first();
  const fileOverlay = fileLine.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(fileOverlay, "0");
  await fileLine.locator(".file-row").focus();
  await painted(fileOverlay, "1");
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(fileLine.locator(".file-row")).toBeFocused();
});

test("Images reveal usage actions beside the filename while thumbnails and usage metadata stay visible", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator("#explorer").getByRole("tab", { name: "Images", exact: true }).click();
  const card = page.locator(".media-library__card").first();
  const overlay = card.locator(".row-action-overlay");
  await page.mouse.move(1400, 900);
  await painted(overlay, "0");
  const thumbnail = await card.locator(".media-library__thumbnail").boundingBox();
  await card.hover();
  await painted(overlay, "1");
  const action = await overlay.boundingBox();
  expect(action!.y).toBeGreaterThanOrEqual(thumbnail!.y + thumbnail!.height);
  await expect(card.locator(".media-library__usage-count")).toHaveText(/Used on \d+ pages/);
  await overlay.getByRole("button").click();
  await expect(page.locator(".media-library__sheet").getByRole("heading", { name: /Used on \d+ pages/ })).toBeVisible();
});

test("reduced motion reveals immediately and coarse pointer actions remain available", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, baseURL);
  const overlay = page.locator(".pages-row.is-current .row-action-overlay").first();
  await expect(overlay).toHaveCSS("transition-duration", "0s");
  await page.locator(".pages-row.is-current").first().hover();
  await painted(overlay, "1");
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("row icons are exposed with usable touch targets", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const overlay = page.locator(".pages-row.is-current .row-action-overlay").first();
    await painted(overlay, "1");
    const buttons = overlay.getByRole("button");
    for (const button of await buttons.all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    await buttons.last().tap();
    await expect(page.getByRole("menu")).toBeVisible();
  });
});
