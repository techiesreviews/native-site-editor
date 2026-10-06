import { openPageSettingsFromPages } from "./settings-entry";
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
const cardTemplate = `<article class="card"><h3>{title}</h3><time>{date}</time></article>`;
const listingWith = (template: string) => `<section class="cards" data-key="work-list" data-each="/work/" data-sort="-date" aria-label="Work"><template>${template}</template></section>`;
const fixture = "fixtures/native-starter";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
/** The seeded site, with the Home listing baked exactly as the editor bakes it. */
function bakedSeed(template = cardTemplate, withAbout = false): [string, string][] {
  const sources: Record<string, string> = {};
  for (const file of files(fixture)) if (/\.html?$/i.test(file)) sources[relative(fixture, file)] = readFileSync(file, "utf8");
  sources["work/one/index.html"] = record("One", "2025-01-01");
  sources["work/two/index.html"] = record("Two", "2026-01-01");
  sources["index.html"] = sources["index.html"].replace('<section class="filler"', `${listingWith(template)}\n  <section class="filler"`);
  if (withAbout) sources["about/index.html"] = sources["about/index.html"].replace('<main class="page" data-key="main">', `<main class="page" data-key="main">${listingWith(cardTemplate).replace('data-key="work-list"', 'data-key="about-list"')}`);
  const baked = planBake(sources, deriveNativeRoutes(Object.keys(sources)), { name: "" });
  if ("error" in baked) throw new Error(baked.error);
  const home = applyCollectionEdits(sources["index.html"], baked.edits["index.html"] ?? []);
  if (withAbout) return [["work/one/index.html", sources["work/one/index.html"]], ["work/two/index.html", sources["work/two/index.html"]], ["index.html", home],
    ["about/index.html", applyCollectionEdits(sources["about/index.html"], baked.edits["about/index.html"] ?? [])]];
  if (template === cardTemplate && !home.includes("<h3>Two</h3><time>2026-01-01</time></article>\n<article class=\"card\"><h3>One</h3>")) throw new Error("Unexpected bake");
  return [["work/one/index.html", sources["work/one/index.html"]], ["work/two/index.html", sources["work/two/index.html"]], ["index.html", home]];
}

async function open(page: Page, baseURL: string | undefined, seed: [string, string][], file = "index.html") {
  await page.goto(`${baseURL}/`);
  for (const [path, content] of seed) await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path, content } });
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", file, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}

test("a generated card offers its page and the collection, and refuses direct writes", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  await open(page, baseURL, seed);
  const before = await mounted(page, "index.html");
  expect(before).toBe(seed[2][1]);
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).click();
  await expect(bar(page)).toContainText("From /work/one/");
  for (const name of ["Heading level", "Text size"]) await expect(bar(page).getByLabel(name, { exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Show collection source", exact: true })).toBeVisible();
  // Inline typing into the generated heading is refused; nothing is written.
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).dblclick();
  await page.keyboard.type("XX");
  await page.keyboard.press("Escape");
  expect(await mounted(page, "index.html")).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
  await page.getByRole("separator", { name: "Resize code pane", exact: true }).press("Home");
  await expect(page.locator("#content .monaco-editor")).toBeHidden();
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).click();
  await bar(page).getByRole("button", { name: "Show collection source", exact: true }).click();
  await expect(page.locator("#main")).not.toHaveClass(/code-collapsed/);
  await expect(page.locator("#content .monaco-editor")).toBeVisible();
  expect(await mounted(page, "index.html")).toBe(before);
  expect(await storedDrafts(page)).toEqual([]);
  await frame(page).locator("section[data-key=\"work-list\"] h3", { hasText: "One" }).click();
  await bar(page).getByRole("button", { name: "Edit page data", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "work/one/index.html");
  expect(await storedDrafts(page)).toEqual([]);
});

test("ordinary elements outside the cards still edit normally, in one Undo", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  await open(page, baseURL, seed);
  const heading = frame(page).locator("section.filler h2").first();
  await heading.click();
  await expect(bar(page)).not.toContainText("From /work/");
  await expect(bar(page).getByRole("button", { name: "Edit page data", exact: true })).toHaveCount(0);
  await bar(page).getByLabel("Heading level", { exact: true }).selectOption("h3");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").not.toBe("");
  const draft = (await storedDraft(page, "index.html"))!.content;
  expect(draft.slice(draft.indexOf('data-key="work-list"'), draft.indexOf("</section>", draft.indexOf('data-key="work-list"'))))
    .toBe(seed[2][1].slice(seed[2][1].indexOf('data-key="work-list"'), seed[2][1].indexOf("</section>", seed[2][1].indexOf('data-key="work-list"'))));
  expect(draft).not.toBe(seed[2][1]);
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
});

test("Structure and keyboard moves leave generated cards untouched", async ({ page, baseURL }) => {
  const seed = bakedSeed(`<article class="lead"><h3>{title}</h3></article>`);
  await open(page, baseURL, seed);
  const before = await mounted(page, "index.html");
  // Structure marks the generated rows, without slot or attribute fields.
  await frame(page).locator('section[data-key="work-list"] article', { hasText: "One" }).click({ position: { x: 2, y: 2 } });
  const row = page.locator(".page-structure__row--generated").first();
  await expect(row).toHaveAttribute("title", /Made from page data/);
  // Alt+Down would move the card in the HTML: nothing moves.
  await page.keyboard.press("Alt+ArrowDown");
  expect(await mounted(page, "index.html")).toBe(before);
  expect(await storedDraft(page, "index.html")).toBeUndefined();
});

