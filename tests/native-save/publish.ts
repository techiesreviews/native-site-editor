import { expect, type Page } from "@playwright/test";

// The Publish button commits on a click; hovering it shows the changes,
// folded under their grand total.
export const publishButton = (page: Page) => page.getByRole("button", { name: "Publish", exact: true });

/** Hovers Publish and unfolds the list of changes. */
export async function showPublish(page: Page) {
  await publishButton(page).hover();
  const panel = page.locator("#publish-files");
  await expect(panel).toBeVisible();
  if (!(await panel.locator(".publish-menu__total").evaluate((details) => (details as HTMLDetailsElement).open)))
    await panel.locator(".publish-menu__total-summary").click();
  await expect(panel.locator(".publish-menu__files")).toBeVisible();
}
