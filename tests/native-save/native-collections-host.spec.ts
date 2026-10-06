import { openPageSettingsFromPages } from "./settings-entry";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { storedDraft, storedDrafts } from "./drafts";

// Collections through the real host: Monaco, native preview, drafts, Undo/Redo.
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const record = (title: string, date: string, extra = "") =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="date" content="${date}">${extra}\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;
const listing = `<section class="cards" data-key="work-list" data-each="/work/" data-sort="-date"><template><article><a href="{url}">{title}</a><time>{date}</time></article></template></section>`;

const fixtureFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? fixtureFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
/** Home with the listing already baked, as the editor would have saved it: hand-free, canonical cards. */
function bakedHome(home: string, pages: [string, string][]) {
  const root = "fixtures/native-starter";
  const sources: Record<string, string> = {};
  for (const file of fixtureFiles(root)) if (/\.html?$/i.test(file)) sources[relative(root, file)] = readFileSync(file, "utf8");
  for (const [path, content] of pages) sources[path] = content;
  sources["index.html"] = home;
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), { name: "" });
  if ("error" in baked) throw new Error(baked.error);
  return applyCollectionEdits(home, baked.edits["index.html"] ?? []);
}
async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const pages: [string, string][] = [
    ["work/one/index.html", record("One", "2025-01-01")],
    ["work/two/index.html", record("Two", "2026-01-01")],
  ];
  const edits: [string, string][] = [...pages, ["index.html", bakedHome(home.replace('<section class="filler"', `${listing}\n  <section class="filler"`), pages)]];
  for (const [path, content] of edits) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
}
async function open(page: Page, baseURL: string | undefined, file: string) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openPageSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  await expect(dialog(page, "Page settings")).toBeVisible();
  return dialog(page, "Page settings");
}
const homeDraft = async (page: Page) => (await storedDraft(page, "index.html"))?.content ?? "";

test("page metadata changes bake the listing title", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/two/index.html");
  const panel = await openPageSettings(page);
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("Two, retitled");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  await expect.poll(() => homeDraft(page)).toContain(">Two, retitled</a>");
  const two = (await storedDraft(page, "work/two/index.html"))!.content;
  expect(two).toContain('<meta name="date" content="2026-01-01">');
  expect(two).not.toContain("field:");
  // The home page renders the baked plain HTML.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator('[data-key="work-list"] article a').first()).toHaveText("Two, retitled");
});

const explorerRow = (page: Page, name: string) => page.locator("#explorer").getByRole("button", { name, exact: true });
async function openFiles(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
}
const listingOf = (home: string) => home.slice(home.indexOf('data-key="work-list"'), home.indexOf("</section>", home.indexOf('data-key="work-list"')));

test("renaming the collection's folder rewrites its scope and card URLs in one Undo/Redo", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "index.html");
  const before = await mounted(page, "index.html");
  await openFiles(page);
  await explorerRow(page, "work").focus();
  await page.keyboard.press("F2");
  await page.locator("#explorer").getByRole("textbox", { name: "New name for work" }).fill("projects");
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: "Rename work to projects?" });
  await confirm.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator("#status")).toContainText("Renamed the folder work to projects");
  const home = await homeDraft(page);
  expect(home).toContain('data-each="/projects/"');
  expect(listingOf(home)).toContain('href="/projects/one/"');
  expect(listingOf(home)).not.toContain('href="/work/');
  expect(await storedDraft(page, "projects/one/index.html")).toBeDefined();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "projects/one/index.html")).toBeUndefined();
  expect(await mounted(page, "index.html")).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => homeDraft(page)).toBe(home);
});

test("deleting a collection page folder drops its card in the same Undo/Redo", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "index.html");
  await openFiles(page);
  const work = explorerRow(page, "work").first();
  if ((await work.getAttribute("aria-expanded")) === "false") await work.click();
  await explorerRow(page, "two").click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for work/two" }).getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: /^Delete .*work\/two/ }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#status")).toContainText("Deleted the folder work/two");
  const home = await homeDraft(page);
  expect(listingOf(home)).toContain(">One</a>");
  expect(listingOf(home)).not.toContain(">Two</a>");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => homeDraft(page)).toBe(home);
});

