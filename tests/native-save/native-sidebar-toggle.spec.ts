import { expect, test, type Page } from "@playwright/test";

// The Hide structure / Page structure toggle in the top bar: it hides the
// page structure sidebar and brings it back at the width it had, shares its
// state with the resize handle, and remembers it across visits.
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
const handle = (page: Page) => page.locator(".sidebar-resize");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const sidebarWidth = async (page: Page) => (await sidebar(page).boundingBox())!.width;

test("the toggle hides the sidebar, the canvas takes the width, and the previous width comes back", async ({ page }) => {
  await expect(toggle(page)).toHaveText("Hide structure");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page)).toHaveAttribute("aria-controls", "structure-sidebar");
  await expect(tree(page)).toBeVisible();
  const frame = page.locator(".native-preview-frame");

  // Widen the sidebar with the handle's keys first, so restoring is not the default.
  await handle(page).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "360");
  await expect.poll(() => sidebarWidth(page)).toBe(360);
  const frameBefore = (await frame.boundingBox())!;

  await toggle(page).click();
  await expect(toggle(page)).toHaveText("Page structure");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(tree(page)).toBeHidden();
  await expect.poll(() => sidebarWidth(page)).toBe(0);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "0");
  await expect.poll(async () => (await frame.boundingBox())!.width).toBe(frameBefore.width + 360);
  await expect(page.evaluate(() => localStorage.getItem("astro-editor.sidebar-width"))).resolves.toBe("0");

  await toggle(page).click();
  await expect(toggle(page)).toHaveText("Hide structure");
  await expect(tree(page)).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBe(360);
  await expect(handle(page)).toHaveAttribute("aria-valuenow", "360");
});

test("dragging the handle to nothing flips the label, and the hidden state survives a reload", async ({ page, baseURL }) => {
  const box = (await handle(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 150, box.y + 200, { steps: 5 });
  await page.mouse.move(box.x - 300, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(toggle(page)).toHaveText("Page structure");
  await expect.poll(() => sidebarWidth(page)).toBe(0);

  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveText(indexPath, { timeout: 30_000 });
  await expect(toggle(page)).toHaveText("Page structure");
  await expect(tree(page)).toBeHidden();
  await expect.poll(() => sidebarWidth(page)).toBe(0);
  // The handle's End key brings it back to the maximum; Home hides again.
  await handle(page).focus();
  await page.keyboard.press("End");
  await expect(toggle(page)).toHaveText("Hide structure");
  await expect(tree(page)).toBeVisible();
  await page.keyboard.press("Home");
  await expect(toggle(page)).toHaveText("Page structure");
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

test("the toggle still hides and shows the sidebar in the narrow column layout", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(tree(page)).toBeVisible();
  await toggle(page).click();
  await expect(toggle(page)).toHaveText("Page structure");
  await expect(tree(page)).toBeHidden();
  await expect.poll(async () => (await sidebar(page).boundingBox())!.height).toBe(0);
  await toggle(page).click();
  await expect(toggle(page)).toHaveText("Hide structure");
  await expect(tree(page)).toBeVisible();
});
