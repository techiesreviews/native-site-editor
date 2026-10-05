import { openPageSettingsFromPages } from "./settings-entry";
import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { storedDraft } from "./drafts";

requireActualFixture();

// Against the real starter (read-only checkout given by ASE_NATIVE_SAVE_FIXTURE;
// the fake GitHub holds every change in memory): the card popover's folder
// chooser, and how editor panels' text fields look (src/ui/inline-field.css).


const pageErrors: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const shots = ".scratch/inline-paths/starter";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const popover = (page: Page) => page.getByRole("dialog", { name: "New card with its own page" });
const folders = (page: Page) => page.getByRole("listbox", { name: "Folder for the new page" });
const url = (page: Page) => popover(page).locator(".card-add__url");
const shownUrl = (page: Page) => url(page).evaluate((row) => {
  const walk = (node: Node): string => node instanceof HTMLInputElement ? node.value
    : node instanceof HTMLElement ? (node.hidden ? "" : [...node.childNodes].map(walk).join("")) : node.textContent ?? "";
  return walk(row).replace(/\s+/g, " ").trim();
});

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("card-project").first()).toBeVisible();
}
async function openPopover(page: Page) {
  await frame(page).locator("card-project").last().scrollIntoViewIfNeeded();
  await frame(page).locator("card-project").last().hover();
  await page.locator(".card-ghost__add").click();
  await expect(popover(page).getByRole("textbox", { name: "Page title" })).toBeFocused();
}

