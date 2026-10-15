// More room for the page on phones (media-manager build slice 117, Q3): at a
// phone width, while a page is on the canvas, Page structure and the code fold
// into a pull-up sheet under the page; the edit bar never covers the selection.
// Default fixture: index.html's hero image is images/placeholder.svg.
import { expect, test, type Locator, type Page } from "@playwright/test";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const handle = (page: Page) => page.getByRole("button", { name: "Page structure and code" });
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const code = (page: Page) => page.locator("#content .monaco-editor");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const box = async (locator: Locator) => (await locator.boundingBox())!;
const sheetSize = (page: Page) => page.locator(".workspace").evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--sheet-size")));

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

// The part of the selection inside the canvas does not meet the bar.
async function clearOfBar(page: Page, selection: Locator) {
  const canvas = await box(page.locator(".native-preview-frame"));
  const picked = await box(selection);
  const edit = await box(bar(page));
  const top = Math.max(picked.y, canvas.y), bottom = Math.min(picked.y + picked.height, canvas.y + canvas.height);
  return Math.max(0, Math.min(bottom, edit.y + edit.height) - Math.max(top, edit.y));
}

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the page takes most of the screen; a selected picture stays fully visible with its bar; double-click opens the picker", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect(handle(page)).toBeVisible();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(structure(page)).toBeHidden();
    await expect(code(page)).toBeHidden();
    const canvas = await box(page.locator(".native-preview-frame"));
    expect(canvas.height).toBeGreaterThan(844 * 0.5);
    // The handle sits under the page, at the bottom of the window.
    const strip = await box(handle(page));
    expect(strip.y + strip.height).toBeGreaterThanOrEqual(843);
    expect(strip.height).toBeGreaterThanOrEqual(36);
    // The folded panes never stretch the window into a scroll (the top bar stays in place).
    await frame(page).locator("site-footer, footer").last().scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => [document.scrollingElement!.scrollTop, document.scrollingElement!.scrollHeight - innerHeight])).toEqual([0, 0]);

    const picture = frame(page).locator(".hero img");
    await picture.tap();
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => clearOfBar(page, picture)).toBe(0);
    const shown = await box(picture);
    expect(shown.y).toBeGreaterThanOrEqual(canvas.y);
    expect(shown.y + shown.height).toBeLessThanOrEqual(canvas.y + canvas.height);

    await picture.dblclick();
    await expect(page.getByRole("dialog", { name: "Choose image", exact: true })).toBeVisible();
  });

  test("a covered selection is scrolled clear of the bar", async ({ page, baseURL }) => {
    await open(page, baseURL);
    // The picture's top just under the canvas's top edge: no room above, none below.
    const picture = frame(page).locator(".hero img");
    await picture.evaluate((el) => { el.style.height = "420px"; el.style.display = "block"; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 20); });
    await picture.tap();
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => clearOfBar(page, picture)).toBe(0);
    await expect(bar(page)).not.toHaveAttribute("data-side", "pinned");
  });

  test("the sheet opens and folds by tap and by drag, and remembers its height for the session", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await handle(page).tap();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(structure(page)).toBeVisible();
    await expect(code(page)).toBeVisible();
    // The page is above the sheet, the structure and the code are under the handle.
    const strip = await box(handle(page));
    expect((await box(page.locator(".native-preview-frame"))).y + 1).toBeLessThan(strip.y);
    expect((await box(structure(page))).y).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
    expect((await box(code(page))).y).toBeGreaterThan((await box(structure(page))).y);
    await handle(page).tap();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(structure(page)).toBeHidden();

    // A slow drag up stays where it is let go.
    const start = await box(handle(page));
    const x = start.x + start.width / 2, y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 150, { steps: 10 });
    // The panes show as it opens, before the finger lets go.
    await expect(structure(page)).toBeVisible();
    await expect(code(page)).toBeVisible();
    await page.mouse.move(x, y - 300, { steps: 20 });
    // fixed-wait: the finger rests before letting go, so the release is slow and not a flick.
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => sheetSize(page)).toBeGreaterThan(280);
    expect(await sheetSize(page)).toBeLessThan(320);
    const kept = await sheetSize(page);

    // Remembered for the session.
    await page.reload();
    await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => sheetSize(page)).toBe(kept);

    // Dragged most of the way down, it folds.
    const raised = await box(handle(page));
    await page.mouse.move(x, raised.y + raised.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, raised.y + raised.height / 2 + kept - 40, { steps: 15 });
    // fixed-wait: a slow release, not a flick.
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => sheetSize(page)).toBe(0);
    await expect(structure(page)).toBeHidden();
  });

  test("a drag cancelled from folded folds the panes again", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const start = await box(handle(page));
    await handle(page).dispatchEvent("pointerdown", { pointerId: 7, button: 0, clientY: start.y + 10, isPrimary: true });
    await handle(page).dispatchEvent("pointermove", { pointerId: 7, clientY: start.y - 120, isPrimary: true });
    await expect(structure(page)).toBeVisible();
    await handle(page).dispatchEvent("pointercancel", { pointerId: 7, isPrimary: true });
    await expect(structure(page)).toBeHidden();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => sheetSize(page)).toBe(0);
  });

  test("after the window shrinks, the first ArrowDown shrinks the sheet on screen", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await handle(page).focus();
    await page.keyboard.press("End");
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    const tall = await sheetSize(page);
    await page.setViewportSize({ width: 390, height: 640 });
    await expect.poll(() => sheetSize(page)).toBeLessThan(tall);
    const shown = await sheetSize(page);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => sheetSize(page)).toBe(shown - 40);
  });

  test("editing a component works with the sheet", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await handle(page).tap();
    await structure(page).getByRole("treeitem", { name: /^Site header/ }).first().locator(".page-structure__label").click();
    const edit = bar(page).getByRole("button", { name: "Edit Site header component", exact: true });
    await expect(edit).toBeVisible();
    await expect.poll(() => clearOfBar(page, frame(page).locator("site-header"))).toBe(0);
    await edit.click();
    await expect(page.locator("#current-page")).not.toHaveAttribute("data-path", "index.html");
    await page.getByRole("button", { name: "Done editing component", exact: true }).click();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  });

  test("keyboard users reach the handle and open, resize and fold the sheet", async ({ page, baseURL }) => {
    await open(page, baseURL);
    // Tab from the block rail reaches the handle next.
    await page.locator(".block-rail button").last().focus();
    await page.keyboard.press("Tab");
    await expect(handle(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => sheetSize(page)).toBeGreaterThan(0);
    const first = await sheetSize(page);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => sheetSize(page)).toBe(first + 40);
    // Into the sheet: Page structure comes next.
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".sidebar")))).toBe(true);
    await handle(page).focus();
    await page.keyboard.press("Home");
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press(" ");
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
    // Folding with the focus inside the sheet gives it back to the handle.
    await structure(page).getByRole("button", { name: "Add", exact: true }).focus();
    await page.evaluate(() => (document.querySelector(".sheet-handle") as HTMLButtonElement).click());
    await expect(handle(page)).toBeFocused();
  });

  test("text, blocks, components and the Add panel work around the sheet", async ({ page, baseURL }) => {
    await open(page, baseURL);
    // Text: double-click puts a caret in the heading; the bar keeps clear of it.
    const heading = frame(page).locator("h1").first();
    await heading.dblclick();
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => clearOfBar(page, heading)).toBe(0);
    await page.keyboard.press("Escape");
    // Page structure in the open sheet selects on the page above it.
    await handle(page).tap();
    await expect(structure(page)).toBeVisible();
    const row = structure(page).getByRole("treeitem").filter({ hasText: /Image/ }).first();
    await row.click();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText("Image");
    // The Add panel opens from the sheet and covers the page and sheet.
    await structure(page).getByRole("button", { name: "Add", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Add to the page", exact: true });
    await expect(panel).toBeVisible();
    const dock = await box(panel);
    expect(dock.y).toBeLessThanOrEqual((await box(page.locator(".native-preview-frame"))).y + 50);
    expect(dock.y + dock.height).toBeLessThanOrEqual(845);
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    // Showing the code another way (the command palette) opens a folded sheet.
    await handle(page).tap();
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false");
    await page.locator("#main").evaluate((main) => main.classList.add("code-collapsed"));
    await page.locator("#main").evaluate((main) => main.classList.remove("code-collapsed"));
    await expect(handle(page)).toHaveAttribute("aria-expanded", "true");
  });
});

// A phone on its side has no room for a sheet under the top bar: the plain column stays, with its own toggles.
test("a phone on its side keeps the column layout", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await open(page, baseURL);
  await expect(handle(page)).toBeHidden();
  await expect(page.getByRole("separator", { name: "Resize page structure sidebar" })).toBeVisible();
});

test("wider screens keep Page structure beside the page and no sheet", async ({ page, baseURL }) => {
  // The sheet's script loads only on a phone-wide window.
  const loaded: string[] = [];
  page.on("request", (request) => { if (request.url().includes("phone-sheet.ts")) loaded.push(request.url()); });
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await open(page, baseURL);
    await expect(handle(page)).toBeHidden();
    await expect(structure(page)).toBeVisible();
    await expect(code(page)).toBeVisible();
    const side = await box(structure(page));
    const canvas = await box(page.locator(".native-preview-frame"));
    expect(side.x + side.width).toBeLessThanOrEqual(canvas.x + 1);
  }
  expect(loaded).toEqual([]);
});