test("Add on an automatic listing creates only the page; the bake adds exactly one card, one Undo/Redo", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  // The seeded listing is already baked, so its cards are on Home. Before, the test baked it
  // through Page settings; that is now refused for an unbuilt listing, so the seed holds the
  // editor's own bake and the mounted bytes are the branch bytes, with no draft.
  await open(page, baseURL, "index.html");
  const baked = await mounted(page, "index.html");
  expect(baked).toBe(await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text());
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  expect(listingOf(baked)).toContain('href="/work/one/"');
  const articles = frame(page).locator('[data-key="work-list"] article');
  await expect(articles).toHaveCount(2);
  await articles.first().hover();
  await page.locator(".card-ghost__add").click();
  await page.getByRole("textbox", { name: "Page title" }).fill("Three");
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Created the page Three at /work/three/");
  const three = (await storedDraft(page, "work/three/index.html"))!.content;
  expect(three).toContain("Three");
  const home = await homeDraft(page);
  expect(listingOf(home).split('href="/work/three/"').length - 1).toBe(1);
  expect(home).toContain("<template><article><a href=\"{url}\">{title}</a><time>{date}</time></article></template>");
  await expect(articles).toHaveCount(3);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "work/three/index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  expect(await mounted(page, "index.html")).toBe(baked);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => homeDraft(page)).toBe(home);
  expect((await storedDraft(page, "work/three/index.html"))?.content).toBe(three);
});

test("an asset delete is not blocked by an invalid listing elsewhere and writes nothing else", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: home.replace('<section class="filler"', `<section data-each="work"><template><p>{title}</p></template></section>\n  <section class="filler"`) } });
  await open(page, baseURL, "index.html");
  await page.waitForLoadState("networkidle");
  const fetched: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/files")) fetched.push(request.url()); });
  await openFiles(page);
  const images = explorerRow(page, "images").first();
  if ((await images.getAttribute("aria-expanded")) === "false") await images.click();
  await explorerRow(page, "studio-desk.svg").click({ button: "right" });
  await page.getByRole("menu", { name: "Actions for images/studio-desk.svg" }).getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: /^Delete images\/studio-desk\.svg/ }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("#status")).toHaveText("Deleted images/studio-desk.svg.");
  expect((await storedDraft(page, "images/studio-desk.svg"))?.deleted).toBe(true);
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  // Only the deleted file's own blob (kept for Undo) is read: no page index.
  expect(fetched.length).toBeLessThanOrEqual(1);
  for (const url of fetched) expect(new URL(url).searchParams.get("shas")?.split(",")).toHaveLength(1);
});

test("an unrelated page edit and move go ahead while another page's listing is broken; changing that page is refused", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  // About lists /news/ with a field no page has: it cannot be baked. Nothing here touches /news/.
  const about = (await (await page.request.get(`${baseURL}/__demo/file?path=about/index.html`)).text())
    .replace('<section class="prose"', '<section class="news" data-each="/news/"><template><p>{nope}</p></template><p>Kept as is</p></section>\n  <section class="prose"');
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/index.html", content: about } });
  const warning = /The collection listing on about\/index\.html was left as it is because it is not valid \(Unknown collection field: nope\.\)\. Fix it in Code to update its cards\./;

  // A page edit: the healthy listing on Home is baked, About is left byte for byte.
  await open(page, baseURL, "work/one/index.html");
  let panel = await openPageSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("One renamed");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator("#status")).toContainText("Page settings applied as a draft.");
  await expect(page.locator("#status")).toContainText(warning);
  await expect.poll(() => homeDraft(page)).toContain(">One renamed</a>");
  expect(await storedDraft(page, "about/index.html")).toBeUndefined();

  // A move: the folder of a listed page is renamed; its card follows, About is still untouched.
  await open(page, baseURL, "index.html");
  await openFiles(page);
  const work = explorerRow(page, "work").first();
  if ((await work.getAttribute("aria-expanded")) === "false") await work.click();
  await explorerRow(page, "two").focus();
  await page.keyboard.press("F2");
  await page.locator("#explorer").getByRole("textbox", { name: "New name for work/two" }).fill("second");
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("dialog", { name: /^Rename work\/two to work\/second/ });
  const keep = confirm.getByRole("checkbox");
  if (await keep.count() && await keep.isChecked()) await keep.uncheck();
  await confirm.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#status")).toContainText("Renamed the folder work/two to work/second");
  await expect(page.locator("#status")).toContainText(warning);
  await expect.poll(async () => listingOf(await homeDraft(page))).toContain('href="/work/second/"');
  expect(listingOf(await homeDraft(page))).toContain(">One renamed</a>");
  expect(await storedDraft(page, "work/second/index.html")).toBeDefined();
  expect(await storedDraft(page, "about/index.html")).toBeUndefined();
  expect(await mounted(page, "index.html")).toBe(await homeDraft(page));

  // Changing the broken listing's own page is refused with the listing's message, writing nothing.
  await open(page, baseURL, "about/index.html");
  const drafts = (await storedDrafts(page)).map((draft) => [draft.path, draft.content]);
  panel = await openPageSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("About, retitled");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel.getByRole("status")).toHaveText("Collection listings (about/index.html): Unknown collection field: nope.");
  expect(await storedDraft(page, "about/index.html")).toBeUndefined();
  expect((await storedDrafts(page)).map((draft) => [draft.path, draft.content])).toEqual(drafts);
  expect(await mounted(page, "about/index.html")).toBe(about);
});

