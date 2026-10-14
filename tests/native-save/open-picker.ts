import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The Media picker for a page image, from a double-click on it (the edit bar's Image button opens
 * the image popup instead, media build slice 39). The image is selected first. A double-click the
 * frame reports against a render the editor has since replaced is dropped (preview-link's render
 * freshness), so it is tried again until the picker shows.
 */
export async function openPickerOn(page: Page, image: Locator) {
  const picker = page.getByRole("dialog", { name: "Choose image", exact: true });
  await image.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__image")).toBeVisible();
  await expect(async () => {
    if (!await picker.isVisible()) await image.dblclick();
    await expect(picker).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return picker;
}
