import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { storedDraft, storedDrafts } from "./drafts";

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
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity);
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
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
});

test("a value that differs in the JSON refuses with the field name and writes nothing", async ({ page, baseURL }) => {
  const sidecar = JSON.stringify({ version: 1, pages: { [POTTERY]: { fields: { client: "Someone else" } } }, collections: {} }, null, 2) + "\n";
  const files = seeded();
  // The listing already shows the JSON value, as every listing reads it.
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  Object.assign(sources, files, { [SIDECAR]: sidecar });
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity);
  if ("error" in baked) throw new Error(baked.error);
  await seed(page, baseURL, { ...files, "index.html": applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? []), [SIDECAR]: sidecar });
  await load(page, baseURL, POTTERY);
  const settings = await openFields(page);
  await moveButton(settings).click();
  await expect(settings.locator(".collections-panel__status")).toContainText("client");
  await expect(settings.locator(".collections-panel__status")).toContainText("Nothing was moved");
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
