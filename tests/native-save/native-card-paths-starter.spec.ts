import { openPageSettingsFromPages } from "./settings-entry";
import { requireActualFixture } from "./fixture-contract";
import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { storedDraft } from "./drafts";

requireActualFixture();

// Against the real starter (read-only checkout given by ASE_NATIVE_SAVE_FIXTURE;
// the fake GitHub holds every change in memory): the card combobox's create offers, and how editor panels' text fields look (src/ui/inline-field.css).


const pageErrors: string[] = [];
test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.request.post(`${baseURL}/__demo/slow?ms=0`);
});
test.afterEach(() => expect(pageErrors).toEqual([]));

const shots = ".scratch/inline-paths/starter";
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const input = (page: Page) => page.getByRole("combobox", { name: "Link to a page" });
const create = (page: Page) => page.getByRole("option", { name: /Create page/ });

async function open(page: Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await expect(frame(page).locator("card-project").first()).toBeVisible();
}
async function openPicker(page: Page) {
  await frame(page).locator("card-project").last().scrollIntoViewIfNeeded();
  await frame(page).locator("card-project").last().hover();
  await page.locator(".card-ghost__add").click();
  await expect(input(page)).toBeFocused();
}

for (const scheme of ["light", "dark"] as const) for (const narrow of [false, true]) {
  const name = `${scheme}${narrow ? "-narrow" : ""}`;
  test(`starter combobox offers addresses and one new folder (${name})`, { tag: "@actual" }, async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: scheme });
    if (narrow) await page.setViewportSize({ width: 820, height: 800 });
    await open(page, baseURL);
    await openPicker(page);
    await input(page).fill("Oak & Ash");
    await expect(create(page)).toContainText("+ Create page /work/oak-ash/");
    await input(page).fill("/about/oak");
    await expect(create(page)).toContainText("+ Create page /about/oak/");
    await input(page).fill("/work/chairs/oak-ash");
    await expect(create(page)).toContainText("+ Create page /work/chairs/oak-ash/");
    await expect(create(page)).not.toHaveAttribute("aria-disabled", "true");
    await input(page).fill("/work/chairs/tall/oak");
    await expect(create(page)).toHaveAttribute("aria-disabled", "true");
    await expect(create(page)).toContainText("Choose an existing folder or add one folder inside it.");
    await input(page).fill("/work/harbour-lane-pottery/");
    await expect(create(page)).toHaveCount(0);
  });
}

test("starter: a page in a new folder and its fill undo together, then undo restores the home page exactly", { tag: "@actual" }, async ({ page, baseURL }) => {
  await open(page, baseURL);
  const original = await page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
  await openPicker(page);
  const blank = (await storedDraft(page, "index.html"))!.content;
  await input(page).fill("/work/chairs/oak");
  await input(page).press("Enter");
  await expect(page.locator("#status")).toContainText("Created the page Oak at /work/chairs/oak/");
  await expect(frame(page).locator("card-project")).toHaveCount(4);
  await expect.poll(async () => (await storedDraft(page, "work/chairs/oak/index.html"))?.content).toContain("<h1>Oak</h1>");
  await expect(frame(page).locator("card-project").last().locator("a")).toHaveAttribute("href", "/work/chairs/oak/");
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(4);
  await expect.poll(() => storedDraft(page, "work/chairs/oak/index.html")).toBeUndefined();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content).toBe(blank);
  await page.locator(".code-editor__undo").click();
  await expect(frame(page).locator("card-project")).toHaveCount(3);
  await expect.poll(() => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"))).toBe(original);
});

