import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { bakePageData } from "../../src/page-builder/document-collections";
import { storedDraft, storedDrafts } from "./drafts";

requireActualFixture();

// Moving old `field:` page metadata into the editor's JSON from Page settings ›
// Fields, on a copy of the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const POTTERY = "work/harbour-lane-pottery/index.html";
const starter = "fixtures/actual-starter";
const identity = { name: "Larkspur Studio" };
const meta = (field: string, value: string) => `  <meta name="field:${field}" content="${value}">\n`;
const legacyList = '<ul class="legacy-list" data-each="/work/" data-sort="client"><template><li><a href="{url}">{title}</a> for {client}</li></template></ul>';

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => statSync(`${dir}/${name}`).isDirectory() ? walk(`${dir}/${name}`, `${prefix}${name}/`) : [prefix + name]);
}
/** Branch files to seed: field metas on the work pages and a baked inline listing on Home. */
function seeded(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  const add = (path: string, lines: string) => { sources[path] = sources[path].replace("</head>", `${lines}</head>`); };
  add("work/fern-and-kettle/index.html", meta("client", "Fern Co"));
  add(POTTERY, meta("client", "Harbour Ltd") + meta("year", "2024"));
  add("work/meadow-row-allotments/index.html", meta("client", "Meadow Trust"));
  sources["index.html"] = sources["index.html"].replace("</main>", `${legacyList}\n</main>`);
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity, bakePageData(sources, Object.keys(sources)));
  if ("error" in baked) throw new Error(baked.error);
  for (const [path, edits] of Object.entries(baked.edits)) sources[path] = applyCollectionEdits(sources[path], edits);
  return { "index.html": sources["index.html"], "work/fern-and-kettle/index.html": sources["work/fern-and-kettle/index.html"], [POTTERY]: sources[POTTERY], "work/meadow-row-allotments/index.html": sources["work/meadow-row-allotments/index.html"] };
}
const existingJson = JSON.stringify({ version: 1, pages: { "about/index.html": { fields: { mood: "calm" }, keep: { unknown: true } } }, collections: {}, future: { kept: 1 } }, null, 2) + "\n";

async function seed(page: Page, baseURL: string | undefined, files: Record<string, string>) {
  await page.goto(baseURL!);
  for (const [path, content] of Object.entries(files)) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
}
async function load(page: Page, baseURL: string | undefined, path: string) {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openFields(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByRole("tab", { name: "Fields", exact: true }).click();
  return settings;
}
const moveButton = (scope: ReturnType<Page["getByRole"]>) => scope.getByRole("button", { name: "Move legacy fields to editor data", exact: true });

test("moving legacy fields keeps cards and other bytes, and one Undo restores the page and JSON", async ({ page, baseURL }) => {
  const files = seeded();
  await seed(page, baseURL, { ...files, [SIDECAR]: existingJson });
  await load(page, baseURL, POTTERY);
  const settings = await openFields(page);
  await expect(settings.getByText("This page keeps the fields client, year in its published HTML.", { exact: false })).toBeVisible();
  // Opening writes nothing.
  expect(await storedDrafts(page)).toEqual([]);
  await moveButton(settings).click();
  await expect.poll(async () => (await storedDraft(page, POTTERY))?.content).toBe(files[POTTERY].replace(meta("client", "Harbour Ltd") + meta("year", "2024"), ""));
  const json = JSON.parse((await storedDraft(page, SIDECAR))!.content);
  expect(json.pages[POTTERY]).toEqual({ fields: { client: "Harbour Ltd", year: "2024" } });
  expect(json.pages["about/index.html"]).toEqual({ fields: { mood: "calm" }, keep: { unknown: true } });
  expect(json.future).toEqual({ kept: 1 });
  // The listing on Home reads the same values from the JSON: its cards are unchanged, so no draft.
  expect((await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, POTTERY].sort());
  await expect(settings.locator(".collections-panel__status")).toHaveText("Moved client, year to the editor's data. Undo puts them back.");
  await expect(moveButton(settings)).toHaveCount(0);
  // The fields still show and edit inline from the JSON.
  await expect(settings.getByLabel("Client", { exact: true })).toHaveValue("Harbour Ltd");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", POTTERY);
  const moved = { page: (await storedDraft(page, POTTERY))!.content, json: (await storedDraft(page, SIDECAR))!.content };
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, POTTERY))?.content).toBe(moved.page);
  expect((await storedDraft(page, SIDECAR))?.content).toBe(moved.json);
  expect(await storedDraft(page, "index.html")).toBeUndefined();
});

