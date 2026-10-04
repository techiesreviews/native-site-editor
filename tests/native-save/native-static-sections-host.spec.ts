import { expect, test, type Page } from "@playwright/test";
import { storedDraft, storedDrafts } from "./drafts";
import { publishButton } from "./publish";

// Plain HTML/CSS sections in the same Add panel: four curated defaults and
// the records saved in .editor/page-builder.json. Adding one writes ordinary
// HTML, a stylesheet link and styles/sections.css; the JSON is editor-only.
// Runs on a copy of the actual starter: ASE_NATIVE_SAVE_FIXTURE=fixtures/actual-starter.
const SIDECAR = ".editor/page-builder.json";
const CSS = "styles/sections.css";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const mounted = (page: Page, path = "index.html") => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), path);
const file = async (page: Page, baseURL: string | undefined, path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
const panel = (page: Page) => page.getByRole("dialog", { name: "Add to the page" });

async function load(page: Page, baseURL: string | undefined, path = "index.html") {
  await page.goto(`${baseURL}/`);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path, { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
}
async function openAdd(page: Page, select = "section.flow h2") {
  await frame(page).locator(select).first().click();
  await page.getByRole("complementary", { name: "Page structure" }).getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel(page)).toBeVisible();
}
async function add(page: Page, name: RegExp) {
  await panel(page).getByRole("searchbox").fill("");
  const option = panel(page).getByRole("option", { name });
  await option.focus();
  await expect(option).not.toHaveAttribute("aria-disabled", "true");
  await option.press("Enter");
}

test("the starter's own styles/sections.css import refuses default sections without writing anything", async ({ page, baseURL }) => {
  await load(page, baseURL);
  await openAdd(page);
  await add(page, /^Intro HTML$/);
  await expect(page.locator("#notice")).toContainText("Intro was not added: The section stylesheet is already loaded through a CSS import.");
  await expect(frame(page).locator("section.section-intro")).toHaveCount(0);
  expect(await storedDrafts(page)).toEqual([]);
});

// An ordinary site whose stylesheets do not already use styles/sections.css.
async function ordinary(page: Page, baseURL: string | undefined) {
  await page.goto(baseURL!);
  const site = await file(page, baseURL, "styles/site.css");
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "styles/site.css", content: site.replace('@import url("sections.css");\n', "") } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: CSS, delete: true } });
}

