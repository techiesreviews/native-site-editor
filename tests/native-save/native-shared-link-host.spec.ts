import { expect, test, type Page } from "@playwright/test";
import { fixtureKind } from "./fixture-contract";
import { storedDraft } from "./drafts";

// Linked page copies outside a master, and the restored field warnings, on the real host.
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
const MASTER = ".editor/sections/about-hero.html";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });
const structure = (page: Page) => page.getByRole("complementary", { name: "Page structure" });
const row = (page: Page, name: RegExp) => structure(page).getByRole("treeitem", { name }).first();
const effective = async (page: Page, baseURL: string | undefined, path: string) => {
  const draft = await storedDraft(page, path);
  if (draft) return draft.content;
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
};
async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(PAGE)}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await expect(frame(page).locator("header.site-header")).toBeVisible();
}
async function replaceCode(page: Page, text: string) {
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate(value => navigator.clipboard.writeText(value), text);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

test("a child of a linked page copy shows its shared item's context; the chip selects the copy, the child has no Edit, and its text edits stay on the page", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await row(page, /^Section About Larkspur/).hover();
  await row(page, /^Section About Larkspur/).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: "Share section" });
  await form.getByRole("textbox", { name: "Name" }).fill("Shared hero");
  await form.getByRole("textbox", { name: "ID" }).fill("about-hero");
  await form.getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, /Shared hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
  const master = await effective(page, baseURL, MASTER);
  // The heading inside the linked copy: "Shared hero › Heading", with no Edit of its own.
  await frame(page).locator("section.hero h1").click();
  const chip = bar(page).getByRole("button", { name: /Shared hero/ });
  await expect(chip).toBeVisible();
  await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("linked-child-context.png") });
  // A text edit of the page copy changes only the page.
  const source = (await effective(page, baseURL, PAGE))!;
  await replaceCode(page, source.replace("About Larkspur</h1>", "About us</h1>"));
  await expect.poll(() => effective(page, baseURL, PAGE)).toContain("About us</h1>");
  expect(await effective(page, baseURL, MASTER)).toBe(master);
  // The edited copy is customised now, so it no longer counts as a linked copy at its old bytes;
  // put the text back and select the heading again to use the chip.
  await replaceCode(page, source);
  await expect.poll(() => effective(page, baseURL, PAGE)).toBe(source);
  await frame(page).locator("section.hero h1").click();
  await bar(page).getByRole("button", { name: /Shared hero/ }).click();
  await expect(row(page, /Shared hero/)).toHaveAttribute("aria-selected", "true");
  await expect(bar(page).getByRole("button", { name: "Edit Shared hero component", exact: true })).toBeVisible();
  // A plain section's child has no shared context.
  await frame(page).locator("section.contact h2").click();
  await expect(bar(page).getByRole("button", { name: /Shared hero/ })).toHaveCount(0);
});

test("an unnamed button and an image with no file show their warnings; a named button does not", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const source = (await effective(page, baseURL, PAGE))!;
  await replaceCode(page, source.replace('<section class="contact flow" id="contact">', '<section class="contact flow" id="contact"><button class="unnamed" style="width:40px;height:24px"></button><button class="named" aria-label="Open menu" style="width:40px;height:24px"></button><img class="nofile" src="" alt="" width="40" height="40">'));
  await expect(frame(page).locator("button.unnamed")).toBeVisible();
  await frame(page).locator("button.unnamed").click();
  await expect(bar(page)).toContainText("Needs a name");
  await frame(page).locator("button.named").click();
  await expect(bar(page)).not.toContainText("Needs a name");
  await frame(page).locator("img.nofile").click({ force: true });
  await expect(bar(page)).toContainText("No image");
  await expect(bar(page)).not.toContainText("Alt text missing");
});

