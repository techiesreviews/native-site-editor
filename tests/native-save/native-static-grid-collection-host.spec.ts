import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { storedDraft, storedDrafts, effectiveSource } from "./drafts";
import { showStylePanel } from "./style-panel-controls";

const kind = fixtureKind();
test.skip(kind !== "native-static", "Requires the native static starter; see docs/page-builder/collections.md.");
const side = ".editor/page-builder.json";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const panel = (page: Page) => page.getByRole("region", { name: "Collection settings", exact: true });
const mounted = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const file = async (page: Page, baseURL: string | undefined, path: string) => {
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
};
const servicePath = "services/design/index.html";
const service = '<!doctype html><html><head><title>Design service · Larkspur Studio</title><meta name="description" content="An accessible design service."></head><body><main><h1>Design service</h1></main></body></html>';
async function open(page: Page, baseURL: string | undefined, services = false) {
  await page.goto(baseURL!);
  if (services) {
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: servicePath, content: service } })).status()).toBe(204);
    const document = JSON.parse((await file(page, baseURL, side)) ?? '{"version":1,"pages":{},"collections":{}}');
    document.futureTop = { keep: [1, { deep: true }] };
    document.pages[servicePath] = { fields: { mood: "calm" }, futurePage: { keep: true } };
    expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: side, content: JSON.stringify(document) } })).status()).toBe(204);
  }
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator(".cards > article.card-project")).toHaveCount(3);
  const before = (await mounted(page))!;
  expect(typeof before).toBe("string");
  await frame(page).locator(".cards > article.card-project h3").first().click();
  await showStylePanel(page);
  await expect(page.locator(".selected-collection > summary")).toBeVisible();
  await page.locator(".selected-collection > summary").click();
  await expect(panel(page).getByRole("heading", { name: "Choose pages for this grid" })).toBeVisible();
  expect(await mounted(page)).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
  return before;
}
function plain(source: string) {
  expect(source).toMatch(/^<!doctype html>/i);
  expect(source).toContain("</html>");
  expect(source).not.toMatch(/<template|<card-project|data-each|data-fields|data-collection-id|data-if|\{title\}/);
}

test("the native starter's three literal cards become a JSON collection byte for byte, one Undo and Redo", async ({ page, baseURL }) => {
  const before = await open(page, baseURL);
  const beforeJson = await effectiveSource(page, baseURL, side);
  await expect(panel(page).getByRole("checkbox", { name: "/work/", exact: true })).toBeChecked();
  await expect(panel(page)).toContainText("3 pages will show, including all 3 current cards exactly");
  await panel(page).getByRole("button", { name: "Convert", exact: true }).click();
  await expect.poll(async () => Object.keys(JSON.parse((await effectiveSource(page, baseURL, side))!).collections ?? {}).length).toBe(1);
  const home = (await mounted(page))!;
  const cards = (source: string) => source.match(/<article class="card-project">[\s\S]*?<\/article>/g);
  expect(cards(home)).toEqual(cards(before));
  // Baking may normalise the separators between cards; the surrounding page is untouched.
  const outside = (source: string) => source.replace(/<div class="cards">[\s\S]*?<\/div>/, "[cards]");
  expect(outside(home)).toBe(outside(before));
  plain(home);
  const after = (await storedDraft(page, side))!.content;
  const document = JSON.parse(after);
  const [record] = Object.values(document.collections) as { pagePath: string; folders: string[]; outputFingerprint: string; fields: string[]; overrides: Record<string, Record<string, string>> }[];
  expect(record).toMatchObject({ pagePath: "index.html", folders: ["/work/"] });
  expect(home).toContain(record.outputFingerprint);
  const note = record.fields.find(field => field.endsWith("-card-note"));
  expect(note).toBeDefined();
  expect(Object.values(record.overrides).some(fields => fields[note!] === "Cafe · Identity and site · 2025")).toBe(true);
  await expect(panel(page).getByRole("combobox", { name: "Sort by", exact: true })).toBeVisible();
  expect(await panel(page).getByRole("combobox", { name: "Sort by", exact: true }).locator("option").allTextContents()).toContain("Card note");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, side)).toBe(beforeJson);
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => effectiveSource(page, baseURL, side)).toBe(after);
  expect(await mounted(page)).toBe(home);
  expect((await storedDrafts(page)).map(draft => draft.path)).toEqual([side, "index.html"]);
  await page.reload();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  await frame(page).locator(".cards > article.card-project h3").first().click();
  await showStylePanel(page);
  if (await page.locator(".selected-collection").getAttribute("open") === null) await page.locator(".selected-collection > summary").click();
  const sort = panel(page).getByRole("combobox", { name: "Sort by", exact: true });
  await expect(sort.locator(`option[value="${note}"]`)).toHaveText("Card note");
  await sort.selectOption(note!);
  await panel(page).getByRole("button", { name: "Save collection", exact: true }).click();
  await expect.poll(async () => Object.values(JSON.parse((await effectiveSource(page, baseURL, side))!).collections).map((record: any) => record.sort)).toEqual([note]);
  const [saved] = Object.values(JSON.parse((await effectiveSource(page, baseURL, side))!).collections) as { fieldLabels: Record<string, string> }[];
  expect(saved.fieldLabels[note!]).toBe("Card note");
  await expect(sort.locator(`option[value="${note}"]`)).toHaveText("Card note");
});