test("a missing JSON is created by the move, and Undo removes it again", async ({ page, baseURL }) => {
  await seed(page, baseURL, seeded());
  await load(page, baseURL, "work/fern-and-kettle/index.html");
  const settings = await openFields(page);
  await moveButton(settings).click();
  await expect.poll(async () => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}").pages?.["work/fern-and-kettle/index.html"]).toEqual({ fields: { client: "Fern Co" } });
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  const created = { page: (await storedDraft(page, "work/fern-and-kettle/index.html"))!.content, json: (await storedDraft(page, SIDECAR))!.content };
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  // Redo brings back both drafts exactly: the page without its meta and the created JSON.
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(created.json);
  expect((await storedDraft(page, "work/fern-and-kettle/index.html"))?.content).toBe(created.page);
  expect((await storedDrafts(page)).map((draft) => draft.path).sort()).toEqual([SIDECAR, "work/fern-and-kettle/index.html"].sort());
});

test("a value that differs in the JSON shows both values; keeping the page value is one Undo over page, JSON and cards", async ({ page, baseURL }) => {
  const sidecar = JSON.stringify({ version: 1, pages: { [POTTERY]: { fields: { client: "Someone else" } } }, collections: {} }, null, 2) + "\n";
  const files = seeded();
  // The listing already shows the JSON value, as every listing reads it.
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  Object.assign(sources, files, { [SIDECAR]: sidecar });
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity, bakePageData(sources, Object.keys(sources)));
  if ("error" in baked) throw new Error(baked.error);
  await seed(page, baseURL, { ...files, "index.html": applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? []), [SIDECAR]: sidecar });
  await load(page, baseURL, POTTERY);
  const settings = await openFields(page);
  // Both values show inline; Move waits for an explicit choice and nothing is written meanwhile.
  await expect(settings.locator(".collections-panel__conflict legend")).toHaveText("client: the page has “Harbour Ltd”, the editor's data has “Someone else”");
  await expect(moveButton(settings)).toBeDisabled();
  expect(await storedDrafts(page)).toEqual([]);
  const home = (await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text());
  expect(home).toContain("Harbour Lane Pottery</a> for Someone else");
  await settings.getByRole("radio", { name: "Keep page value for client" }).check();
  await moveButton(settings).click();
  // One step: the page loses its metas, the JSON keeps the chosen page value, the Home cards show it.
  await expect.poll(async () => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}").pages?.[POTTERY]).toEqual({ fields: { client: "Harbour Ltd", year: "2024" } });
  expect((await storedDraft(page, POTTERY))!.content).toBe(files[POTTERY].replace(meta("client", "Harbour Ltd") + meta("year", "2024"), ""));
  const cards = (await storedDraft(page, "index.html"))!.content;
  expect(cards).toContain("Harbour Lane Pottery</a> for Harbour Ltd");
  expect(cards).not.toContain("Someone else");
  // Only the listing changed: everything outside it is byte-identical.
  const outside = (text: string) => text.slice(0, text.indexOf('<ul class="legacy-list"')) + text.slice(text.indexOf("</ul>", text.indexOf('<ul class="legacy-list"')));
  expect(outside(cards)).toBe(outside(home));
  const after = (await storedDrafts(page)).map((draft) => [draft.path, draft.content]);
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => [draft.path, draft.content])).toEqual(after);
});

test("keeping the editor value, and a stale choice refuses with no write", async ({ page, baseURL }) => {
  const sidecar = JSON.stringify({ version: 1, pages: { [POTTERY]: { fields: { client: "Someone & \"else\"" } } }, collections: {} }, null, 2) + "\n";
  const files = seeded();
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  Object.assign(sources, files, { [SIDECAR]: sidecar });
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity, bakePageData(sources, Object.keys(sources)));
  if ("error" in baked) throw new Error(baked.error);
  await seed(page, baseURL, { ...files, "index.html": applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? []), [SIDECAR]: sidecar });
  await load(page, baseURL, POTTERY);
  let settings = await openFields(page);
  await settings.getByRole("radio", { name: "Keep editor value for client" }).check();
  // A foreign edit after the choice: the panel redraws, the choice is gone, and Move waits again.
  const changed = await page.evaluate(async (path) => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource(path)!;
    editor.replaceActiveRange({ path, start: 0, end: 0, text: "<!-- foreign -->\n", expected: "" });
    return "<!-- foreign -->\n" + before;
  }, POTTERY);
  await expect.poll(async () => (await storedDraft(page, POTTERY))?.content).toBe(changed);
  if (await moveButton(settings).isEnabled()) {
    await moveButton(settings).click();
    await expect(settings.locator(".collections-panel__status")).toContainText("changed");
  }
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual([POTTERY]);
  expect((await storedDraft(page, POTTERY))!.content).toBe(changed);
  // Reopened on the newer page, the editor's value is kept exactly, entities and quotes included.
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  settings = await openFields(page);
  await settings.getByRole("radio", { name: "Keep editor value for client" }).check();
  await moveButton(settings).click();
  await expect.poll(async () => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}").pages?.[POTTERY]).toEqual({ fields: { client: "Someone & \"else\"", year: "2024" } });
  expect((await storedDraft(page, POTTERY))!.content).toContain("<!-- foreign -->");
  expect((await storedDraft(page, POTTERY))!.content).not.toContain("field:");
  expect(await storedDraft(page, "index.html")).toBeUndefined();
});

