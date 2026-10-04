import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

// A page Title write (the Pages tab's Rename) awaits the listed-page check
// before it writes. A source edit landing in that await (here: the public
// editor API, called in the same browser task right after the rename field's
// Enter, so it runs before the write's continuation) must be refused, never
// overwritten, and the collection listing and the editor's JSON stay untouched.
const SIDECAR = ".editor/page-builder.json";
const REFUSED = "The page changed meanwhile. Try again.";
const FOREIGN = "<!-- foreign edit -->\n";
const fixture = "fixtures/native-starter";
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
const record = (title: string, date: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="description" content="About ${title}">\n  <meta name="date" content="${date}">\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;
const listing = `<section class="cards" data-key="work-list" data-each="/work/" data-sort="-date" aria-label="Work"><template><article class="card"><h3>{title}</h3><time>{date}</time></article></template></section>`;

/** Work pages plus Home listing them, baked exactly as the editor bakes them. */
function bakedSeed(titleOne = "One"): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const file of files(fixture)) if (/\.html?$/i.test(file)) sources[relative(fixture, file)] = readFileSync(file, "utf8");
  sources["work/one/index.html"] = record("One", "2025-01-01").replace("<title>One</title>", `<title>${titleOne}</title>`);
  sources["work/two/index.html"] = record("Two", "2026-01-01");
  sources["index.html"] = sources["index.html"].replace('<section class="filler"', `${listing}\n  <section class="filler"`);
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), { name: "" });
  if ("error" in baked) throw new Error(baked.error);
  return { ...sources, "index.html": applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? []) };
}
const SEED = bakedSeed();
const PAGE = "work/one/index.html";

const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
async function seed(page: Page, baseURL: string | undefined, file: string) {
  await page.goto(`${baseURL}/`);
  for (const path of ["work/one/index.html", "work/two/index.html", "index.html"])
    await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content: SEED[path] } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  expect(await mounted(page, file)).toBe(SEED[file] ?? readFileSync(join(fixture, file), "utf8"));
}
const explorer = (page: Page) => page.locator("#explorer");
/**
 * Renames `label` in the Pages tab: the real rename field is filled, then its
 * real Enter handler starts the Title write and, in the same task, FOREIGN is
 * inserted at the start of the mounted source through the public editor API.
 * The write is then parked at its first await (the listed-page check), so the
 * foreign edit lands strictly between its capture and its continuation.
 */
async function renameThenEditSource(page: Page, path: string, label: string, value: string, foreign = true) {
  if (!(await explorer(page).isVisible())) await page.locator("#explorer-toggle").click();
  await explorer(page).getByRole("tab", { name: "Pages" }).click();
  await explorer(page).getByRole("treeitem", { name: label, exact: true }).focus();
  await page.keyboard.press("F2");
  const field = explorer(page).getByRole("textbox", { name: `Title of ${label}` });
  await field.fill(value);
  return field.evaluate(async (input, { path, foreign }) => {
    const editor = await import("/src/components/code-editor.ts");
    const before = editor.getMountedSource(path)!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    // The handler ran synchronously up to its first await; the source is still untouched.
    const untouched = editor.getMountedSource(path) === before;
    if (foreign) editor.replaceActiveRange({ path, start: 0, end: 0, expected: "", text: foreign });
    return { before, untouched };
  }, { path, foreign: foreign ? FOREIGN : "" });
}
async function expectRefusedThenUndo(page: Page, path: string, before: string) {
  await expect(page.locator("#status")).toHaveText(REFUSED);
  expect(await mounted(page, path)).toBe(FOREIGN + before);
  // Only the foreign edit was written: no listing rebuild, no JSON.
  expect((await storedDrafts(page)).map((draft) => [draft.path, draft.content])).toEqual([[path, FOREIGN + before]]);
  expect(await storedDraft(page, "index.html")).toBeUndefined();
  expect(await storedDraft(page, SIDECAR)).toBeUndefined();
  // One Undo removes the foreign edit only, back to the seeded source.
  expect(await page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), path)).toBe(true);
  expect(await mounted(page, path)).toBe(before);
}

