import { expect, test, type Page } from "@playwright/test";
import { openPageSettingsFromPages } from "./settings-entry";

// A stylesheet whose bytes are not UTF-8 text (GitHub's text read refuses it
// with 415) is a file the editor cannot read, not a broken site: the page
// that links it paints, the site's text index (read after the paint) skips
// it, the preview shows no error, and editing the page goes on as usual.
const preview = (page: Page) => page.frameLocator(".native-preview-frame");
// Latin-1 bytes (é as 0xE9): not UTF-8.
const latin1 = (css: string) => Buffer.from(css, "latin1").toString("base64");
const background = (page: Page) => preview(page).locator("body").evaluate((element) => getComputedStyle(element).backgroundColor);

// Opens Page settings, which waits for the whole site's text index, and closes it again.
async function waitForTextIndex(page: Page) {
  if (!await page.locator("#explorer").evaluate((element) => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await expect(settings.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Native Studio");
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).toBeHidden();
}

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
  await expect.poll(() => background(page)).toBe("rgb(246, 247, 243)");
  await expect.poll(() => refused, { message: "the sheet was asked for and refused" }).toBeGreaterThan(0);
  // Said once, as a warning: the sheet is in the branch, so not "missing".
  await expect(page.locator(".native-preview-warning")).toHaveText("styles/latin1.css: This file is not UTF-8 text. The preview shows the site without it.");

  await waitForTextIndex(page);
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

// The case slice 17 met: a sheet no page links, in a dot-folder the boot
// never predicts, so the text index after the paint is the first to ask.
test("the text index meeting an unreadable stylesheet after the paint skips it, with no preview error", async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: ".theme/latin1.css", base64: latin1('.x::after { content: "\u00e9"; }\n') } });
  const sha = await page.evaluate(async () => {
    const snapshot = await (await fetch("/api/snapshot?repo=native-demo-user%2Fnative-demo&branch=main", { credentials: "same-origin" })).json() as { tree: { path: string; sha: string }[] };
    return snapshot.tree.find((entry) => entry.path === ".theme/latin1.css")!.sha;
  });
  // Its reads wait until the page is on screen, then GitHub refuses them.
  let release!: () => void;
  const painted = new Promise<void>((resolve) => { release = resolve; });
  let asked = 0, refused = 0;
  page.on("response", (response) => { if (/\/api\/files?\?/.test(response.url()) && response.status() === 415) refused++; });
  await page.route(/\/api\/files?\?/, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if ([...(params.get("shas")?.split(",") ?? []), params.get("sha")].includes(sha)) { asked++; await painted; }
    await route.continue();
  });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  expect(refused).toBe(0);
  release();
  await expect.poll(() => refused, { message: "the text index asked for the sheet and was refused", timeout: 15_000 }).toBeGreaterThan(0);
  expect(asked).toBeGreaterThan(0);
  await waitForTextIndex(page);
  await expect(page.locator(".native-preview-warning")).toHaveText(".theme/latin1.css: This file is not UTF-8 text. The preview shows the site without it.");
  await expect(page.locator(".native-preview-error")).toBeHidden();
  // Text on the page still edits.
  if (await page.locator("#explorer").evaluate((element) => element.matches(":popover-open"))) await page.keyboard.press("Escape");
  const heading = preview(page).locator(".hero h1");
  await heading.dblclick();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited after the index");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Text changed");
  await expect(page.locator(".native-preview-error")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("an imported stylesheet and a component's stylesheet that are not UTF-8 text are left out without an error", async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/`);
  const site = await (await page.request.get(`${baseURL}/__demo/file?path=styles/site.css`)).text();
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "styles/latin1.css", base64: latin1('.hero h1::after { content: "\u00e9"; }\n') } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "styles/site.css", content: `@import "latin1.css";\n${site}` } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/site-footer/site-footer.css", base64: latin1('footer::after { content: "\u00e9"; }\n') } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(preview(page).locator("site-footer")).toBeVisible();
  await expect.poll(() => background(page)).toBe("rgb(246, 247, 243)");
  await waitForTextIndex(page);
  await expect(page.locator(".native-preview-warning")).toContainText("styles/latin1.css: This file is not UTF-8 text.");
  await expect(page.locator(".native-preview-warning")).toContainText("components/site-footer/site-footer.css: This file is not UTF-8 text.");
  await expect(page.locator(".native-preview-error")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

// Small sites read every component template with the page: one the page
// does not use is only skipped, while one it uses cannot be drawn.
test("an unreadable template the page does not use is skipped; one it uses is the preview's error", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/odd-block/odd-block.html", base64: latin1("<section>\u00e9</section>\n") } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await waitForTextIndex(page);
  await expect(page.locator(".native-preview-error")).toBeHidden();

  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "components/site-footer/site-footer.html", base64: latin1("<footer>\u00e9</footer>\n") } });
  await page.reload();
  await expect(page.locator(".native-preview-error")).toHaveText("components/site-footer/site-footer.html: This file is not UTF-8 text.", { timeout: 30_000 });
});
