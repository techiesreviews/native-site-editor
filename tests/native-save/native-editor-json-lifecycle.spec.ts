import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

// The lifecycle of a collection kept in .editor/page-builder.json, through
// ordinary editor actions on its grid and its pages. Runs on a copy of the
// actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
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

const json = async (page: Page) => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}");
/** Converted and saved, so the branch holds the JSON and the plain cards; no drafts. */
async function saved(page: Page, baseURL: string | undefined) {
  await convert(page, baseURL);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await load(page, baseURL);
  expect(await storedDrafts(page)).toEqual([]);
  return { home: await file(page, baseURL, "index.html"), sidecar: await file(page, baseURL, SIDECAR) };
}
async function selectGrid(page: Page) {
  await frame(page).locator("card-project").first().click({ position: { x: 4, y: 4 } });
  await page.getByRole("button", { name: "div.cards", exact: true }).click();
}
async function pagesTab(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
}

test("a class added to a JSON grid moves its target in the same Undo, and later page changes still rebuild its cards", async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { home, sidecar } = await saved(page, baseURL);
  await selectGrid(page);
  await page.getByPlaceholder("e.g. hero-title").fill("wide");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain('<div class="cards wide">');
  const target = Object.values((await json(page)).collections as Record<string, { target: { openingTagFingerprint: string } }>)[0].target;
  expect(target.openingTagFingerprint).toBe('<div class="cards wide">');
  const after = { home: (await storedDraft(page, "index.html"))!.content, sidecar: (await storedDraft(page, SIDECAR))!.content };
  // Only the target changed in the JSON; the page changed only in the grid's tag.
  const was = JSON.parse(sidecar), now = JSON.parse(after.sidecar);
  for (const record of [...Object.values(was.collections), ...Object.values(now.collections)] as { target?: unknown }[]) delete record.target;
  expect(now).toEqual(was);
  expect(after.home).toBe(home.replace('<div class="cards">', '<div class="cards wide">'));
  // One Undo takes back the class and the target together; Redo writes both.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(after.sidecar);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(after.home);
  // A listed page's new title still reaches its card, through the JSON collection, in one Undo.
  await load(page, baseURL, "services/one/index.html");
  await pagesTab(page);
  await page.locator("#explorer").getByRole("treeitem", { name: /New services/ }).locator(".pages-label").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: /^Title of / }).fill("Services renamed");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("Services renamed");
  expect((await storedDraft(page, "index.html"))!.content).toContain('<div class="cards wide">');
  expect((await storedDraft(page, "services/one/index.html"))!.content).toContain("Services renamed");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(after.home);
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
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByRole("tab", { name: "Fields", exact: true }).click();
  const list = settings.getByRole("region", { name: "Collections that cannot be found" });
  const [id] = Object.keys(JSON.parse(sidecar).collections);
  // One plain row: which grid on which page, why, and its action; the technical error only in its details.
  const row = list.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".collections-panel__recovery-name")).toHaveText(/^Cards from \/work\/, \/services\/ on .+ \(\/\)$/);
  await expect(row.locator(".collections-panel__recovery-reason")).toHaveText("Its grid was changed in Code, so the editor cannot tell which element it is.");
  // The long error appears once, inside the row's closed details.
  await expect(settings.getByText(/can no longer be found exactly/)).toHaveCount(1);
  await expect(row.locator("details p")).toBeHidden();
  await row.getByText("Technical details").click();
  await expect(row.locator("details p")).toHaveText(`The collections on index.html can no longer be found exactly (Collection target is missing or ambiguous.). Undo the change that moved them, or open Page settings › Fields and forget the recipe there; its cards stay as they are. Recipe “${id}” in ${SIDECAR}, page index.html.`);
  await row.getByRole("button", { name: /^Forget recipe, keep cards: Cards from / }).click();
  await expect.poll(async () => Object.keys((await json(page)).collections ?? { pending: 1 })).toEqual([]);
  const forgotten = (await storedDraft(page, SIDECAR))!.content;
  const after = await json(page), before = JSON.parse(sidecar);
  delete before.collections[id];
  expect(after).toEqual(before);
  const broken = home.slice(0, at) + ' data-x="1"' + home.slice(at);
  expect((await storedDraft(page, "index.html"))!.content).toBe(broken);
  await expect(list).toHaveCount(0);
  // Forget is one Undo step of its own: Undo brings the recipe back exactly, Redo forgets it again; the page is untouched.
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, SIDECAR)).toBeUndefined();
  expect((await storedDraft(page, "index.html"))!.content).toBe(broken);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(forgotten);
  expect((await storedDraft(page, "index.html"))!.content).toBe(broken);
});

test("a collection whose page was deleted outside the editor can be forgotten alone, keeping other recipes and page fields", async ({ page, baseURL }) => {
  const { sidecar } = await saved(page, baseURL);
  const document = JSON.parse(sidecar);
  const [id] = Object.keys(document.collections);
  document.collections.gone = { ...document.collections[id], pagePath: "gone/index.html", label: "Old blog cards" };
  document.pages["about/index.html"] = { fields: { mood: "calm" }, keep: { unknown: true } };
  const seeded = JSON.stringify(document, null, 2) + "\n";
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: seeded } });
  await load(page, baseURL);
  await pagesTab(page);
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByRole("tab", { name: "Fields", exact: true }).click();
  const list = settings.getByRole("region", { name: "Collections that cannot be found" });
  const row = list.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".collections-panel__recovery-name")).toHaveText("Old blog cards on gone/index.html");
  await expect(row.locator(".collections-panel__recovery-reason")).toHaveText("This page no longer exists.");
  await row.getByRole("button", { name: "Forget recipe, keep cards: Old blog cards on gone/index.html" }).click();
  await expect.poll(async () => Object.keys((await json(page)).collections ?? {}).sort()).toEqual([id]);
  const after = await json(page);
  expect(after.pages["about/index.html"]).toEqual({ fields: { mood: "calm" }, keep: { unknown: true } });
  expect(after.collections[id]).toEqual(document.collections[id]);
  expect((await storedDrafts(page)).map((draft: { path: string }) => draft.path)).toEqual([SIDECAR]);
});
