import { expect, test, type Locator, type Page } from "@playwright/test";
import { storedDrafts } from "./drafts";
const code = (page: Page) => page.getByRole("separator", { name: "Resize code pane", exact: true });
const style = (page: Page) => page.getByRole("separator", { name: "Resize Style panel", exact: true });
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
  test(`code and Style collapse to zero and their edge grips restore at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1000 });
    await load(page, baseURL);
    const before = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
    const drafts = await storedDrafts(page);
    const split = page.locator("#code-split"), dock = page.locator("#style-dock");
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

    await style(page).click();
    await expect(dock.locator(".style-panel__body")).toBeVisible();
    const dockWidth = await metric(dock, "width");
    await style(page).click();
    await expect.poll(() => metric(dock, "width")).toBe(0);
    await expect(dock.locator(".style-panel__body")).toBeHidden();
    // Collapsed, the dock exposes no hidden controls: its resize separator is the only one reachable.
    await expect(dock.getByRole("button")).toHaveCount(0);
    await expect(dock.getByRole("textbox")).toHaveCount(0);
    await expect(dock.getByRole("separator")).toHaveCount(1);
    await gripInside(page, style(page));
    await style(page).press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("#style-dock")?.className ?? "")).not.toContain("style-panel");
    await style(page).press("Enter");
    await expect.poll(() => metric(dock, "width")).toBe(dockWidth);
    await style(page).press("Home");
    await drag(page, style(page), -180, 0);
    await expect(dock.locator(".style-panel__body")).toBeVisible();
    const draggedWidth = await metric(dock, "width");
    await drag(page, style(page), draggedWidth + 100, 0);
    await expect.poll(() => metric(dock, "width")).toBe(0);
    await style(page).press("Enter");
    // A narrow drawer drag is transient; reopening keeps the remembered width.
    await expect.poll(() => metric(dock, "width")).toBe(width < 600 ? dockWidth : draggedWidth);
    await style(page).press("Home"); await code(page).press("Home");
    await load(page, baseURL);
    await expect.poll(() => metric(split, "height")).toBe(0);
    await expect.poll(() => metric(dock, "width")).toBe(0);
    await gripInside(page, code(page)); await gripInside(page, style(page));
    expect(await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe(before);
    expect(await storedDrafts(page)).toEqual(drafts);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(code(page)).toHaveCSS("transition-duration", "0s");
    await expect(style(page)).toHaveCSS("transition-duration", "0s");
  });
}


test("legacy collapsed preferences fully hide code and Style and restore remembered sizes", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("collapse-prefs-installed")) return;
    localStorage.setItem("astro-editor.code-height", JSON.stringify({ height: 0.55, collapsed: true }));
    localStorage.setItem("astro-editor.style-width", "0");
    localStorage.setItem("astro-editor.style-width-last", "320");
    sessionStorage.setItem("collapse-prefs-installed", "true");
  });
  await load(page, baseURL);
  await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(style(page)).toHaveAttribute("aria-valuenow", "0");
  await code(page).press("Enter");
  const mainHeight = await metric(page.locator("#main"), "height");
  await expect.poll(() => metric(page.locator("#code-split"), "height")).toBe(Math.round(mainHeight * 0.55));
  await style(page).press("Enter");
  await expect.poll(() => metric(page.locator("#style-dock"), "width")).toBe(320);
});


test("Minimize code command returns focused Monaco to the visible restore grip", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await page.locator('#content [role="textbox"]').first().focus();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".monaco-editor")))).toBe(true);
  await page.keyboard.press("ControlOrMeta+p");
  const palette = page.locator("dialog.command-palette");
  await palette.getByRole("combobox").fill("> Minimize code");
  await palette.getByRole("combobox").press("Enter");
  await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(code(page)).toBeFocused();
  await expect(page.locator("#content .monaco-editor")).toBeHidden();
});

test("a narrow clamped Style width retains its requested desktop restoration width", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await style(page).click();
  await expect(style(page)).toHaveAttribute("aria-valuenow", "280");
  await style(page).press("End");
  await expect(style(page)).toHaveAttribute("aria-valuenow", "560");
  await page.setViewportSize({ width: 390, height: 1000 });
  // Narrow canvases float Style as a drawer clamped short of the canvas edge.
  const room = await page.locator("#main").evaluate(element => element.clientWidth - 48);
  await expect(style(page)).toHaveAttribute("aria-valuenow", String(room));
  expect(await metric(page.locator(".preview-pane"), "width")).toBeGreaterThanOrEqual(await metric(page.locator("#main"), "width") - 1);
  await page.locator("#style-dock .style-panel__body").press("Escape");
  await expect(style(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(style(page)).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await style(page).click();
  await expect(style(page)).toHaveAttribute("aria-valuenow", "560");
});


test("touch restore grips use centred 44px targets and reopen both panels", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  try {
    const page = await context.newPage(); await load(page, baseURL);
    await code(page).tap();
    await expect(code(page)).toHaveAttribute("aria-valuenow", "0");
    expect(await metric(code(page), "height")).toBe(44);
    expect(await metric(code(page), "width")).toBe(64);
    await code(page).tap();
    await expect(page.locator("#content .monaco-editor")).toBeVisible();
    expect(await metric(style(page), "width")).toBe(44);
    expect(await metric(style(page), "height")).toBe(64);
    await style(page).tap();
    await expect(page.locator(".style-panel__body")).toBeVisible();
  } finally { await context.close(); }
});
