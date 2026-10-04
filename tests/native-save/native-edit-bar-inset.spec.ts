import { expect, test, type Page } from "@playwright/test";

// The runtime reports how far the page's own sticky/fixed top bar covers the
// frame (`inset` on the selection's rectangle); the edit bar keeps clear of
// it. A missing, negative or non-finite inset is ignored, and one taller
// than the frame falls back to a bar still inside the frame.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

async function sendRect(page: Page, inset: unknown) {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await child!.evaluate((value) => {
    const r = document.querySelector(".hero h1")!.getBoundingClientRect();
    parent.postMessage({ source: "astro-native-preview", type: "selection-rect", rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right, inset: value } }, "*");
  }, inset);
  await page.waitForTimeout(150);
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  return { top: box.y - area.y, bottom: box.y + box.height - area.y, frameHeight: area.height, side: await bar(page).getAttribute("data-side") };
}

test("the bar keeps clear of a reported top inset and ignores invalid ones", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  await expect(bar(page)).toBeVisible();
  // A rectangle with no inset is the reference place.
  const plain = await sendRect(page, undefined);
  for (const invalid of [-40, Number.NaN, Number.POSITIVE_INFINITY, "120", null]) expect(await sendRect(page, invalid)).toEqual(plain);
  const heading = (await frame(page).locator(".hero h1").boundingBox())!;
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const headingTop = heading.y - area.y;
  // An inset reaching past the space above the heading moves the bar below it, or pins it under the inset.
  const inset = Math.max(1, headingTop - 10);
  const cleared = await sendRect(page, inset);
  expect(cleared.top).toBeGreaterThanOrEqual(inset);
  // An inset taller than the frame: the bar still fits inside the frame.
  const huge = await sendRect(page, 100_000);
  expect(huge.top).toBeGreaterThanOrEqual(0);
  expect(huge.bottom).toBeLessThanOrEqual(huge.frameHeight);
  // Back to none: the original place.
  expect(await sendRect(page, 0)).toEqual(plain);
});
