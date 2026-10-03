import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";

// Collections through the real host: Monaco, native preview, drafts, Undo/Redo.
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const record = (title: string, date: string, extra = "") =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="date" content="${date}">${extra}\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;
const listing = `<section class="cards" data-key="work-list" data-each="/work/" data-sort="-date"><template><article><a href="{url}">{title}</a><time>{date}</time></article></template></section>`;

async function seed(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/`);
  const home = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  const edits: [string, string][] = [
    ["work/one/index.html", record("One", "2025-01-01")],
    ["work/two/index.html", record("Two", "2026-01-01")],
    ["index.html", home.replace('<section class="filler"', `${listing}\n  <section class="filler"`)],
  ];
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
  await page.locator("#page-settings-toggle").click();
  await expect(dialog(page, "Page settings")).toBeVisible();
  return dialog(page, "Page settings");
}
const homeDraft = async (page: Page) => (await storedDraft(page, "index.html"))?.content ?? "";

test("General and staged Fields apply with the dependent listing as one draft operation and one Undo/Redo", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/one/index.html");
  const before = await mounted(page, "work/one/index.html");
  const panel = await openPageSettings(page);
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(panel.getByLabel("Date", { exact: true })).toHaveValue("2025-01-01");
  for (const label of ["Title", "Description", "Image"]) await expect(panel.getByRole("tabpanel").getByLabel(label, { exact: true })).toHaveCount(0);
  await panel.getByLabel("Date", { exact: true }).fill("2027-05-01");
  await panel.getByLabel("New custom field name", { exact: true }).fill("category");
  await panel.getByLabel("New custom field value", { exact: true }).fill("Clay & glaze");
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("One renamed");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();

  await expect.poll(async () => (await storedDraft(page, "work/one/index.html"))?.content ?? "").toContain("<title>One renamed</title>");
  const one = (await storedDraft(page, "work/one/index.html"))!.content;
  expect(one).toContain('<meta name="date" content="2027-05-01">');
  expect(one).toContain('content="Clay &amp; glaze"');
  expect(one).toBe(await mounted(page, "work/one/index.html"));
  // The dependent listing on Home is baked from the result, newest first.
  const home = await homeDraft(page);
  const cards = home.slice(home.indexOf('data-key="work-list"'));
  expect(cards.indexOf("One renamed")).toBeGreaterThan(-1);
  expect(cards.indexOf("One renamed")).toBeLessThan(cards.indexOf(">Two<"));
  expect(cards).toContain("<time>2027-05-01</time>");
  expect(home).toContain("<template><article><a href=\"{url}\">{title}</a><time>{date}</time></article></template>");

  // One Undo restores both files exactly; one Redo writes both again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "work/one/index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  expect(await mounted(page, "work/one/index.html")).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "work/one/index.html"))?.content).toBe(one);
  await expect.poll(() => homeDraft(page)).toBe(home);
});

test("an unchanged Fields tab passes a metadata-only change through and bakes the listing title", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/two/index.html");
  const panel = await openPageSettings(page);
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
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

test("an invalid staged field refuses the whole apply without writing", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/one/index.html");
  const panel = await openPageSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("Should not apply");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByLabel("New custom field name", { exact: true }).fill("Bad name");
  await panel.getByLabel("New custom field value", { exact: true }).fill("x");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel.locator(".site-settings__status")).toContainText(/valid editable page field|field/i);
  await expect(panel).toBeVisible();
  expect(await storedDraft(page, "work/one/index.html")).toBeUndefined();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
});

test("a custom field value without a name refuses the whole apply", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await open(page, baseURL, "work/one/index.html");
  const panel = await openPageSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("Not applied");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByLabel("New custom field value", { exact: true }).fill("orphan");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel.locator(".site-settings__status")).toHaveText("Name the new custom field, or clear its value.");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("New custom field value", { exact: true })).toHaveValue("orphan");
  expect(await storedDraft(page, "work/one/index.html")).toBeUndefined();
  expect(await storedDraft(page, "index.html")).toBeUndefined();
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
  // Bake the listing once through Page settings, so its cards are on Home.
  await open(page, baseURL, "work/two/index.html");
  const panel = await openPageSettings(page);
  await panel.getByLabel("Title", { exact: true }).fill("Two");
  await panel.getByLabel("Description", { exact: true }).fill("Second");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel).not.toBeVisible();
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  const baked = await homeDraft(page);
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
  await expect.poll(() => homeDraft(page)).toBe(baked);
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

test("dirty Fields refuse Apply after the branch changes, writing nothing", async ({ page, baseURL }) => {
  await seed(page, baseURL);
  await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature", path: "work/one/index.html", content: record("One feature", "2025-01-01") } });
  await open(page, baseURL, "work/one/index.html");
  const panel = await openPageSettings(page);
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByLabel("Date", { exact: true }).fill("2027-05-01");
  await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=work%2Fone%2Findex.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
  await expect(panel.getByLabel("Date", { exact: true })).toHaveValue("2027-05-01");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel.getByRole("status")).toHaveText("The repository or source changed meanwhile. Reopen settings and try again.");
  await expect(panel).toBeVisible();
  for (const path of ["work/one/index.html", "index.html"]) expect(await storedDraft(page, path)).toBeUndefined();
  expect(await mounted(page, "work/one/index.html")).toContain("<title>One feature</title>");
});


// In the host, Settings opens only once every page's text is read, and its
// Apply and URL change then make no request: nothing real can be held while
// they wait. These cases mount the dialog in the browser with the real Fields
// panel and hold the handler's promise instead, to prove the dialog's guards.
async function mountSettings(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createSiteSettings } = await import("/src/components/site-settings.ts");
    const { mountCollectionsPanel } = await import("/src/components/collections-panel.ts");
    const { upsertHeadTag } = await import("/src/page-builder/site-head.ts");
    const path = "work/one/index.html";
    const state = {
      sources: { [path]: '<!doctype html>\n<html>\n<head>\n  <title>One</title>\n  <meta name="date" content="2025-01-01">\n</head>\n<body><h1>One</h1></body>\n</html>\n' } as Record<string, string>,
      calls: [] as string[], release: undefined as undefined | (() => void),
    };
    const hold = () => new Promise<void>((resolve) => { state.release = resolve; });
    const settings = createSiteSettings({
      async applyPage(file, fields, pageFields) {
        let next = state.sources[file];
        for (const [field, value] of Object.entries(fields)) next = upsertHeadTag(next, field as never, value as string);
        if (pageFields) next = pageFields(next);
        state.calls.push(`page ${JSON.stringify(fields)}`);
        await hold();
        state.sources[file] = next;
        return undefined;
      },
      pageFields: (host, file) => {
        const saved = state.sources[file];
        return mountCollectionsPanel(host, {
          sources: () => state.sources, routes: () => ({ "/work/one/": path }), identity: () => ({ name: "Studio" }), revision: () => "r",
          page: () => saved === undefined ? undefined : file, apply: () => false, openPage: () => {}, announce: () => {},
        }, { settings: true });
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

test("General and Date typed while Apply waits are kept, and Apply again writes them over the earlier values", async ({ page }) => {
  const panel = await mountSettings(page);
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByLabel("Date", { exact: true }).fill("2027-05-01");
  await panel.getByLabel("New custom field name", { exact: true }).fill("category");
  await panel.getByLabel("New custom field value", { exact: true }).fill("Clay");
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await panel.getByLabel("Title", { exact: true }).fill("One first");
  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect(panel.getByRole("status")).toHaveText("Applying drafts…");
  await expect.poll(async () => (await harness(page)).calls.length).toBe(1);
  // The Apply waits: type newer values on both tabs.
  await panel.getByLabel("Title", { exact: true }).fill("One second");
  await panel.getByRole("tab", { name: "Fields", exact: true }).click();
  await panel.getByLabel("New custom field value", { exact: true }).fill("Glaze");
  await panel.getByLabel("Date", { exact: true }).fill("2028-02-02");
  await release(page);

  await expect(panel.getByRole("status")).toHaveText("Applied the earlier values as drafts. Your newer changes are not applied yet; Apply again to add them.");
  await expect(panel).toBeVisible();
  const first = (await harness(page)).sources["work/one/index.html"];
  expect(first).toContain("<title>One first</title>");
  expect(first).toContain('<meta name="date" content="2027-05-01">');
  expect(first).toContain('content="Clay"');
  // The Fields panel now reads the applied page: the added field is its own, holding the newer value.
  await expect(panel.getByLabel("Date", { exact: true })).toHaveValue("2028-02-02");
  await expect(panel.getByLabel("Date", { exact: true })).toBeFocused();
  await expect(panel.getByLabel("Category", { exact: true })).toHaveValue("Glaze");
  await expect(panel.getByLabel("New custom field name", { exact: true })).toHaveValue("");
  await panel.getByRole("tab", { name: "General", exact: true }).click();
  await expect(panel.getByLabel("Title", { exact: true })).toHaveValue("One second");

  await panel.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(async () => (await harness(page)).calls.length).toBe(2);
  expect((await harness(page)).calls[1]).toBe('page {"title":"One second"}');
  await release(page);
  await expect(panel).not.toBeVisible();
  const second = (await harness(page)).sources["work/one/index.html"];
  expect(second).toContain("<title>One second</title>");
  expect(second).toContain('<meta name="date" content="2028-02-02">');
  expect(second).toContain('content="Glaze"');
  expect(second).not.toContain("One first");
  expect(second).not.toContain('content="Clay"');
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
