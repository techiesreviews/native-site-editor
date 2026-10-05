import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton, showPublish } from "./publish";

// Whole-page metadata in .editor/page-builder.json follows the page through the Files tree: a page
// whose section and header were saved shared (actual Save shared, then saved to GitHub) keeps its
// whole entry when its folder is renamed, loses it when the page is deleted, and a move onto a
// leftover entry for a missing file is refused. Private masters and every other key stay as they
// were; one Undo and one Redo take each change back and forth exactly.
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Requires the native static starter.");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();
const PAGE = "about/index.html";
const JSON_PATH = ".editor/page-builder.json";
const MASTERS = [".editor/sections/about-hero.html", ".editor/page-parts/site-head.html"];
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const explorer = (page: Page) => page.locator("#explorer");
const fileRow = (page: Page, name: string) => explorer(page).getByRole("button", { name, exact: true });
const status = (page: Page) => page.locator("#status");
const branch = async (page: Page, baseURL: string | undefined, path: string) => {
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
};
const effective = async (page: Page, baseURL: string | undefined, path: string) => {
  const draft = await storedDraft(page, path);
  if (draft) return draft.deleted ? undefined : draft.content;
  return branch(page, baseURL, path);
};
const snapshot = async (page: Page, baseURL: string | undefined, paths: string[]) => Object.fromEntries(await Promise.all(paths.map(async path => [path, await effective(page, baseURL, path)] as const)));
const json = async (page: Page, baseURL: string | undefined) => JSON.parse((await effective(page, baseURL, JSON_PATH)) ?? "{}");

async function open(page: Page, baseURL: string | undefined, path = PAGE) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(status(page)).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("header.site-header")).toBeVisible();
}
const row = (page: Page, name: RegExp) => structure(page).getByRole("treeitem", { name }).first();
async function share(page: Page, rowName: RegExp, kind: string, id: string, label: string) {
  await row(page, rowName).hover();
  await row(page, rowName).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: `Share ${kind}` });
  await form.getByRole("textbox", { name: "Name" }).fill(label);
  await form.getByRole("textbox", { name: "ID" }).fill(id);
  const sheet = form.getByLabel("Stylesheet");
  if (await sheet.evaluate(el => el instanceof HTMLSelectElement)) await sheet.selectOption("styles/site.css");
  await form.getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, new RegExp(label)).getByRole("button", { name: "Edit component" })).toBeAttached();
}

/**
 * The about page's section and header saved shared and saved to GitHub, then — through the fake
 * GitHub's own external edit, as another writer would — opaque data added to its entry, a foreign
 * page entry and a future top-level key. Returns the branch bytes, with no drafts left.
 */
async function seeded(page: Page, baseURL: string | undefined, extraPages: Record<string, unknown> = {}) {
  await open(page, baseURL);
  await share(page, /^Section About Larkspur/, "section", "about-hero", "About hero");
  await share(page, /^Header/, "header", "site-head", "Site header");
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const document = JSON.parse((await branch(page, baseURL, JSON_PATH))!);
  expect(document.pages[PAGE].sections).toBeTruthy();
  expect(document.pages[PAGE].pageParts).toBeTruthy();
  document.pages[PAGE].keep = { opaque: [1, "two"] };
  document.pages = { ...document.pages, "index.html": { fields: { mood: "calm" }, foreign: { untouched: true } }, ...extraPages };
  document.futureKey = { nested: true };
  const sidecar = JSON.stringify(document, null, 2) + "\n";
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: JSON_PATH, content: sidecar } })).status()).toBe(204);
  await open(page, baseURL, "index.html");
  expect(await storedDrafts(page)).toEqual([]);
  return { sidecar, document, files: await snapshot(page, baseURL, [PAGE, "index.html", ...MASTERS, JSON_PATH]) };
}

