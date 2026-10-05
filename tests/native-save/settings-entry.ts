import { expect, type Page } from "@playwright/test";

/** Open the current page's settings from its visible Pages row menu. */
export async function openPageSettingsFromPages(page: Page, path?: string) {
  await openPageMenuSettings(page, "Page settings…", path);
}

export async function openNavigationFromPages(page: Page, path?: string) {
  await openPageMenuSettings(page, "Navigation…", path);
}

async function openPageMenuSettings(page: Page, action: string, path?: string) {
  const file = path ?? await page.locator("#current-page").getAttribute("data-path");
  expect(file, "A page file must be current before opening its settings").toBeTruthy();
  const explorer = page.locator("#explorer");
  if (!await explorer.evaluate(element => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await explorer.getByRole("tab", { name: "Pages", exact: true }).click();
  const row = explorer.locator(`[role="treeitem"][data-key=${JSON.stringify(`page:${file}`)}]`);
  await expect(row).toHaveCount(1);
  await row.press("Shift+F10");
  await explorer.getByRole("menuitem", { name: action, exact: true }).click();
}
