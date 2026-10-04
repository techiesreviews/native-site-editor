import { expect, test, type Page } from "@playwright/test";
import { makeCollectionTarget } from "../../src/page-builder/page-builder-document";
import { storedDraft, storedDrafts } from "./drafts";

// Renaming or deleting a site file in the Files tab: every page, stylesheet
// and JSON card recipe that uses it follows in the same operation and Undo
// step, or the change is refused. External URLs never change.
test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));

const side = ".editor/page-builder.json";
const item = "work/lifecycle/index.html";
const card = '<article><a href="/work/lifecycle/">Lifecycle</a><img src="/images/studio-desk.svg" alt="Lifecycle"></article>';
const external = '<img src="https://example.com/images/studio-desk.svg" alt="">';
const home = `<!doctype html><html><head><title>Collection proof</title></head><body><main><div id="proof-cards">${card}</div><p>${external}</p></main></body></html>`;
const source = '<!doctype html><html><head><title>Lifecycle</title><meta name="description" content="Original description"><meta property="og:image" content="/images/studio-desk.svg"></head><body><main><h1>Lifecycle</h1></main></body></html>';
const recipe = JSON.stringify({ version: 1, pages: { [item]: { fields: { keep: "yes" } } }, futureKey: { keep: true }, collections: { proof: { pagePath: "index.html", target: makeCollectionTarget(home, home.indexOf("<div")), folders: ["/work/"], sort: "title", filter: "", limit: 500, template: '<article><a href="{url}">{title}</a><img src="{image}" alt="{title}" data-if="image"></article>', fields: [], overrides: {}, outputFingerprint: card } } }, null, 2) + "\n";
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of [["index.html", home], [item, source], [side, recipe]])
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

test("renaming a linked image updates the page, its meta tag, the cards and the JSON recipe as one Undo step", async ({ page, baseURL }) => {
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
  const json = JSON.parse((await storedDraft(page, side))!.content);
  expect(json.futureKey).toEqual({ keep: true });
  expect(json.collections.proof.outputFingerprint).toBe(card.replace("studio-desk", "lifecycle"));
  expect(json.collections.proof.template).toBe(JSON.parse(recipe).collections.proof.template);
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
