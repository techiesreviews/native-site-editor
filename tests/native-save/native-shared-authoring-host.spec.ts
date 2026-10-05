import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { storedDraft } from "./drafts";
import { publishButton, showPublish } from "./publish";

// The real host for native shared roots: Structure's Save shared writes a private master and the
// editor JSON (one Undo, public HTML and CSS untouched); a linked root's Edit opens its actual
// master through a real preview selection; Done never writes; Update copies changes only unchanged
// copies; Cancel or a changed page refuses the write.
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
const CSS = ["styles/site.css", "styles/sections.css", "styles/layout.css"];
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const effective = async (page: Page, baseURL: string | undefined, path: string) => {
  const draft = await storedDraft(page, path);
  if (draft) return draft.content;
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
};
const snapshot = async (page: Page, baseURL: string | undefined, paths: string[]) => Object.fromEntries(await Promise.all(paths.map(async path => [path, await effective(page, baseURL, path)] as const)));
async function open(page: Page, baseURL: string | undefined, path = PAGE) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(path)}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator("header.site-header")).toBeVisible();
}
const row = (page: Page, name: RegExp) => structure(page).getByRole("treeitem", { name }).first();
async function share(page: Page, rowName: RegExp, kind: string, id: string, label: string, stylesheet = "styles/site.css") {
  await row(page, rowName).hover();
  await row(page, rowName).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: `Share ${kind}` });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "Name" }).fill(label);
  await form.getByRole("textbox", { name: "ID" }).fill(id);
  const sheet = form.getByLabel("Stylesheet");
  if (await sheet.evaluate(el => el instanceof HTMLSelectElement)) await sheet.selectOption(stylesheet);
  return form;
}

