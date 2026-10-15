import { expect, type Locator, type Page } from "@playwright/test";

/** Open the picker with one double-click, including immediately after selection. */
export async function openPickerOn(page: Page, image: Locator, title = "Choose image") {
  // A picture spot's picker (an image with a slot) is "Choose image or video".
  const picker = page.getByRole("dialog", { name: title, exact: true });
  await image.click();
  await expect(page.getByRole("toolbar", { name: "Edit bar" }).locator(".edit-bar__media")).toBeVisible();
  await image.dblclick();
  await expect(picker).toBeVisible();
  return picker;
}
