import { expect, test, type Locator, type Page } from "@playwright/test";

// The three resize handles are also their panels' toggles: the sidebar's
// edge hides the page structure, the handle above the code split hides the
// code so the preview fills, and the handle between the code panes hides the
// side-by-side pane. A press released within 4 px is a click and toggles; a
// drag resizes and never toggles; Enter and Space toggle; hover or focus
// makes the handle bigger; the state and the size to come back to persist.
const indexPath = "src/pages/index.html";
const cssPath = "src/styles/site.css";
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page, baseURL }) => {
  await load(page, baseURL);
});

const sidebar = (page: Page) => page.locator("#structure-sidebar");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const sidebarHandle = (page: Page) => page.locator(".sidebar-resize");
const codeHandle = (page: Page) => page.locator(".code-resize");
const widthHandle = (page: Page) => page.locator(".code-width-resize");
const frame = (page: Page) => page.locator(".native-preview-frame");
const split = (page: Page) => page.locator("#main > .code-split");
const primary = (page: Page) => page.locator("#main .code-pane").first();
const secondary = (page: Page) => page.locator("#secondary-pane");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const box = async (locator: Locator) => (await locator.boundingBox())!;

// A press and release at the handle's centre, moved `dx`/`dy` in between.
async function press(page: Page, handle: Locator, dx = 0, dy = 0) {
  const b = await box(handle);
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (dx || dy) {
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
  }
  await page.mouse.up();
}

// The handle and its grip are bigger while the pointer is over it, and back
// to their resting size once it leaves; focus grows them too.
async function expectHoverGrowth(page: Page, handle: Locator, axis: "width" | "height") {
  const away = async () => page.mouse.move(page.viewportSize()!.width / 2, 3);
  await away();
  // A press focuses the handle, and focus grows it too.
  await handle.evaluate((el) => (el as HTMLElement).blur());
  const grip = handle.locator(".resize-grip");
  const rest = await box(handle);
  const gripRest = await box(grip);
  const b = await box(handle);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(async () => (await box(handle))[axis]).toBeGreaterThanOrEqual(rest[axis] + 6);
  const gripHover = await box(grip);
  expect(gripHover.width * gripHover.height).toBeGreaterThan(gripRest.width * gripRest.height * 2);
  expect(gripHover[axis]).toBeGreaterThanOrEqual(12);
  await expect(grip.locator("svg")).toHaveCSS("opacity", "1");
  await away();
  await expect.poll(async () => (await box(handle))[axis]).toBe(rest[axis]);
  await handle.focus();
  await expect.poll(async () => (await box(handle))[axis]).toBeGreaterThanOrEqual(rest[axis] + 6);
  await handle.evaluate((el) => (el as HTMLElement).blur());
}

test("the sidebar handle: hover growth, click hides and shows at the previous width, drag resizes", async ({ page }) => {
  const handle = sidebarHandle(page);
  await expect(page.locator("#structure-toggle")).toHaveCount(0);
  await expect(handle).toHaveAttribute("role", "separator");
  await expect(handle).toHaveAttribute("aria-controls", "structure-sidebar");
  await expect(handle).toHaveAttribute("title", "Drag to resize, click to hide the page structure");
  await expect(handle).toHaveAttribute("aria-valuetext", "Page structure shown, 280 pixels");
  await expectHoverGrowth(page, handle, "width");

  // Widen with the keys first, so restoring is not the default.
  await handle.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(360);
  const frameBefore = await box(frame(page));

  await press(page, handle);
  await expect(tree(page)).toBeHidden();
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(0);
  await expect.poll(async () => (await box(frame(page))).width).toBe(frameBefore.width + 360);
  await expect(handle).toHaveAttribute("aria-valuetext", "Page structure hidden");
  await expect(handle).toHaveAttribute("aria-valuenow", "0");
  await expect(handle).toHaveAttribute("title", "Drag to resize, click to show the page structure");
  // It stays at the workspace's left edge, visible, and still grows on hover.
  const workspace = await box(page.locator(".workspace"));
  expect(Math.abs((await box(handle)).x - workspace.x)).toBeLessThanOrEqual(1);
  await expect(handle.locator(".resize-grip")).not.toHaveCSS("opacity", "0");
  await expectHoverGrowth(page, handle, "width");

  // 3 px of movement is still a click.
  await press(page, handle, 3, 0);
  await expect(tree(page)).toBeVisible();
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(360);
  await expect(handle).toHaveAttribute("aria-valuetext", "Page structure shown, 360 pixels");

  // A drag resizes and does not toggle.
  await press(page, handle, 60, 0);
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(420);
  await expect(tree(page)).toBeVisible();
  await press(page, handle, -40, 0);
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(380);
  await expect(tree(page)).toBeVisible();
});

