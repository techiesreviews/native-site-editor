import { expect, test, type Page } from "@playwright/test";

// The runtime reports how far the page's own sticky/fixed top bar covers the
// frame (`inset` on the selection's rectangle); the edit bar keeps clear of
// it. Only a header-like bar counts (half the width or more, 40% of the
// height or less): a full-height sidebar or a full-screen layer does not.
// Messages here carry the render's real context, so the host applies them.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });

test.beforeEach(async ({ page, baseURL }) => {
  // Record the runtime's messages: the render context and the last reported inset.
  await page.addInitScript(() => {
    const seen = window as unknown as { aseContext?: string; aseInsets?: (number | undefined)[] };
    seen.aseInsets = [];
    window.addEventListener("message", (event) => {
      const data = event.data as { source?: string; type?: string; context?: string; rect?: { inset?: number } } | undefined;
      if (data?.source !== "astro-native-preview") return;
      if (typeof data.context === "string") seen.aseContext = data.context;
      if (data.type === "selection-rect" || data.type === "selected") seen.aseInsets!.push(data.rect?.inset);
    });
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

// A rectangle 100px down the frame, 40px high, with `inset`, sent as the
// runtime would (with its context unless `context` is false).
async function sendRect(page: Page, inset: unknown, context = true) {
  const ctx = context ? await page.evaluate(() => (window as unknown as { aseContext?: string }).aseContext) : undefined;
  if (context) expect(ctx).toBeTruthy();
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  await child!.evaluate(([value, ctxValue]) => {
    const message: Record<string, unknown> = { source: "astro-native-preview", type: "selection-rect", rect: { top: 100, left: 40, width: 200, height: 40, bottom: 140, right: 240, inset: value } };
    if (ctxValue) message.context = ctxValue;
    parent.postMessage(message, "*");
  }, [inset, ctx] as const);
  await page.waitForTimeout(150);
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  return { top: Math.round(box.y - area.y), bottom: box.y + box.height - area.y, height: box.height, frameHeight: area.height, side: await bar(page).getAttribute("data-side") };
}

test("a reported inset moves the bar; invalid or missing ones leave it; a huge one keeps it in the frame", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  await expect(bar(page)).toBeVisible();
  await page.waitForTimeout(800);
  const plain = await sendRect(page, undefined);
  // With room above the rectangle and no inset, the bar stands above it.
  expect(plain.side).toBe("above");
  expect(plain.top).toBe(Math.round(100 - plain.height - 8));
  // A valid inset reaching past the room above puts the bar below, under the header.
  const below = await sendRect(page, 150);
  expect(below.side).toBe("below");
  expect(below.top).toBe(154);
  // The same message with no render context is not applied.
  expect(await sendRect(page, 0, false)).toEqual(below);
  // Invalid insets are ignored: the bar goes back to the no-inset place.
  for (const invalid of [-40, Number.NaN, Number.POSITIVE_INFINITY, "120", null]) {
    expect(await sendRect(page, 150)).toEqual(below);
    expect(await sendRect(page, invalid)).toEqual(plain);
  }
  // An inset taller than the frame: the bar still fits inside the frame.
  const huge = await sendRect(page, 100_000);
  expect(huge.side).toBe("below");
  expect(huge.top).toBeGreaterThanOrEqual(0);
  expect(huge.bottom).toBeLessThanOrEqual(huge.frameHeight + 0.5);
  expect(huge.top).toBeLessThan(below.frameHeight);
  // Back to none: the original place.
  expect(await sendRect(page, 0)).toEqual(plain);
});

// The fixture's site-header sticks. The runtime's own report for the hero
// heading (right under it) puts the bar below the heading and the header.
test("the sticky header leaves the bar under it and below the selected heading", async ({ page }) => {
  await frame(page).locator(".hero h1").click();
  await page.waitForTimeout(300);
  const header = (await frame(page).locator("site-header").boundingBox())!;
  const heading = (await frame(page).locator(".hero h1").boundingBox())!;
  const box = (await bar(page).boundingBox())!;
  expect(await bar(page).getAttribute("data-side")).toBe("below");
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 0.5);
  expect(box.y).toBeGreaterThanOrEqual(heading.y + heading.height);
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(area.y);
  expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
});

// The runtime's inset: the header's bottom with a full-height sidebar beside
// it, and none under a full-screen layer.
test("a full-height sidebar or a full-screen layer is not a header", async ({ page }) => {
  const child = await (await page.locator(".native-preview-frame").elementHandle())!.contentFrame();
  const lastInset = async () => {
    // A 1px scroll makes the runtime measure and report again.
    await child!.evaluate(() => { window.scrollBy(0, 1); });
    await page.waitForTimeout(250);
    await child!.evaluate(() => { window.scrollBy(0, -1); });
    await page.waitForTimeout(250);
    return page.evaluate(() => (window as unknown as { aseInsets: (number | undefined)[] }).aseInsets.at(-1));
  };
  await frame(page).locator(".hero p.lead").click();
  const header = await child!.evaluate(() => document.querySelector("site-header")!.getBoundingClientRect().bottom);
  expect(header).toBeGreaterThan(0);
  expect(await lastInset()).toBeCloseTo(header, 0);
  // A fixed sidebar down the left, full height: the header still counts, the sidebar does not.
  await child!.evaluate(() => {
    const side = document.createElement("div");
    side.id = "probe-sidebar";
    side.style.cssText = "position:fixed;left:0;top:0;width:30vw;height:100vh;background:rgba(0,0,0,.05);z-index:50";
    document.body.append(side);
  });
  expect(await lastInset()).toBeCloseTo(header, 0);
  await expect(bar(page)).toBeVisible();
  const area = (await page.locator(".native-preview-frame").boundingBox())!;
  expect((await bar(page).boundingBox())!.y - area.y).toBeLessThan(area.height * 0.5);
  // A full-screen layer over everything: nothing header-like at the top.
  await child!.evaluate(() => {
    document.getElementById("probe-sidebar")!.remove();
    const layer = document.createElement("div");
    layer.id = "probe-layer";
    layer.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.05);z-index:60";
    document.body.append(layer);
  });
  expect(await lastInset()).toBe(0);
});
