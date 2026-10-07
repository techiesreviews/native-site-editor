import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Editing a Structure row's text in place: a first click selects; a second
// click, a double-click, Enter or F2 turns the row's text into its field
// without moving it. Typing shows in the page at once; Done or Enter keep it
// as one undo step; Escape takes it all back.
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const tree = (page: Page) => page.getByRole("tree", { name: "Page structure", exact: true });
const source = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html"));
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
const shownTitle = (page: Page) => frame(page).locator("project-card").first().locator("span[slot='title']");
const titleRow = (page: Page) => tree(page).locator("[role=treeitem][data-slot=title]").first();
const titleField = (page: Page) => tree(page).getByRole("textbox", { name: "Title: Text", exact: true });

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(".hero h1")).toBeVisible();
  await editorMounted(page);
  const section = tree(page).getByRole("treeitem", { name: "Section", exact: true });
  if (await section.getAttribute("aria-expanded") === "false") await section.locator(".page-structure__toggle").click();
  const instance = tree(page).getByRole("treeitem", { name: /^Project card Reusable cards$/ });
  if (await instance.getAttribute("aria-expanded") === "false") await instance.locator(".page-structure__toggle").click();
  await expect(titleRow(page)).toBeVisible();
});

test("a single click selects; a second click edits in place without moving the text; typing shows at once; Escape restores page and source", async ({ page }) => {
  const row = titleRow(page), text = row.locator(".page-structure__text");
  await text.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).not.toHaveClass(/is-editing/);
  await expect(titleField(page)).toHaveCount(0);

  const original = await source(page);
  const before = (await text.boundingBox())!;
  await text.click({ position: { x: 20, y: before.height / 2 } });
  const field = titleField(page);
  await expect(field).toBeFocused();
  await expect(row).toHaveClass(/is-editing/);
  // The field stands where the text stood.
  const after = (await field.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.5);
  // The caret where the text was clicked, nothing selected.
  expect(await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart === el.selectionEnd && el.selectionStart > 0 && el.selectionStart < el.value.length)).toBe(true);
  // Editing is neutral: the role badge and the row actions step aside for Done.
  await expect(row.locator(".page-structure__slot-badge")).toBeHidden();
  await expect(row.locator(".row-action-overlay")).toBeHidden();
  await expect(row.getByRole("button", { name: "Done", exact: true })).toBeVisible();

  // Typing shows in the page before anything is committed.
  await page.keyboard.type("ZZ");
  await expect(shownTitle(page)).toContainText("ZZ");
  await expect(field).toBeFocused();

  // Escape takes it all back, in the page and the source, with no undo step left.
  await field.press("Escape");
  await expect(row).not.toHaveClass(/is-editing/);
  await expect(row).toBeFocused();
  await expect(shownTitle(page)).toHaveText("Reusable cards");
  await expect.poll(() => source(page)).toBe(original);
  expect(await undo(page)).toBe(false);
  expect(await source(page)).toBe(original);
});

test("a double-click edits with all of the text selected; Done keeps it as one undo step", async ({ page }) => {
  const row = titleRow(page);
  await row.locator(".page-structure__text").dblclick();
  const field = titleField(page);
  await expect(field).toBeFocused();
  expect(await field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value])).toEqual([0, 14, "Reusable cards"]);
  await page.keyboard.type("Fresh title");
  await expect(shownTitle(page)).toHaveText("Fresh title");
  await row.getByRole("button", { name: "Done", exact: true }).click();
  await expect(row).not.toHaveClass(/is-editing/);
  await expect(row.locator(".page-structure__text")).toHaveText("Fresh title");
  expect(await source(page)).toContain('<span slot="title">Fresh title</span>');
  await expect(shownTitle(page)).toHaveText("Fresh title");
  // The whole edit is one step.
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toContain('<span slot="title">Reusable cards</span>');
  await expect(shownTitle(page)).toHaveText("Reusable cards");
});

test("Enter on a selected row edits it with all selected, and Enter in the field commits back to the row", async ({ page }) => {
  const row = titleRow(page);
  await row.locator(".page-structure__text").click();
  await expect(row).toBeFocused();
  await row.press("Enter");
  const field = titleField(page);
  await expect(field).toBeFocused();
  expect(await field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 14]);
  // Arrow keys move the caret in the field, not the tree's focus.
  await field.press("ArrowLeft");
  await expect(field).toBeFocused();
  await page.keyboard.type("!");
  await field.press("Enter");
  await expect(row).toBeFocused();
  await expect(row).not.toHaveClass(/is-editing/);
  expect(await source(page)).toContain('<span slot="title">!Reusable cards</span>');
  // Out of editing, the arrow keys move through the tree again.
  await row.press("ArrowDown");
  await expect(row).not.toBeFocused();
});

