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

// The caret beside Publish opens the same panel, which ends with Discard changes.
export const publishActions = (page: Page) => page.getByRole("button", { name: "More publish actions", exact: true });

/** Opens the branch actions even when Publish is disabled. */
export async function showPublishActions(page: Page) {
  const panel = page.locator("#publish-files");
  if (!(await panel.isVisible())) await publishActions(page).click();
  await expect(panel).toBeVisible();
  return panel;
}

/** Opens the branch actions and asks to discard every unsaved change. */
export async function discardAllChanges(page: Page) {
  const panel = await showPublishActions(page);
  await panel.getByRole("button", { name: "Discard changes", exact: true }).click();
}
