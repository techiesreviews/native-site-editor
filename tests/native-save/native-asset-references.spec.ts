import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

// Renaming or deleting a site file in the Files tab: every page and stylesheet
// that uses it follows in the same operation and Undo step, or the change is
// refused. External URLs never change.
test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const side = ".editor/page-builder.json";
const item = "work/lifecycle/index.html";
const card = '<article><a href="/work/lifecycle/">Lifecycle</a><img src="/images/studio-desk.svg" alt="Lifecycle"></article>';
const external = '<img src="https://example.com/images/studio-desk.svg" alt="">';
const home = `<!doctype html><html><head><title>Card proof</title></head><body><main><div id="proof-cards">${card}</div><p>${external}</p></main></body></html>`;
const source = '<!doctype html><html><head><title>Lifecycle</title><meta name="description" content="Original description"><meta property="og:image" content="/images/studio-desk.svg"></head><body><main><h1>Lifecycle</h1></main></body></html>';
const sidecarText = JSON.stringify({ version: 1, pages: { [item]: { sections: { keep: "yes" } } }, futureKey: { keep: true } }, null, 2) + "\n";
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [["index.html", home], [item, source], [side, sidecarText]])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await expect(page.frameLocator(".native-preview-frame").locator("#proof-cards a")).toHaveText("Lifecycle");
  expect(await storedDrafts(page)).toEqual([]);
  await page.locator("#explorer-toggle").click();
  const explorer = page.locator("#explorer");
  await explorer.getByRole("tab", { name: "Files", exact: true }).click();
  const images = explorer.getByRole("button", { name: "images", exact: true });
  if (await images.getAttribute("aria-expanded") === "false") await images.click();
  return explorer;
}

test("renaming a linked image updates the page, its meta tag and the cards as one Undo step", async ({ page, baseURL }) => {
  const explorer = await seed(page, baseURL);
  await explorer.getByRole("button", { name: "studio-desk.svg", exact: true }).focus();
  await page.keyboard.press("F2");
  await explorer.getByRole("textbox", { name: "New name for images/studio-desk.svg" }).fill("lifecycle.svg");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toHaveText("Renamed images/studio-desk.svg to images/lifecycle.svg.");
  await expect.poll(async () => (await storedDraft(page, item))?.content).toBe(source.replace("/images/studio-desk.svg", "/images/lifecycle.svg"));
  const renamedHome = home.replace('src="/images/studio-desk.svg"', 'src="/images/lifecycle.svg"');
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(renamedHome);
  // The external image with the same file name is not this site's file.
  expect(renamedHome).toContain(external);
  expect(await storedDraft(page, side)).toBeUndefined();
  expect((await storedDraft(page, "images/lifecycle.svg"))).toBeTruthy();
  // One Undo puts every file back; Redo does it again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page, "index.html")).toBe(home);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(renamedHome);
  await expect.poll(async () => (await storedDraft(page, item))?.content).toContain('content="/images/lifecycle.svg"');
});

test("deleting an image that pages and cards use is refused and changes nothing", async ({ page, baseURL }) => {
  const explorer = await seed(page, baseURL);
  await explorer.getByRole("button", { name: "studio-desk.svg", exact: true }).click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for images/studio-desk.svg" }).getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.locator("#status")).toHaveText("images/studio-desk.svg is used by index.html, work/lifecycle/index.html. Remove or replace those references first; nothing was deleted.");
  await expect(page.getByRole("dialog", { name: /^Delete images\/studio-desk\.svg/ })).toHaveCount(0);
  expect(await storedDrafts(page)).toEqual([]);
});