test("a button named by an icon's aria-label, and images given by srcset or picture, show no warning; a data-alt does not name a button", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const source = (await effective(page, baseURL, PAGE))!;
  const svg = '<svg role="img" aria-label="Open menu" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20"/></svg>';
  await replaceCode(page, source.replace('<section class="contact flow" id="contact">', `<section class="contact flow" id="contact"><button class="icon" style="width:40px;height:24px">${svg}</button><button class="dataalt" style="width:40px;height:24px"><img data-alt="x" src="/images/studio-desk.svg" alt="" width="20" height="20"></button><img class="srcset" srcset="/images/studio-desk.svg 1x" alt="Desk" width="40" height="40"><picture><source srcset="/images/studio-desk.svg"><img class="pictured" alt="Desk" width="40" height="40"></picture><img class="nofile" src="" alt="" width="40" height="40">`));
  await expect(frame(page).locator("button.icon")).toBeVisible();
  // Each case follows one that warns, so the warning must actually go away.
  await frame(page).locator("button.dataalt").click({ position: { x: 36, y: 12 } });
  await expect(bar(page)).toContainText("Needs a name");
  await frame(page).locator("button.icon").click();
  await expect(bar(page)).not.toContainText("Needs a name");
  for (const name of ["img.srcset", "img.pictured"]) {
    await frame(page).locator("img.nofile").click({ force: true });
    await expect(bar(page)).toContainText("No image");
    await frame(page).locator(name).click({ force: true });
    await expect(bar(page)).not.toContainText("No image");
  }
});

test("an editor JSON whose section catalog has an unsupported version leaves the page plainly editable and offers no shared label", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await row(page, /^Section About Larkspur/).hover();
  await row(page, /^Section About Larkspur/).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: "Share section" });
  await form.getByRole("textbox", { name: "Name" }).fill("Shared hero");
  await form.getByRole("textbox", { name: "ID" }).fill("about-hero");
  await form.getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, /Shared hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
  const JSON_FILE = ".editor/page-builder.json";
  const parsed = JSON.parse((await effective(page, baseURL, JSON_FILE))!);
  parsed.reusableSections.version = 99;
  const broken = JSON.stringify(parsed, null, 2) + "\n";
  // Through the real Code pane, as a person would.
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(JSON_FILE)}`);
  await expect(page.locator("#primary-title")).toHaveText(JSON_FILE);
  await replaceCode(page, broken);
  await expect.poll(() => effective(page, baseURL, JSON_FILE)).toBe(broken);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(PAGE)}`);
  await expect(page.locator("#primary-title")).toHaveText(PAGE);
  await expect(row(page, /^Section About Larkspur/)).toBeVisible();
  await expect(structure(page).getByRole("button", { name: "Edit component" })).toHaveCount(0);
  await frame(page).locator("section.hero h1").click();
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: /Shared hero/ })).toHaveCount(0);
  // Plain editing still works, and the JSON is left exactly as written.
  const source = (await effective(page, baseURL, PAGE))!;
  await replaceCode(page, source.replace("About Larkspur</h1>", "About us</h1>"));
  await expect(frame(page).locator("section.hero h1")).toHaveText("About us");
  expect(await effective(page, baseURL, JSON_FILE)).toBe(broken);
});

// ---- Use here across the six routes ------------------------------------------------------------
const JSON_PATH = ".editor/page-builder.json";
const ROUTES = {
  "index.html": "Home",
  "about/index.html": "About · Larkspur Studio",
  "work/fern-and-kettle/index.html": "Fern & Kettle · Larkspur Studio",
  "work/harbour-lane-pottery/index.html": "Harbour Lane Pottery · Larkspur Studio",
  "work/meadow-row-allotments/index.html": "Meadow Row Allotments · Larkspur Studio",
  "404.html": "Page not found · Larkspur Studio",
} as const;
type Route = keyof typeof ROUTES;
const PAGES = Object.keys(ROUTES) as Route[];
const CSS = ["styles/site.css", "styles/sections.css", "styles/layout.css", "styles/components.css", "styles/elements.css", "styles/tokens.css", "styles/utilities.css"];
const all = async (page: Page, baseURL: string | undefined, paths: readonly string[]) => Object.fromEntries(await Promise.all(paths.map(async path => [path, await effective(page, baseURL, path)] as const)));
async function goTo(page: Page, path: Route) {
  await page.locator("#explorer-toggle").click();
  const item = page.locator("#explorer").getByRole("treeitem", { name: ROUTES[path], exact: true });
  const work = page.locator("#explorer").getByRole("treeitem", { name: "Work", exact: true });
  if (path.startsWith("work/") && await work.getAttribute("aria-expanded") === "false") { await work.focus(); await page.keyboard.press("ArrowRight"); }
  await item.click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await page.locator("#explorer-toggle").click();
  await expect(page.locator("#primary-title")).toHaveText(path);
  await expect(frame(page).locator("header.site-header")).toBeVisible();
}
async function saveShared(page: Page, rowName: RegExp, kind: string, id: string, label: string) {
  await row(page, rowName).hover();
  await row(page, rowName).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: `Share ${kind}` });
  await form.getByRole("textbox", { name: "Name" }).fill(label);
  await form.getByRole("textbox", { name: "ID" }).fill(id);
  await form.getByRole("button", { name: "Save shared" }).click();
  await expect(row(page, new RegExp(label)).getByRole("button", { name: "Edit component" })).toBeAttached();
}
async function useHere(page: Page, rowName: RegExp, kind: string, label: string) {
  // Not linked before: the row still offers Save shared, under its own kind.
  await row(page, rowName).hover();
  await row(page, rowName).getByRole("button", { name: "Save shared" }).click();
  const form = structure(page).getByRole("form", { name: `Share ${kind}` });
  const choice = form.getByRole("combobox", { name: "Shared item" });
  await expect(choice.locator("option")).toHaveText([`New shared ${kind}`, `Use ${label} here`]);
  await choice.selectOption({ label: `Use ${label} here` });
  await form.getByRole("button", { name: "Use here" }).click();
  await expect(form).toHaveCount(0);
  await expect(row(page, new RegExp(label)).getByRole("button", { name: "Edit component" })).toBeAttached();
}