async function mountSettings(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createSiteSettings } = await import("/src/components/site-settings.ts");
    const { upsertHeadTag } = await import("/src/page-builder/site-head.ts");
    const path = "work/one/index.html";
    const state = {
      sources: { [path]: '<!doctype html>\n<html>\n<head>\n  <title>One</title>\n  <meta name="date" content="2025-01-01">\n</head>\n<body><h1>One</h1></body>\n</html>\n' } as Record<string, string>,
      calls: [] as string[], release: undefined as undefined | (() => void),
    };
    const hold = () => new Promise<void>((resolve) => { state.release = resolve; });
    const settings = createSiteSettings({
      async applyPage(file, fields) {
        let next = state.sources[file];
        for (const [field, value] of Object.entries(fields)) next = upsertHeadTag(next, field as never, value as string);
        state.calls.push(`page ${JSON.stringify(fields)}`);
        await hold();
        state.sources[file] = next;
        return undefined;
      },
      planUrl: (_file, value) => ({ ok: true, route: value, message: "Moves the page." }),
      async applyUrl(_file, value) { state.calls.push(`url ${value}`); await hold(); return undefined; },
      applySite: async () => undefined, open404: async () => undefined, applyNavigation: async () => undefined,
      uploadImage: async () => undefined, imageUrl: async () => undefined,
    });
    settings.page({ path, source: state.sources[path], route: "/work/one/", images: [] });
    Object.assign(window, { settingsHarness: state });
  });
  const panel = dialog(page, "Page settings");
  await expect(panel).toBeVisible();
  return panel;
}
const harness = (page: Page) => page.evaluate(() => (window as unknown as { settingsHarness: { sources: Record<string, string>; calls: string[] } }).settingsHarness);
const release = (page: Page) => page.evaluate(() => (window as unknown as { settingsHarness: { release(): void } }).settingsHarness.release());

test("newer page title typing survives a waiting Apply and can be applied again", async ({ page }) => {
  const panel = await mountSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("One first");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(async () => (await harness(page)).calls.length).toBe(1);
  await panel.getByLabel("Title", { exact: true }).fill("One second");
  await release(page);
  await expect(panel).toBeVisible();
  expect((await harness(page)).sources["work/one/index.html"]).toContain("<title>One first</title>");
  await expect(panel.getByLabel("Title", { exact: true })).toHaveValue("One second");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(async () => (await harness(page)).calls.length).toBe(2);
  await release(page);
  await expect(panel).not.toBeVisible();
  expect((await harness(page)).sources["work/one/index.html"]).toContain("<title>One second</title>");
});

test("an untouched dialog closes after its waiting Apply", async ({ page }) => {
  const panel = await mountSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("One first");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(async () => (await harness(page)).calls.length).toBe(1);
  await release(page);
  await expect(panel).not.toBeVisible();
});

test("typing while a URL change waits keeps the dialog open and says the typing was not applied", async ({ page }) => {
  const panel = await mountSettings(page);
  await panel.getByLabel("URL", { exact: true }).fill("/work/uno/");
  await panel.getByRole("button", { name: "Change URL", exact: true }).click();
  await expect.poll(async () => (await harness(page)).calls).toEqual(["url /work/uno/"]);
  await panel.getByLabel("Title", { exact: true }).fill("Typed meanwhile");
  await release(page);
  await expect(panel.getByRole("status")).toHaveText("The URL changed. Edits typed meanwhile were not applied, and closing this dialog discards them. Reopen Page settings to apply them to the moved page.");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Title", { exact: true })).toHaveValue("Typed meanwhile");
});

test("an untouched dialog closes after its waiting URL change", async ({ page }) => {
  const panel = await mountSettings(page);
  await panel.getByLabel("URL", { exact: true }).fill("/work/uno/");
  await panel.getByRole("button", { name: "Change URL", exact: true }).click();
  await expect.poll(async () => (await harness(page)).calls.length).toBe(1);
  await release(page);
  await expect(panel).not.toBeVisible();
});
