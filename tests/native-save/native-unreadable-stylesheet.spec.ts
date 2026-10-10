import { expect, test, type Page } from "@playwright/test";
import { openPageSettingsFromPages } from "./settings-entry";

// A stylesheet whose bytes are not UTF-8 text (GitHub's text read refuses it
// with 415) is a file the editor cannot read, not a broken site: the page
// that links it paints, the site's text index (read after the paint) skips
// it, the preview shows no error, and editing the page goes on as usual.
const preview = (page: Page) => page.frameLocator(".native-preview-frame");

test("a page linking a stylesheet that is not UTF-8 text paints, indexes and edits", async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/`);
  // Latin-1 bytes (é as 0xE9): not UTF-8.
  const latin1 = Buffer.from('.hero h1::after { content: "é"; }\n', "latin1").toString("base64");
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "styles/latin1.css", base64: latin1 } });
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const linked = home.replace('<link rel="stylesheet" href="/styles/site.css">', '<link rel="stylesheet" href="/styles/site.css">\n  <link rel="stylesheet" href="/styles/latin1.css">');
  expect(linked).not.toBe(home);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: linked } });

  // Every read of the sheet is refused by the real file endpoints.
  let refused = 0;
  page.on("response", (response) => {
    if (/\/api\/files?\?/.test(response.url()) && response.status() === 415) refused++;
  });

  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  // Styled by styles/site.css, which it also links.
  await expect.poll(() => preview(page).locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(246, 247, 243)");
  await expect.poll(() => refused, { message: "the sheet was asked for and refused" }).toBeGreaterThan(0);
  // Said once, as a warning: the sheet is in the branch, so not "missing".
  await expect(page.locator(".native-preview-warning")).toHaveText("styles/latin1.css: This file is not UTF-8 text. The preview shows the site without it.");

  // Page settings waits for the whole site's text index: it opens, so the index finished.
  if (!await page.locator("#explorer").evaluate((element) => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await expect(settings.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Native Studio");
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).toBeHidden();
  await expect(page.locator(".native-preview-error")).toBeHidden();

  // Text on the page still edits.
  if (await page.locator("#explorer").evaluate((element) => element.matches(":popover-open"))) await page.keyboard.press("Escape");
  const heading = preview(page).locator(".hero h1");
  await heading.dblclick();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Still editable");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("Still editable");
  await expect(page.locator("#status")).toHaveText("Text changed");
  await expect(page.locator(".native-preview-error")).toBeHidden();

  // The code pane, which needs the sheet's text, says it cannot open it; the preview stays up.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=styles/latin1.css`);
  await expect(page.locator("#content")).toContainText("This file is not UTF-8 text.", { timeout: 30_000 });
  await expect(preview(page).locator(".hero h1")).toBeVisible();
  await expect(page.locator(".native-preview-error")).toBeHidden();
  expect(pageErrors).toEqual([]);
});
