import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { bakePageData } from "../../src/page-builder/document-collections";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { storedDrafts } from "./drafts";

requireActualFixture();

// Site settings › Pages › "Move editor data out of pages" on an old-style copy
// of the actual starter (inline listings and field tags), run with
// ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const starter = "fixtures/actual-starter";
const identity = { name: "Larkspur Studio" };
const FERN = "work/fern-and-kettle/index.html", POTTERY = "work/harbour-lane-pottery/index.html", MEADOW = "work/meadow-row-allotments/index.html";
const meta = (field: string, value: string) => `  <meta name="field:${field}" content="${value}">\n`;
const homeRecipe = ' data-each="/work/" data-sort="client"', homeTemplate = '<template><li><a href="{url}">{title}</a> for {client}</li></template>';
const aboutRecipe = ' data-each="/work/" data-limit="2"', aboutTemplate = '<template><li class="recent">{title}</li></template>';
const metas: Record<string, string> = { [FERN]: meta("client", "Fern Co"), [POTTERY]: meta("client", "Harbour Ltd") + meta("year", "2024"), [MEADOW]: meta("client", "Meadow Trust") };
const PAGES = ["about/index.html", "index.html", FERN, POTTERY, MEADOW].sort();

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => statSync(`${dir}/${name}`).isDirectory() ? walk(`${dir}/${name}`, `${prefix}${name}/`) : [prefix + name]);
}
/** The five old-style pages: field tags on the work pages, baked inline listings on Home and About. */
function seeded(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const path of walk(starter)) if (/\.(html|json)$/.test(path)) sources[path] = readFileSync(`${starter}/${path}`, "utf8");
  for (const [path, lines] of Object.entries(metas)) sources[path] = sources[path].replace("</head>", `${lines}</head>`);
  sources["index.html"] = sources["index.html"].replace("</main>", `<ul class="legacy-list"${homeRecipe}>${homeTemplate}</ul>\n</main>`);
  sources["about/index.html"] = sources["about/index.html"].replace("</main>", `<ol class="recent-work" id="recent"${aboutRecipe}>${aboutTemplate}</ol>\n</main>`);
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), identity, bakePageData(sources, Object.keys(sources)));
  if ("error" in baked) throw new Error(baked.error);
  for (const [path, edits] of Object.entries(baked.edits)) sources[path] = applyCollectionEdits(sources[path], edits);
  return Object.fromEntries(PAGES.map((path) => [path, sources[path]]));
}
/** Each page exactly without its editor data, and nothing else. */
function cleaned(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const path of PAGES) result[path] = files[path];
  result["index.html"] = result["index.html"].replace(homeRecipe, "").replace(homeTemplate, "");
  result["about/index.html"] = result["about/index.html"].replace(aboutRecipe, "").replace(aboutTemplate, "");
  for (const [path, lines] of Object.entries(metas)) result[path] = result[path].replace(lines, "");
  return result;
}

/**
 * Every changed page served as plain files with scripts off and no .editor
 * folder: `drafts` (when given) stand in for the branch file. One full-page
 * screenshot per page.
 */
async function render(page: Page, baseURL: string | undefined, drafts: Record<string, string> = {}) {
  const site = await page.context().browser()!.newContext({ javaScriptEnabled: false, viewport: { width: 1200, height: 900 } });
  const plain = await site.newPage();
  const errors: string[] = [], requests: string[] = [];
  plain.on("pageerror", (error) => errors.push(String(error)));
  await plain.route("http://site.test/**", async (route) => {
    let path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    if (!path || path.endsWith("/")) path += "index.html";
    requests.push(path);
    if (path.startsWith(".editor/")) return route.fulfill({ status: 404, body: "" });
    const type = path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".js") ? "text/javascript" : /\.(png|jpe?g|webp)$/.test(path) ? `image/${path.split(".").pop()!.replace("jpg", "jpeg")}` : "text/html";
    if (Object.hasOwn(drafts, path)) return route.fulfill({ body: drafts[path], contentType: type });
    const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
    if (!response.ok()) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: await response.body(), contentType: type });
  });
  const shots: Record<string, Buffer> = {}, texts: Record<string, string> = {};
  for (const path of PAGES) {
    await plain.goto(`http://site.test/${path}`);
    texts[path] = await plain.locator("body").innerText();
    shots[path] = await plain.screenshot({ fullPage: true });
  }
  await site.close();
  return { shots, texts, requests, errors };
}

