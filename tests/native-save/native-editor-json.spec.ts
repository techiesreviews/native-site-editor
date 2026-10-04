import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

requireActualFixture();

// Collections keep their recipes in .editor/page-builder.json; the page HTML
// holds finished cards only. Runs on a copy of the actual starter:
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path = "index.html") => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const inspector = (page: Page) => page.getByRole("region", { name: "Collection settings", exact: true });
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const extra: [string, string][] = [["services/one/index.html", `<!doctype html><html><head><title>New services · Larkspur Studio</title><meta name="description" content="About services."></head><body><main><h1>New services</h1></main></body></html>`]];

async function load(page: Page, baseURL: string | undefined, path = "index.html") {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openCollection(page: Page) {
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  return details;
}
async function convert(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of extra) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await load(page, baseURL);
  const before = await mounted(page);
  await openCollection(page);
  // Selecting and opening writes nothing.
  expect(await storedDrafts(page)).toEqual([]);
  await inspector(page).getByRole("checkbox", { name: "/services/", exact: true }).check();
  await inspector(page).getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"pagePath": "index.html"');
  return before;
}

test("a grid's recipe goes to the editor's JSON, the HTML stays plain, and Save commits both", async ({ page, baseURL }) => {
  const before = await convert(page, baseURL);
  const home = (await storedDraft(page, "index.html"))!.content;
  const sidecar = (await storedDraft(page, SIDECAR))!.content;
  expect(home).not.toMatch(/<template|data-each|data-collection-id|data-fields|data-if|\{title\}/);
  await expect(frame(page).locator(".cards card-project")).toHaveCount(4);
  // One Undo takes back both files; Redo writes both again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(sidecar);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  expect(await file(page, baseURL, "index.html")).toBe(home);
  expect(await file(page, baseURL, SIDECAR)).toBe(sidecar);
  // Reloaded, the saved JSON reads back as this grid's collection; browsing writes nothing.
  await load(page, baseURL);
  await openCollection(page);
  await expect(inspector(page).getByRole("heading", { name: "Edit collection" })).toBeVisible();
  await expect(inspector(page).getByRole("checkbox", { name: "/services/", exact: true })).toBeChecked();
  expect(await storedDrafts(page)).toEqual([]);
  // Without the editor, the saved page is a finished static page: every card is there.
  const published = await file(page, baseURL, "index.html");
  for (const text of ["Fern &amp; Kettle", "Harbour Lane Pottery", "Meadow Row Allotments", "New services", "Read about New services"]) expect(published).toContain(text);
});

test("a hand edit to the cards blocks a later title change until rebuilt, and Rebuild is one Undo", async ({ page, baseURL }) => {
  await convert(page, baseURL);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const saved = await file(page, baseURL, "index.html");
  await load(page, baseURL);
  const at = saved.indexOf("Read about New services");
  await page.evaluate(async (at) => (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at + 10, text: "Learn", expected: "Read about" }), at);
  const edited = saved.slice(0, at) + "Learn" + saved.slice(at + 10);
  await expect.poll(() => mounted(page)).toBe(edited);
  // Retitling a listed page would rebuild the cards: refused, nothing else written.
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(edited);
  await load(page, baseURL, "services/one/index.html");
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("Services renamed");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(page.getByText(/index\.html were edited by hand/).first()).toBeVisible();
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["index.html"]);
  expect((await storedDraft(page, "index.html"))!.content).toBe(edited);
  await load(page, baseURL);
  const details = await openCollection(page);
  await expect(details).toContainText("edited by hand");
  await details.getByRole("button", { name: "Rebuild cards from page data", exact: true }).click();
  await expect.poll(() => mounted(page)).toBe(saved);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(edited);
});

test("Use manual cards drops the JSON recipe and keeps the edited cards exactly", async ({ page, baseURL }) => {
  await convert(page, baseURL);
  const home = (await storedDraft(page, "index.html"))!.content;
  const at = home.indexOf("Read about New services");
  await page.evaluate(async (at) => (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at + 10, text: "Learn", expected: "Read about" }), at);
  const edited = home.slice(0, at) + "Learn" + home.slice(at + 10);
  await expect.poll(() => mounted(page)).toBe(edited);
  const details = await openCollection(page);
  await details.getByRole("button", { name: "Use manual cards", exact: true }).click();
  await expect.poll(async () => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}").collections).toEqual({});
  expect(await mounted(page)).toBe(edited);
});