test("Use here links the shared header and footer on all six routes and the section only on the selected copy, JSON only (one Undo/Redo per kind); Update of pristine copies is one Undo/Redo; Save persists literal pages", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("work/fern-and-kettle/index.html")}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  const pristine = await all(page, baseURL, [...PAGES, ...CSS]);
  // Saved on one pristine work page.
  await saveShared(page, /^Header/, "header", "site-head", "Site header");
  await saveShared(page, /^Footer/, "footer", "site-foot", "Site footer");
  await saveShared(page, /^Section Need something similar/, "section", "contact-cta", "Contact CTA");
  for (const path of [...PAGES, ...CSS]) expect(await effective(page, baseURL, path)).toBe(pristine[path]);
  // Every other route: independent until its own explicit Use here; each link writes the JSON only.
  const undoRedo = async (before: string | undefined, after: string) => {
    // One Undo removes just this link; Redo brings it back. Pages and CSS never change.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => effective(page, baseURL, JSON_PATH)).toBe(before);
    for (const other of [...PAGES, ...CSS]) expect(await effective(page, baseURL, other)).toBe(pristine[other]);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => effective(page, baseURL, JSON_PATH)).toBe(after);
    for (const other of [...PAGES, ...CSS]) expect(await effective(page, baseURL, other)).toBe(pristine[other]);
  };
  const undone = new Set<string>();
  for (const path of PAGES.filter(path => path !== "work/fern-and-kettle/index.html")) {
    await goTo(page, path);
    for (const [name, kind, label] of [[/^Header/, "header", "Site header"], [/^Footer/, "footer", "Site footer"]] as const) {
      const before = await effective(page, baseURL, JSON_PATH);
      await useHere(page, name, kind, label);
      const after = (await effective(page, baseURL, JSON_PATH))!;
      expect(after).not.toBe(before);
      expect(JSON.parse(after).pages[path].pageParts).toBeTruthy();
      for (const other of [...PAGES, ...CSS]) expect(await effective(page, baseURL, other)).toBe(pristine[other]);
      const customised = (path === "index.html" || path === "about/index.html") && kind === "header" || path === "about/index.html" && kind === "footer";
      if (customised) await expect(page.locator("#status")).toContainText("differs from the shared item");
      if (!undone.has(kind)) { undone.add(kind); await undoRedo(before, after); }
    }
  }
  // The section: only the selected Harbour Lane copy is linked; Meadow Row's identical copy stays plain.
  await goTo(page, "work/harbour-lane-pottery/index.html");
  const beforeSection = await effective(page, baseURL, JSON_PATH);
  await useHere(page, /^Section Need something similar/, "section", "Contact CTA");
  const afterSection = (await effective(page, baseURL, JSON_PATH))!;
  expect(afterSection).not.toBe(beforeSection);
  await undoRedo(beforeSection, afterSection);
  await goTo(page, "work/meadow-row-allotments/index.html");
  await expect(row(page, /^Section Need something similar/).getByRole("button", { name: "Save shared" })).toBeAttached();
  const json = JSON.parse((await effective(page, baseURL, JSON_PATH))!);
  for (const path of PAGES) expect(Object.keys(json.pages[path].pageParts ?? {})).toHaveLength(2);
  const sectionLinks = (path: Route) => Object.values(json.pages[path]?.sections ?? {}).filter((link: any) => link?.kind === "native-section" && link.recordId === "contact-cta");
  expect(sectionLinks("work/fern-and-kettle/index.html")).toHaveLength(1);
  expect(sectionLinks("work/harbour-lane-pottery/index.html")).toHaveLength(1);
  expect(sectionLinks("work/meadow-row-allotments/index.html")).toHaveLength(0);
  expect(sectionLinks("index.html")).toHaveLength(0);
  // Edit the header master in Code, hide Code, Update copies: pristine copies follow; customised stay.
  await goTo(page, "work/fern-and-kettle/index.html");
  await row(page, /Site header/).hover();
  await row(page, /Site header/).getByRole("button", { name: "Edit component" }).click();
  const banner = page.getByRole("region", { name: "Shared header master" });
  await expect(banner).toBeVisible();
  const MASTER = ".editor/page-parts/site-head.html";
  const master = (await effective(page, baseURL, MASTER))!;
  const edited = master.replace('class="brand" href="/">Larkspur</a>', 'class="brand" href="/">Larkspur Studio</a>');
  expect(edited).not.toBe(master);
  await page.locator("#content [role='textbox']").first().focus();
  await page.evaluate(value => navigator.clipboard.writeText(value), edited);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => effective(page, baseURL, MASTER)).toBe(edited);
  const grip = page.getByRole("separator", { name: "Resize code pane", exact: true });
  await grip.focus();
  await page.keyboard.press("Home");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  const beforeUpdate = await all(page, baseURL, [...PAGES, JSON_PATH]);
  await banner.getByRole("button", { name: "Update copies" }).click();
  const pristineHeaders = PAGES.filter(path => path !== "index.html" && path !== "about/index.html");
  for (const path of pristineHeaders) await expect.poll(async () => (await effective(page, baseURL, path)) ?? "").toContain(">Larkspur Studio</a>");
  for (const path of ["index.html", "about/index.html"] as const) expect(await effective(page, baseURL, path)).toBe(pristine[path]);
  for (const path of CSS) expect(await effective(page, baseURL, path)).toBe(pristine[path]);
  await page.screenshot({ path: test.info().outputPath("six-route-update-code-hidden.png") });
  // The whole Update is one Undo across the six pages and the JSON: the edited master, the CSS,
  // the session, its banner and the hidden Code all stay. Redo brings back exactly the update.
  const afterUpdate = await all(page, baseURL, [...PAGES, JSON_PATH]);
  expect(afterUpdate[JSON_PATH]).not.toBe(beforeUpdate[JSON_PATH]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  for (const path of [...PAGES, JSON_PATH]) await expect.poll(() => effective(page, baseURL, path)).toBe(beforeUpdate[path]);
  expect(await effective(page, baseURL, MASTER)).toBe(edited);
  for (const path of CSS) expect(await effective(page, baseURL, path)).toBe(pristine[path]);
  await expect(banner).toBeVisible();
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  for (const path of [...PAGES, JSON_PATH]) await expect.poll(() => effective(page, baseURL, path)).toBe(afterUpdate[path]);
  expect(await effective(page, baseURL, MASTER)).toBe(edited);
  await expect(banner).toBeVisible();
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  await banner.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#primary-title")).toHaveText("work/fern-and-kettle/index.html");
  await expect(grip).toHaveAttribute("aria-valuenow", "0");
  // Saved through the repository boundary: the pages are literal HTML that need no editor files or JS.
  const { publishButton, showPublish } = await import("./publish");
  await showPublish(page);
  await publishButton(page).click();
  await expect(page.locator(".publish-menu__message")).toContainText("Saved to GitHub", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  const head = async (path: string) => (await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`)).text();
  const literal = await page.context().browser()!.newContext({ javaScriptEnabled: false });
  const view = await literal.newPage();
  for (const path of PAGES) {
    const html = await head(path);
    expect(html).not.toContain(".editor");
    await view.setContent(html);
    await expect(view.locator("header.site-header .brand")).toHaveText(pristineHeaders.includes(path) ? "Larkspur Studio" : "Larkspur");
    await expect(view.locator("footer.site-footer")).toHaveCount(1);
  }
  await literal.close();
  expect(await head(JSON_PATH)).toContain("site-head");
});

test("an open Use here form refuses after its page source or the editor JSON changes", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent("work/fern-and-kettle/index.html")}`);
  await expect(page.locator("#status")).toContainText("Up to date with main");
  await saveShared(page, /^Header/, "header", "site-head", "Site header");
  await saveShared(page, /^Footer/, "footer", "site-foot", "Site footer");
  await goTo(page, "work/harbour-lane-pottery/index.html");
  const open = async () => {
    await row(page, /^Header/).hover();
    await row(page, /^Header/).getByRole("button", { name: "Save shared" }).click();
    const form = structure(page).getByRole("form", { name: "Share header" });
    await form.getByRole("combobox", { name: "Shared item" }).selectOption({ label: "Use Site header here" });
    return form;
  };
  const tryUse = async (form: ReturnType<typeof structure>) => {
    if (await form.isVisible()) {
      await form.getByRole("button", { name: "Use here" }).click();
      await expect(form.getByRole("status")).toContainText("changed");
    }
  };
  // The page source changes under the open form.
  const json = await effective(page, baseURL, JSON_PATH);
  let form = await open();
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n");
  await expect.poll(async () => (await effective(page, baseURL, "work/harbour-lane-pottery/index.html"))?.endsWith("\n\n") ?? false).toBe(true);
  await tryUse(form);
  expect(await effective(page, baseURL, JSON_PATH)).toBe(json);
  await page.keyboard.press("Escape");
  // The editor JSON changes under the open form: the linked footer is disconnected meanwhile.
  await useHere(page, /^Footer/, "footer", "Site footer");
  const linked = (await effective(page, baseURL, JSON_PATH))!;
  form = await open();
  await row(page, /Site footer/).hover();
  await row(page, /Site footer/).getByRole("button", { name: "Disconnect this instance" }).click();
  await expect.poll(() => effective(page, baseURL, JSON_PATH)).not.toBe(linked);
  const disconnected = await effective(page, baseURL, JSON_PATH);
  await tryUse(form);
  expect(await effective(page, baseURL, JSON_PATH)).toBe(disconnected);
});