test("a link's URL suggestions open under the URL field, and Enter and Escape go to the list first", async ({ page }) => {
  // The first card's optional link, shown: its editor opens with the URL in the card under the row.
  const show = tree(page).getByRole("button", { name: "Show Link", exact: true }).first();
  await show.locator("xpath=ancestor::*[@role='treeitem'][1]").hover();
  await show.click();
  const editing = tree(page).locator(".page-structure__row.is-editing[data-slot-editor=link]");
  await expect(editing).toHaveCount(1);
  const url = tree(page).getByRole("combobox", { name: "Link: Link / URL", exact: true });
  await url.click();
  await url.fill("/");
  const list = page.getByRole("listbox", { name: "Pages of this site" });
  await expect(list).toBeVisible();
  await expect(url).toHaveAttribute("aria-expanded", "true");
  // Directly under the field, from its left edge, at least as wide, starting in the sidebar.
  const field = (await url.boundingBox())!, box = (await list.boundingBox())!, sidebar = (await page.locator("aside.sidebar").boundingBox())!;
  expect(Math.abs(box.x - field.x)).toBeLessThanOrEqual(2);
  expect(box.y - (field.y + field.height)).toBeGreaterThanOrEqual(0);
  expect(box.y - (field.y + field.height)).toBeLessThanOrEqual(8);
  expect(box.width).toBeGreaterThanOrEqual(field.width - 1);
  expect(box.x).toBeGreaterThanOrEqual(sidebar.x);
  expect(box.x).toBeLessThan(sidebar.x + sidebar.width);
  // ArrowDown walks the list with focus kept in the field; Enter picks without ending the edit.
  await url.press("ArrowDown");
  const first = list.getByRole("option").first();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(url).toBeFocused();
  const picked = (await first.getAttribute("data-value"))!;
  await url.press("Enter");
  await expect(list).toBeHidden();
  await expect(url).toHaveValue(picked);
  await expect(url).toBeFocused();
  await expect(editing).toHaveCount(1);
  // Escape closes the list first; the next Escape ends the edit.
  await url.press("ArrowDown");
  await expect(list).toBeVisible();
  await url.press("Escape");
  await expect(list).toBeHidden();
  await expect(editing).toHaveCount(1);
  await url.press("Escape");
  await expect(editing).toHaveCount(0);
});

// ---- One session per row edit; line breaks; the page never shows text its source does not have. ----
// Changes index.html in the editor itself (as the code pane or an agent would): `from` becomes `to`.
async function changeSource(page: Page, from: string, to: string) {
  await page.evaluate(async ({ from, to }) => {
    const editor = await import("/src/components/code-editor.ts");
    const text = editor.getMountedSource("index.html")!;
    const start = text.indexOf(from);
    if (start < 0) throw new Error(`not in the source: ${from}`);
    editor.replaceActiveRange({ path: "index.html", start, end: start + from.length, text: to, expected: from });
  }, { from, to });
}

test("Shift+Enter adds a line break, shown in the page at once and written as <br>; Escape takes it back", async ({ page }) => {
  const original = await source(page);
  await titleRow(page).locator(".page-structure__text").dblclick();
  const field = titleField(page);
  await expect(field).toBeFocused();
  await field.press("End");
  await field.press("Shift+Enter");
  await page.keyboard.type("Two");
  await expect(field).toHaveValue("Reusable cards\nTwo");
  // The page shows the break before anything is committed: text, <br>, text.
  await expect(shownTitle(page).locator("br")).toHaveCount(1);
  await expect(shownTitle(page)).toHaveText("Reusable cardsTwo");
  await field.press("Escape");
  await expect(titleRow(page)).not.toHaveClass(/is-editing/);
  await expect(shownTitle(page).locator("br")).toHaveCount(0);
  await expect(shownTitle(page)).toHaveText("Reusable cards");
  await expect.poll(() => source(page)).toBe(original);
  // Again, kept this time: Enter commits it as one <br>.
  await titleRow(page).locator(".page-structure__text").dblclick();
  await titleField(page).press("End");
  await titleField(page).press("Shift+Enter");
  await page.keyboard.type("Two");
  await titleField(page).press("Enter");
  expect(await source(page)).toContain('<span slot="title">Reusable cards<br>Two</span>');
  await expect(shownTitle(page).locator("br")).toHaveCount(1);
  // The row, at rest, reads the break as a space.
  await expect(titleRow(page).locator(".page-structure__text")).toHaveText("Reusable cards Two");
});

