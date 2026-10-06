import { expect, test, type Locator, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";
const code = (page: Page) => page.getByRole("separator", { name: "Resize code pane", exact: true });
const metric = (locator: Locator, axis: "width" | "height") => locator.evaluate((element, axis) => element.getBoundingClientRect()[axis], axis);
async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Up to date with main");
}
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}
async function gripInside(page: Page, handle: Locator) {
  await expect(handle).toBeVisible(); await expect(handle).toBeInViewport();
  const grip = (await handle.locator(".resize-grip").boundingBox())!;
  const main = (await page.locator("#main").boundingBox())!;
  expect(grip.x).toBeGreaterThanOrEqual(main.x - 1);
  expect(grip.y).toBeGreaterThanOrEqual(main.y - 1);
  expect(grip.x + grip.width).toBeLessThanOrEqual(main.x + main.width + 1);
  expect(grip.y + grip.height).toBeLessThanOrEqual(main.y + main.height + 1);
  const vertical = await handle.getAttribute("aria-orientation") === "vertical";
  expect(await metric(handle, vertical ? "height" : "width")).toBe(64);
  // Away from the centred restore tab, the canvas edge stays available for
  // classic iframe scrollbars instead of becoming a panel toggle hit target.
  expect(await handle.evaluate((element, vertical) => {
    const main = document.querySelector("#main")!.getBoundingClientRect();
    const hit = document.elementFromPoint(vertical ? main.right - 2 : main.left + 20, vertical ? main.top + 20 : main.bottom - 2);
    return Boolean(hit && element.contains(hit));
  }, vertical)).toBe(false);
}
for (const width of [1440, 390]) {
  test(`code collapses to zero and its edge grip restores at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    await load(page, baseURL);
    const before = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
    const drafts = await storedDrafts(page);
    const split = page.locator("#code-split");
    const height = await metric(split, "height");
    await code(page).click();
    await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
    await expect.poll(() => metric(split, "height")).toBe(0);
    await expect(page.locator("#content .monaco-editor")).toBeHidden();
    await expect(page.locator(".code-width-resize")).toBeHidden();
    await gripInside(page, code(page));
    await code(page).press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".code-pane")))).toBe(false);
    await code(page).press("Enter");
    await expect.poll(() => metric(split, "height")).toBe(height);
    await code(page).press("Home");
    await drag(page, code(page), 0, -150);
    await expect(page.locator("#content .monaco-editor")).toBeVisible();
    const draggedHeight = await metric(split, "height");
    await drag(page, code(page), 0, draggedHeight + 100);
    await expect.poll(() => metric(split, "height")).toBe(0);
    await code(page).click();
    await expect.poll(() => metric(split, "height")).toBe(draggedHeight);
    await code(page).press("End");
    expect(await metric(split, "height")).toBeGreaterThan(draggedHeight);

    await code(page).press("Home");
    await load(page, baseURL);
    await expect.poll(() => metric(split, "height")).toBe(0);
    await gripInside(page, code(page));
    expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe(before);
    expect(await storedDrafts(page)).toEqual(drafts);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(code(page)).toHaveCSS("transition-duration", "0s");
  });
}


test("legacy collapsed preferences fully hide code and restores remembered size", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("collapse-prefs-installed")) return;
    localStorage.setItem("astro-editor.code-height", JSON.stringify({ height: 0.55, collapsed: true }));
    sessionStorage.setItem("collapse-prefs-installed", "true");
  });
  await load(page, baseURL);
  await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
  await code(page).press("Enter");
  const mainHeight = await metric(page.locator("#main"), "height");
  await expect.poll(() => metric(page.locator("#code-split"), "height")).toBe(Math.round(mainHeight * 0.55));
});


test("Hide code command returns focused Monaco to the visible restore grip", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await page.locator('#content [role="textbox"]').first().focus();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".monaco-editor")))).toBe(true);
  await page.keyboard.press("ControlOrMeta+p");
  const palette = page.locator("dialog.command-palette");
  await palette.getByRole("combobox").fill("> Hide code");
  await palette.getByRole("combobox").press("Enter");
  await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(code(page)).toBeFocused();
  await expect(page.locator("#content .monaco-editor")).toBeHidden();
});

test("touch restore grips use centred 44px targets and reopen code", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  try {
    const page = await context.newPage(); await load(page, baseURL);
    await code(page).tap();
    await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
    expect(await metric(code(page), "height")).toBe(44);
    expect(await metric(code(page), "width")).toBe(64);
    await code(page).tap();
    await expect(page.locator("#content .monaco-editor")).toBeVisible();
  } finally { await context.close(); }
});