test("work and service folders keep the existing literal cards and page metadata, with atomic Undo and Redo", async ({ page, baseURL }) => {
  const before = await open(page, baseURL, true);
  const beforeJson = await effectiveSource(page, baseURL, side);
  await panel(page).getByRole("checkbox", { name: "/services/", exact: true }).check();
  await expect(panel(page)).toContainText("4 pages will show, including all 3 current cards exactly");
  expect(await storedDrafts(page)).toEqual([]);
  await panel(page).getByRole("button", { name: "Convert", exact: true }).click();
  await expect(frame(page).locator(".cards > article.card-project")).toHaveCount(4);
  const home = (await storedDraft(page, "index.html"))!.content;
  const json = (await storedDraft(page, side))!.content;
  plain(home);
  for (const text of ["Cafe · Identity and site · 2025", "A quiet portfolio for a working potter", "Read about Harbour Lane Pottery"]) expect(home).toContain(text);
  expect(home).toContain('href="/services/design/"');
  expect(home).toContain("An accessible design service.");
  expect(await effectiveSource(page, baseURL, servicePath)).toBe(service);
  expect(await storedDraft(page, servicePath)).toBeUndefined();
  expect(JSON.parse(json).pages).toEqual(JSON.parse(beforeJson!).pages);
  expect(JSON.parse(json).futureTop).toEqual({ keep: [1, { deep: true }] });
  const [record] = Object.values(JSON.parse(json).collections) as { folders: string[]; outputFingerprint: string; fields: string[]; overrides: Record<string, Record<string, string>> }[];
  expect(record.folders).toEqual(["/work/", "/services/"]);
  expect(home).toContain(record.outputFingerprint);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => mounted(page)).toBe(before);
  await expect.poll(() => effectiveSource(page, baseURL, side)).toBe(beforeJson);
  expect(await storedDrafts(page)).toEqual([]);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => mounted(page)).toBe(home);
  expect(await effectiveSource(page, baseURL, side)).toBe(json);
  expect((await storedDrafts(page)).map(draft => draft.path)).toEqual([side, "index.html"]);
});

test("a natural Code edit after folder choices refuses stale Convert and preserves the foreign source", async ({ page, baseURL }) => {
  const before = await open(page, baseURL, true);
  await panel(page).getByRole("checkbox", { name: "/services/", exact: true }).check();
  await expect(panel(page).getByRole("button", { name: "Convert", exact: true })).toBeEnabled();
  const foreign = `<!-- foreign Code edit -->\n${before}`;
  await page.evaluate(text => navigator.clipboard.writeText(text), foreign);
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => mounted(page)).toBe(foreign);
  await panel(page).getByRole("button", { name: "Convert", exact: true }).click();
  await expect(panel(page)).toContainText("changed");
  expect(await mounted(page)).toBe(foreign);
  expect((await storedDrafts(page)).map(draft => draft.path)).toEqual(["index.html"]);
  expect(await effectiveSource(page, baseURL, servicePath)).toBe(service);
});

