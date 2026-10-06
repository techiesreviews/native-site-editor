import { seedCollection } from "./collection-fixture";
import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";

requireActualFixture();

// Renaming a folder that a JSON collection lists, through the Files tree's
// F2, on a copy of the actual starter. The recipe in .editor/page-builder.json
// follows the folder, the generated cards follow the moved page, the public
// HTML stays plain, and one Undo/Redo takes it all back and forth exactly.
const SIDECAR = ".editor/page-builder.json";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const explorer = (page: Page) => page.locator("#explorer");
const row = (page: Page, name: string) => explorer(page).getByRole("button", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const mounted = (page: Page, path = "index.html") => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const servicesPage = `<!doctype html><html><head><title>New services · Larkspur Studio</title><meta name="description" content="About services."></head><body><main><h1>New services</h1></main></body></html>`;
const pageErrors: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
});
test.afterEach(() => expect(pageErrors).toEqual([]));

async function load(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
}

/** Recent work converted to /work/ + /services/, saved, with unrelated sidecar keys on the branch; no drafts. */
async function seeded(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "services/one/index.html", content: servicesPage } });
  await load(page, baseURL);
  await seedCollection(page, baseURL, ["/work/", "/services/"], ["services/one/index.html"]);
  // Unrelated keys the editor must carry through untouched.
  const document = JSON.parse(await file(page, baseURL, SIDECAR));
  document.pages = { ...document.pages, "about/index.html": { fields: { mood: "calm" }, keep: { unknown: true } } };
  document.futureKey = { nested: [1, "two"] };
  const sidecar = JSON.stringify(document, null, 2) + "\n";
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: sidecar } });
  await load(page, baseURL);
  expect(await storedDrafts(page)).toEqual([]);
  return { home: await file(page, baseURL, "index.html"), sidecar, service: await file(page, baseURL, "services/one/index.html") };
}

test("F2 renaming a listed folder moves its recipe and cards; one Undo restores JSON, HTML and pages exactly, Redo repeats it", async ({ page, baseURL }) => {
  const before = await seeded(page, baseURL);
  const was = JSON.parse(before.sidecar);
  const [id] = Object.keys(was.collections);
  expect(was.collections[id].folders).toEqual(["/work/", "/services/"]);
  expect(before.home).toContain('href="/services/one/"');
  expect(before.service).toBe(servicesPage);
  const titles = frame(page).locator('.cards > card-project > h3[slot="title"]');
  await expect(titles).toHaveCount(4);

  // Files tree, real keyboard: focus the folder row, F2, type, Enter, confirm.
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Files" }).click();
  const services = row(page, "services");
  await expect(services).toBeVisible({ timeout: 20_000 });
  await services.focus();
  await page.keyboard.press("F2");
  const input = explorer(page).getByRole("textbox", { name: "New name for services" });
  await expect(input).toBeFocused();
  await input.fill("studio");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Rename services to studio?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(status(page)).toContainText("Renamed the folder services to studio");

  // The recipe follows the folder; every other key is unchanged.
  await expect.poll(async () => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}").collections?.[id]?.folders).toEqual(["/work/", "/studio/"]);
  const afterSidecar = (await storedDraft(page, SIDECAR))!.content;
  const now = JSON.parse(afterSidecar);
  // The target's output fingerprint follows the rebuilt card link too.
  const expected = JSON.parse(before.sidecar.replaceAll("/services/one/", "/studio/one/"));
  expected.collections[id].folders = ["/work/", "/studio/"];
  expect(now).toEqual(expected);
  expect(now.pages["about/index.html"]).toEqual({ fields: { mood: "calm" }, keep: { unknown: true } });
  expect(now.futureKey).toEqual({ nested: [1, "two"] });

  // The generated card links to the moved page and keeps its title; public HTML stays plain.
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain('href="/studio/one/"');
  const afterHome = (await storedDraft(page, "index.html"))!.content;
  expect(afterHome).not.toContain('href="/services/one/"');
  expect(afterHome).toContain("New services");
  expect(afterHome).not.toMatch(/<template|data-each|data-collection-id|data-fields|data-if|\{title\}/);
  expect(afterHome).toBe(before.home.replaceAll("/services/one/", "/studio/one/"));
  expect((await storedDraft(page, "studio/one/index.html"))?.content).toBe(servicesPage);
  const afterDrafts = await storedDrafts(page);
  const afterPaths = afterDrafts.map((draft) => draft.path);
  expect(afterPaths).toEqual([SIDECAR, "_redirects", "index.html", "services/one/index.html", "studio/one/index.html"].sort((a, b) => a.localeCompare(b)));
  expect(afterDrafts.find((draft) => draft.path === "services/one/index.html")?.deleted).toBe(true);
  expect(afterDrafts.find((draft) => draft.path === "studio/one/index.html")?.movedFrom).toBe("services/one/index.html");
  await expect(titles).toHaveCount(4);
  await expect(frame(page).locator(".cards card-project").filter({ hasText: "New services" }).locator('a[slot="link"]')).toHaveAttribute("href", "/studio/one/");

  // One Undo restores JSON, HTML and source pages exactly: no drafts remain.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  // The editor's own mounted source is the proof; the branch files are only a cross-check.
  await expect.poll(() => mounted(page)).toBe(before.home);
  expect(await file(page, baseURL, SIDECAR)).toBe(before.sidecar);
  expect(await file(page, baseURL, "index.html")).toBe(before.home);
  expect(await file(page, baseURL, "services/one/index.html")).toBe(servicesPage);
  await expect(frame(page).locator(".cards card-project").filter({ hasText: "New services" }).locator('a[slot="link"]')).toHaveAttribute("href", "/services/one/");

  // Redo repeats it exactly.
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(afterSidecar);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(afterHome);
  await expect.poll(() => mounted(page)).toBe(afterHome);
  expect(await storedDrafts(page)).toEqual(afterDrafts);
});
