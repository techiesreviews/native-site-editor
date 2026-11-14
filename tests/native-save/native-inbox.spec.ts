// The Inbox (site-quality slice 40, mock-up 05 v2; TOOLS-222): a tray button between History and Publish with an
// orange dot while something waits, its panel of items (what and where, a wave-off named for what it means, "All
// done" when empty), dots on the pages and pictures that have something waiting, and a row in the phone's Menu.
// Default fixture: the home page's hero picture has no alt text.
import { expect, test, type Page } from "@playwright/test";

const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const banner = (page: Page) => page.getByRole("banner");
const inboxButton = (page: Page) => banner(page).getByRole("button", { name: "Inbox", exact: true });
const inbox = (page: Page) => page.getByRole("dialog", { name: "Inbox", exact: true });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const picture = (page: Page) => inbox(page).getByRole("button", { name: /^Picture without a description/ });
const dot = (page: Page, selector: string, pseudo = "::after") =>
  page.locator(selector).first().evaluate((el, which) => { const style = getComputedStyle(el, which); return style.content !== "none" && style.display !== "none" && style.scale !== "0"; }, pseudo);
const homeSource = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html") ?? "");

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the tray sits between History and Publish with a dot; its item goes to the picture, and a description clears it", async ({ page, baseURL }) => {
    await open(page, baseURL);
    const history = banner(page).getByRole("button", { name: "History", exact: true });
    const publish = banner(page).getByRole("button", { name: "Publish", exact: true });
    await expect(inboxButton(page)).toBeVisible();
    const [h, i, p] = [await history.boundingBox(), await inboxButton(page).boundingBox(), await publish.boundingBox()];
    expect(i!.x).toBeGreaterThan(h!.x + h!.width - 1);
    expect(p!.x).toBeGreaterThan(i!.x + i!.width - 1);
    expect(Math.round(i!.height)).toBe(28);
    // Something waits: the dot, never a number.
    await expect.poll(() => dot(page, "#inbox-button")).toBe(true);
    await expect(inboxButton(page)).toHaveText("");

    await inboxButton(page).click();
    await expect(inbox(page)).toBeVisible();
    await expect(inbox(page).getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(picture(page)).toHaveText(/Picture without a description\s*Home page/);
    await expect(picture(page)).toHaveAccessibleName("Picture without a description, Home page");
    await expect(inbox(page).getByRole("button", { name: /^Decorative: Picture without a description/ })).toBeVisible();
    await expect(picture(page)).toBeFocused();
    // Escape closes it and gives the keyboard back to the tray.
    await page.keyboard.press("Escape");
    await expect(inbox(page)).toBeHidden();
    await expect(inboxButton(page)).toBeFocused();

    // The page with something waiting wears a dot in Pages.
    await page.locator("#explorer-toggle").click();
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="index.html"] > .pages-row .pages-label')).toBe(true);
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="about/index.html"] > .pages-row .pages-label')).toBe(false);
    await page.keyboard.press("Escape");

    // The item opens its spot: the picture selected, the edit bar on its missing alt text.
    await inboxButton(page).click();
    await picture(page).click();
    await expect(inbox(page)).toBeHidden();
    await bar(page).getByRole("button", { name: "Alt text missing", exact: true }).click();
    await page.getByRole("textbox", { name: "Alt text", exact: true }).fill("A desk with a laptop");
    await page.keyboard.press("Enter");
    // Fixed: the item goes by itself, the dot with it.
    await expect.poll(() => dot(page, "#inbox-button")).toBe(false);
    await inboxButton(page).click();
    await expect(inbox(page)).toContainText("All done");
    await expect(picture(page)).toHaveCount(0);
  });

  test("Decorative marks the picture as Media does and stays after a reload", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect.poll(() => dot(page, "#inbox-button")).toBe(true);
    await inboxButton(page).click();
    await inbox(page).getByRole("button", { name: /^Decorative: / }).click();
    await expect(picture(page)).toHaveCount(0);
    await expect(inbox(page)).toContainText("All done");
    await expect.poll(() => dot(page, "#inbox-button")).toBe(false);
    await expect.poll(() => homeSource(page)).toMatch(/<img alt="" class="hero-image" src="\/images\/placeholder.svg"|<img class="hero-image" src="\/images\/placeholder.svg"[^>]*alt=""/);
    await page.reload();
    await expect(frame(page).locator(".hero img")).toBeVisible({ timeout: 30_000 });
    await inboxButton(page).click();
    await expect(inbox(page)).toContainText("All done");
    expect(await dot(page, "#inbox-button")).toBe(false);
  });

  test("a page whose title is removed waits in the Inbox, and its item opens the page's details", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await page.locator("#explorer-toggle").click();
    const about = page.locator("#explorer").getByRole("treeitem", { name: /About/ }).first();
    await about.focus();
    await about.press("F2");
    await about.getByRole("textbox").fill("");
    await page.keyboard.press("Enter");
    await expect(page.locator("#status")).toContainText("Removed the title");
    await expect.poll(() => dot(page, '#explorer .pages-item[data-file="about/index.html"] > .pages-row .pages-label')).toBe(true);
    await page.keyboard.press("Escape");
    await inboxButton(page).click();
    const untitled = inbox(page).getByRole("button", { name: /^Page without a title/ });
    await expect(untitled).toHaveText(/Page without a title\s*\/about\//);
    await expect(untitled).toHaveAccessibleName("Page without a title, /about/");
    await untitled.click();
    await expect(page.getByRole("dialog", { name: "Page settings", exact: true })).toBeVisible();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the Inbox leaves the bar for the Menu: the Menu wears the dot and its Inbox row opens the panel", async ({ page, baseURL }) => {
    await open(page, baseURL);
    await expect(inboxButton(page)).toBeHidden();
    const menu = banner(page).getByRole("button", { name: "Menu", exact: true });
    await expect.poll(() => dot(page, "#topbar-menu")).toBe(true);
    await menu.click();
    const sheet = page.getByRole("dialog", { name: "Menu", exact: true });
    const row = sheet.getByRole("button", { name: "Inbox", exact: true });
    await expect(row).toBeVisible();
    expect(await dot(page, '.top-bar-menu__row[data-row="inbox"] .top-bar-menu__label')).toBe(true);
    await row.click();
    await expect(sheet).toBeHidden();
    await expect(inbox(page)).toBeVisible();
    await expect(picture(page)).toBeVisible();
    const box = (await inbox(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
});
