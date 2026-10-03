import { expect, test } from "@playwright/test";

test("Page settings keeps the first heading hint and refuses a component-only preview", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible();
  if (!await page.locator("#explorer").evaluate(element => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await expect(settings.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Native Studio");
  await expect(settings.getByRole("textbox", { name: "Title", exact: true })).toHaveAttribute("placeholder", "A native browser preview");
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto(`${baseURL}/#repo=501&branch=main&file=components/feature-block/feature-block.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/feature-block/feature-block.html");
  await expect(page.locator("#structure .sidebar-hint")).toContainText("component by itself");
  if (!await page.locator("#explorer").evaluate(element => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  await expect(page.locator("#status")).toHaveText("Open a page to edit its settings.");
  await expect(settings).toBeHidden();
});
