import { seedCollection } from "./collection-fixture";
import { openPageSettingsFromPages } from "./settings-entry";
import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { effectiveSource, storedDraft, storedDrafts } from "./drafts";

requireActualFixture();

// The lifecycle of a collection kept in .editor/page-builder.json, through
// ordinary editor actions on its grid and its pages. Runs on a copy of the
// actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const extra: [string, string][] = [["services/one/index.html", `<!doctype html><html><head><title>New services · Larkspur Studio</title><meta name="description" content="About services."></head><body><main><h1>New services</h1></main></body></html>`]];

async function load(page: Page, baseURL: string | undefined, path = "index.html") {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
const json = async (page: Page) => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}");
/** Seed the saved recipe and baked cards at the fake GitHub boundary. */
async function saved(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  for (const [path, content] of extra) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await seedCollection(page, baseURL, ["/work/", "/services/"], extra.map(([path]) => path));
  await load(page, baseURL);
  expect(await storedDrafts(page)).toEqual([]);
  return { home: await file(page, baseURL, "index.html"), sidecar: await file(page, baseURL, SIDECAR) };
}
async function pagesTab(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
}

test("a listed page's new title rebuilds its JSON collection cards in one Undo", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { home } = await saved(page, baseURL);
  // A listed page's new title still reaches its card, through the JSON collection, in one Undo.
  await load(page, baseURL, "services/one/index.html");
  await pagesTab(page);
  await page.locator("#explorer").getByRole("treeitem", { name: /New services/ }).locator(".pages-label").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: /^Title of / }).fill("Services renamed");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("Services renamed");
  expect((await storedDraft(page, "index.html"))!.content).toContain('<div class="cards">');
  expect((await storedDraft(page, "services/one/index.html"))!.content).toContain("Services renamed");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  expect(await effectiveSource(page, baseURL, "index.html")).toBe(home);
  await expect.poll(() => storedDraft(page, "services/one/index.html")).toBeUndefined();
  expect(errors).toEqual([]);
});

test("duplicating or removing the section that holds a JSON grid is refused before writing, saying why", async ({ page, baseURL }) => {
  await saved(page, baseURL);
  await frame(page).locator("section#work h2").first().click();
  await page.getByRole("button", { name: "section.flow", exact: true }).click();
  for (const action of ["Duplicate", "Remove"]) {
    await page.getByRole("toolbar", { name: "Edit bar" }).getByRole("button", { name: action, exact: true }).click();
    await expect(page.locator("#status, [role=alert]").filter({ hasText: "This change would leave a collection on index.html without one exact grid to fill" }).first()).toBeVisible();
    expect(await storedDrafts(page)).toEqual([]);
  }
});

test("a grid broken in Code shows in Page settings, and forgetting its recipe keeps the cards and every other page datum", async ({ page, baseURL }) => {
  const { home, sidecar } = await saved(page, baseURL);
  // Code changes the grid's tag directly; the collection can no longer be found.
  const at = home.indexOf('<div class="cards">') + 4;
  await page.evaluate(async (at) => (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at, text: ' data-x="1"', expected: "" }), at);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain('data-x="1"');
  await pagesTab(page);
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  const list = settings.getByRole("region", { name: "Collections that cannot be found" });
  const [id] = Object.keys(JSON.parse(sidecar).collections);
  // One plain row: which grid on which page, why, and its action; the technical error only in its details.
  const row = list.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".collections-panel__recovery-name")).toHaveText(/^Cards from \/work\/, \/services\/ on .+ \(\/\)$/);
  await expect(row.locator(".collections-panel__recovery-reason")).toHaveText("Its grid was changed in Code, so the editor cannot tell which element it is.");
  // The long error appears once, inside the row's closed details.
  await expect(settings.getByText(/Collection target is missing or ambiguous/)).toHaveCount(1);
  await expect(row.locator("details p")).toBeHidden();
  await row.getByText("Technical details").click();
  await expect(row.locator("details p")).toHaveText(`Collection target is missing or ambiguous. Recipe “${id}” in ${SIDECAR}, page index.html.`);
  await row.getByRole("button", { name: /^Forget recipe, keep cards: Cards from / }).click();
  await expect.poll(async () => Object.keys((await json(page)).collections ?? { pending: 1 })).toEqual([]);
  const forgotten = (await storedDraft(page, SIDECAR))!.content;
  const after = await json(page), before = JSON.parse(sidecar);
  delete before.collections[id];
  expect(after).toEqual(before);
  const broken = home.slice(0, at) + ' data-x="1"' + home.slice(at);
  expect((await storedDraft(page, "index.html"))!.content).toBe(broken);
  await expect(list).toHaveCount(0);
  // Apply from the same dialog uses the baseline after Forget, keeping both operations undoable.
  await settings.getByLabel("Title", { exact: true }).fill("Home after forgetting recipe");
  await settings.getByRole("button", { name: "Apply page settings", exact: true }).click();
  await expect(settings).toBeHidden();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toContain("<title>Home after forgetting recipe</title>");
  expect((await storedDraft(page, SIDECAR))!.content).toBe(forgotten);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(broken);
  expect((await storedDraft(page, SIDECAR))!.content).toBe(forgotten);
  // Forget is one Undo step of its own: Undo brings the recipe back exactly, Redo forgets it again.

  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, SIDECAR)).toBeUndefined();
  expect((await storedDraft(page, "index.html"))!.content).toBe(broken);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(forgotten);
  expect((await storedDraft(page, "index.html"))!.content).toBe(broken);
});

