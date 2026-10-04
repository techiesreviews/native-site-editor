import { test, expect, type Page } from "@playwright/test";

// Leaf controller harness. Real host transaction/history integration is tested after main wiring.
async function mount(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  await page.evaluate(async () => {
    const modulePath = "/src/components/collections-panel.ts";
    const { mountCollectionsPanel } = await import(modulePath);
    const hostPath = "/src/page-builder/native-collection-host.ts", routesPath = "/shared/native-routes.ts";
    const { planNativeCollectionOperation } = await import(hostPath);
    const { deriveNativeRoutes } = await import(routesPath);
    const host = document.createElement("div"); host.id = "collection-test-host"; document.body.replaceChildren(host);
    const home = `<html><head><title>Home | Studio</title></head><body><div class="cards"><article><a href="/old/">Old</a></article></div></body></html>`;
    const sources = {
      "index.html": home,
      "work/index.html": `<html><head><title>Work</title></head><body></body></html>`,
      "work/one/index.html": `<html><head><title>One | Studio</title><meta name="date" content="2025-01-01"><meta name="description" content="Clay"></head><body></body></html>`,
      "work/two/index.html": `<html><head><title>Two | Studio</title><meta name="date" content="2026-01-01"><meta property="og:image" content="/two.jpg"></head><body></body></html>`,
    };
    const state = { sources, routes: { "/": "index.html", "/work/": "work/index.html", "/work/one/": "work/one/index.html", "/work/two/": "work/two/index.html" }, revision: "scope-A", page: "index.html", applied: [] as unknown[], messages: [] as string[], opened: [] as string[] };
    const panel = mountCollectionsPanel(host, {
      sources: () => state.sources, routes: () => state.routes, identity: () => ({ name: "Studio" }), revision: () => state.revision, page: () => state.page,
      // Mirrors the host: a JSON recipe origin is planned again by the real host planner from the
      // current graph, then every file is checked against its pinned bytes and applied together.
      apply: (plan: any, revision: string, label: string) => {
        if (state.revision !== revision) return false;
        if ("creates" in plan) {
          const planned = planNativeCollectionOperation({ sources: state.sources, routes: state.routes, files: Object.keys(state.sources), revision: state.revision, identity: { name: "Studio" }, origin: { ...plan, done: "", undone: "" } });
          if ("error" in planned) throw new Error(planned.error);
          const sources = state.sources as Record<string, string | undefined>;
          if ([...planned.operation.expectedSources].some(([path, text]) => sources[path] !== text)) return false;
          const edits: Record<string, string> = {};
          for (const [path, text] of planned.operation.edits ?? []) edits[path] = text;
          for (const file of planned.operation.creates ?? []) edits[file.path] = file.content;
          state.applied.push({ plan: { edits, creates: (planned.operation.creates ?? []).map((file) => file.path) }, revision, label });
          Object.assign(state.sources, edits);
          return true;
        }
        if (Object.entries(plan.expectedSources).some(([path, text]) => state.sources[path as keyof typeof sources] !== text)) return false;
        state.applied.push({ plan, revision, label });
        for (const [path, edits] of Object.entries(plan.edits) as [string, { start: number; end: number; text: string }[]][]) for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
          const key = path as keyof typeof sources; state.sources[key] = state.sources[key].slice(0, edit.start) + edit.text + state.sources[key].slice(edit.end);
        }
        return true;
      }, openPage: (path: string) => state.opened.push(path), announce: (message: string) => state.messages.push(message),
    });
    // Fixtures that add files re-derive routes exactly as the host does from its file list.
    const derive = () => { state.routes = deriveNativeRoutes(Object.keys(state.sources).sort()); };
    Object.assign(window, { collectionTest: { state, panel, derive, start: home.indexOf('<div') } });
  });
}
async function grid(page: Page) {
  await page.evaluate(() => {
    const harness = (window as any).collectionTest; harness.panel.openGrid("index.html", harness.start);
  });
  await page.locator(".collections-panel__advanced > summary").click();
  await page.getByLabel("Card template HTML").fill(`<article><a href="{url}">{title}</a><img src="{image}" data-if="image"></article>`);
}
const panel = (page: Page) => page.getByRole("region", { name: "Collections and page fields" });
test.beforeEach(async ({ page, baseURL }) => { await mount(page, baseURL); });
test("grid preview shows source, stable sort, count and plain HTML, then sends one guarded plan", async ({ page }) => {
  await grid(page);
  await expect(panel(page)).toContainText("2 matching pages");
  const preview = panel(page).locator("pre");
  await expect(preview).toContainText(`href="/work/two/">Two</a>`);
  await expect(preview).toContainText(`src="/two.jpg"`);
  await page.getByLabel("Maximum items (1–500)").fill("1");
  await expect(panel(page)).toContainText("1 matching page");
  await page.getByRole("button", { name: "Make collection", exact: true }).click();
  await expect(panel(page)).toContainText("Grid made into a collection");
  const state = await page.evaluate(() => (window as any).collectionTest.state);
  expect(state.applied).toHaveLength(1);
  expect(state.applied[0].revision).toBe("scope-A");
  // The recipe is stored in the editor's JSON; the page keeps only plain baked cards.
  expect(state.applied[0].plan.creates).toEqual([".editor/page-builder.json"]);
  const recipes = Object.values(JSON.parse(state.sources[".editor/page-builder.json"]).collections) as any[];
  expect(recipes).toHaveLength(1);
  expect(recipes[0]).toMatchObject({ pagePath: "index.html", folders: ["/work/"], limit: 1 });
  expect(recipes[0].template).toContain('<a href="{url}">{title}</a>');
  expect(state.sources["index.html"]).toContain('<div class="cards"><article><a href="/work/two/">Two</a><img src="/two.jpg"></article></div>');
  for (const recipe of ["data-each", "<template", "data-native-src", "data-collection-id"]) expect(state.sources["index.html"]).not.toContain(recipe);
});
test("page field edits include dependent listing drafts in the same plan", async ({ page }) => {
  await grid(page); await page.getByRole("button", { name: "Make collection", exact: true }).click();
  await page.evaluate(() => { const h = (window as any).collectionTest; h.state.page = "work/two/index.html"; h.panel.update(); });
  await page.getByLabel("Title", { exact: true }).fill("New project");
  await page.getByRole("button", { name: "Apply page fields" }).click();
  const before = await page.evaluate(() => (window as any).collectionTest.state.applied[0].plan.edits[".editor/page-builder.json"]);
  const state = await page.evaluate(() => (window as any).collectionTest.state);
  // One plan: the page, its dependent listing, and the listing's recorded output fingerprint in the JSON.
  expect(Object.keys(state.applied[1].plan.edits).sort()).toEqual([".editor/page-builder.json", "index.html", "work/two/index.html"]);
  const [was] = Object.values(JSON.parse(before).collections) as any[], [now] = Object.values(JSON.parse(state.sources[".editor/page-builder.json"]).collections) as any[];
  expect({ ...now, outputFingerprint: undefined }).toEqual({ ...was, outputFingerprint: undefined });
  expect(now.outputFingerprint).not.toBe(was.outputFingerprint);
  expect(state.sources["index.html"]).toContain(">New project</a>");
  expect(state.sources["work/two/index.html"]).toContain("<title>New project | Studio</title>");
});
test("collection controls reject malformed bindings and unsafe URLs without host writes", async ({ page }) => {
  await grid(page);
  await page.getByLabel("Card template HTML").fill(`<a href="{unknown}">{title}</a>`);
  await expect(panel(page)).toContainText("Unknown collection field: unknown.");
  await expect(page.getByRole("button", { name: "Make collection", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).collectionTest.state.applied.length)).toBe(0);
  await page.getByLabel("Card template HTML").fill(`<a href="javascript:{title}">Link</a>`);
  await expect(panel(page)).toContainText("Unsafe collection URL in href.");
});
for (const change of ["source", "scope", "routes"] as const) test(`open grid refuses ${change} changes before Apply`, async ({ page }) => {
  await grid(page);
  await page.evaluate((change) => {
    const state = (window as any).collectionTest.state;
    if (change === "source") state.sources["index.html"] += "<!-- agent edit -->";
    if (change === "scope") state.revision = "scope-B";
    if (change === "routes") state.routes["/new/"] = "new/index.html";
  }, change);
  await page.getByRole("button", { name: "Make collection", exact: true }).click();
  await expect(panel(page)).toContainText("The page or repository changed. Reopen the collection panel before applying.");
  expect(await page.evaluate(() => (window as any).collectionTest.state.applied.length)).toBe(0);
});

