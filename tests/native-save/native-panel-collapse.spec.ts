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
    await expect(dock.locator(".style-panel__opener")).toBeHidden();
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
    await expect.poll(() => metric(dock, "width")).toBe(draggedWidth);
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