async function filesTab(page: Page) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Files" }).click();
}
async function renameFolder(page: Page, from: string, to: string) {
  await filesTab(page);
  const folder = fileRow(page, from);
  await expect(folder).toBeVisible({ timeout: 20_000 });
  await folder.focus();
  await page.keyboard.press("F2");
  const input = explorer(page).getByRole("textbox", { name: `New name for ${from}` });
  await expect(input).toBeFocused();
  await input.fill(to);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: `Rename ${from} to ${to}?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
}

test("renaming a shared page's folder carries its whole metadata entry; deleting it removes the entry; each is one exact Undo/Redo", async ({ page, baseURL }) => {
  const before = await seeded(page, baseURL);
  const entry = before.document.pages[PAGE];

  await renameFolder(page, "about", "studio");
  await expect(status(page)).toContainText("Renamed the folder about to studio");
  await expect.poll(async () => Object.keys((await json(page, baseURL)).pages ?? {}).sort()).toEqual(["index.html", "studio/index.html"]);
  const moved = await json(page, baseURL);
  // The whole entry moves under its new key: sections, page parts and opaque data alike.
  const expected = structuredClone(before.document);
  delete expected.pages[PAGE];
  expected.pages["studio/index.html"] = entry;
  expect(moved).toEqual(expected);
  // Pages and masters change only by links to the moved URL; masters stay at their own paths.
  const rebased = (text: string | undefined) => text!.replaceAll("/about/", "/studio/");
  expect(await effective(page, baseURL, "studio/index.html")).toBe(rebased(before.files[PAGE]));
  expect(await effective(page, baseURL, "index.html")).toBe(rebased(before.files["index.html"]));
  expect(await effective(page, baseURL, PAGE)).toBeUndefined();
  for (const path of MASTERS) expect(await effective(page, baseURL, path)).toBe(rebased(before.files[path]));
  const afterMove = await storedDrafts(page);
  // Every other draft is a link rebase of its branch bytes, or the redirect for the old URL.
  for (const draft of afterMove) {
    if (draft.path === PAGE) expect(draft.deleted).toBe(true);
    else if (draft.path === "studio/index.html") expect(draft.movedFrom).toBe(PAGE);
    else if (draft.path === "_redirects") expect(draft.content).toContain("/about/ /studio/");
    else if (draft.path !== JSON_PATH) expect(draft.content, draft.path).toBe(rebased(await branch(page, baseURL, draft.path)));
  }

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await snapshot(page, baseURL, [PAGE, "index.html", ...MASTERS, JSON_PATH])).toEqual(before.files);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual(afterMove);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);

  // Deleting the linked page from its Files menu drops its whole entry and nothing else.
  await filesTab(page);
  const folder = fileRow(page, "about");
  if ((await folder.getAttribute("aria-expanded")) === "false") await folder.click();
  await explorer(page).locator(`.file-row[data-path="${PAGE}"]`).click({ button: "right" });
  const menu = page.getByRole("menu", { name: `Actions for ${PAGE}` });
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: `Delete ${PAGE}?` }).getByRole("button", { name: "Delete" }).click();
  await expect(status(page)).toContainText(`Deleted ${PAGE}`);
  await expect.poll(async () => Object.keys((await json(page, baseURL)).pages ?? {})).toEqual(["index.html"]);
  const removed = structuredClone(before.document);
  delete removed.pages[PAGE];
  expect(await json(page, baseURL)).toEqual(removed);
  for (const path of ["index.html", ...MASTERS]) expect(await effective(page, baseURL, path)).toBe(before.files[path]);
  const afterDelete = await storedDrafts(page);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await snapshot(page, baseURL, [PAGE, "index.html", ...MASTERS, JSON_PATH])).toEqual(before.files);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => storedDrafts(page)).toEqual(afterDelete);
});

test("a folder rename onto a page key that only has leftover metadata is refused, writing nothing", async ({ page, baseURL }) => {
  const leftover = { fields: { note: "An old page" }, orphan: { kept: true } };
  const before = await seeded(page, baseURL, { "studio/index.html": leftover });
  expect(before.files["studio/index.html" as never]).toBeUndefined();

  await renameFolder(page, "about", "studio");
  // The existing planner's refusal shows at the rename field, and nothing is written.
  await expect(explorer(page).locator(".file-rename__message")).toContainText("studio/index.html already has page data");
  await page.waitForTimeout(500);
  expect(await storedDrafts(page)).toEqual([]);
  expect(await snapshot(page, baseURL, [PAGE, "index.html", ...MASTERS, JSON_PATH])).toEqual(before.files);
  expect(await effective(page, baseURL, "studio/index.html")).toBeUndefined();
  expect(JSON.parse(before.files[JSON_PATH]!).pages["studio/index.html"]).toEqual(leftover);
  // The rename field stays open and focused with what was typed, so it can be changed or cancelled.
  const input = explorer(page).getByRole("textbox", { name: "New name for about" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("studio");
  await page.keyboard.press("Escape");
  await expect(fileRow(page, "about")).toBeFocused();
  expect(await storedDrafts(page)).toEqual([]);
});

// A folder rename rewrites /about/ links in the public header and in its private master alike.
// That site-managed rewrite is not a customisation: the moved page's pristine header copy must
// still count as unchanged, so the master's Update copies writes it.
test("after a folder rename rebases a pristine shared header, Update copies from its master still updates the moved page", async ({ page, baseURL }) => {
  const MASTER = ".editor/page-parts/site-head.html";
  const MOVED = "studio/index.html";
  await open(page, baseURL);
  await share(page, /^Header/, "header", "site-head", "Site header");
  await showPublish(page);
  for (const box of await page.locator("#publish-files .publish-menu__file input").all()) await box.check();
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const saved = await snapshot(page, baseURL, [PAGE, MASTER, JSON_PATH]);
  // Pristine at save: the page's header is the master byte for byte, and both link /about/.
  const header = (source: string | undefined) => source!.match(/<header class="site-header">[\s\S]*?<\/header>/)![0];
  expect(header(saved[PAGE])).toBe(saved[MASTER]);
  expect(saved[MASTER]).toContain('href="/about/"');

  await renameFolder(page, "about", "studio");
  await expect(status(page)).toContainText("Renamed the folder about to studio");
  await expect.poll(async () => (await effective(page, baseURL, MOVED)) ?? "").toContain('href="/studio/"');
  const moved = await snapshot(page, baseURL, [MOVED, MASTER, JSON_PATH]);
  // The rewrite kept them identical to each other: still pristine.
  expect(moved[MASTER]).toBe(saved[MASTER]!.replaceAll("/about/", "/studio/"));
  expect(header(moved[MOVED])).toBe(moved[MASTER]);

  // Through the Pages tree to the moved page (its drafts are not saved, so the status is not "Up to date").
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
  await explorer(page).getByRole("treeitem", { name: "About · Larkspur Studio" }).click();
  await expect(page.locator("#primary-title")).toHaveText(MOVED);
  if (await explorer(page).isVisible()) await page.locator("#explorer-toggle").click();
  await row(page, /Site header/).hover();
  await row(page, /Site header/).getByRole("button", { name: "Edit component" }).click();
  const banner = page.getByRole("region", { name: "Shared header master" });
  await expect(banner).toBeVisible();
  await expect(page.locator("#primary-title")).toHaveText(MASTER);
  const edited = moved[MASTER]!.replace(">Larkspur</a>", ">Larkspur Studio</a>");
  expect(edited).not.toBe(moved[MASTER]);
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate(value => navigator.clipboard.writeText(value), edited);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => effective(page, baseURL, MASTER)).toBe(edited);
  await banner.getByRole("button", { name: "Update copies" }).click();
  // The moved copy was unchanged by the person, so Update writes it.
  await expect.poll(async () => header(await effective(page, baseURL, MOVED)), { timeout: 5_000 }).toBe(edited);
  expect(await effective(page, baseURL, MOVED)).toBe(moved[MOVED]!.replace(moved[MASTER]!, edited));
});