// Every text-like field shown in `root`: its class and the box it draws.
async function audit(page: Page, root: string) {
  return page.evaluate((selector) => [...new Set([...document.querySelectorAll(selector)].flatMap((rootEl) => [...rootEl.querySelectorAll("input, textarea")]))]
    .filter((field) => (field as HTMLElement).getClientRects().length && ["text", "url", "email", "tel", "number", "textarea", "search"].includes((field as HTMLInputElement).type))
    .map((field) => {
      const style = getComputedStyle(field);
      return {
        label: field.getAttribute("aria-label") ?? field.closest("label")?.textContent?.trim().slice(0, 40) ?? "", cls: field.className, parent: field.parentElement?.className ?? "",
        type: (field as HTMLInputElement).type, focused: field === document.activeElement, border: style.borderTopColor, borderWidth: style.borderTopWidth,
        background: style.backgroundColor, outline: style.outlineStyle, shadow: style.boxShadow, height: Math.round(field.getBoundingClientRect().height), rows: (field as HTMLTextAreaElement).rows ?? null,
      };
    }), root);
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

// Structure edits a row's text in place and keeps a link's address, an image and its alt in a
// card attached under the row (36b643f). The row's field is the label's own text: no box, ring
// or underline, the lift is on the row. The card's fields are neutral: no border or outline, a
// thin inset ring and no accent.
function structureFields(group: string, fields: Field[]) {
  expect(fields.length, `${group}: fields found`).toBeGreaterThan(0);
  expect(fields.filter((field) => field.focused).length, `${group}: the row's field has focus`).toBe(1);
  for (const field of fields) {
    expect.soft(field.outline, `${group} ${field.label} outline`).toBe("none");
    expect.soft(clear(field.border) || field.borderWidth === "0px", `${group} ${field.label} border ${field.borderWidth} ${field.border}`).toBe(true);
    if (field.focused) {
      expect.soft(field.shadow, `${group} ${field.label} in-row field ring`).toBe("none");
      expect.soft(clear(field.background), `${group} ${field.label} in-row field background ${field.background}`).toBe(true);
    } else expect.soft(field.shadow, `${group} ${field.label} card field ring`).toMatch(/^\S.* 0px 0px 0px 1px inset$/);
  }
}

// A late source-index refresh moves the focused field into a new row. Query and
// measure together, then retain the same snapshot that proves the editor is ready.
async function auditStructure(page: Page, slot: string, focusedLabel: string, minimum: number) {
  let fields: Field[] = [];
  await expect.poll(async () => {
    fields = await audit(page, `.page-structure__tree [role=treeitem][data-slot=${slot}], .page-structure__inline`);
    return { ready: fields.length >= minimum, focused: fields.filter(field => field.focused).map(field => field.label) };
  }).toEqual({ ready: true, focused: [focusedLabel] });
  return fields;
}

const tree = (page: Page) => page.locator(".page-structure__tree");
async function showPages(page: Page) {
  if (!await page.locator("#explorer").evaluate((el) => el.matches(":popover-open"))) await page.locator("#explorer-toggle").click();
  await page.getByRole("tab", { name: "Pages", exact: true }).click();
}

for (const scheme of ["light", "dark"] as const) for (const narrow of [false, true]) {
  const name = `${scheme}${narrow ? "-narrow" : ""}`;
  test(`starter panels' text fields read inline (${name})`, { tag: "@actual" }, async ({ page, baseURL }) => {
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
    report.structureSlot = await auditStructure(page, "title", "Title: Text", 1);
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
    // The link's text is edited in place in its row; its address stays in the card attached below.
    await expect(page.getByRole("textbox", { name: "Primary: Button text", exact: true })).toBeFocused();
    await expect(page.getByRole("combobox", { name: "Primary: Link / URL", exact: true })).toBeVisible();
    report.structureLink = await auditStructure(page, "primary", "Primary: Button text", 2);
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

    // The canvas width.
    report.canvas = await audit(page, ".canvas-width");

    // Page settings: General.
    await showPages(page);
    await openPageSettingsFromPages(page);
    const settings = page.getByRole("dialog", { name: "Page settings", exact: true });
    await expect(settings).toBeVisible();
    report.pageSettings = await audit(page, ".site-settings");
    await page.screenshot({ path: `${shots}/fields-page-settings-${name}.png` });
    await expect(settings.getByRole("tab", { name: "Fields", exact: true })).toHaveCount(0);
    await settings.locator(".site-settings__actions").getByRole("button", { name: "Cancel", exact: true }).click();

    // Pages: a page row renamed in place.
    await showPages(page);
    const about = page.locator("#explorer").getByRole("treeitem", { name: /About/ }).first();
    await about.focus();
    await about.press("F2");
    await expect(about.getByRole("textbox")).toBeFocused();
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
    // At rest: the pointer leaves the field it clicked through, so no hover fill is measured.
    await page.mouse.move(0, 0);
    // The hover fill fades out (120 ms); wait until no resting field keeps one.
    // The same fields the audit measures: the bar's and its address popover's.
    await expect.poll(() => page.locator(".edit-bar, .edit-bar__popover").evaluateAll((roots) => {
      const fields = [...new Set(roots.flatMap((root) => [...root.querySelectorAll("input.edit-bar__field-input")]))]
        .filter((field) => (field as HTMLElement).getClientRects().length && field !== document.activeElement);
      const filled = fields.filter((field) => !["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(field).backgroundColor));
      return { fields: fields.length > 0, filled: filled.length };
    })).toEqual({ fields: true, filled: 0 });
    report.editBar = await audit(page, ".edit-bar, .edit-bar__popover");
    await page.screenshot({ path: `${shots}/fields-edit-bar-${name}.png` });

    await writeFile(`${shots}/fields-audit-${name}.json`, JSON.stringify(report, null, 2));
    for (const [group, fields] of Object.entries(report)) {
      if (group === "structureSlot" || group === "structureLink") structureFields(group, fields);
      else boxless(group, fields);
    }
  });
}