test("an existing <br/> keeps its spelling through an unrelated edit, and opening without a change writes nothing", async ({ page }) => {
  await changeSource(page, '<span slot="title">Reusable cards</span>', '<span slot="title">\n        Reusable<br/>\n        cards\n      </span>');
  await expect(shownTitle(page).locator("br")).toHaveCount(1);
  const before = await source(page);
  await titleRow(page).locator(".page-structure__text").dblclick();
  const field = titleField(page);
  await expect(field).toHaveValue("Reusable\ncards");
  // Open and close without a change: the source stays byte for byte.
  await field.press("Enter");
  await expect(titleRow(page)).not.toHaveClass(/is-editing/);
  expect(await source(page)).toBe(before);
  // A change on the second line keeps the first line, the <br/> and its spacing.
  await titleRow(page).locator(".page-structure__text").dblclick();
  await titleField(page).press("End");
  await page.keyboard.type("!");
  await titleField(page).press("Enter");
  expect(await source(page)).toContain('<span slot="title">\n        Reusable<br/>\n        cards!\n      </span>');
});

test("Undo pressed while typing ends the edit and the page shows the undone text", async ({ page }) => {
  await titleRow(page).locator(".page-structure__text").dblclick();
  const field = titleField(page);
  await expect(field).toBeFocused();
  await page.keyboard.type("Typed");
  await expect(shownTitle(page)).toHaveText("Typed");
  await expect.poll(() => source(page)).toContain('<span slot="title">Typed</span>');
  // Undo as the toolbar runs it: focus stays in the field.
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toContain('<span slot="title">Reusable cards</span>');
  await expect(shownTitle(page)).toHaveText("Reusable cards");
  await expect(titleRow(page)).not.toHaveClass(/is-editing/);
  await expect(field).toHaveCount(0);
});

test("an outside change while typing ends the edit, and the page shows what its source holds", async ({ page }) => {
  await titleRow(page).locator(".page-structure__text").dblclick();
  await expect(titleField(page)).toBeFocused();
  await page.keyboard.type("Lost");
  // While typing, the file changes elsewhere (an agent, the code pane), whether or not the typing was written yet.
  await changeSource(page, "<!doctype html>", "<!doctype html><!-- elsewhere -->");
  await expect(titleRow(page)).not.toHaveClass(/is-editing/);
  expect(await source(page)).toContain("<!-- elsewhere -->");
  // The page never shows text its source does not have.
  const written = (await source(page)).match(/<span slot="title">([^<]*)<\/span>/)![1];
  await expect(shownTitle(page)).toHaveText(written);
  await page.keyboard.type("More");
  await expect(shownTitle(page)).toHaveText(written);
});

test("a link's text and URL are one edit: one undo step, and Escape from the URL field takes both back; the window losing focus keeps it", async ({ page }) => {
  const show = tree(page).getByRole("button", { name: "Show Link", exact: true }).first();
  await show.locator("xpath=ancestor::*[@role='treeitem'][1]").hover();
  await show.click();
  const editing = tree(page).locator(".page-structure__row.is-editing[data-slot-editor=link]");
  await expect(editing).toHaveCount(1);
  const shown = await source(page);
  const text = tree(page).getByRole("textbox", { name: "Link: Button text", exact: true });
  const url = tree(page).getByRole("combobox", { name: "Link: Link / URL", exact: true });
  await text.fill("Read more");
  await url.click();
  // The window losing focus (another app) leaves the edit open.
  await page.evaluate(() => { (document as unknown as { hasFocus: () => boolean }).hasFocus = () => false; (document.activeElement as HTMLElement).blur(); });
  await page.waitForTimeout(100);
  await expect(editing).toHaveCount(1);
  await page.evaluate(() => { delete (document as unknown as { hasFocus?: unknown }).hasFocus; });
  await url.click();
  await url.fill("/about/");
  await url.press("Escape");
  if (await editing.count()) await url.press("Escape");
  await expect(editing).toHaveCount(0);
  await expect.poll(() => source(page)).toBe(shown);
  // Kept this time: Done, and one Undo takes back text and URL together.
  await tree(page).locator(".page-structure__slot-badge").filter({ hasText: /^Link$/ }).first().press("Enter");
  await expect(editing).toHaveCount(1);
  await text.fill("Read more");
  await url.click();
  await url.fill("/about/");
  await editing.getByRole("button", { name: "Done", exact: true }).click();
  await expect(editing).toHaveCount(0);
  const kept = await source(page);
  expect(kept).toMatch(/<a slot="link" href="\/about\/">Read more<\/a>/);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(shown);
});
