import type { Page } from "@playwright/test";

/** Opens Site settings: the project menu's row on a wide screen, the Menu's row on a phone (mock-up 05 v2, TOOLS-220). */
export async function openSiteSettings(page: Page) {
  const project = page.locator(".topbar .repository-menu__trigger");
  if (await project.isVisible()) {
    await project.click();
    await page.locator("#site-settings-toggle").click();
    return;
  }
  await page.getByRole("banner").getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("button", { name: "Site settings", exact: true }).click();
}