test("four plain sections share the Add catalogue; adding one is one Undo over page, CSS and JSON, and saves ready HTML", async ({ page, baseURL }) => {
  await ordinary(page, baseURL);
  await load(page, baseURL);
  const before = await mounted(page);
  await openAdd(page);
  for (const name of ["Intro", "Features", "Split", "Contact"]) await expect(panel(page).getByRole("option", { name: new RegExp(`^${name} HTML$`) })).toHaveCount(1);
  // Sections only: no loose HTML elements join the catalogue.
  await panel(page).getByRole("searchbox").fill("Heading");
  await expect(panel(page).getByRole("option", { name: /HTML$/ })).toHaveCount(0);
  await add(page, /^Intro HTML$/);
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Section heading");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
  const home = await mounted(page);
  expect(home).toContain('<section class="section-intro"><h2>Section heading</h2>');
  expect(home).toContain('<link rel="stylesheet" href="styles/sections.css">');
  expect(home).not.toMatch(/static-section|saved-section|data-native|reusableSections/);
  await expect.poll(async () => (await storedDraft(page, CSS))?.content ?? "").toContain(".section-intro {");
  const sidecar = (await storedDraft(page, SIDECAR))!.content;
  expect(JSON.parse(sidecar).reusableSections.records.intro.rootClass).toBe("section-intro");
  // Center aligned by the new stylesheet, in the live preview.
  await expect(frame(page).locator("section.section-intro")).toHaveCSS("text-align", "center");

  await page.locator(".code-editor__undo").first().click();
  await expect.poll(() => storedDrafts(page)).toEqual([]);
  expect(await mounted(page)).toBe(before);
  await page.locator(".code-editor__redo").first().click();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(home);
  await expect.poll(async () => (await storedDraft(page, SIDECAR))?.content).toBe(sidecar);

  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  expect(await file(page, baseURL, "index.html")).toBe(home);
  const css = await file(page, baseURL, CSS);
  expect(css).toContain(".section-intro {");

  // Saved: listed once (as the saved record); adding it again leaves the stylesheet as it is.
  await load(page, baseURL);
  await openAdd(page);
  await panel(page).getByRole("searchbox").fill("Intro");
  await expect(panel(page).getByRole("option", { name: /^Intro HTML$/ })).toHaveCount(1);
  await add(page, /^Intro HTML$/);
  await expect(frame(page).locator("section.section-intro")).toHaveCount(2);
  const twice = await mounted(page);
  expect(twice.match(/href="styles\/sections\.css"/g)?.length).toBe(1);
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["index.html"]);

  // Without the editor or any script, the published section reads and looks the same.
  const site = await page.context().browser()!.newContext({ javaScriptEnabled: false });
  const plain = await site.newPage();
  const requests: string[] = [];
  await plain.route("http://site.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || "index.html";
    requests.push(path);
    const body = await file(page, baseURL, path);
    await route.fulfill({ body, contentType: path.endsWith(".css") ? "text/css" : "text/html" });
  });
  await plain.goto("http://site.test/index.html");
  await expect(plain.locator("section.section-intro h2")).toHaveText("Section heading");
  await expect(plain.locator("section.section-intro")).toHaveCSS("text-align", "center");
  expect(requests.some((path) => path.startsWith(".editor") || path.endsWith(".js"))).toBe(false);
  await site.close();
});

test("a saved custom section previews and inserts its own HTML with the live stylesheet; a subpage links relatively", async ({ page, baseURL }) => {
  await ordinary(page, baseURL);
  const record = { id: "intro", label: "Intro", rootClass: "section-intro", stylesheetPath: CSS,
    html: '<section class="section-intro"><h2>Our custom intro</h2></section>', css: ".section-intro { color: teal; }" };
  const live = ".section-intro { color: rgb(200, 0, 0); }\n";
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: JSON.stringify({ version: 1, pages: {}, collections: {}, reusableSections: { version: 1, records: { intro: record } } }, null, 2) + "\n" } });
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: CSS, content: live } });
  await load(page, baseURL, "about/index.html");
  await openAdd(page, "main h1");
  const option = panel(page).getByRole("option", { name: /^Intro HTML$/ });
  await expect(option).toHaveCount(1);
  await expect(option.locator("iframe")).toHaveCount(1);
  const thumb = option.frameLocator("iframe");
  await expect(thumb.locator("section.section-intro h2")).toHaveText("Our custom intro");
  await expect(thumb.locator("section.section-intro")).toHaveCSS("color", "rgb(200, 0, 0)");
  await add(page, /^Intro HTML$/);
  await expect(frame(page).locator("section.section-intro h2")).toHaveText("Our custom intro");
  await expect(frame(page).locator("section.section-intro")).toHaveCSS("color", "rgb(200, 0, 0)");
  const about = await mounted(page, "about/index.html");
  expect(about).toContain(record.html);
  expect(about).toContain('href="../styles/sections.css"');
  expect((await storedDrafts(page)).map((draft) => draft.path)).toEqual(["about/index.html"]);
});

test("invalid editor JSON hides plain sections instead of falling back to defaults", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: SIDECAR, content: "{ not json" } });
  await load(page, baseURL);
  await openAdd(page);
  await expect(panel(page).getByRole("option").first()).toBeVisible();
  for (const name of ["Intro", "Features", "Split", "Contact"]) await expect(panel(page).getByRole("option", { name: new RegExp(`^${name} HTML$`) })).toHaveCount(0);
  expect(await storedDrafts(page)).toEqual([]);
});