// Convert reads nothing from GitHub once the panel is open, so nothing real
// can be held in flight. These cases hold the host's own lookup of the
// editor's JSON (RepositoryIndex.find, awaited between planning and writing
// the drafts) and change the branch, the repository snapshot, the repository
// or the account while it waits.
async function holdConvert(page: Page) {
  await page.evaluate(async (path) => {
    const { RepositoryIndex } = await import("/src/repository-loading.ts");
    const original = RepositoryIndex.prototype.find;
    const state = window as unknown as { convertHeld?: boolean; releaseConvert?: () => void };
    const gate = new Promise<void>((resolve) => { state.releaseConvert = resolve; });
    state.convertHeld = false;
    RepositoryIndex.prototype.find = async function (this: InstanceType<typeof RepositoryIndex>, ...args: Parameters<typeof original>) {
      if (args[3] === path) { RepositoryIndex.prototype.find = original; state.convertHeld = true; await gate; }
      return original.apply(this, args);
    };
  }, side);
}
async function convertHeld(page: Page) {
  await holdConvert(page);
  await panel(page).getByRole("button", { name: "Convert", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { convertHeld?: boolean }).convertHeld)).toBe(true);
  expect(await storedDrafts(page)).toEqual([]);
}
const release = (page: Page) => page.evaluate(() => (window as unknown as { releaseConvert(): void }).releaseConvert());
const stale = /changed meanwhile/;
async function untouched(page: Page, home: string) {
  // Let the released Convert run to its end before reading what it left.
  await page.waitForTimeout(500);
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(home);
  await expect(frame(page).locator(".cards > article.card-project")).toHaveCount(3);
}

test("switching branch while Convert waits refuses it and leaves the new branch untouched", async ({ page, baseURL }) => {
  const before = await open(page, baseURL);
  const feature = before.replace("</body>", "<!-- feature branch -->\n</body>");
  expect(feature).not.toBe(before);
  expect((await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature", path: "index.html", content: feature } })).status()).toBe(204);
  await convertHeld(page);
  await page.evaluate(() => { location.hash = "#repo=501&branch=feature&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with feature", { timeout: 30_000 });
  await expect.poll(() => mounted(page)).toBe(feature);
  await release(page);
  await expect(page.locator("#status")).toHaveText(stale);
  await untouched(page, feature);
  expect(await file(page, baseURL, side)).toBeUndefined();
});

test("refreshing the repository while Convert waits refuses it and keeps the newer commit", async ({ page, baseURL }) => {
  const before = await open(page, baseURL);
  const newer = before.replace("</body>", "<!-- committed on GitHub meanwhile -->\n</body>");
  await convertHeld(page);
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "index.html", content: newer } })).status()).toBe(204);
  await page.locator("#refresh").evaluate((button) => (button as HTMLButtonElement).click());
  await expect.poll(() => mounted(page), { timeout: 30_000 }).toBe(newer);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await release(page);
  await expect(page.locator("#status")).toHaveText(stale);
  await untouched(page, newer);
  expect(await file(page, baseURL, side)).toBeUndefined();
});

test("refreshing an unchanged repository while Convert waits still refuses the older session's Convert to an existing JSON", async ({ page, baseURL }) => {
  // With the editor's JSON on the branch, Convert edits it rather than creating it.
  const before = await open(page, baseURL, true);
  const json = await file(page, baseURL, side);
  expect(json).toBeDefined();
  await panel(page).getByRole("checkbox", { name: "/services/", exact: true }).check();
  await expect(panel(page)).toContainText("4 pages will show");
  await convertHeld(page);
  await page.locator("#refresh").evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await release(page);
  await expect(page.locator("#status")).toHaveText(stale);
  await untouched(page, before);
  expect(await file(page, baseURL, side)).toBe(json);
  expect(await effectiveSource(page, baseURL, servicePath)).toBe(service);
});

test("switching repository while Convert waits refuses it and leaves the other repository untouched", async ({ page, baseURL }) => {
  await open(page, baseURL);
  expect((await page.request.post(`${baseURL}/__demo/onboarding`, { data: { org: true } })).status()).toBe(204);
  const other = await (await page.request.get(`${baseURL}/__demo/file?repo=org-site&path=index.html`)).text();
  await convertHeld(page);
  await page.evaluate(() => { location.hash = "#repo=700&branch=main&file=index.html"; });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect.poll(() => mounted(page), { timeout: 30_000 }).toBe(other);
  await release(page);
  await expect(page.locator("#status")).toHaveText(stale);
  await untouched(page, other);
  expect(await file(page, baseURL, side)).toBeUndefined();
});
