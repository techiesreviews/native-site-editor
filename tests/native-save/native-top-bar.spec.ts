// The slim top bar (atomic catalogue ticket 66, version B) and the phone layout Lex approved on 2026-11-11
// (TOOLS-206): one 44 px row at 1280 and at 390 wide. On a phone the bar holds the site and page name, Undo,
// Publish and one Menu button; Pages, Add a block, Page structure, Code, Screen size, History, Share a preview
// link, Site settings and Switch site sit behind the Menu as a bottom sheet. Default fixture.
import { expect, test, type Locator, type Page } from "@playwright/test";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const banner = (page: Page) => page.getByRole("banner");
const menuButton = (page: Page) => banner(page).getByRole("button", { name: "Menu", exact: true });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Menu", exact: true });
const row = (page: Page, name: string) => sheet(page).getByRole("button", { name, exact: true });
const box = async (locator: Locator) => (await locator.boundingBox())!;
const middle = async (locator: Locator) => { const b = await box(locator); return b.y + b.height / 2; };
const popoverOpen = (page: Page, selector: string) => page.locator(selector).evaluate((el) => el.matches(":popover-open"));

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("one 44 px row: the project / page path on the left, Undo, History and Publish on the right", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const bar = page.locator(".topbar");
    expect((await box(bar)).height).toBeLessThanOrEqual(45);
    const project = page.locator(".repository-menu__trigger"), picker = page.locator("#explorer-toggle");
    const undo = banner(page).getByRole("button", { name: "Undo", exact: true });
    const history = banner(page).getByRole("button", { name: "History", exact: true });
    const publish = banner(page).getByRole("button", { name: "Publish", exact: true });
    for (const control of [project, picker, undo, history, publish]) await expect(control).toBeVisible();
    // The slash between them.
    expect(await page.locator("#repository-menu").evaluate((el) => getComputedStyle(el, "::after").content)).toBe('"/"');
    // The path reads left to right, the page right after the project and its slash.
    expect((await box(picker)).x).toBeGreaterThan((await box(project)).x);
    expect((await box(picker)).x).toBeLessThan(1280 / 2);
    // Everything on one row.
    const row = await middle(bar);
    for (const control of [project, picker, undo, history, publish]) expect(Math.abs((await middle(control)) - row)).toBeLessThanOrEqual(2);
    // The phone's Menu button is not on a wide screen.
    await expect(menuButton(page)).toBeHidden();
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("one 44 px row with the site and page, Undo, Publish and Menu; the page starts right under it", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const bar = page.locator(".topbar");
    expect((await box(bar)).height).toBeLessThanOrEqual(45);
    const name = page.locator("#explorer-toggle");
    const undo = banner(page).getByRole("button", { name: "Undo", exact: true });
    const publish = banner(page).getByRole("button", { name: "Publish", exact: true });
    for (const control of [name, undo, publish, menuButton(page)]) await expect(control).toBeVisible();
    await expect(name).toContainText("native-demo");
    await expect(name).toContainText("Home");
    const row = await middle(bar);
    for (const control of [name, undo, publish, menuButton(page)]) expect(Math.abs((await middle(control)) - row)).toBeLessThanOrEqual(2);
    // The rest moved behind the Menu: no stack of bars over the page.
    await expect(page.locator(".repository-menu__trigger")).toBeHidden();
    await expect(banner(page).getByRole("button", { name: "Redo", exact: true })).toBeHidden();
    await expect(banner(page).getByRole("button", { name: "History", exact: true })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Blocks" })).toBeHidden();
    await expect(page.locator(".canvas-bar")).toBeHidden();
    expect((await box(page.locator(".native-preview-frame"))).y).toBeLessThanOrEqual((await box(bar)).height + 2);
  });

  test("the Menu opens a bottom sheet with the approved rows, and each row works the control it stands for", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await menuButton(page).tap();
    await expect(sheet(page)).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Pages", "Add a block", "Page structure", "Code", "History", "Share a preview link", "Site settings", "Switch site"])
      await expect(row(page, name)).toBeVisible();
    await expect(sheet(page).getByRole("group", { name: "Screen size" })).toBeVisible();
    // A bottom sheet: it reaches the window's bottom edge.
    const shown = await box(sheet(page));
    expect(shown.y + shown.height).toBeGreaterThanOrEqual(843);

    // Screen size presses the canvas's own breakpoint, and the sheet stays open to show it.
    await sheet(page).getByRole("button", { name: "Tablet", exact: true }).tap();
    await expect(page.locator('.canvas-device[data-device="tablet"]')).toHaveAttribute("aria-pressed", "true");
    await expect(sheet(page).getByRole("button", { name: "Tablet", exact: true })).toHaveAttribute("aria-pressed", "true");
    await sheet(page).getByRole("button", { name: "Mobile", exact: true }).tap();
    await expect(page.locator('.canvas-device[data-device="mobile"]')).toHaveAttribute("aria-pressed", "true");

    // Add a block shows the blocks; Back returns to the list.
    await row(page, "Add a block").tap();
    await expect(sheet(page).getByRole("button", { name: "Heading", exact: true })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Back", exact: true }).tap();
    await expect(row(page, "Pages")).toBeVisible();

    // Pages: the sheet goes and the Pages panel opens under the bar.
    await row(page, "Pages").tap();
    await expect(sheet(page)).toBeHidden();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => popoverOpen(page, "#explorer")).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => popoverOpen(page, "#explorer")).toBe(false);

    // History opens the History panel.
    await menuButton(page).tap();
    await row(page, "History").tap();
    await expect(page.getByRole("dialog", { name: "History" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "History" })).toBeHidden();

    // Switch site opens the project menu, at the bottom of the screen.
    await menuButton(page).tap();
    await row(page, "Switch site").tap();
    await expect.poll(() => popoverOpen(page, "#repository-actions")).toBe(true);
    const project = await box(page.locator("#repository-actions"));
    expect(project.y + project.height).toBeGreaterThanOrEqual(843);
    await page.keyboard.press("Escape");

    // Page structure opens the pull-up sheet.
    await menuButton(page).tap();
    await row(page, "Page structure").tap();
    await expect(page.getByRole("button", { name: "Page structure and code" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("complementary", { name: "Page structure" })).toBeVisible();
  });

  test("Escape or a tap outside closes the sheet and gives focus back to the Menu button", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await menuButton(page).tap();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
    await menuButton(page).tap();
    await expect(sheet(page)).toBeVisible();
    // The dimmed page above the sheet.
    await page.mouse.click(195, 120);
    await expect(sheet(page)).toBeHidden();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  });
});
