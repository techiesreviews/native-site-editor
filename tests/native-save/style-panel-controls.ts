import { expect, type Page } from "@playwright/test";

// The Style dock starts collapsed to zero width; then everything in it except
// its resize separator is inert and hidden, so the separator is what opens it.
export const styleGrip = (page: Page) => page.getByRole("separator", { name: "Resize Style panel", exact: true });

/** Opens the Style dock from its focused separator with Enter; leaves an open dock as it is. */
export async function showStylePanel(page: Page) {
  const grip = styleGrip(page);
  if (await grip.getAttribute("aria-valuenow") === "0") { await grip.focus(); await page.keyboard.press("Enter"); }
  await expect(grip).not.toHaveAttribute("aria-valuenow", "0");
}