for (const scheme of ["light", "dark"] as const) for (const narrow of [false, true]) {
  const name = `${scheme}${narrow ? "-narrow" : ""}`;
  test(`starter popover, folders and new folder (${name})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    if (narrow) await page.setViewportSize({ width: 820, height: 800 });
    await open(page, baseURL);
    await openPopover(page);
    await page.keyboard.type("Oak & Ash");
    await expect.poll(() => shownUrl(page)).toBe("URL /work/oak-ash/");
    await page.screenshot({ path: `${shots}/popover-${name}.png` });
    await popover(page).locator(".card-add__path").click();
    await expect(folders(page).getByRole("option").first()).toHaveText("/work/");
    await popover(page).getByRole("combobox", { name: "URL prefix" }).fill("");
    await expect(folders(page).getByRole("option", { name: "/about/", exact: true })).toBeVisible();
    await page.screenshot({ path: `${shots}/folders-${name}.png` });
    await popover(page).getByRole("combobox", { name: "URL prefix" }).fill("/work/chairs/");
    await expect.poll(() => shownUrl(page)).toBe("URL /work/chairs/oak-ash/");
    await page.screenshot({ path: `${shots}/new-folder-${name}.png` });
  });
}

test("starter: a page in a new folder and its card, then one Undo restores the home page exactly", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await openPopover(page);
  await page.keyboard.type("Oak");
  await popover(page).locator(".card-add__path").click();
  await popover(page).getByRole("combobox", { name: "URL prefix" }).fill("/work/chairs/");
  await popover(page).getByRole("textbox", { name: "Page title" }).focus();
  const home = page.locator("#content .view-lines");
  const before = await home.textContent();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Created the page Oak at /work/chairs/oak/");
  await expect(frame(page).locator("card-project")).toHaveCount(4);
  expect((await storedDraft(page, "work/chairs/oak/index.html"))?.content).toContain("Oak");
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  await expect.poll(async () => (await storedDraft(page, "work/chairs/oak/index.html"))?.content).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? before).not.toContain("/work/chairs/oak/");
});

// Every text-like field shown in `root`: its class and the box it draws.
async function audit(page: Page, root: string) {
  return page.locator(root).evaluateAll((roots) => [...new Set(roots.flatMap((rootEl) => [...rootEl.querySelectorAll("input, textarea")]))]
    .filter((field) => (field as HTMLElement).getClientRects().length && ["text", "url", "email", "tel", "number", "textarea", "search"].includes((field as HTMLInputElement).type))
    .map((field) => {
      const style = getComputedStyle(field);
      return {
        label: field.getAttribute("aria-label") ?? field.closest("label")?.textContent?.trim().slice(0, 40) ?? "", cls: field.className, parent: field.parentElement?.className ?? "",
        type: (field as HTMLInputElement).type, focused: field === document.activeElement, border: style.borderTopColor, borderWidth: style.borderTopWidth,
        background: style.backgroundColor, outline: style.outlineStyle, shadow: style.boxShadow, height: Math.round(field.getBoundingClientRect().height), rows: (field as HTMLTextAreaElement).rows ?? null,
      };
    }));
}
type Field = Awaited<ReturnType<typeof audit>>[number];
const clear = (color: string) => color === "rgba(0, 0, 0, 0)" || color === "transparent";
// At rest, a text field draws no box: its border and background are clear (search fields keep theirs).
function boxless(group: string, fields: Field[]) {
  expect(fields.length, `${group}: fields found`).toBeGreaterThan(0);
  for (const field of fields) {
    if (field.type === "search") continue;
    // Focused, from the pointer, a script or the keyboard: a primary underline, no ring or box.
    if (field.focused) {
      expect.soft(field.outline, `${group} ${field.label} focused outline`).toBe("none");
      expect.soft(field.shadow, `${group} ${field.label} focused underline`).toMatch(/-[12](\.\d+)?px 0px 0px inset/);
      expect.soft(clear(field.border) || field.borderWidth === "0px", `${group} ${field.label} focused border ${field.border}`).toBe(true);
      continue;
    }
    expect.soft(clear(field.border) || field.borderWidth === "0px", `${group} ${field.label} (${field.cls} in ${field.parent}) border ${field.borderWidth} ${field.border}`).toBe(true);
    expect.soft(clear(field.background), `${group} ${field.label} (${field.cls}) background ${field.background}`).toBe(true);
  }
}

const tree = (page: Page) => page.locator(".page-structure__tree");
async function showPages(page: Page) {
  if (!await page.locator("#explorer").evaluate((el) => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
}

for (const scheme of ["light", "dark"] as const) for (const narrow of [false, true]) {
  const name = `${scheme}${narrow ? "-narrow" : ""}`;
  test(`starter panels' text fields read inline (${name})`, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    if (narrow) await page.setViewportSize({ width: 900, height: 900 });
    await open(page, baseURL);
    const report: Record<string, Field[]> = {};

    // Structure: the hero section, selected from its row; its Title field opened by its pencil, edited, applied and undone.
    const hero = tree(page).getByRole("treeitem", { name: /Section hero/ }).first();
    await hero.click();
    await expect(page.locator(".edit-bar__kind").first()).toContainText(/hero/i);
    const heading = frame(page).locator("section-hero h1, section-hero [slot=title]").first();
    const original = (await heading.textContent())!.trim();
    if (await hero.getAttribute("aria-expanded") === "false") await hero.press("ArrowRight");
    const titleRow = tree(page).locator("[role=treeitem][data-slot=title]").filter({ visible: true }).first();
    await titleRow.hover();
    await titleRow.locator(".page-structure__action[aria-label='Edit Title']").click();
    const titleText = page.getByRole("textbox", { name: "Title: Text", exact: true });
    await expect(titleText).toBeFocused();
    report.structureSlot = await audit(page, ".page-structure__inline");
    await page.screenshot({ path: `${shots}/fields-structure-slot-${name}.png` });
    await titleText.fill("Inline & exact");
    await titleText.press("Tab");
    await expect(heading).toHaveText("Inline & exact");
    await page.locator(".code-editor__undo").click();
    await expect(heading).toHaveText(original);

    // Structure: the hero's Primary link, its text and address fields.
    const linkRow = tree(page).locator("[role=treeitem][data-slot=primary]").filter({ visible: true }).first();
    await linkRow.hover();
    await linkRow.locator(".page-structure__action[aria-label='Edit Primary']").click();
    await expect(page.locator(".page-structure__inline input").first()).toBeFocused();
    report.structureLink = await audit(page, ".page-structure__inline");
    expect(report.structureLink.length).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: `${shots}/fields-structure-link-${name}.png` });
    await page.keyboard.press("Escape");

    // Structure: the hero's attributes form.
    await hero.hover();
    await hero.getByRole("button", { name: "Attributes", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "New attribute name", exact: true })).toBeVisible();
    report.attributes = await audit(page, ".page-structure__tree");
    await page.screenshot({ path: `${shots}/fields-attributes-${name}.png` });
    await page.keyboard.press("Escape");

    // Style: the cards grid's own `.cards` rule (styles/layout.css), every section open, and a value's variable menu.
    await frame(page).locator("card-project h3").first().click();
    await page.getByRole("button", { name: "div.cards", exact: true }).click();
    const grip = page.getByRole("separator", { name: "Resize Style panel", exact: true });
    if (await grip.getAttribute("aria-valuenow") === "0") await grip.click();
    const style = page.getByRole("complementary", { name: "Style panel" });
    await expect(style.getByText(".cards", { exact: true }).first()).toBeVisible();
    await expect(style.getByText("styles/layout.css", { exact: true }).first()).toBeVisible();
    await style.locator("details.style-panel__section").evaluateAll((sections) => sections.forEach((section) => { (section as HTMLDetailsElement).open = true; }));
    await page.waitForTimeout(200);
    report.style = await audit(page, "[aria-label='Style panel']");
    await page.screenshot({ path: `${shots}/fields-style-${name}.png` });
    const gap = style.getByRole("textbox", { name: /^(Gap|Margin top|Padding top)$/ }).first();
    await gap.scrollIntoViewIfNeeded();
    await gap.click({ button: "right" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/fields-style-variables-${name}.png` });
    await page.keyboard.press("Escape");

    // The canvas width.
    report.canvas = await audit(page, ".canvas-width");

    // Page settings: General, and Fields (the collections panel's page fields).
    await showPages(page);
    await openPageSettingsFromPages(page);
    const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
    await expect(settings).toBeVisible();
    report.pageSettings = await audit(page, ".site-settings");
    await page.screenshot({ path: `${shots}/fields-page-settings-${name}.png` });
    await settings.getByRole("tab", { name: "Fields", exact: true }).click();
    await page.waitForTimeout(300);
    report.pageFields = await audit(page, ".site-settings");
    await page.screenshot({ path: `${shots}/fields-page-fields-${name}.png` });
    await settings.getByRole("button", { name: "Cancel" }).click();

    // Pages: a page row renamed in place.
    await showPages(page);
    const about = page.locator("#explorer").getByRole("treeitem", { name: /About/ }).first();
    await about.focus();
    await about.press("F2");
    await page.waitForTimeout(300);
    report.pages = await audit(page, "#explorer");
    await page.screenshot({ path: `${shots}/fields-pages-rename-${name}.png` });
    await page.keyboard.press("Escape");

    // The edit bar's link address.
    await page.locator("#explorer").evaluate((el) => { if (el.matches(":popover-open")) (el as HTMLElement).hidePopover(); });
    await expect(page.locator("#explorer")).toBeHidden();
    await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html");
    await frame(page).locator("card-project a[slot=link]").first().click();
    const linkButton = page.locator(".edit-bar").getByRole("button", { name: /^(Link|Address|Edit link)/ }).first();
    if (await linkButton.isVisible().catch(() => false)) await linkButton.click();
    await page.waitForTimeout(300);
    report.editBar = await audit(page, ".edit-bar, .edit-bar__popover");
    await page.screenshot({ path: `${shots}/fields-edit-bar-${name}.png` });

    await writeFile(`${shots}/fields-audit-${name}.json`, JSON.stringify(report, null, 2));
    for (const [group, fields] of Object.entries(report)) boxless(group, fields);
  });
}