for (const [what, mangle] of [
  ["malformed", (_: string) => "{ not json\n"],
  ["unsupported-version", (text: string) => { const parsed = JSON.parse(text); parsed.reusableSections.version = 99; return JSON.stringify(parsed, null, 2) + "\n"; }],
] as const) {
  test(`selecting a whole section with a ${what} editor JSON keeps the bar plain and usable, with no save action and no JSON write`, async ({ page, baseURL }) => {
    await open(page, baseURL);
    await row(page, /^Section About Larkspur/).hover();
    await row(page, /^Section About Larkspur/).getByRole("button", { name: "Save shared" }).click();
    const form = structure(page).getByRole("form", { name: "Share section" });
    await form.getByRole("textbox", { name: "Name" }).fill("Shared hero");
    await form.getByRole("textbox", { name: "ID" }).fill("about-hero");
    await form.getByRole("button", { name: "Save shared" }).click();
    await expect(row(page, /Shared hero/).getByRole("button", { name: "Edit component" })).toBeAttached();
    const JSON_FILE = ".editor/page-builder.json";
    const broken = mangle((await effective(page, baseURL, JSON_FILE))!);
    await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(JSON_FILE)}`);
    await expect(page.locator("#primary-title")).toHaveText(JSON_FILE);
    await replaceCode(page, broken);
    await expect.poll(() => effective(page, baseURL, JSON_FILE)).toBe(broken);
    await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(PAGE)}`);
    await expect(page.locator("#primary-title")).toHaveText(PAGE);
    // The whole section, selected through Structure: the bar shows, with no shared or save action.
    await row(page, /^Section About Larkspur/).locator(".page-structure__label").first().click();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText("Section");
    await expect(bar(page).getByRole("button", { name: /^Update / })).toHaveCount(0);
    await expect(bar(page).getByRole("button", { name: /^Edit .* component$/ })).toHaveCount(0);
    // Plain editing still works; the JSON stays exactly as written.
    const source = (await effective(page, baseURL, PAGE))!;
    await replaceCode(page, source.replace("About Larkspur</h1>", "About us</h1>"));
    await expect(frame(page).locator("section.hero h1")).toHaveText("About us");
    expect(await effective(page, baseURL, JSON_FILE)).toBe(broken);
  });
}
