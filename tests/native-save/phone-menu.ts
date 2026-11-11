import { expect, type Page } from "@playwright/test";

// On a phone the slim top bar (atomic catalogue ticket 66) keeps the project menu, the block rail and the canvas's
// breakpoints behind its one Menu; these open them the way a phone user does.

/** Opens the top bar's Menu and presses one of its rows. */
export async function phoneMenu(page: Page, row: string, options: { tap?: boolean } = {}) {
  const menu = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
  const choice = page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("button", { name: row, exact: true });
  for (const target of [menu, choice]) await (options.tap ? target.tap() : target.click());
}

/** The project menu: its tile on a wide screen, Menu › Switch site on a phone. */
export async function openProjectMenu(page: Page, options: { tap?: boolean } = {}) {
  const tile = page.locator(".repository-menu__trigger");
  if (page.viewportSize()!.width > 650) await (options.tap ? tile.tap() : tile.click());
  else await phoneMenu(page, "Switch site", options);
  await expect.poll(() => page.locator("#repository-actions").evaluate((el) => el.matches(":popover-open"))).toBe(true);
}

/** Adds a block from Menu › Add a block on a phone. */
export async function addBlockOnPhone(page: Page, block: string) {
  await phoneMenu(page, "Add a block");
  await page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("button", { name: block, exact: true }).click();
}

/** The phone's pull-up sheet has its script (it loads with the phone half of the top bar). */
export async function sheetReady(page: Page) {
  await expect.poll(() => page.locator(".workspace").evaluate((el) => (el as HTMLElement).style.getPropertyValue("--sheet-size"))).not.toBe("");
}
