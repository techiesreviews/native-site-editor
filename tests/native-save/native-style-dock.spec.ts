import { expect, test, type Page } from "@playwright/test";

const style = (page: Page) => page.getByRole("separator", { name: "Resize Style panel", exact: true });
const shots = ".scratch/style-dock-async";
async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Up to date with main");
}
const layout = (page: Page) => page.locator("#main").evaluate(main => ({
  main: main.clientWidth,
  preview: main.querySelector(".preview-pane")!.getBoundingClientRect().width,
  panel: main.querySelector(".style-panel")!.getBoundingClientRect(),
  overflow: document.documentElement.scrollWidth - innerWidth,
}));

for (const width of [1440, 900, 390]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Style hides to the right and reopens by keyboard at ${width}px (${colorScheme})`, async ({ page, baseURL }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 844 }); await load(page, baseURL);
      const body = page.locator("#style-dock .style-panel__body");
      if (await style(page).getAttribute("aria-valuenow") !== "0") await style(page).press("Home");
      await expect(body).toBeHidden();
      // Hidden: no rail, a faded opener stays visible at the canvas edge.
      let sizes = await layout(page);
      expect(sizes.panel.width).toBe(0); expect(sizes.overflow).toBeLessThanOrEqual(0);
      await expect(style(page).locator(".resize-grip svg")).toHaveCSS("opacity", "0.8");
      await page.screenshot({ path: `${shots}/${width}-${colorScheme}-hidden.png` });
      await style(page).focus(); await style(page).press("Enter");
      await expect(body).toBeVisible();
      sizes = await layout(page);
      expect(sizes.overflow).toBeLessThanOrEqual(0);
      expect(sizes.panel.right).toBeLessThanOrEqual(width + 1);
      if (await page.locator("#main").evaluate(main => main.classList.contains("style-panel-overlay"))) {
        // Narrow: a drawer over a full-width canvas, never a squeezed page.
        expect(sizes.preview).toBeGreaterThanOrEqual(sizes.main - 1);
        expect(sizes.panel.width).toBeLessThanOrEqual(sizes.main - 48);
        const mainHeight = await page.locator("#main").evaluate(main => main.clientHeight);
        expect(sizes.panel.height).toBeGreaterThanOrEqual(mainHeight * .6);
        const add = page.locator("#style-dock").getByRole("button", { name: "Add class", exact: true });
        await add.scrollIntoViewIfNeeded(); await expect(add).toBeInViewport();
      } else expect(sizes.preview + sizes.panel.width).toBeLessThanOrEqual(sizes.main + 1);
      await page.screenshot({ path: `${shots}/${width}-${colorScheme}-open.png` });
      await style(page).press("Enter");
      await expect(body).toBeHidden();
      await expect(style(page)).toBeFocused();
    });
  }
}

test("touch reopens the narrow Style drawer and Escape closes it to its grip", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(); await load(page, baseURL);
    if (await style(page).getAttribute("aria-valuenow") !== "0") await style(page).press("Home");
    expect((await style(page).boundingBox())!.width).toBe(44);
    await style(page).tap();
    await expect(page.locator("#style-dock .style-panel__body")).toBeVisible();
    await expect(page.locator("#main")).toHaveClass(/style-panel-overlay/);
    await page.screenshot({ path: `${shots}/390-touch-open.png` });
    await page.locator("#style-dock .style-panel__body").press("Escape");
    await expect(style(page)).toHaveAttribute("aria-valuenow", "0");
    await expect(style(page)).toBeFocused();
  } finally { await context.close(); }
});

test("a narrow drawer clamp never replaces the desktop Style width", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 844 }); await load(page, baseURL);
  if (await style(page).getAttribute("aria-valuenow") === "0") await style(page).press("Enter");
  await style(page).press("End");
  await expect(style(page)).toHaveAttribute("aria-valuenow", "560");
  await page.setViewportSize({ width: 390, height: 844 });
  await style(page).press("ArrowRight"); await style(page).press("End");
  await page.reload();
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 844 });
  await expect(style(page)).toHaveAttribute("aria-valuenow", "560");
});