test("renaming a folder with a page and its image moves every reference, keeps the page's own relative path, and Undo restores all", async ({ page, baseURL }) => {
  const photo = "/work/lifecycle/photo.svg";
  const itemSource = source.replace("/images/studio-desk.svg", photo).replace("<h1>Lifecycle</h1>", '<h1>Lifecycle</h1><img src="photo.svg" alt="">');
  const extra = `<p><img srcset="${photo} 2x" src="${photo}" alt=""></p>`;
  const folderCard = card.replace("/images/studio-desk.svg", photo);
  const folderHome = `<!doctype html><html><head><title>Card proof</title><meta property="og:image" content="${photo}"></head><body><main><div id="proof-cards">${folderCard}</div>${extra}</main></body></html>`;
  const folderSidecar = JSON.parse(sidecarText);
  await page.goto(baseURL!);
  for (const [path, content] of [["index.html", folderHome], [item, itemSource], [side, JSON.stringify(folderSidecar, null, 2) + "\n"], ["work/lifecycle/photo.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>']])
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } })).status()).toBe(204);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.frameLocator(".native-preview-frame").locator("#proof-cards a")).toHaveText("Lifecycle");
  await page.locator("#explorer-toggle").click();
  const explorer = page.locator("#explorer");
  await explorer.getByRole("tab", { name: "Files", exact: true }).click();
  const work = explorer.getByRole("button", { name: "work", exact: true });
  if (await work.getAttribute("aria-expanded") === "false") await work.click();
  await explorer.getByRole("button", { name: "lifecycle", exact: true }).focus();
  await page.keyboard.press("F2");
  await explorer.getByRole("textbox", { name: "New name for work/lifecycle" }).fill("renamed");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /^Rename work\/lifecycle to work\/renamed/ });
  // Without redirects, nothing may be left pointing at the old folder.
  const keep = dialog.getByRole("checkbox");
  if (await keep.count() && await keep.isChecked()) await keep.uncheck();
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Renamed the folder work/lifecycle to work/renamed");
  const moved = "/work/renamed/photo.svg";
  await expect.poll(async () => (await storedDraft(page, "work/renamed/index.html"))?.content).toBe(itemSource.replace(photo, moved));
  const homeAfter = (await storedDraft(page, "index.html"))!.content;
  expect(homeAfter).not.toContain("/work/lifecycle/");
  expect(homeAfter).toContain(`<meta property="og:image" content="${moved}">`);
  expect(homeAfter).toContain(`<img srcset="${moved} 2x" src="${moved}" alt="">`);
  expect(homeAfter).toContain(`<article><a href="/work/renamed/">Lifecycle</a><img src="${moved}" alt="Lifecycle"></article>`);
  const json = JSON.parse((await storedDraft(page, side))!.content);
  expect(json.futureKey).toEqual({ keep: true });
  expect(json.pages["work/renamed/index.html"]).toEqual({ sections: { keep: "yes" } });
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page, "index.html")).toBe(folderHome);
});

test("a reference added in another tab while the Delete dialog is open stops the delete", async ({ page, baseURL, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const explorer = await seed(page, baseURL);
  const css = await (await page.request.get(`${baseURL}/__demo/file?path=styles/site.css`)).text();
  await explorer.getByRole("button", { name: "placeholder.svg", exact: true }).click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for images/placeholder.svg" }).getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: /^Delete images\/placeholder\.svg/ });
  await expect(dialog).toBeVisible();
  // Meanwhile another tab of the same site starts using the image in the stylesheet.
  const other = await context.newPage();
  await other.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("styles/site.css")}`);
  await expect(other.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  const used = css + "\n.used { background: url(/images/placeholder.svg); }\n";
  await other.evaluate((text) => navigator.clipboard.writeText(text), used);
  await other.locator('#content [role="textbox"]').first().evaluate((el) => (el as HTMLElement).focus());
  await other.keyboard.press("ControlOrMeta+A");
  await other.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await storedDraft(other, "styles/site.css"))?.content).toBe(used);
  await other.close();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#explorer")).toContainText("The repository or source changed meanwhile. Try again.");
  await expect(page.locator("#explorer").getByRole("button", { name: "placeholder.svg", exact: true })).toBeVisible();
  expect(await storedDraft(page, "images/placeholder.svg")).toBeUndefined();
  expect((await storedDraft(page, "styles/site.css"))?.content).toBe(used);
});
