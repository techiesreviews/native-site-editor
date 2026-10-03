import { test, expect, type Page } from "@playwright/test";

// Leaf controller harness. Real host transaction/history integration is tested after main wiring.
async function mount(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  await page.evaluate(async () => {
    const modulePath = "/src/components/collections-panel.ts";
    const { mountCollectionsPanel } = await import(modulePath);
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
      apply: (plan: { edits: Record<string, { start: number; end: number; text: string }[]>; expectedSources: Record<string, string> }, revision: string, label: string) => {
        if (state.revision !== revision || Object.entries(plan.expectedSources).some(([path, text]) => state.sources[path as keyof typeof sources] !== text)) return false;
        state.applied.push({ plan, revision, label });
        for (const [path, edits] of Object.entries(plan.edits)) for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
          const key = path as keyof typeof sources; state.sources[key] = state.sources[key].slice(0, edit.start) + edit.text + state.sources[key].slice(edit.end);
        }
        return true;
      }, openPage: (path: string) => state.opened.push(path), announce: (message: string) => state.messages.push(message),
    });
    Object.assign(window, { collectionTest: { state, panel, start: home.indexOf('<div') } });
  });
}
async function grid(page: Page) {
  await page.evaluate(() => {
    const harness = (window as any).collectionTest; harness.panel.openGrid("index.html", harness.start);
  });
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
  await expect(panel(page)).toContainText("1 matching pages");
  await page.getByRole("button", { name: "Make collection", exact: true }).click();
  await expect(panel(page)).toContainText("Grid made into a collection");
  const state = await page.evaluate(() => (window as any).collectionTest.state);
  expect(state.applied).toHaveLength(1);
  expect(state.applied[0].revision).toBe("scope-A");
  expect(state.sources["index.html"]).toContain('data-each="/work/"');
  expect(state.sources["index.html"]).toContain("<template>");
  expect(state.sources["index.html"]).not.toContain("data-native-src");
});
test("page field edits include dependent listing drafts in the same plan", async ({ page }) => {
  await grid(page); await page.getByRole("button", { name: "Make collection", exact: true }).click();
  await page.evaluate(() => { const h = (window as any).collectionTest; h.state.page = "work/two/index.html"; h.panel.update(); });
  await page.getByLabel("Title", { exact: true }).fill("New project");
  await page.getByRole("button", { name: "Apply page fields" }).click();
  const state = await page.evaluate(() => (window as any).collectionTest.state);
  expect(Object.keys(state.applied[1].plan.edits).sort()).toEqual(["index.html", "work/two/index.html"]);
  expect(state.sources["index.html"]).toContain(">New project</a>");
  expect(state.sources["work/two/index.html"]).toContain("<title>New project | Studio</title>");
});
test("collection controls reject malformed bindings and unsafe URLs without host writes", async ({ page }) => {
  await grid(page);
  await page.getByLabel("Card template HTML").fill(`<a href="{unknown}">{title}</a>`);
  await expect(panel(page)).toContainText("Unknown collection field: unknown.");
  await page.getByRole("button", { name: "Make collection", exact: true }).click();
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
