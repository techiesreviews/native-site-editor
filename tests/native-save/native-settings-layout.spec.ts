import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { storedDraft } from "./drafts";
const settings = (page: Page, name = "Page settings") => page.getByRole("dialog", { name, exact: true });
const pageBlock = (page: Page) => page.getByRole("group", { name: "Page", exact: true });
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main");
}
async function pageSettings(page: Page) { await pageBlock(page).getByRole("button", { name: "Page settings", exact: true }).click(); }
test("category switches keep all page values and Apply includes hidden fields", async ({ page, baseURL }) => {
  await open(page, baseURL); await pageSettings(page);
  const panel = settings(page);
  await panel.getByLabel("Title", { exact: true }).fill("Long title for a thoughtful studio and its independent garden projects");
  await panel.getByLabel("Description", { exact: true }).fill("A long description stays readable and editable without squeezing the title or creating a second scroll area.");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Use page title", { exact: true }).uncheck();
  await panel.getByLabel("Social title", { exact: true }).fill("Independent share title");
  await panel.getByRole("tab", { name: "Search", exact: true }).click();
  await panel.getByLabel("Canonical URL").fill("https://studio.example/");
  await panel.getByLabel("Hide from search engines").check();
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await expect(panel.getByLabel("Title", { exact: true })).toHaveValue("Long title for a thoughtful studio and its independent garden projects");
  await expect(panel.getByLabel("Description", { exact: true })).toHaveValue(/A long description/);
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).toBeHidden();
  const source = (await storedDraft(page, "index.html"))!.content;
  expect(source).toContain("Independent share title");
  expect(source).toContain('href="https://studio.example/"');
  expect(source).toContain('content="noindex"');
});
test("keyboard categories and scrolling leave the footer visible; Escape restores focus", async ({ page, baseURL }) => {
  await open(page, baseURL); await pageSettings(page);
  const panel = settings(page);
  const general = panel.getByRole("tab", { name: "General", exact: true });
  await expect(general).toBeFocused();
  await general.press("ArrowDown");
  await expect(panel.getByRole("tab", { name: "Search", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(panel.getByRole("tab", { name: "Social", exact: true })).toBeFocused();
  const footer = panel.locator(".site-settings__footer");
  const before = await footer.boundingBox();
  await panel.locator(".site-settings__content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  expect(await footer.boundingBox()).toEqual(before);
  await expect(panel.getByRole("button", { name: "Apply page settings" })).toBeInViewport();
  await mkdir(".scratch/settings-layout", { recursive: true });
  await panel.locator(".site-settings__content").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: ".scratch/settings-layout/page-social-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: ".scratch/settings-layout/page-social-dark.png" });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(pageBlock(page).getByRole("button", { name: "Page settings", exact: true })).toBeFocused();
});
test("all settings families fit 390px with horizontal categories and stacked controls", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, baseURL);
  for (const [family, categories] of [["Page settings", ["General", "Search", "Social"]], ["Site settings", ["General", "Social", "Pages"]], ["Navigation", ["Links", "Add link"]]] as const) {
    if (family === "Site settings") { await page.locator(".repository-menu__trigger").click(); await page.getByRole("button", { name: family, exact: true }).click(); }
    else await pageBlock(page).getByRole("button", { name: family, exact: true }).click();
    const panel = settings(page, family);
    await expect(panel.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
    for (const category of categories) {
      await panel.getByRole("tab", { name: category, exact: true }).click();
      const dimensions = await panel.evaluate((element) => ({ width: element.getBoundingClientRect().width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }));
      expect(dimensions.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.right).toBeLessThanOrEqual(390);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
      await expect(panel.locator(".site-settings__actions")).toBeInViewport();
    }
    if (family === "Page settings") { await mkdir(".scratch/settings-layout", { recursive: true }); await page.screenshot({ path: ".scratch/settings-layout/page-mobile.png" }); }
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});
test("site categories preserve identity and image edits until Cancel, returning focus to repository control", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await page.locator(".repository-menu__trigger").click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  const panel = settings(page, "Site settings");
  await panel.getByLabel("Site name", { exact: true }).fill("Unsaved identity");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await panel.getByLabel("Default social image").fill("https://studio.example/share.png");
  await panel.getByRole("tab", { name: "Pages", exact: true }).click();
  await expect(panel.locator(".site-settings__affected li")).toHaveCount(2);
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await expect(panel.getByLabel("Site name", { exact: true })).toHaveValue("Unsaved identity");
  await panel.getByRole("tab", { name: "Social", exact: true }).click();
  await expect(panel.getByLabel("Default social image")).toHaveValue("https://studio.example/share.png");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await storedDraft(page, ".editor/config.json")).toBeUndefined();
  await expect(page.locator(".repository-menu__trigger")).toBeFocused();
});
