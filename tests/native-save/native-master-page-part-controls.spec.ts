import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { effectiveSource } from "./drafts";

// Shared Header and Footer masters (.editor/page-parts/<id>.html) with the real edit bar:
// Save shared on the About page, Structure's Edit opens the master, and image and text controls
// write only the master until Update copies. Runs on the native static starter:
// STATIC_SECTIONS_FIXTURE=native ASE_NATIVE_SAVE_FIXTURE=<.scratch/native-static-preview>.
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

test.skip(process.env.STATIC_SECTIONS_FIXTURE !== "native", "Requires the native static starter.");
if (process.env.STATIC_SECTIONS_FIXTURE === "native") fixtureKind();
const PAGE = "about/index.html";
const JSON_PATH = ".editor/page-builder.json";
const CSS = ["styles/tokens.css", "styles/elements.css", "styles/layout.css", "styles/components.css", "styles/sections.css", "styles/utilities.css", "styles/site.css"];
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const row = (page: Page, name: RegExp) => structure(page).getByRole("treeitem", { name }).first();
const snapshot = async (page: Page, baseURL: string | undefined, paths: string[]) => Object.fromEntries(await Promise.all(paths.map(async path => [path, await effectiveSource(page, baseURL, path)] as const)));
const codeCollapsed = (page: Page) => page.locator("main").evaluate(main => main.classList.contains("code-collapsed"));
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(PAGE)}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator("header.site-header")).toBeVisible();
}
async function shareAndEdit(page: Page, rowName: RegExp, kind: string, id: string, label: string, bannerName: string) {
  await row(page, rowName).hover();
  await row(page, rowName).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: `Share ${kind}` });
  await form.getByRole("textbox", { name: "Name" }).fill(label);
  await form.getByRole("textbox", { name: "ID" }).fill(id);
  await form.getByRole("button", { name: "Save shared" }).click();
  const shared = row(page, new RegExp(label));
  await expect(shared.getByRole("button", { name: "Edit component" })).toBeAttached();
  await shared.hover();
  await shared.getByRole("button", { name: "Edit component" }).click();
  const banner = page.getByRole("region", { name: bannerName });
  await expect(banner).toBeVisible();
  await expect(page.locator("#primary-title")).toHaveText(`.editor/page-parts/${id}.html`);
  return banner;
}
async function replaceCode(page: Page, text: string) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("a shared header master's image: chooser and Alt write only the master; Update then one Undo keeps the master edits", { tag: "@native-static" }, async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const asset = await (await page.request.get(`${baseURL}/__demo/file?path=images%2Fstudio-desk.svg`)).text();
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/part-image.svg", content: asset } })).status()).toBe(204);
  await open(page, baseURL);
  const codeBefore = await codeCollapsed(page);
  const banner = await shareAndEdit(page, /^Header/, "header", "site-head", "Site header", "Shared header master");
  const MASTER = ".editor/page-parts/site-head.html";
  const before = await snapshot(page, baseURL, [PAGE, JSON_PATH, ...CSS, MASTER]);
  const img = '<img class="header-photo" src="/images/studio-desk.svg" alt="Studio desk" width="48" height="48">';
  const withImage = before[MASTER]!.replace("</header>", `${img}</header>`);
  await replaceCode(page, withImage);
  await expect.poll(() => effectiveSource(page, baseURL, MASTER)).toBe(withImage);
  const photo = frame(page).locator("header.site-header .header-photo");
  await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const unchanged = async (paths: string[]) => { for (const path of paths) expect(await effectiveSource(page, baseURL, path), path).toBe(before[path]); };
  await unchanged([PAGE, JSON_PATH, ...CSS]);
  // Choose image… through the real media picker: only the master's img changes.
  await photo.click();
  await expect(bar(page).getByRole("button", { name: /Site header/ })).toBeVisible();
  await bar(page).getByRole("button", { name: "Choose image…", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Choose image", exact: true });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("button", { name: "Details for about/part-image.svg", exact: true }).click();
  await chooser.getByRole("button", { name: "Use image", exact: true }).click();
  await expect(chooser).toHaveCount(0);
  await expect.poll(async () => (await effectiveSource(page, baseURL, MASTER)) ?? "").toContain('src="/about/part-image.svg"');
  const chosen = (await effectiveSource(page, baseURL, MASTER))!;
  expect(chosen).toMatch(/<img [^>]*class="header-photo"[^>]*alt="Studio desk"[^>]*><\/header>$/);
  expect(chosen.replace(/<img [^>]*><\/header>$/, "</header>")).toBe(before[MASTER]);
  await unchanged([PAGE, JSON_PATH, ...CSS]);
  // Alt text: the master only.
  await photo.click();
  await bar(page).getByRole("button", { name: "Alt text", exact: true }).click();
  const alt = page.getByRole("textbox", { name: "Alt text", exact: true });
  await alt.fill("Desk in the studio");
  await alt.press("Escape");
  const alted = chosen.replace('alt="Studio desk"', 'alt="Desk in the studio"');
  await expect.poll(() => effectiveSource(page, baseURL, MASTER)).toBe(alted);
  await unchanged([PAGE, JSON_PATH, ...CSS]);
  // Update copies writes the page's header from the master; one Undo reverts only that.
  await banner.getByRole("button", { name: "Update copies" }).click();
  await expect.poll(async () => (await effectiveSource(page, baseURL, PAGE)) ?? "").toContain('alt="Desk in the studio"');
  expect(await effectiveSource(page, baseURL, PAGE)).toContain('src="/about/part-image.svg"');
  await banner.getByRole("button", { name: "Done" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => effectiveSource(page, baseURL, PAGE)).toBe(before[PAGE]);
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(alted);
  // Done returns to the page with Code as it was, writing nothing.
  const atDone = await snapshot(page, baseURL, [PAGE, JSON_PATH, ...CSS, MASTER]);
  await banner.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText(PAGE);
  await expect(banner).toBeHidden();
  expect(await snapshot(page, baseURL, [PAGE, JSON_PATH, ...CSS, MASTER])).toEqual(atDone);
  expect(await codeCollapsed(page)).toBe(codeBefore);
});

test("a shared footer master's text: canvas typing and Bold target the master; Update when pristine, one Undo", { tag: "@native-static" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const codeBefore = await codeCollapsed(page);
  const banner = await shareAndEdit(page, /^Footer/, "footer", "site-foot", "Site footer", "Shared footer master");
  const MASTER = ".editor/page-parts/site-foot.html";
  const before = await snapshot(page, baseURL, [PAGE, JSON_PATH, ...CSS, MASTER]);
  const unchanged = async (paths: string[]) => { for (const path of paths) expect(await effectiveSource(page, baseURL, path), path).toBe(before[path]); };
  const line = frame(page).locator("footer.site-footer address p").first();
  await line.click();
  await expect(bar(page).getByRole("button", { name: /Site footer/ })).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.type(" Since 2019.");
  await page.keyboard.press("Enter");
  const typed = before[MASTER]!.replace("Designed and built by hand.", "Designed and built by hand. Since 2019.");
  await expect.poll(() => effectiveSource(page, baseURL, MASTER)).toBe(typed);
  await unchanged([PAGE, JSON_PATH, ...CSS]);
  // Bold on a keyboard range of the master's paragraph.
  await line.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < "Larkspur".length; i++) await page.keyboard.press("Shift+ArrowRight");
  await bar(page).getByRole("button", { name: "Bold", exact: true }).click();
  const bold = typed.replace("<p>Larkspur Studio", "<p><strong>Larkspur</strong> Studio");
  await expect.poll(() => effectiveSource(page, baseURL, MASTER)).toBe(bold);
  await unchanged([PAGE, JSON_PATH, ...CSS]);
  // The bar's Text size on the master's paragraph: the master only.
  await line.click();
  await bar(page).getByRole("combobox", { name: "Text size" }).selectOption({ label: "L" });
  const sized = bold.replace("<p><strong>Larkspur", '<p class="text-l"><strong>Larkspur');
  await expect.poll(() => effectiveSource(page, baseURL, MASTER)).toBe(sized);
  await unchanged([PAGE, JSON_PATH, ...CSS]);
  await line.click();
  await bar(page).getByRole("button", { name: /In the Site footer master/ }).click();
  await expect(bar(page).locator(".edit-bar__label")).toHaveText("Site footer");
  for (const name of ["Move up", "Move down", "Duplicate", "Remove"]) await expect(bar(page).getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  // Done goes back with Code as it was and writes nothing; Edit again, then Update copies the pristine page copy.
  const atDone = await snapshot(page, baseURL, [PAGE, JSON_PATH, ...CSS, MASTER]);
  await banner.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText(PAGE);
  expect(await snapshot(page, baseURL, [PAGE, JSON_PATH, ...CSS, MASTER])).toEqual(atDone);
  expect(await codeCollapsed(page)).toBe(codeBefore);
  await row(page, /Site footer/).hover();
  await row(page, /Site footer/).getByRole("button", { name: "Edit component" }).click();
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Update copies" }).click();
  await expect.poll(async () => (await effectiveSource(page, baseURL, PAGE)) ?? "").toContain('<p class="text-l"><strong>Larkspur</strong> Studio, Frome, Somerset. Designed and built by hand. Since 2019.');
  for (const path of CSS) expect(await effectiveSource(page, baseURL, path)).toBe(atDone[path]);
  await banner.getByRole("button", { name: "Done" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => effectiveSource(page, baseURL, PAGE)).toBe(before[PAGE]);
  expect(await effectiveSource(page, baseURL, JSON_PATH)).toBe(atDone[JSON_PATH]);
  expect(await effectiveSource(page, baseURL, MASTER)).toBe(sized);
  await expect(page.locator("#primary-title")).toHaveText(MASTER);
});