test("new custom field refuses reserved title without applying", async ({ page }) => {
  await page.getByLabel("New custom field name").fill("title");
  await page.getByLabel("New custom field value").fill("Oops");
  await page.getByRole("button", { name: "Apply page fields" }).click();
  await expect(panel(page)).toContainText("title is a built-in field. Edit its own control above.");
  expect(await page.evaluate(() => (window as any).collectionTest.state.applied.length)).toBe(0);
});

test("five source checkboxes preview the union, disable empty selection, and serialize native data-each", async ({ page }) => {
  await page.evaluate(() => {
    const h = (window as any).collectionTest;
    for (const folder of ["services", "portfolio", "articles", "videos"]) {
      h.state.routes[`/${folder}/`] = `${folder}/index.html`;
      h.state.routes[`/${folder}/one/`] = `${folder}/one/index.html`;
      h.state.sources[`${folder}/index.html`] = '<html><head><title>Index</title></head><body></body></html>';
      h.state.sources[`${folder}/one/index.html`] = `<html><head><title>${folder}</title></head><body></body></html>`;
    }
  });
  await grid(page);
  await expect(page.getByRole("checkbox")).toHaveCount(5);
  await expect(page.getByRole("checkbox", { name: "/work/", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "/work/", exact: true }).uncheck();
  await expect(panel(page)).toContainText("Select at least one source folder to preview or apply.");
  await expect(page.getByRole("button", { name: "Make collection", exact: true })).toBeDisabled();
  await expect(panel(page).locator("pre")).toHaveText("");
  for (const folder of ["work", "services", "portfolio", "articles", "videos"]) await page.getByRole("checkbox", { name: `/${folder}/`, exact: true }).check();
  await expect(panel(page)).toContainText("6 matching pages");
  await expect(panel(page).locator("pre")).toContainText('href="/videos/one/">videos</a>');
  await page.getByRole("button", { name: "Make collection", exact: true }).click();
  const { source, sidecar } = await page.evaluate(() => { const s = (window as any).collectionTest.state.sources; return { source: s["index.html"], sidecar: s[".editor/page-builder.json"] }; });
  expect((Object.values(JSON.parse(sidecar).collections) as any[])[0].folders).toEqual(["/work/", "/services/", "/portfolio/", "/articles/", "/videos/"]);
  expect((source.match(/<article>/g) ?? []).length).toBe(6); // six plain cards, no template
  expect(source).not.toContain("data-each");
});

test("existing selected deeper source remains visible without its folder route", async ({ page }) => {
  await page.evaluate(() => {
    const h = (window as any).collectionTest;
    h.state.sources["index.html"] = h.state.sources["index.html"].replace('<div class="cards">', '<div class="cards" data-each="/work/deep/" data-sort="title"><template><a href="{url}">{title}</a></template>').replace('<article><a href="/old/">Old</a></article>', '<a href="/work/deep/one/">Deep</a>');
    h.state.sources["work/deep/one/index.html"] = '<html><head><title>Deep</title></head><body></body></html>';
    h.state.routes["/work/deep/one/"] = "work/deep/one/index.html";
    h.panel.openGrid("index.html", h.start);
  });
  await expect(page.getByRole("checkbox", { name: "/work/deep/", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "/work/", exact: true })).not.toBeChecked();
  await expect(panel(page)).toContainText("1 matching page");
  await page.getByRole("button", { name: "Save collection", exact: true }).click();
  const { source, sidecar } = await page.evaluate(() => { const s = (window as any).collectionTest.state.sources; return { source: s["index.html"], sidecar: s[".editor/page-builder.json"] }; });
  // The legacy inline recipe moves into the JSON as-is; the page keeps the plain card.
  expect((Object.values(JSON.parse(sidecar).collections) as any[]).map((recipe) => recipe.folders)).toEqual([["/work/deep/"]]);
  expect(source).not.toContain("data-each");
  expect(source).toContain('<div class="cards"><a href="/work/deep/one/">Deep</a></div>');
});

test("folders without index pages offer ancestors, exclude invalid routes, and bake a mixed union", async ({ page }) => {
  await page.evaluate(() => {
    const h = (window as any).collectionTest;
    for (const path of ["articles/one/index.html", "videos/series/one.html", ".hidden/one/index.html", "_private/one/index.html", "encoded%20/one/index.html", "wild*/one/index.html"]) {
      h.state.sources[path] = `<html><head><title>${path}</title></head><body></body></html>`;
    }
    h.derive();
  });
  await grid(page);
  await expect(page.getByRole("checkbox", { name: "/articles/", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "/videos/series/", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(4);
  await page.getByRole("checkbox", { name: "/work/", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "/articles/", exact: true }).check();
  await page.getByRole("checkbox", { name: "/videos/", exact: true }).check();
  await expect(panel(page)).toContainText("2 matching pages");
  await page.getByRole("button", { name: "Make collection", exact: true }).click();
  const { source, sidecar } = await page.evaluate(() => { const s = (window as any).collectionTest.state.sources; return { source: s["index.html"], sidecar: s[".editor/page-builder.json"] }; });
  expect((Object.values(JSON.parse(sidecar).collections) as any[])[0].folders).toEqual(["/articles/", "/videos/"]);
  expect(source).not.toContain("data-each");
  expect(source).toContain('href="/articles/one/"');
  expect(source).toContain('href="/videos/series/one.html"');
  await expect(panel(page)).toContainText("Pages from /articles/, /videos/");
});

// A legacy inline recipe whose <template> carries authored attributes cannot move into the JSON
// without losing them, so it is refused whole: Save stays disabled and nothing is written.
test("an empty legacy source with template attributes refuses the JSON move and keeps every byte", async ({ page }) => {
  const retained = '<template id="authoring" data-note="x > y" class=card>\r\n  <a href="{url}">{title}</a>\r\n</template>';
  const original = await page.evaluate((retained) => {
    const h = (window as any).collectionTest;
    h.state.sources["index.html"] = `<html><body><div class="cards" data-each="/empty/" data-sort="title">${retained}<b>Old</b></div><!-- outside --></body></html>`;
    h.start = h.state.sources["index.html"].indexOf("<div");
    h.panel.openGrid("index.html", h.start);
    return h.state.sources["index.html"];
  }, retained);
  await expect(page.getByRole("heading", { name: "Edit collection", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "/empty/", exact: true })).toBeChecked();
  await expect(panel(page)).toContainText("could not be moved into the editor's page data, so nothing was changed: A recipe template with authored attributes cannot be removed safely.");
  await expect(page.getByRole("button", { name: "Save collection", exact: true })).toBeDisabled();
  const state = await page.evaluate(() => (window as any).collectionTest.state);
  expect(state.applied).toHaveLength(0);
  expect(state.sources["index.html"]).toBe(original);
  expect(state.sources[".editor/page-builder.json"]).toBeUndefined();
});

test("custom fields kept in the editor's JSON are offered to Sort and Filter, and the JSON value wins as in the bake", async ({ page }) => {
  await page.evaluate(() => {
    const h = (window as any).collectionTest;
    h.state.sources["work/one/index.html"] = h.state.sources["work/one/index.html"].replace("</head>", '<meta name="field:mood" content="html">');
    h.state.sources[".editor/page-builder.json"] = JSON.stringify({ version: 1, pages: { "work/one/index.html": { fields: { mood: "json", price: "10" } }, "work/two/index.html": { fields: { price: "5" } } }, collections: {} }, null, 2) + "\n";
    h.derive();
  });
  await grid(page);
  const sort = page.getByRole("combobox", { name: "Sort by", exact: true });
  await expect(sort.locator("option", { hasText: "price" })).toHaveCount(1);
  await sort.selectOption("price");
  await expect(panel(page).locator("pre")).toContainText('href="/work/two/">Two</a>');
  const preview = await panel(page).locator("pre").textContent();
  expect(preview!.indexOf("/work/two/")).toBeLessThan(preview!.indexOf("/work/one/"));
  const filter = page.getByRole("combobox", { name: "Filter by", exact: true });
  await filter.selectOption("mood");
  await page.getByLabel("Matches exactly").fill("json");
  await expect(panel(page)).toContainText("1 matching page");
  await expect(panel(page).locator("pre")).toContainText('href="/work/one/"');
});