test("a mouse click on a handle takes focus without the keyboard focus ring", async ({ page }) => {
  const handle = sidebarHandle(page);
  const ring = () => handle.evaluate((el) => ({ focus: el.matches(":focus"), visible: el.matches(":focus-visible") }));
  await handle.click();
  await expect(tree(page)).toBeHidden();
  expect(await ring()).toEqual({ focus: true, visible: false });
  await handle.click();
  await expect(tree(page)).toBeVisible();
  expect(await ring()).toEqual({ focus: true, visible: false });
  // Tabbing to it shows the ring.
  await handle.blur();
  await handle.evaluate((el) => (el.previousElementSibling as HTMLElement | null)?.focus?.());
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(tree(page)).toBeHidden();
  await expect.poll(async () => (await ring()).visible).toBe(true);
});

test("the sidebar handle: Enter and Space toggle, and the hidden state and width survive a reload", async ({ page, baseURL }) => {
  const handle = sidebarHandle(page);
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(tree(page)).toBeHidden();
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(0);
  await page.keyboard.press(" ");
  await expect(tree(page)).toBeVisible();
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(280);
  // Dragging to nothing hides it too, and the width it had comes back.
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(320);
  await press(page, handle, -300, 0);
  await expect(tree(page)).toBeHidden();

  await load(page, baseURL);
  await expect(tree(page)).toBeHidden();
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(0);
  await expect(handle).toHaveAttribute("aria-valuetext", "Page structure hidden");
  await press(page, handle);
  await expect(tree(page)).toBeVisible();
  await expect.poll(async () => (await box(sidebar(page))).width).toBe(320);
  // End and Home still work.
  await handle.focus();
  await page.keyboard.press("Home");
  await expect(tree(page)).toBeHidden();
  await page.keyboard.press("End");
  await expect(tree(page)).toBeVisible();
});

test("the code handle: click hides the code so the preview fills, and brings it back at its height", async ({ page, baseURL }) => {
  const handle = codeHandle(page);
  await expect(handle).toHaveAttribute("aria-controls", "code-split");
  await expect(handle).toHaveAttribute("title", "Drag to resize, click to hide the code");
  await expect(handle).not.toHaveAttribute("aria-expanded", /.*/);
  await expectHoverGrowth(page, handle, "height");

  // A drag resizes and does not toggle.
  const splitBefore = await box(split(page));
  await press(page, handle, 0, -100);
  await expect.poll(async () => Math.round((await box(split(page))).height - splitBefore.height)).toBe(100);
  await expect(primary(page)).toBeVisible();
  const splitHeight = (await box(split(page))).height;
  const frameHeight = (await box(frame(page))).height;

  await press(page, handle);
  await expect(primary(page)).toBeHidden();
  await expect(page.locator("#main")).toHaveClass(/code-collapsed/);
  await expect(handle).toHaveAttribute("aria-valuetext", "Code hidden");
  await expect(handle).toHaveAttribute("title", "Drag to resize, click to show the code");
  await expect.poll(async () => (await box(split(page))).height).toBeLessThanOrEqual(12);
  await expect.poll(async () => (await box(frame(page))).height).toBeGreaterThan(frameHeight + splitHeight - 20);
  await expect(widthHandle(page)).toBeHidden();
  // The collapsed handle stays at the bottom edge and still grows on hover.
  const main = await box(page.locator("#main"));
  const collapsed = await box(handle);
  expect(collapsed.y + collapsed.height).toBeGreaterThan(main.y + main.height - 12);
  await expectHoverGrowth(page, handle, "height");

  await press(page, handle, 0, 2);
  await expect(primary(page)).toBeVisible();
  await expect.poll(async () => (await box(split(page))).height).toBe(splitHeight);
  await expect(handle).toHaveAttribute("aria-valuetext", `Code shown, ${Math.round(splitHeight)} pixels`);

  // Enter and Space toggle.
  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(primary(page)).toBeHidden();
  await page.keyboard.press(" ");
  await expect(primary(page)).toBeVisible();
  await expect.poll(async () => (await box(split(page))).height).toBe(splitHeight);

  // Collapsed state and height survive a reload.
  await page.keyboard.press("Enter");
  await expect(primary(page)).toBeHidden();
  await load(page, baseURL);
  await expect(primary(page)).toBeHidden();
  await expect(handle).toHaveAttribute("aria-valuetext", "Code hidden");
  await press(page, handle);
  await expect(primary(page)).toBeVisible();
  await expect.poll(async () => (await box(split(page))).height).toBe(splitHeight);
});