test("a shared component that is a whole card keeps its explicit Edit, opening the shared template", async ({ page, baseURL }) => {
  await open(page, baseURL, bakedSeed(`<card-note>{title}</card-note>`));
  await frame(page).locator('section[data-key="work-list"] card-note', { hasText: "One" }).click();
  await expect(bar(page)).toContainText("From /work/one/");
  await bar(page).getByRole("button", { name: /^Edit/ }).filter({ hasNotText: "page data" }).filter({ hasNotText: "collection" }).first().click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/card-note/card-note.html");
  expect(await storedDrafts(page)).toEqual([]);
});

test("a clean listing still rebakes on a page title change in one Undo", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  await open(page, baseURL, seed, "work/one/index.html");
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("One renamed");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("<h3>One renamed</h3>");
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
});

test("renaming a listed page from the Pages tab rebuilds its card in the same step, leaving no false hand-edit warning", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  await open(page, baseURL, seed, "work/one/index.html");
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await page.locator("#explorer").getByRole("treeitem", { name: "One", exact: true }).locator(".pages-label").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Title of One" }).fill("One renamed");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("<h3>One renamed</h3>");
  expect((await storedDraft(page, "work/one/index.html"))!.content).toContain("<title>One renamed</title>");
  const renamed = (await storedDraft(page, "index.html"))!.content;
  // One Undo takes back the title and its card together; Redo writes both again.
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDraft(page, "index.html")).toBeUndefined();
  await expect.poll(() => storedDraft(page, "work/one/index.html")).toBeUndefined();
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(renamed);
  await open(page, baseURL, [], "index.html");
});

test("a title typed in Code rebuilds every listing that shows the page, shared-component cards included, with the edit's Undo", async ({ page, baseURL }) => {
  // Home's cards are the shared card-note component; About lists the same pages with plain cards.
  const seed = bakedSeed(`<card-note>{title}</card-note>`, true);
  await open(page, baseURL, seed, "work/one/index.html");
  const one = seed[0][1], typed = one.replaceAll("One", "One from Code");
  await expect(page.locator("#content .monaco-editor")).toBeVisible();
  await page.evaluate((text) => navigator.clipboard.writeText(text), typed);
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toContain("<card-note>One from Code</card-note>");
  await expect.poll(async () => (await storedDraft(page, "about/index.html"))?.content ?? "").toContain("<h3>One from Code</h3>");
  const home = (await storedDraft(page, "index.html"))!.content, about = (await storedDraft(page, "about/index.html"))!.content;
  // Only the cards change; each listing keeps its recipe.
  expect(home).toBe(seed[2][1].replace("<card-note>One</card-note>", "<card-note>One from Code</card-note>"));
  expect(about).toBe(seed[3][1].replace("<h3>One</h3>", "<h3>One from Code</h3>"));
  await page.locator(".code-editor__undo").first().click();
  await expect.poll(async () => (await storedDrafts(page)).map((draft) => draft.path)).toEqual([]);
  expect(await mounted(page, "work/one/index.html")).toBe(one);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  expect((await storedDraft(page, "about/index.html"))!.content).toBe(about);
  expect((await storedDraft(page, "work/one/index.html"))!.content).toBe(typed);
  // The preview renders the shared component with the new title.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator('section[data-key="work-list"] card-note', { hasText: "One from Code" })).toBeVisible();
});

test("Structure hides only the collection recipe and offers no fields on a generated component card", async ({ page, baseURL }) => {
  await open(page, baseURL, bakedSeed(`<card-note>{title}</card-note>`));
  const before = await mounted(page, "index.html");
  await frame(page).locator('section[data-key="work-list"] card-note', { hasText: "One" }).click();
  const tree = page.getByRole("tree", { name: "Page structure" });
  const generated = tree.locator(".page-structure__row--generated");
  await expect(generated.first()).toBeVisible();
  // No template row for the recipe; no slot or attribute editors on generated rows.
  await expect(tree.getByRole("treeitem", { name: /^Template/ })).toHaveCount(0);
  await expect(tree.locator(".page-structure__row--generated .page-structure__slot-toggle, .page-structure__row--generated input")).toHaveCount(0);
  await expect(page.locator(".page-structure input[aria-label=\"New attribute name\"]")).toHaveCount(0);
  expect(await mounted(page, "index.html")).toBe(before);
});

test("hand-edited cards refuse a page title change without writing drafts", async ({ page, baseURL }) => {
  const seed = bakedSeed();
  const drifted = seed[2][1].replace("<h3>One</h3>", "<h3>One, my own words</h3>");
  await open(page, baseURL, [seed[0], seed[1], ["index.html", drifted]], "work/one/index.html");
  // A title change on the source page would rebake Home: refused, nothing written.
  if (!await page.locator("#explorer").evaluate(el => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
  await openPageSettingsFromPages(page);
  const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
  await settings.getByLabel("Title", { exact: true }).fill("One renamed");
  await settings.getByRole("button", { name: "Apply page settings" }).click();
  await expect(page.getByText(/index\.html were edited by hand/).first()).toContainText("Source editor");
  expect(await storedDrafts(page)).toEqual([]);
  await settings.getByRole("button", { name: /Cancel|Close/ }).first().click().catch(() => page.keyboard.press("Escape"));

  expect(await mounted(page, "work/one/index.html")).toBe(seed[0][1]);
});