test("a listed page's Rename refuses a source edit made during the listed check; retry rebuilds the listing in one Undo", async ({ page, baseURL }) => {
  await seed(page, baseURL, PAGE);
  const { before, untouched } = await renameThenEditSource(page, PAGE, "One", "One renamed");
  expect(untouched).toBe(true);
  expect(before).toBe(SEED[PAGE]);
  await expectRefusedThenUndo(page, PAGE, before);

  // Retry without interference: the title and Home's listing change together, one Undo takes both back.
  await renameThenEditSource(page, PAGE, "One", "One renamed", false);
  await expect(page.locator("#status")).toHaveText("Renamed One to One renamed");
  const expected = bakedSeed("One renamed");
  expect(expected["index.html"]).toContain("<h3>One renamed</h3>");
  // The title write also adds the social title, as for any page.
  expect(await mounted(page, PAGE)).toBe(expected[PAGE].replace('  <link rel="stylesheet"', '  <meta property="og:title" content="One renamed">\n  <link rel="stylesheet"'));
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(expected["index.html"]);
  expect(await storedDraft(page, SIDECAR)).toBeUndefined();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Undid changing the title of One.");
  expect(await mounted(page, PAGE)).toBe(SEED[PAGE]);
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? SEED["index.html"]).toBe(SEED["index.html"]);
});

test("an unlisted page's Rename refuses a source edit made during the listed check", async ({ page, baseURL }) => {
  const path = "about/index.html";
  await seed(page, baseURL, path);
  const label = /<title>([^<]*)<\/title>/.exec(readFileSync(join(fixture, path), "utf8"))![1];
  const { before, untouched } = await renameThenEditSource(page, path, label, "About renamed");
  expect(untouched).toBe(true);
  await expectRefusedThenUndo(page, path, before);
});

// The same race on a page that a collection in the editor's JSON lists: the
// recipe lives in .editor/page-builder.json and Home holds plain cards only.
// (This is a page-source edit during the JSON-aware listed check, not an edit
// of the JSON file itself.)
test("a page listed through the editor's JSON: Rename refuses a source edit made during the listed check; retry is one Undo", async ({ page, baseURL }) => {
  const file = async (path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
  await seed(page, baseURL, "index.html");
  // Move the listing's recipe into the JSON through the collection settings, then Save it, so the baseline has no drafts.
  await page.frameLocator(".native-preview-frame").locator('section[data-key="work-list"]').click({ position: { x: 2, y: 2 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  const settings = page.getByRole("region", { name: "Collection settings", exact: true });
  await settings.getByRole("combobox", { name: "Order", exact: true }).selectOption("ascending");
  await settings.getByRole("button", { name: "Save collection", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"pagePath": "index.html"');
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  const home = await file("index.html"), sidecar = await file(SIDECAR);
  expect(home).not.toMatch(/data-each|<template/);
  expect(home).toContain("<h3>One</h3>");
  expect(Object.values(JSON.parse(sidecar).collections)).toEqual([expect.objectContaining({ pagePath: "index.html", folders: ["/work/"], sort: "date" })]);

  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(PAGE)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", PAGE, { timeout: 30_000 });
  const { before, untouched } = await renameThenEditSource(page, PAGE, "One", "One renamed");
  expect(untouched).toBe(true);
  expect(before).toBe(SEED[PAGE]);
  await expectRefusedThenUndo(page, PAGE, before);
  expect(await file("index.html")).toBe(home);
  expect(await file(SIDECAR)).toBe(sidecar);

  // Retry: the title, Home's cards and the JSON's recorded output change as one step; one Undo restores the baseline.
  await renameThenEditSource(page, PAGE, "One", "One renamed", false);
  await expect(page.locator("#status")).toHaveText("Renamed One to One renamed");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home.replace("<h3>One</h3>", "<h3>One renamed</h3>"));
  // The JSON changes only in the recorded output fingerprint of the renamed card.
  expect(sidecar.split("<h3>One</h3>")).toHaveLength(2);
  expect((await storedDraft(page, SIDECAR))?.content).toBe(sidecar.replace("<h3>One</h3>", "<h3>One renamed</h3>"));
  expect(await mounted(page, PAGE)).toBe(SEED[PAGE].replace("<title>One</title>", "<title>One renamed</title>").replace('  <link rel="stylesheet"', '  <meta property="og:title" content="One renamed">\n  <link rel="stylesheet"'));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Undid changing the title of One.");
  expect(await mounted(page, PAGE)).toBe(SEED[PAGE]);
  await expect.poll(() => storedDrafts(page)).toEqual([]);
});
