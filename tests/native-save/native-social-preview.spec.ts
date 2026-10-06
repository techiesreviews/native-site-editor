import { openPageSettingsFromPages, openNavigationFromPages } from "./settings-entry";
import { requireActualFixture } from "./fixture-contract";
import { expect, test } from "@playwright/test";

requireActualFixture();

// The share card preview in Page settings shows the page's social image without
// loading anything from another site: an absolute URL at the site's own canonical
// address is read from the repository; any other absolute URL is not previewed.
// Runs on a copy of the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
test("the share card previews the site's own absolute image from the repository and never loads another site's", { tag: "@actual" }, async ({ page, baseURL }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request) => { if (!request.url().startsWith(baseURL!) && /^https?:/.test(request.url())) external.push(request.url()); });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByRole("tab", { name: "Social", exact: true }).click();
  const image = settings.getByLabel("Social image", { exact: true });
  await expect(image).toHaveValue("https://native-site-editor-starter-test.lexvd.workers.dev/images/social-card.png");
  const photo = settings.getByLabel("Share card preview").locator("img");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await image.fill("https://other.example/card.png");
  await expect(settings.getByLabel("Share card preview")).toContainText("Image preview unavailable");
  await expect(photo).toBeHidden();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('.pages-settings[role="group"][aria-label="Page"]')).toHaveCount(0);
  await openNavigationFromPages(page);
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
});