test("the code width handle: click hides the side-by-side pane so the first pane fills, and brings it back", async ({ page, baseURL }) => {
  const handle = widthHandle(page);
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("title", "Drag to resize, click to hide the side-by-side pane");
  await expectHoverGrowth(page, handle, "width");
  // Hovering widens it over the panes without moving them.
  const primaryRest = await box(primary(page));
  const h = await box(handle);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await expect.poll(async () => (await box(handle)).width).toBe(14);
  expect((await box(primary(page))).width).toBe(primaryRest.width);

  // A drag resizes and does not toggle.
  await press(page, handle, -120, 0);
  await expect.poll(async () => Math.round(primaryRest.width - (await box(primary(page))).width)).toBe(120);
  await expect(secondary(page)).toBeVisible();
  const primaryWidth = (await box(primary(page))).width;

  await press(page, handle);
  await expect(secondary(page)).toBeHidden();
  await expect(handle).toHaveAttribute("aria-valuetext", "Side-by-side pane hidden");
  await expect(handle).toHaveAttribute("title", "Drag to resize, click to show the side-by-side pane");
  const splitBox = await box(split(page));
  await expect.poll(async () => (await box(primary(page))).width).toBe(splitBox.width - 6);
  // The handle stays at the right edge and still grows on hover.
  const edge = await box(handle);
  expect(Math.abs(edge.x + edge.width - (splitBox.x + splitBox.width))).toBeLessThanOrEqual(1);
  await expectHoverGrowth(page, handle, "width");

  await press(page, handle);
  await expect(secondary(page)).toBeVisible();
  await expect.poll(async () => (await box(primary(page))).width).toBe(primaryWidth);

  await handle.focus();
  await page.keyboard.press("Enter");
  await expect(secondary(page)).toBeHidden();
  await page.keyboard.press(" ");
  await expect(secondary(page)).toBeVisible();
  await expect.poll(async () => (await box(primary(page))).width).toBe(primaryWidth);

  await page.keyboard.press("Enter");
  await expect(secondary(page)).toBeHidden();
  await load(page, baseURL);
  await expect(page.locator("#secondary-title")).toHaveText(cssPath);
  await expect(secondary(page)).toBeHidden();
  await expect(handle).toBeVisible();
  await press(page, handle);
  await expect(secondary(page)).toBeVisible();
  await expect.poll(async () => (await box(primary(page))).width).toBe(primaryWidth);
});

test("the edit bar stays inside the frame with the sidebar and the code hidden, and rows still select after", async ({ page }) => {
  const inner = page.frameLocator(".native-preview-frame");
  await inner.locator(".hero h1").evaluate((el) => (el as HTMLElement).click());
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");

  const barInside = async () => {
    const frameBox = await box(frame(page));
    const barBox = await box(bar(page));
    const headingBox = (await inner.locator(".hero h1").boundingBox())!;
    const inside = barBox.x >= frameBox.x + 8 - 1
      && barBox.x + barBox.width <= frameBox.x + frameBox.width - 8 + 1
      && barBox.y >= frameBox.y && barBox.y + barBox.height <= frameBox.y + frameBox.height;
    // The bar sits by the heading, which moved with the bigger frame.
    const near = Math.abs(barBox.x - headingBox.x) <= 1.5
      || Math.abs(headingBox.y - (barBox.y + barBox.height) - 8) <= 1.5
      || Math.abs(barBox.y - (headingBox.y + headingBox.height) - 8) <= 1.5;
    return inside && near;
  };
  await press(page, sidebarHandle(page));
  await expect(tree(page)).toBeHidden();
  await expect(bar(page)).toBeVisible();
  await expect.poll(barInside).toBe(true);
  await press(page, codeHandle(page));
  await expect(primary(page)).toBeHidden();
  await expect(bar(page)).toBeVisible();
  await expect.poll(barInside).toBe(true);

  await press(page, codeHandle(page));
  await press(page, sidebarHandle(page));
  await expect(tree(page)).toBeVisible();
  await expect(tree(page).getByRole("treeitem", { name: "Heading A native browser preview", exact: true })).toHaveAttribute("aria-selected", "true");
  await tree(page).getByRole("treeitem", { name: "Section Scroll to verify", exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
});

test("in the narrow column layout a handle bar at the sidebar's bottom edge toggles on tap", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  const handle = sidebarHandle(page);
  await expect(tree(page)).toBeVisible();
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
  await expect(handle).toHaveAttribute("title", "Click to hide the page structure");
  const along = async () => {
    const b = await box(handle);
    const side = await box(sidebar(page));
    return Math.abs(b.y + b.height - (side.y + side.height)) <= 1 && Math.abs(b.width - side.width) <= 1 && b.height >= 16;
  };
  await expect.poll(along).toBe(true);
  await expect(handle.locator(".resize-grip")).not.toHaveCSS("opacity", "0");
  await expectHoverGrowth(page, handle, "height");

  await press(page, handle);
  await expect(tree(page)).toBeHidden();
  await expect(handle).toHaveAttribute("title", "Click to show the page structure");
  await expect.poll(async () => (await box(sidebar(page))).height).toBe(20);
  await expect.poll(along).toBe(true);
  await press(page, handle);
  await expect(tree(page)).toBeVisible();
  await expect.poll(along).toBe(true);
});
