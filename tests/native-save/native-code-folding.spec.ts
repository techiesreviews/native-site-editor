import { expect, test } from "@playwright/test";

// A page opens in the code editor with its <head>, sections and multi-line
// components collapsed; single-line elements have nothing to fold.

test("the head and every section open collapsed in the code editor", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  const lines = page.locator("#content .view-lines");
  await expect(lines).toContainText('<section class="hero"', { timeout: 30_000 });
  await expect(lines).toContainText("<head>");
  await expect(lines).toContainText("<site-header");
  await expect(lines).not.toContainText("<title>");
  await expect(lines).not.toContainText("A native browser preview");
  await expect(lines).not.toContainText("Reusable cards");

  // The gutter arrow opens a collapsed element.
  await page.locator("#content .codicon-folding-collapsed").first().click({ force: true });
  await expect(lines).toContainText("<title>");
});