test("a collection whose page was deleted outside the editor can be forgotten alone, keeping other recipes and page data", async ({ page, baseURL }) => {
  const { sidecar } = await saved(page, baseURL);
  const document = JSON.parse(sidecar);
  const [id] = Object.keys(document.collections);
  document.collections.gone = { ...document.collections[id], pagePath: "gone/index.html", label: "Old blog cards" };
  document.pages["about/index.html"] = { fields: { mood: "calm" }, keep: { unknown: true } };
  const seeded = JSON.stringify(document, null, 2) + "\n";
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: seeded } });
  await load(page, baseURL);
  await pagesTab(page);
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  const list = settings.getByRole("region", { name: "Collections that cannot be found" });
  const row = list.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".collections-panel__recovery-name")).toHaveText("Old blog cards on gone/index.html");
  await expect(row.locator(".collections-panel__recovery-reason")).toHaveText("This page no longer exists.");
  await row.getByRole("button", { name: "Forget recipe, keep cards: Old blog cards on gone/index.html" }).click();
  await expect.poll(async () => Object.keys((await json(page)).collections ?? {}).sort()).toEqual([id]);
  const after = await json(page);
  expect(after.pages["about/index.html"]).toEqual({ keep: { unknown: true } });
  expect(after.collections[id]).toEqual(document.collections[id]);
  expect((await storedDrafts(page)).map((draft: { path: string }) => draft.path)).toEqual([SIDECAR]);
});

test("Structure marks cards a JSON collection made as generated, with no fields, and leaves the grid itself plain", async ({ page, baseURL }) => {
  await saved(page, baseURL);
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  const tree = page.getByRole("tree", { name: "Page structure" });
  const cards = tree.locator(".page-structure__row--generated");
  // The four cards (and what is inside them) are generated; each card row says so.
  await expect(cards.filter({ hasText: /^Card project/ })).toHaveCount(4);
  await expect(tree.locator(".page-structure__row").filter({ hasText: /^Card project/ }).and(tree.locator(":not(.page-structure__row--generated)"))).toHaveCount(0);
  await expect(tree.locator(".page-structure__row--generated .page-structure__slot-toggle, .page-structure__row--generated input")).toHaveCount(0);
  const grid = tree.locator(".page-structure__row").filter({ hasText: /^Block / });
  await expect(grid).toHaveCount(1);
  await expect(grid).not.toHaveClass(/page-structure__row--generated/);
  expect(await storedDrafts(page)).toEqual([]);
});

test("with two JSON grids from the same pages, only the broken one is listed, rows are told apart, and Forget removes exactly its own recipe", async ({ page, baseURL }) => {
  await import("../../src/page-builder/page-builder-document"); const { makeSectionTarget } = await import("../../src/page-builder/source-target");
  const { home, sidecar } = await saved(page, baseURL);
  // A second grid of the same cards from the same pages, with its own recipe and an unknown key.
  const open = home.indexOf('<div class="cards">'), close = home.indexOf("</div>", home.lastIndexOf("</card-project>")) + 6;
  const twin = home.slice(open, close).replace('<div class="cards">', '<div class="cards more">');
  const both = home.slice(0, close) + "\n      " + twin + home.slice(close);
  const document = JSON.parse(sidecar), [first] = Object.keys(document.collections);
  document.collections.second = { ...document.collections[first], target: makeSectionTarget(both, both.indexOf('<div class="cards more">')), keep: { unknown: true } };
  const seeded = JSON.stringify(document, null, 2) + "\n";
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: both } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: seeded } });
  await load(page, baseURL);
  const edit = async (marker: string, text: string) => {
    const source = (await storedDraft(page, "index.html"))?.content ?? both, at = source.indexOf(marker) + 4;
    await page.evaluate(async ({ at, text }) => (await import("/src/components/code-editor.ts")).replaceActiveRange({ path: "index.html", start: at, end: at, text, expected: "" }), { at, text });
    await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain(text.trim());
  };
  const openRecovery = async () => {
    await pagesTab(page);
    await openPageSettingsFromPages(page);
    const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
    return settings;
  };
  // Only the first grid changed in Code: one row, for it alone.
  await edit('<div class="cards">', ' data-x="1"');
  let settings = await openRecovery();
  let rows = settings.getByRole("region", { name: "Collections that cannot be found" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.locator(".collections-panel__recovery-reason")).toHaveText("Its grid was changed in Code, so the editor cannot tell which element it is.");
  await expect(rows.locator("details p")).toContainText(`Recipe “${first}”`);
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  // Both changed: two rows that would read the same say which grid each is, with distinct action names.
  await edit('<div class="cards more">', ' data-y="1"');
  settings = await openRecovery();
  rows = settings.getByRole("region", { name: "Collections that cannot be found" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  const names = await rows.locator(".collections-panel__recovery-name").allTextContents();
  expect(names.map((name) => name.replace(/ on .*$/, "")).sort()).toEqual(["Cards from /work/, /services/, grid div.cards", "Cards from /work/, /services/, grid div.cards.more"]);
  const firstRow = rows.filter({ has: page.locator("details p", { hasText: `Recipe “${first}”` }) });
  const name = (await firstRow.locator(".collections-panel__recovery-name").textContent())!;
  await settings.getByRole("button", { name: `Forget recipe, keep cards: ${name}`, exact: true }).click();
  await expect(rows).toHaveCount(1);
  const forgotten = (await storedDraft(page, SIDECAR))!.content;
  const expected = JSON.parse(seeded); delete expected.collections[first];
  expect(JSON.parse(forgotten)).toEqual(expected);
  const page2 = (await storedDraft(page, "index.html"))!.content;
  await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, SIDECAR)).toBeUndefined();
  expect((await storedDraft(page, "index.html"))!.content).toBe(page2);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(forgotten);
});
