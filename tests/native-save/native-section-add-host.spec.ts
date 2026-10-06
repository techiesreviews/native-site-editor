import { openPageSettingsFromPages } from "./settings-entry";
import { expect, test } from "@playwright/test";

test("Add offers page sections without a separate HTML element catalogue", { tag: "@smoke" }, async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator(".hero h1")).toBeVisible();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Add to the page" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("option", { name: /^Feature block/ })).toHaveCount(1);
  for (const name of ["Heading", "Text", "Image", "Video", "Embed", "Input", "Grid", "Columns"])
    await expect(panel.getByRole("option", { name: new RegExp(`^${name}(?:\\s|$)`) })).toHaveCount(0);
  await frame.locator("section.hero").click({ position: { x: 5, y: 5 } });
  await panel.getByRole("option", { name: /^Feature block/ }).click();
  await expect(frame.locator("section.hero + feature-block + section.cards")).toHaveCount(1);
});

test("Pages settings follows the canvas page while the code editor stays on Home", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.locator(".hero h1")).toBeVisible();
  await frame.locator("site-header a", { hasText: "About" }).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByRole("tree", { name: "Page structure" }).getByRole("treeitem", { name: "Section About this project" })).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page, "about/index.html");
  const dialog = page.getByRole("dialog", { name: "Page settings", exact: true });
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("About this project");
  await dialog.locator(".site-settings__footer").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
});