test("a field tag that is also a redirect is refused and kept: the move writes nothing", async ({ page, baseURL }) => {
  const files = seeded();
  files[POTTERY] = files[POTTERY].replace("</head>", '  <meta name="field:redirect" http-equiv="refresh" content="0;url=/other/">\n</head>');
  await seed(page, baseURL, files);
  await load(page, baseURL, POTTERY);
  const settings = await openFields(page);
  await moveButton(settings).click();
  await expect(settings.locator(".collections-panel__status")).toContainText("The field tag “field:redirect” also has http-equiv, which the page itself may use, so it is neither moved nor removed.");
  expect(await storedDrafts(page)).toEqual([]);
});

test("a page changed after the fields opened refuses the move and keeps the newer text", async ({ page, baseURL }) => {
  await seed(page, baseURL, { ...seeded(), [SIDECAR]: existingJson });
  await load(page, baseURL, POTTERY);
  const settings = await openFields(page);
  const changed = await page.evaluate(async (path) => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource(path)!;
    editor.replaceActiveRange({ path, start: 0, end: 0, text: "<!-- newer -->\n", expected: "" });
    return "<!-- newer -->\n" + before;
  }, POTTERY);
  await expect.poll(async () => (await storedDraft(page, POTTERY))?.content).toBe(changed);
  await moveButton(settings).click();
  await expect(settings.locator(".collections-panel__status")).toContainText("changed");
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual([POTTERY]);
  expect((await storedDraft(page, POTTERY))!.content).toBe(changed);
});

// Real await boundaries. Page settings opens only after every branch file is
// read (ensureNativeTextIndex), and the editor reads files by Git blob SHA, so
// that read is held at the network until the test releases it. Once open, the
// move itself crosses no network read: the JSON and pages are already read and
// the base of each edited file comes from the loaded tree. So the held await is
// the one before the fields are pinned, and the move must plan from what is
// true after it, keeping anything that arrived meanwhile.
async function holdSidecarRead(page: Page, content: string) {
  const bytes = Buffer.from(content);
  const sha = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
  let release!: () => void, asked = 0;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname.startsWith("/api/file") && decodeURIComponent(url.search).includes(sha), async (route) => { asked++; await held; await route.fallback(); });
  return { release, asked: () => asked };
}
async function loadHeld(page: Page, baseURL: string | undefined, path: string) {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(frame(page).locator("h1").first()).toBeVisible();
}
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const settingsDialog = (page: Page) => page.getByRole("dialog", { name: "Page settings", exact: true });
async function requestSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
}
const foreignEdit = (page: Page, text: string) => page.evaluate(async ({ path, text }) => {
  const editor = await import("/src/components/code-editor.ts");
  const before = editor.getMountedSource(path)!, at = before.indexOf("</head>");
  editor.replaceActiveRange({ path, start: at, end: at, text, expected: "" });
  return before.slice(0, at) + text + before.slice(at);
}, { path: POTTERY, text });

test("a foreign edit during the held read before the fields open is kept, and the move plans from it", async ({ page, baseURL }) => {
  const files = seeded();
  await seed(page, baseURL, { ...files, [SIDECAR]: existingJson });
  const hold = await holdSidecarRead(page, existingJson);
  await loadHeld(page, baseURL, POTTERY);
  await expect.poll(hold.asked).toBeGreaterThan(0);
  await requestSettings(page);
  await page.waitForTimeout(300);
  await expect(settingsDialog(page)).toHaveCount(0);
  // Arrives during the await: a foreign comment and a foreign field meta.
  const foreign = '<!-- foreign -->\n  <meta name="field:extra" content="Kept">\n';
  const changed = await foreignEdit(page, foreign);
  hold.release();
  const settings = settingsDialog(page);
  await settings.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(settings.getByText("This page keeps the fields client, year, extra", { exact: false })).toBeVisible();
  await moveButton(settings).click();
  await expect.poll(async () => (await storedDraft(page, POTTERY))?.content).toBe(changed.replace(meta("client", "Harbour Ltd") + meta("year", "2024"), "").replace('  <meta name="field:extra" content="Kept">\n', ""));
  expect((await storedDraft(page, POTTERY))!.content).toContain("<!-- foreign -->");
  const json = JSON.parse((await storedDraft(page, SIDECAR))!.content);
  expect(json.pages[POTTERY]).toEqual({ fields: { client: "Harbour Ltd", year: "2024", extra: "Kept" } });
  expect(json.pages["about/index.html"]).toEqual({ fields: { mood: "calm" }, keep: { unknown: true } });
  await page.unroute(() => true);
});

