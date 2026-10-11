import { expect, test, type Page } from "@playwright/test";
import { openPageSettingsFromPages } from "./settings-entry";

// A page whose bytes are not UTF-8 text (GitHub's text read refuses it with
// 415) cannot be drawn. The home page that links it boots as usual; opening
// it later, by a link in the preview or from the Pages list, shows the
// preview's error naming the file rather than a blank page, and the home
// page comes back as before.
const preview = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const error = (page: Page) => page.locator(".native-preview-error");
const message = "about/index.html: This file is not UTF-8 text.";
// Latin-1 bytes (é as 0xE9): not UTF-8.
const latin1 = (html: string) => Buffer.from(html, "latin1").toString("base64");

async function openExplorer(page: Page) {
  if (!await explorer(page).evaluate((element) => element.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Pages", exact: true }).click();
}
async function choosePage(page: Page, name: string) {
  await openExplorer(page);
  await explorer(page).getByRole("treeitem", { name, exact: true }).click();
}
async function homeIsBack(page: Page) {
  await expect(error(page)).toBeHidden();
  await expect(preview(page).locator(".hero h1")).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
}

// Puts `bytes` (base64, from About's source) at `path`, after committing `edit` to About.
async function openSite(page: Page, baseURL: string | undefined, path: string, bytes: (about: string) => string, edit = (about: string) => about) {
  await page.goto(`${baseURL}/`);
  const about = await (await page.request.get(`${baseURL}/__demo/file?path=about/index.html`)).text();
  if (edit(about) !== about) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: edit(about) } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, base64: bytes(about) } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(preview(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
}

test("a page that is not UTF-8 text, opened by a link or from Pages, shows the named error, not a blank preview", async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (failure) => pageErrors.push(failure.message));
  await openSite(page, baseURL, "about/index.html", (about) => latin1(about.replace("</main>", "<p>Caf\u00e9</p>\n</main>")));
  await expect(error(page)).toBeHidden();

  // Followed by a link in the preview, before the text index has read it.
  await preview(page).locator("site-header [data-key='nav-about']").click({ modifiers: ["ControlOrMeta"] });
  await expect(error(page)).toHaveText(message, { timeout: 15_000 });
  await expect(page.locator(".native-preview-frame")).toBeHidden();
  await choosePage(page, "Home");
  await homeIsBack(page);

  // Chosen from Pages: the code pane says so too.
  await choosePage(page, "About");
  await expect(error(page)).toHaveText(message);
  await expect(page.locator("#content")).toContainText("This file is not UTF-8 text.", { timeout: 15_000 });
  await choosePage(page, "Home");
  await homeIsBack(page);

  // The text on the home page still edits.
  if (await explorer(page).evaluate((element) => element.matches(":popover-open"))) await page.keyboard.press("Escape");
  const heading = preview(page).locator(".hero h1");
  await heading.dblclick();
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Back home");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Text changed");
  await expect(error(page)).toBeHidden();
  expect(pageErrors).toEqual([]);
});

// Opens Page settings, which waits for the whole site's text index, and closes it again.
async function waitForTextIndex(page: Page) {
  await openExplorer(page);
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await expect(settings.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Native Studio");
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(settings).toBeHidden();
  if (await explorer(page).evaluate((element) => element.matches(":popover-open"))) await page.keyboard.press("Escape");
}

// Followed at once, the link's page is read before the text index reaches it
// and the template is found unreadable then; later, the index knows both.
for (const indexed of [false, true]) test(`a template only another page uses that is not UTF-8 text is that page's error${indexed ? " once the index knows it" : ", followed before the index"}`, async ({ page, baseURL }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (failure) => pageErrors.push(failure.message));
  await openSite(page, baseURL, "components/odd-block/odd-block.html", () => latin1("<section>Caf\u00e9</section>\n"),
    (about) => about.replace("</main>", "  <odd-block></odd-block>\n</main>"));
  if (indexed) await waitForTextIndex(page);
  await expect(error(page)).toBeHidden();

  await preview(page).locator("site-header [data-key='nav-about']").click({ modifiers: ["ControlOrMeta"] });
  await expect(error(page)).toHaveText("components/odd-block/odd-block.html: This file is not UTF-8 text.", { timeout: 15_000 });
  await expect(page.locator(".native-preview-frame")).toBeHidden();
  await choosePage(page, "Home");
  await homeIsBack(page);
  expect(pageErrors).toEqual([]);
});
