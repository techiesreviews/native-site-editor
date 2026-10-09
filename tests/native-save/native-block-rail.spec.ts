import { expect, test, type Page } from "@playwright/test";

// Default fixture group; nightly coverage for the boot block controls.
const names = ["Section", "Div", "Heading", "Paragraph", "Image", "Button"];
const rail = (page: Page) => page.getByRole("navigation", { name: "Blocks" });
const tip = (page: Page) => page.locator(".block-rail__tip");
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(rail(page)).toBeVisible();
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`six named blocks, hover and keyboard tooltips, beside Structure in ${colorScheme}`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme });
    await open(page, baseURL);
    const buttons = rail(page).getByRole("button");
    await expect(buttons).toHaveCount(6);
    await expect(tip(page)).toHaveAttribute("aria-hidden", "true");
    for (const [index, name] of names.entries()) {
      const button = buttons.nth(index);
      await expect(button).toHaveAccessibleName(name);
      await expect(button.locator("svg")).toHaveAttribute("width", "20");
      await button.hover();
      await expect(tip(page)).toBeVisible();
      await expect(tip(page)).toHaveText(name);
      const buttonBox = (await button.boundingBox())!;
      expect((await tip(page).boundingBox())!.x).toBeGreaterThan(buttonBox.x + buttonBox.width);
      await page.mouse.move(1, 1);
      await expect(tip(page)).toBeHidden();
    }
    // Keyboard modality, then arrows wrap through every button in catalogue order.
    await page.keyboard.press("Tab");
    await buttons.first().focus();
    for (const name of [...names, names[0]]) {
      await expect(rail(page).getByRole("button", { name, exact: true })).toBeFocused();
      await expect(tip(page)).toBeVisible();
      await expect(tip(page)).toHaveText(name);
      await page.keyboard.press("ArrowDown");
    }
    await buttons.first().focus();
    await page.keyboard.press("ArrowUp");
    await expect(buttons.last()).toBeFocused();
    // Hovering another block and leaving it brings back the focused block's name.
    await buttons.first().hover();
    await expect(tip(page)).toHaveText(names[0]);
    await page.mouse.move(1, 1);
    await expect(tip(page)).toBeVisible();
    await expect(tip(page)).toHaveText(names.at(-1)!);
    await page.keyboard.press("Tab");
    await expect(tip(page)).toBeHidden();
    const colors = await buttons.first().evaluate((button) => {
      const nav = button.closest("nav")!;
      return { icon: getComputedStyle(button.querySelector("svg")!).color, background: getComputedStyle(nav).backgroundColor };
    });
    expect(colors.icon).not.toBe(colors.background);
    const railBox = (await rail(page).boundingBox())!;
    const sidebarBox = (await page.locator("#structure-sidebar").boundingBox())!;
    expect(railBox.x + railBox.width).toBe(sidebarBox.x);
    expect(railBox.height).toBe(sidebarBox.height);

    // The Add catalogue remains components and sections only, docked after the rail.
    await page.locator("#add-panel-toggle").click();
    const panel = page.getByRole("dialog", { name: "Add to the page" });
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-tag^="native:"]')).toHaveCount(0);
    await expect(panel.getByRole("option", { name: /^(Section|Div|Heading|Paragraph|Image|Button) HTML$/ })).toHaveCount(0);
    // The panel slides in; its settled left edge is the sidebar's.
    await expect.poll(async () => (await panel.boundingBox())!.x).toBe(sidebarBox.x);
    await page.keyboard.press("Escape");

    await buttons.first().hover();
    await page.mouse.down();
    await expect(tip(page)).toBeHidden();
    await page.mouse.up();
    await expect(page.frameLocator(".native-preview-frame").locator("main > section")).toHaveCount(3);
    await page.locator(".sidebar-resize").press("Enter");
    await expect(page.getByRole("tree", { name: "Page structure" })).toBeHidden();
    await expect(rail(page)).toBeVisible();
    expect((await rail(page).boundingBox())!.width).toBe(48);
  });
}

test("rail leaves preview space when resizing and becomes a row above the narrow sidebar", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.setViewportSize({ width: 800, height: 900 });
  const handle = page.locator(".sidebar-resize");
  await handle.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "392");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
  const blocks = (await rail(page).boundingBox())!;
  const side = (await page.locator("#structure-sidebar").boundingBox())!;
  expect(blocks.y + blocks.height).toBe(side.y);
  const buttons = await rail(page).getByRole("button").all();
  const rows = await Promise.all(buttons.map(async (button) => (await button.boundingBox())!.y));
  expect(new Set(rows).size).toBe(1);
  await handle.press("Enter");
  await expect(rail(page)).toBeVisible();
  await expect(page.getByRole("tree", { name: "Page structure" })).toBeHidden();
});

test("a repository without a native page hides the rail and releases its column", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.request.post(`${baseURL}/__demo/onboarding`, { data: { add: [{ name: "rail-notes", kind: "no-site" }] } });
  const repos = await (await page.request.get(`${baseURL}/api/repositories?refresh=1`)).json() as { id: number; name: string }[];
  const repo = repos.find((entry) => entry.name === "rail-notes")!;
  await page.goto(`${baseURL}/#repo=${repo.id}&branch=main&file=README.md`);
  await expect(page.locator("#primary-title")).toHaveText("README.md");
  await expect(rail(page)).toBeHidden();
  await expect(page.locator("#add-panel-toggle")).toBeHidden();
  await expect(page.locator(".workspace")).not.toHaveClass(/workspace--blocks/);
  const workspace = (await page.locator(".workspace").boundingBox())!;
  expect((await page.locator("#structure-sidebar").boundingBox())!.x).toBe(workspace.x);
  // Back on a native page, the rail and its column return.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(rail(page)).toBeVisible({ timeout: 30_000 });
  await expect(rail(page).getByRole("button")).toHaveCount(6);
  await expect(page.locator(".workspace")).toHaveClass(/workspace--blocks/);
});