async function seed(page: Page, baseURL: string | undefined, files: Record<string, string>) {
  await page.goto(baseURL!);
  for (const [path, content] of Object.entries(files)) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
}
async function openSiteSettings(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  return reopenSiteSettings(page);
}
async function reopenSiteSettings(page: Page) {
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "Site settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Site settings", exact: true });
  await settings.getByRole("tab", { name: "Pages", exact: true }).click();
  return settings;
}
const drafted = async (page: Page) => (await storedDrafts(page)).map((draft) => [draft.path, draft.content, Boolean(draft.deleted)] as const);

test("one action moves every page's editor data into the JSON; pages render identically without .editor; one Undo and Redo", async ({ page, baseURL }) => {
  const files = seeded();
  await seed(page, baseURL, files);
  const before = await render(page, baseURL);
  expect(before.texts["index.html"]).toContain("Fern & Kettle for Fern Co");

  const settings = await openSiteSettings(page, baseURL);
  const box = settings.getByRole("group", { name: "Editor data in pages", exact: true });
  await expect(box).toContainText("5 pages still keep editor-only data in their HTML: 2 listing recipes and 4 page fields.");
  // Opening writes nothing.
  expect(await storedDrafts(page)).toEqual([]);
  await settings.screenshot({ path: ".scratch/native-save/editor-data-migration.png" });
  await box.getByRole("button", { name: "Move editor data out of pages", exact: true }).click();
  await expect(box).toContainText("Moved the editor data out of 5 pages as one draft. Undo puts every file back.");
  await expect(box.getByRole("button", { name: "Move editor data out of pages" })).toHaveCount(0);
  await expect(settings.locator(".site-settings__status")).toHaveText("");

  // Exactly five pages lose only their editor data, and the JSON is created with it.
  const expected = cleaned(files);
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path)).toEqual([SIDECAR, ...PAGES].sort());
  for (const draft of await storedDrafts(page)) if (draft.path !== SIDECAR) expect(draft.content, draft.path).toBe(expected[draft.path]);
  const json = JSON.parse((await storedDrafts(page)).find((draft) => draft.path === SIDECAR)!.content);
  expect(Object.values(json.collections).map((item: any) => item.pagePath).sort()).toEqual(["about/index.html", "index.html"]);
  expect(json.pages[POTTERY]).toEqual({ fields: { client: "Harbour Ltd", year: "2024" } });
  const moved = await drafted(page);

  // Served without scripts or .editor, every page looks and reads exactly as before.
  const after = await render(page, baseURL, Object.fromEntries(moved.filter(([path]) => path !== SIDECAR).map(([path, content]) => [path, content])));
  expect(after.requests.some((path) => path.startsWith(".editor"))).toBe(false);
  expect(after.errors).toEqual([]);
  for (const path of PAGES) {
    expect(after.texts[path], path).toBe(before.texts[path]);
    expect(after.shots[path].equals(before.shots[path]), `${path} renders identically`).toBe(true);
  }

  // Reopened, the action is no longer offered.
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await reopenSiteSettings(page);
  await expect(settings.getByRole("group", { name: "404 page", exact: true })).toBeVisible();
  await expect(settings.getByRole("group", { name: "Editor data in pages" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();

  // One Undo puts all six files back (the JSON did not exist); Redo re-applies them exactly.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).length).toBe(0);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(() => drafted(page)).toEqual(moved);
});

test("malformed inline data refuses the move with its reason and writes nothing", async ({ page, baseURL }) => {
  const files = seeded();
  // A field tag in the body cannot be moved safely.
  files[MEADOW] = files[MEADOW].replace("</main>", '<meta name="field:client" content="x"></main>');
  await seed(page, baseURL, files);
  const settings = await openSiteSettings(page, baseURL);
  const box = settings.getByRole("group", { name: "Editor data in pages", exact: true });
  await box.getByRole("button", { name: "Move editor data out of pages", exact: true }).click();
  await expect(settings.locator(".site-settings__status")).toContainText(`${MEADOW}: `);
  await expect(settings.locator(".site-settings__status")).toContainText("Nothing was changed.");
  await expect(box.getByRole("button", { name: "Move editor data out of pages", exact: true })).toBeEnabled();
  expect(await storedDrafts(page)).toEqual([]);
});
