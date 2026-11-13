import { expect, type Page } from "@playwright/test";

/** Opens `path` in the code pane from the Files tab, its folders opened on the way. */
export async function openFile(page: Page, path: string) {
  if (!(await page.locator("#explorer").isVisible())) await page.locator("#explorer-toggle").click();
  await page.locator("#explorer").getByRole("tab", { name: "Files" }).click();
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index++) {
    const item = page.locator(`#explorer .file-row[data-path='${parts.slice(0, index).join("/")}']`);
    await expect(item).toBeVisible({ timeout: 20_000 });
    if (index === parts.length || (await item.getAttribute("aria-expanded")) === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.locator("#content [role=\"textbox\"]").first()).toBeAttached({ timeout: 20_000 });
}
