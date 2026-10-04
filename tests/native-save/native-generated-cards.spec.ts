import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deriveNativeRoutes } from "../../shared/native-routes";
import { applyCollectionEdits, planBake } from "../../src/page-builder/collection-bake";
import { storedDraft, storedDrafts } from "./drafts";

// Cards a collection makes are rebuilt from page data: the editor must not
// invite edits that a later bake would silently replace, and hand edits made
// in Code must survive until the user explicitly keeps or rebuilds them.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path: string) => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const record = (title: string, date: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n  <meta name="date" content="${date}">\n  <link rel="stylesheet" href="/styles/site.css">\n</head>\n<body>\n<main><h1>${title}</h1></main>\n</body>\n</html>\n`;
const listing = `<section class="cards" data-key="work-list" data-each="/work/" data-sort="-date" aria-label="Work"><template><article class="card"><h3>{title}</h3><time>{date}</time></article></template></section>`;
const fixture = "fixtures/native-starter";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
/** The seeded site, with the Home listing baked exactly as the editor bakes it. */
function bakedSeed(): [string, string][] {
  const sources: Record<string, string> = {};
  for (const file of files(fixture)) if (/\.html?$/i.test(file)) sources[relative(fixture, file)] = readFileSync(file, "utf8");
  sources["work/one/index.html"] = record("One", "2025-01-01");
  sources["work/two/index.html"] = record("Two", "2026-01-01");
  sources["index.html"] = sources["index.html"].replace('<section class="filler"', `${listing}\n  <section class="filler"`);
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), { name: "" });
  if ("error" in baked) throw new Error(baked.error);
  const home = applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? []);
  if (!home.includes("<h3>Two</h3><time>2026-01-01</time></article>\n<article class=\"card\"><h3>One</h3>")) throw new Error("Unexpected bake");
  return [["work/one/index.html", sources["work/one/index.html"]], ["work/two/index.html", sources["work/two/index.html"]], ["index.html", home]];
}

async function open(page: Page, baseURL: string | undefined, seed: [string, string][], file = "index.html") {
  await page.goto(`${baseURL}/`);
  for (const [path, content] of seed) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openCollection(page: Page) {
  await frame(page).locator("section[data-key=\"work-list\"]").click({ position: { x: 2, y: 2 } });
  const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
  if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
  const details = page.locator(".selected-collection");
  if (await details.getAttribute("open") === null) await details.locator("> summary").click();
  return details;
}

test("a generated card offers its page and the collection, and refuses direct writes", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  await open(page, baseURL, seed);
  const before = await mounted(page, "index.html");
  expect(before).toBe(seed[2][1]);
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).click();
  await expect(bar(page)).toContainText("From /work/one/");
  for (const name of ["Heading level", "Text size"]) await expect(bar(page).getByLabel(name, { exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Edit collection", exact: true })).toBeVisible();
  // Inline typing into the generated heading is refused; nothing is written.
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).dblclick();
  await page.keyboard.type("XX");
  await page.keyboard.press("Escape");
  expect(await mounted(page, "index.html")).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).click();
  await bar(page).getByRole("button", { name: "Edit page data", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/one/index.html");
  expect(await storedDrafts(page)).toEqual([]);
});

test("ordinary elements outside the cards still edit normally", async ({ page, baseURL }) => {
  await open(page, baseURL, bakedSeed());
  await frame(page).locator("section.filler h2, section.filler p").first().click();
  await expect(bar(page)).not.toContainText("From /work/");
  await expect(bar(page).getByRole("button", { name: "Edit page data", exact: true })).toHaveCount(0);
});

test("hand-edited cards block later page changes until explicitly rebuilt, in one Undo", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  const drifted = seed[2][1].replace("<h3>One</h3>", "<h3>One, my own words</h3>");
  await open(page, baseURL, [seed[0], seed[1], ["index.html", drifted]], "work/one/index.html");
  // A title change on the source page would rebake Home: refused, nothing written.
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("One renamed");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(page.getByText(/index\.html were edited by hand/).first()).toBeVisible();
  expect(await storedDrafts(page)).toEqual([]);
  await settings.getByRole("button", { name: /Cancel|Close/ }).first().click().catch(() => page.keyboard.press("Escape"));

  await open(page, baseURL, [], "index.html");
  expect(await mounted(page, "index.html")).toBe(drifted);
  const details = await openCollection(page);
  await expect(details).toContainText("edited by hand");
  await details.getByRole("button", { name: "Rebuild cards from page data", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(seed[2][1]);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  expect(await mounted(page, "index.html")).toBe(drifted);
});

test("Use manual cards keeps the edited cards and host attributes, drops only the recipe, in one Undo", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  const drifted = seed[2][1].replace("<h3>One</h3>", "<h3>One, my own words</h3>");
  await open(page, baseURL, [seed[0], seed[1], ["index.html", drifted]]);
  const details = await openCollection(page);
  await details.getByRole("button", { name: "Use manual cards", exact: true }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain('<section class="cards" data-key="work-list" aria-label="Work">');
  const manual = (await storedDraft(page, "index.html"))!.content;
  expect(manual).toContain("<h3>One, my own words</h3>");
  expect(manual).not.toMatch(/<template>|data-each|data-sort/);
  expect(manual).toBe(drifted.replace(/ data-each="\/work\/" data-sort="-date"/, "").replace(/<template>.*?<\/template>/, ""));
  // The kept cards are ordinary HTML again.
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "my own words" }).click();
  await expect(bar(page)).not.toContainText("Made from page data");
  await expect(bar(page).getByLabel("Heading level", { exact: true })).toBeVisible();
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  expect(await mounted(page, "index.html")).toBe(drifted);
});

test("a clean listing still rebakes on a page title change in one Undo", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  await open(page, baseURL, seed, "work/one/index.html");
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#page-settings-toggle").click();
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("One renamed");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("<h3>One renamed</h3>");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
});
