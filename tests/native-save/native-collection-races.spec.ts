import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { storedDraft, storedDrafts } from "./drafts";

// Collection operations on one page and on a broken editor JSON: they refuse
// whole, or write only their own explicitly accepted target, never a fallback.
const SIDECAR = ".editor/page-builder.json";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const record = (title: string, date: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="date" content="${date}">\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;
const listing = (key: string) => `<section class="cards" data-key="${key}" data-each="/work/" data-sort="-date" aria-label="Work"><template><article class="card"><h3>{title}</h3><time>{date}</time></article></template></section>`;
const fixture = "fixtures/native-starter";
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);

/** Work pages plus Home with the given listings, baked exactly as the editor bakes them. */
function bakedSeed(keys = ["work-list"]): [string, string][] {
  const sources: Record<string, string> = {};
  for (const file of files(fixture)) if (/\.html?$/i.test(file)) sources[relative(fixture, file)] = readFileSync(file, "utf8");
  sources["work/one/index.html"] = record("One", "2025-01-01");
  sources["work/two/index.html"] = record("Two", "2026-01-01");
  sources["index.html"] = sources["index.html"].replace('<section class="filler"', `${keys.map(listing).join("\n  ")}\n  <section class="filler"`);
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), { name: "" });
  if ("error" in baked) throw new Error(baked.error);
  return [["work/one/index.html", sources["work/one/index.html"]], ["work/two/index.html", sources["work/two/index.html"]],
    ["index.html", applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? [])]];
}
async function load(page: Page, baseURL: string | undefined, file = "index.html") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
}
async function seed(page: Page, baseURL: string | undefined, sources: [string, string][]) {
  await page.goto(`${baseURL}/`);
  for (const [path, content] of sources) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await load(page, baseURL);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function select(page: Page, key: string) {
  await frame(page).locator(`section[data-key="${key}"]`).click({ position: { x: 2, y: 2 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  return details;
}
/** Moves the listing's recipe into the JSON (drafts), so the page holds plain cards only. */
async function toJson(page: Page, key: string) {
  const details = await select(page, key);
  const settings = page.getByRole("region", { name: "Collection settings", exact: true });
  await settings.getByRole("combobox", { name: "Order", exact: true }).selectOption("ascending");
  await settings.getByRole("button", { name: "Save collection", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content ?? "").toContain('"sort": "date"');
  return details;
}
test("two listings on one page: rebuilding one edited listing never clobbers the other's hand edits", async ({ page, baseURL }) => {
  const [one, two, [, home]] = bakedSeed(["work-list", "other-list"]);
  // Both listings were edited by hand.
  const first = home.indexOf("<h3>One</h3>"), second = home.indexOf("<h3>One</h3>", first + 1);
  expect(second).toBeGreaterThan(first);
  const edited = home.slice(0, first) + "<h3>Mine A</h3>" + home.slice(first + 12, second) + "<h3>Mine B</h3>" + home.slice(second + 12);
  await seed(page, baseURL, [one, two, ["index.html", edited]]);
  const details = await select(page, "work-list");
  await expect(details).toContainText("edited by hand");
  await details.getByRole("button", { name: "Rebuild cards from page data", exact: true }).click();
  // The rebuild accepts only this listing; the other listing's hand edit would be replaced too, so it refuses whole.
  await expect(details.locator(".selected-collection__note").first()).toHaveText("The cards in index.html were edited by hand and no longer match the page data, so this change would replace them. Select the collection and choose “Use manual cards” to keep them, or “Rebuild cards from page data” to replace them.");
  expect(await storedDrafts(page)).toEqual([]);
  expect(await mounted(page, "index.html")).toBe(edited);
});

for (const [name, json, reason] of [
  ["invalid JSON", "{ not json", "The editor's page data file .editor/page-builder.json is not valid (Expected property name or '}' in JSON at position 2 (line 1 column 3)). Fix it in Code; the editor changes no collection until it is valid, and never removes your page data."],
  ["a target that is missing", JSON.stringify({ version: 1, pages: {}, collections: { lost: { pagePath: "index.html", target: { path: [9, 9, 9], tag: "section", openingTagFingerprint: '<section class="cards">' }, folders: ["/work/"], sort: "", filter: "", limit: 10, template: "<article>{title}</article>", fields: [], overrides: {} } } }, null, 2) + "\n", "The collections on index.html can no longer be found exactly (Collection target is missing or ambiguous.). Undo the change that moved them, or open Page settings › Fields and forget the recipe there; its cards stay as they are."],
] as const) test(`${name} in the editor's JSON refuses collection changes without writes or fallback`, async ({ page, baseURL }) => {
  await seed(page, baseURL, [...bakedSeed(), [SIDECAR, json]]);
  const details = await select(page, "work-list");
  const settings = page.getByRole("region", { name: "Collection settings", exact: true });
  const save = settings.getByRole("button", { name: "Save collection", exact: true });
  // Opening shows why; the legacy listing is neither saved nor kept as manual cards over a broken JSON.
  await expect(details).toContainText(reason);
  expect(await save.count()).toBe(0);
  await details.getByRole("button", { name: "Use manual cards", exact: true }).click();
  await expect(details.locator(".selected-collection__note").first()).toHaveText(reason);
  await expect(details.getByRole("button", { name: "Use manual cards", exact: true })).toBeVisible();
  expect(await storedDrafts(page)).toEqual([]);
});
