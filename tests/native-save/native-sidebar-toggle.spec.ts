import { expect, test, type Page } from "@playwright/test";

// The Hide / Show page structure toggle, a panel icon floating on the
// sidebar's right edge: it hides the page structure sidebar and brings it
// back at the width it had, shares its state with the resize handle, and
// remembers it across visits.
const indexPath = "src/pages/index.html";
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
});

const sidebar = (page: Page) => page.locator("#structure-sidebar");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure" });
const toggle = (page: Page) => page.locator("#structure-toggle");
const hideName = "Hide page structure";
const showName = "Show page structure";
const handle = (page: Page) => page.locator(".sidebar-resize");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const sidebarWidth = async (page: Page) => (await sidebar(page).boundingBox())!.width;
const box = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;

// The toggle is a 28 px square centred in the workspace's height; shown, its
// centre is on the sidebar's right edge; hidden, it sits 8 px in from the
// workspace's left edge.
async function expectTogglePlaced(page: Page, hidden: boolean) {
  await expect.poll(async () => {
    const button = await box(toggle(page));
    const workspace = await box(page.locator(".workspace"));
    const side = await box(sidebar(page));
    const middle = Math.abs(button.y + button.height / 2 - (workspace.y + workspace.height / 2)) <= 1;
    const edge = hidden
      ? Math.abs(button.x - (workspace.x + 8)) <= 1
      : Math.abs(button.x + button.width / 2 - (side.x + side.width)) <= 1;
    return button.width === 28 && button.height === 28 && middle && edge;
  }).toBe(true);
}

test("the toggle hides the sidebar, the canvas takes the width, and the previous width comes back", async ({ page }) => {
  await expect(toggle(page)).toHaveAccessibleName(hideName);
  await expect(toggle(page)).toHaveAttribute("title", hideName);
  await expect(page.getByRole("button", { name: hideName, exact: true })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page)).toHaveAttribute("aria-controls", "structure-sidebar");
  await expect(toggle(page).locator("svg path")).toHaveAttribute("stroke", "currentColor");
  // It floats above the page, not in the top bar.
  await expect(page.locator(".topbar #structure-toggle")).toHaveCount(0);
  await expect(toggle(page)).toHaveCSS("position", "absolute");
  expect(await toggle(page).evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  await expect(tree(page)).toBeVisible();
  await expectTogglePlaced(page, false);
  // The resize handle stays reachable above and below the toggle.
  const handleBox = await box(handle(page));
  const buttonBox = await box(toggle(page));
  for (const y of [buttonBox.y - 12, buttonBox.y + buttonBox.height + 12]) {
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [handleBox.x + handleBox.width / 2, y])).toBe("sidebar-resize");
  }
  const frame = page.locator(".native-preview-frame");

  // Widen the sidebar with the handle's keys first, so restoring is not the default.
  await handle(page).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "360");
  await expect.poll(() => sidebarWidth(page)).toBe(360);
  await expectTogglePlaced(page, false);
  const frameBefore = (await frame.boundingBox())!;

  await toggle(page).click();
  await expect(toggle(page)).toHaveAccessibleName(showName);
  await expect(toggle(page)).toHaveAttribute("title", showName);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(tree(page)).toBeHidden();
  await expect.poll(() => sidebarWidth(page)).toBe(0);
  await expectTogglePlaced(page, true);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "0");
  await expect.poll(async () => (await frame.boundingBox())!.width).toBe(frameBefore.width + 360);
  await expect(page.evaluate(() => localStorage.getItem("astro-editor.sidebar-width"))).resolves.toBe("0");

  await toggle(page).click();
  await expect(toggle(page)).toHaveAccessibleName(hideName);
  await expect(tree(page)).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBe(360);
  await expectTogglePlaced(page, false);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "360");
});

test("dragging the handle to nothing flips the label, and the hidden state survives a reload", async ({ page, baseURL }) => {
  const grip = await box(handle(page));
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 200);
  await page.mouse.down();
  await page.mouse.move(grip.x - 150, grip.y + 200, { steps: 5 });
  await page.mouse.move(grip.x - 300, grip.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(toggle(page)).toHaveAccessibleName(showName);
  await expectTogglePlaced(page, true);
  await expect.poll(() => sidebarWidth(page)).toBe(0);

  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(toggle(page)).toHaveAccessibleName(showName);
  await expect(tree(page)).toBeHidden();
  await expect.poll(() => sidebarWidth(page)).toBe(0);
  await expectTogglePlaced(page, true);
  // The handle's End key brings it back to the maximum; Home hides again.
  await handle(page).focus();
  await page.keyboard.press("End");
  await expect(toggle(page)).toHaveAccessibleName(hideName);
  await expect(tree(page)).toBeVisible();
  await expectTogglePlaced(page, false);
  await page.keyboard.press("Home");
  await expect(toggle(page)).toHaveAccessibleName(showName);
});

test("the edit bar stays inside the frame while hidden, and rows still select after showing again", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await frame.locator(".hero h1").evaluate((el) => (el as HTMLElement).click());
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");

  await toggle(page).click();
  await expect(tree(page)).toBeHidden();
  await expect(bar(page)).toBeVisible();
  await expect.poll(async () => {
    const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
    const barBox = (await bar(page).boundingBox())!;
    const headingBox = (await frame.locator(".hero h1").boundingBox())!;
    const inside = barBox.x >= frameBox.x + 8 - 1
      && barBox.x + barBox.width <= frameBox.x + frameBox.width - 8 + 1
      && barBox.y >= frameBox.y && barBox.y + barBox.height <= frameBox.y + frameBox.height;
    // The bar sits by the heading, which moved with the wider frame.
    const near = Math.abs(barBox.x - headingBox.x) <= 1.5
      || Math.abs(headingBox.y - (barBox.y + barBox.height) - 8) <= 1.5
      || Math.abs(barBox.y - (headingBox.y + headingBox.height) - 8) <= 1.5;
    return inside && near;
  }).toBe(true);

  await toggle(page).click();
  await expect(tree(page)).toBeVisible();
  await expect(tree(page).getByRole("treeitem", { name: "Heading A native browser preview", exact: true })).toHaveAttribute("aria-selected", "true");
  await tree(page).getByRole("treeitem", { name: "Section Scroll to verify", exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(tree(page).getByRole("treeitem", { name: "Section Scroll to verify", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("in the narrow column layout the toggle sits at the top right of the sidebar block", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(tree(page)).toBeVisible();
  // 12 px in from the sidebar block's top and right edges, shown and hidden.
  const placed = async () => {
    const button = await box(toggle(page));
    const side = await box(sidebar(page));
    return Math.abs(button.y - (side.y + 12)) <= 1 && Math.abs(button.x + button.width - (side.x + side.width - 12)) <= 1;
  };
  await expect.poll(placed).toBe(true);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAccessibleName(showName);
  await expect(tree(page)).toBeHidden();
  // The hidden sidebar keeps a strip just tall enough for the toggle.
  await expect.poll(async () => (await box(sidebar(page))).height).toBe(52);
  await expect.poll(placed).toBe(true);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAccessibleName(hideName);
  await expect(tree(page)).toBeVisible();
});