test("Save shared on a section and a header writes the private master and JSON as one Undo, then persists through Save", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await snapshot(page, baseURL, [PAGE, ...CSS, JSON_PATH]);
  expect(before[JSON_PATH]).toBeUndefined();
  const form = await share(page, /^Section About Larkspur/, "section", "about-hero", "About hero");
  await form.getByRole("button", { name: "Save shared" }).click();
  await expect.poll(() => effective(page, baseURL, ".editor/sections/about-hero.html")).toMatch(/^<section class="hero flow">[\s\S]*About Larkspur[\s\S]*<\/section>$/);
  expect(await effective(page, baseURL, JSON_PATH)).toContain('"about-hero"');
  for (const path of [PAGE, ...CSS]) expect(await effective(page, baseURL, path)).toBe(before[path]);
  // The row now wears the shared label with Edit and Disconnect.
  await expect(row(page, /About hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
  await expect(row(page, /About hero/).getByRole("button", { name: "Disconnect this instance" })).toBeAttached();
  // The header too, as a page part.
  const header = await share(page, /^Header/, "header", "site-head", "Site header");
  await header.getByRole("button", { name: "Save shared" }).click();
  await expect.poll(() => effective(page, baseURL, ".editor/page-parts/site-head.html")).toMatch(/^<header class="site-header">[\s\S]*<\/header>$/);
  for (const path of [PAGE, ...CSS]) expect(await effective(page, baseURL, path)).toBe(before[path]);
  await expect(row(page, /Site header/).getByRole("button", { name: "Edit component" })).toBeAttached();
  // One Undo removes the header master and its record; the section save stays.
  const afterSection = (await effective(page, baseURL, ".editor/sections/about-hero.html"))!;
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => effective(page, baseURL, ".editor/page-parts/site-head.html")).toBeUndefined();
  expect(await effective(page, baseURL, ".editor/sections/about-hero.html")).toBe(afterSection);
  expect(await effective(page, baseURL, JSON_PATH)).not.toContain("site-head");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => effective(page, baseURL, ".editor/page-parts/site-head.html")).toMatch(/^<header/);
  for (const path of [PAGE, ...CSS]) expect(await effective(page, baseURL, path)).toBe(before[path]);
  // The repository's real Save boundary commits the private files; public files stay as they were.
  await showPublish(page);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const head = async (path: string) => { const r = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`); return r.ok() ? r.text() : undefined; };
  await expect.poll(() => head(".editor/page-parts/site-head.html")).toMatch(/^<header class="site-header">/);
  expect(await head(".editor/sections/about-hero.html")).toBe(afterSection);
  expect(await head(JSON_PATH)).toContain("site-head");
  for (const path of [PAGE, ...CSS]) expect(await head(path)).toBe(before[path]);
});

const masterBanner = (page: Page, name = "Saved section master") => page.getByRole("region", { name });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
async function replaceCode(page: Page, text: string) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}
async function addSaved(page: Page, name: RegExp) {
  await frame(page).locator("main > section h1, main > section h2").first().click();
  await structure(page).getByRole("button", { name: "Add", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add to the page" });
  await add.getByRole("option", { name }).focus();
  await page.keyboard.press("Enter");
  await add.getByRole("button", { name: "Close" }).click();
}

test("Structure Edit opens the actual section master; Update copies only unchanged copies, one Undo; Done never writes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await (await share(page, /^Section About Larkspur/, "section", "about-hero", "About hero")).getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, /About hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
  const MASTER = ".editor/sections/about-hero.html";
  // A second, customised copy on the home page: Update must leave it alone.
  await open(page, baseURL, "index.html");
  await addSaved(page, /^About hero/);
  await expect.poll(async () => (await effective(page, baseURL, "index.html")) ?? "").toContain("About Larkspur</h1>");
  const home = (await effective(page, baseURL, "index.html"))!.replace("About Larkspur</h1>", "About Larkspur, customised</h1>");
  await replaceCode(page, home);
  await expect.poll(() => effective(page, baseURL, "index.html")).toBe(home);
  await open(page, baseURL);
  const codeBefore = await page.locator("main").evaluate(main => main.classList.contains("code-collapsed"));
  const before = await snapshot(page, baseURL, [PAGE, "index.html", ...CSS, JSON_PATH, MASTER]);
  // Edit selects the root through the preview itself, then opens the master.
  await row(page, /About hero/).hover();
  await row(page, /About hero/).getByRole("button", { name: "Edit component" }).click();
  await expect(masterBanner(page)).toBeVisible();
  await expect(page.locator("#primary-title")).toHaveText(MASTER);
  // A child of the master's root selects in the master, as its local node.
  await frame(page).locator("section.hero h1").click();
  await expect(bar(page).getByRole("button", { name: /About hero/ })).toBeVisible();
  // The page around the master is read-only.
  await frame(page).locator("header.site-header .brand").click();
  await expect(page.locator("#status")).toContainText("read-only");
  const master = before[MASTER]!.replace("About Larkspur</h1>", "About the studio</h1>");
  await replaceCode(page, master);
  await expect.poll(() => effective(page, baseURL, MASTER)).toBe(master);
  await expect(frame(page).locator("section.hero h1")).toHaveText("About the studio");
  for (const path of [PAGE, "index.html", ...CSS, JSON_PATH]) expect(await effective(page, baseURL, path)).toBe(before[path]);
  await masterBanner(page).getByRole("button", { name: "Update copies" }).click();
  await expect.poll(async () => (await effective(page, baseURL, PAGE)) ?? "").toContain("About the studio</h1>");
  expect(await effective(page, baseURL, "index.html")).toBe(before["index.html"]);
  for (const path of CSS) expect(await effective(page, baseURL, path)).toBe(before[path]);
  const updated = await snapshot(page, baseURL, [PAGE, JSON_PATH]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => effective(page, baseURL, PAGE)).toBe(before[PAGE]);
  expect(await effective(page, baseURL, JSON_PATH)).toBe(before[JSON_PATH]);
  expect(await effective(page, baseURL, MASTER)).toBe(master);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => effective(page, baseURL, PAGE)).toBe(updated[PAGE]);
  expect(await effective(page, baseURL, JSON_PATH)).toBe(updated[JSON_PATH]);
  // Done goes back to the page and its root, writing nothing.
  const atDone = await snapshot(page, baseURL, [PAGE, "index.html", ...CSS, JSON_PATH, MASTER]);
  await masterBanner(page).getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText(PAGE);
  await expect(masterBanner(page)).toBeHidden();
  expect(await snapshot(page, baseURL, [PAGE, "index.html", ...CSS, JSON_PATH, MASTER])).toEqual(atDone);
  expect(await page.locator("main").evaluate(main => main.classList.contains("code-collapsed"))).toBe(codeBefore);
  await expect(row(page, /About hero/)).toHaveAttribute("aria-selected", "true");
});

test("a shared header opens as its own master: its image loads on the nested page; Update and Undo write the page header", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  const asset = await (await page.request.get(`${baseURL}/__demo/file?path=images%2Fstudio-desk.svg`)).text();
  expect((await page.request.post(`${baseURL}/__demo/external-edit`, { data: { path: "about/part-image.svg", content: asset } })).status()).toBe(204);
  await open(page, baseURL);
  await (await share(page, /^Header/, "header", "site-head", "Site header")).getByRole("button", { name: "Save shared" }).click();
  const MASTER = ".editor/page-parts/site-head.html";
  await expect(row(page, /Site header/).getByRole("button", { name: "Edit component" })).toBeAttached();
  const before = await snapshot(page, baseURL, [PAGE, ...CSS, JSON_PATH, MASTER]);
  await row(page, /Site header/).hover();
  await row(page, /Site header/).getByRole("button", { name: "Edit component" }).click();
  const banner = masterBanner(page, "Shared header master");
  await expect(banner).toBeVisible();
  await expect(page.locator("#primary-title")).toHaveText(MASTER);
  await expect(frame(page).locator("header.site-header")).toHaveCount(1);
  const master = before[MASTER]!.replace("</header>", '<img class="part-image" src="/about/part-image.svg" alt="" width="40" height="40"></header>');
  await replaceCode(page, master);
  await expect.poll(() => effective(page, baseURL, MASTER)).toBe(master);
  await expect.poll(() => frame(page).locator("header.site-header .part-image").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await frame(page).locator("header.site-header .brand").click();
  await expect(bar(page).getByRole("button", { name: /Site header/ })).toBeVisible();
  for (const path of [PAGE, ...CSS, JSON_PATH]) expect(await effective(page, baseURL, path)).toBe(before[path]);
  await banner.getByRole("button", { name: "Update copies" }).click();
  await expect.poll(async () => (await effective(page, baseURL, PAGE)) ?? "").toContain('class="part-image" src="/about/part-image.svg"');
  for (const path of CSS) expect(await effective(page, baseURL, path)).toBe(before[path]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => effective(page, baseURL, PAGE)).toBe(before[PAGE]);
  expect(await effective(page, baseURL, JSON_PATH)).toBe(before[JSON_PATH]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await effective(page, baseURL, PAGE)) ?? "").toContain("part-image.svg");
  const atDone = await snapshot(page, baseURL, [PAGE, ...CSS, JSON_PATH, MASTER]);
  await banner.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText(PAGE);
  await expect(banner).toBeHidden();
  expect(await snapshot(page, baseURL, [PAGE, ...CSS, JSON_PATH, MASTER])).toEqual(atDone);
  // Disconnect drops only the link: the page and the master stay.
  const json = (await effective(page, baseURL, JSON_PATH))!;
  await row(page, /Site header/).hover();
  await row(page, /Site header/).getByRole("button", { name: "Disconnect this instance" }).click();
  await expect.poll(() => effective(page, baseURL, JSON_PATH)).not.toBe(json);
  await expect(row(page, /^Header/).getByRole("button", { name: "Save shared" })).toBeAttached();
  expect(await effective(page, baseURL, PAGE)).toBe(atDone[PAGE]);
  expect(await effective(page, baseURL, MASTER)).toBe(atDone[MASTER]);
});

test("Cancel during the write, a same-bytes model replacement, and a planner error all refuse; typed fields stay", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const before = await snapshot(page, baseURL, [PAGE, ...CSS, JSON_PATH]);
  // A planner error keeps the form and what was typed.
  await (await share(page, /^Section About Larkspur/, "section", "about-hero", "About hero")).getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, /About hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
  const json = await effective(page, baseURL, JSON_PATH);
  const clash = await share(page, /^Section Get in touch/, "section", "about-hero", "Contact block");
  await clash.getByRole("button", { name: "Save shared" }).click();
  await expect(clash.getByRole("status")).toContainText("about-hero");
  await expect(clash.getByRole("textbox", { name: "Name" })).toHaveValue("Contact block");
  await expect(clash.getByRole("textbox", { name: "ID" })).toHaveValue("about-hero");
  expect(await effective(page, baseURL, JSON_PATH)).toBe(json);
  await clash.getByRole("button", { name: "Cancel" }).click();
  await expect(clash).toBeHidden();
  // The same bytes in a new model version: the offered context is stale and nothing is written.
  const form = await share(page, /^Section Get in touch/, "section", "contact", "Contact");
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("x");
  await page.keyboard.press("Backspace");
  expect(await effective(page, baseURL, PAGE)).toBe(before[PAGE]);
  if (await form.isVisible()) {
    await form.getByRole("button", { name: "Save shared" }).click();
    await expect(form.getByRole("status")).toContainText("changed");
  }
  expect(await effective(page, baseURL, ".editor/sections/contact.html")).toBeUndefined();
  expect(await effective(page, baseURL, JSON_PATH)).toBe(json);
  // Cancel right after Save, while the write is still awaiting: nothing is written.
  const pending = await share(page, /^Section Get in touch/, "section", "contact", "Contact");
  await pending.evaluate(form => {
    (form as HTMLFormElement).requestSubmit();
    form.querySelector<HTMLButtonElement>(".native-shared-authoring__cancel")!.click();
  });
  await expect(pending).toBeHidden();
  await page.waitForTimeout(1000);
  expect(await effective(page, baseURL, ".editor/sections/contact.html")).toBeUndefined();
  expect(await effective(page, baseURL, JSON_PATH)).toBe(json);
  for (const path of [PAGE, ...CSS]) expect(await effective(page, baseURL, path)).toBe(before[path]);
});