test("a conflicting value found only by the held JSON read waits for a choice, with no write", async ({ page, baseURL }) => {
  const sidecar = JSON.stringify({ version: 1, pages: { [POTTERY]: { fields: { year: "1999" } } }, collections: {} }, null, 2) + "\n";
  const files = seeded();
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  Object.assign(sources, files, { [SIDECAR]: sidecar });
  await seed(page, baseURL, { ...files, [SIDECAR]: sidecar });
  const hold = await holdSidecarRead(page, sidecar);
  await loadHeld(page, baseURL, POTTERY);
  await expect.poll(hold.asked).toBeGreaterThan(0);
  await requestSettings(page);
  await page.waitForTimeout(300);
  hold.release();
  const settings = settingsDialog(page);
  await settings.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(settings.locator(".collections-panel__conflict legend")).toHaveText("year: the page has “2024”, the editor's data has “1999”");
  await expect(moveButton(settings)).toBeDisabled();
  expect(await storedDrafts(page)).toEqual([]);
  await page.unroute(() => true);
});

test("a branch switch during the held read before the fields open opens nothing for the old branch; the new branch moves only what it shows", async ({ page, baseURL }) => {
  const files = seeded();
  await seed(page, baseURL, { ...files, [SIDECAR]: existingJson });
  // The feature branch differs in a field no listing shows, so its cards stay current.
  const featurePage = files[POTTERY].replace('content="2024"', 'content="2025"');
  expect((await page.request.post(`${baseURL}/__demo/branch`, { data: { name: "feature", path: POTTERY, content: featurePage } })).ok()).toBeTruthy();
  const hold = await holdSidecarRead(page, existingJson);
  await loadHeld(page, baseURL, POTTERY);
  await expect.poll(hold.asked).toBeGreaterThan(0);
  await requestSettings(page);
  await page.waitForTimeout(300);
  await expect(settingsDialog(page)).toHaveCount(0);
  await page.goto(`${baseURL}/#repo=501&branch=feature&file=${encodeURIComponent(POTTERY)}`);
  hold.release();
  await expect(frame(page).locator("h1").first()).toBeVisible();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", POTTERY, { timeout: 30_000 });
  await page.waitForTimeout(500);
  // The main-branch request never opens over the feature branch.
  await expect(settingsDialog(page)).toHaveCount(0);
  expect(await storedDrafts(page)).toEqual([]);
  await page.unroute(() => true);
  const settings = await openFields(page);
  await expect(settings.getByLabel("Year", { exact: true })).toHaveValue("2025");
  await moveButton(settings).click();
  await expect.poll(async () => JSON.parse((await storedDraft(page, SIDECAR))?.content ?? "{}").pages?.[POTTERY]).toEqual({ fields: { client: "Harbour Ltd", year: "2025" } });
  expect((await storedDraft(page, POTTERY))!.content).toBe(featurePage.replace(meta("client", "Harbour Ltd") + meta("year", "2025"), ""));
});

test("after every page's fields moved, a legacy card still says where it comes from and opens its page", async ({ page, baseURL }) => {
  const files = seeded();
  const pages: Record<string, { fields: Record<string, string> }> = {};
  const moved: Record<string, string> = { "index.html": files["index.html"] };
  for (const [path, value] of [["work/fern-and-kettle/index.html", "Fern Co"], [POTTERY, "Harbour Ltd"], ["work/meadow-row-allotments/index.html", "Meadow Trust"]] as const) {
    moved[path] = readFileSync(`${starter}/${path}`, "utf8");
    pages[path] = { fields: path === POTTERY ? { client: value, year: "2024" } : { client: value } };
  }
  await seed(page, baseURL, { ...moved, [SIDECAR]: JSON.stringify({ version: 1, pages, collections: {} }, null, 2) + "\n" });
  await load(page, baseURL, "index.html");
  const bar = page.getByRole("toolbar", { name: "Edit bar", exact: true });
  await frame(page).locator(".legacy-list a", { hasText: "Fern & Kettle" }).click();
  await expect(bar).toContainText("From /work/fern-and-kettle/");
  await bar.getByRole("button", { name: "Edit page data", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/fern-and-kettle/index.html");
  expect(await storedDrafts(page)).toEqual([]);
});
