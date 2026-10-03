import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The command palette (Ctrl/⌘+K, Ctrl/⌘+P) and the keyboard shortcuts sheet
// (?): pages, files, components and actions found by fuzzy search, each run
// the way the editor's own control runs it.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.frameLocator(".native-preview-frame").locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#content [role='textbox']").first()).toBeAttached({ timeout: 30_000 });
});

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });
const search = (page: Page) => palette(page).getByRole("combobox", { name: "Search commands" });
const option = (page: Page, name: string | RegExp) => palette(page).getByRole("option", { name });
const active = (page: Page) => palette(page).locator("[role='option'][aria-selected='true']");
const groups = (page: Page) => palette(page).locator(".command-palette__heading");

async function editorText(page: Page) {
  const textbox = page.locator(`#content [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

test("Ctrl+K finds a page by name or URL and opens it; Escape closes back to where focus was", async ({ page }) => {
  const toggle = page.locator("#explorer-toggle");
  await toggle.focus();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(palette(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
  // Before typing: suggestions in groups, actions with their shortcuts.
  await expect(groups(page)).toContainText(["Actions", "Pages", "Components"]);
  await expect(option(page, /^Undo, Ctrl Z$/)).toBeVisible();
  await expect(option(page, /^Add Feature block/)).toBeVisible();
  // Files wait for a query.
  await expect(palette(page).locator(".command-palette__heading", { hasText: /^Files$/ })).toHaveCount(0);
  // Down and up move the highlight, Up from the first wrapping to the last.
  const first = await active(page).getAttribute("aria-label");
  await page.keyboard.press("ArrowDown");
  await expect(active(page)).not.toHaveAttribute("aria-label", first!);
  await page.keyboard.press("ArrowUp");
  await expect(active(page)).toHaveAttribute("aria-label", first!);
  await page.keyboard.press("ArrowUp");
  await expect(active(page)).toHaveAttribute("data-index", String(await palette(page).getByRole("option").count() - 1));
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await expect(toggle).toBeFocused();

  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("abou");
  await expect(active(page)).toHaveAttribute("aria-label", /^About/);
  // The matched characters are marked.
  await expect(active(page).locator(".command-palette__title mark")).toHaveText("Abou");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "about/index.html");

  // The page just opened comes back first among recent items; `/` narrows to pages by URL.
  await page.keyboard.press("ControlOrMeta+K");
  await expect(groups(page).first()).toHaveText("Recent");
  await page.keyboard.type("/");
  await expect(groups(page)).toHaveText(["Recent", "Pages"]);
  await page.keyboard.type("index");
  await expect(palette(page).locator(".command-palette__empty")).toHaveText("Nothing matches “/index”.");
  await search(page).fill("/");
  await option(page, /^Home/).click();
  await expect(palette(page)).toBeHidden();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
});

test("Ctrl+P goes to a file, also from the code editor, where Ctrl+K stays Monaco's", async ({ page }) => {
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+P");
  await expect(palette(page)).toBeVisible();
  await expect(palette(page).locator(".command-palette__scope")).toHaveText("Go to");
  await page.keyboard.type("site.css");
  await expect(active(page)).toHaveAttribute("aria-label", /^site\.css, styles/);
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
});

test("actions and the selected section's controls run from the palette, keys work on the canvas", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  // Hide and show the code, and the page structure.
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("hide code");
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toHaveClass(/code-collapsed/);
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("> show code");
  await expect(groups(page)).toHaveText(["Actions"]);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).not.toHaveClass(/code-collapsed/);
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("hide struc");
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace")).toHaveClass(/workspace--sidebar-collapsed/);
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("show struc");
  await page.keyboard.press("Enter");
  await expect(page.locator(".workspace")).not.toHaveClass(/workspace--sidebar-collapsed/);

  // On the canvas: a heading being typed in; Enter finishes, Shift+Enter selects its section.
  const kind = page.locator(".edit-bar .edit-bar__kind");
  await frame.locator("section.filler h2").click();
  await expect(kind).toHaveText("Heading");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  await expect(kind).toHaveText("Section");
  // Ctrl+K pressed in the preview opens the palette, the section's controls first.
  await page.keyboard.press("ControlOrMeta+K");
  await expect(palette(page)).toBeVisible();
  await expect(groups(page).first()).toHaveText("Selection");
  await expect(option(page, "Move up, Section, Alt Up")).toBeVisible();
  // The last section cannot move down: not offered.
  await expect(option(page, /^Move down/)).toHaveCount(0);
  await page.keyboard.type("dupl");
  await expect(active(page)).toHaveAttribute("aria-label", "Duplicate, Section, Ctrl D");
  await page.keyboard.press("Enter");
  await expect(frame.locator("section.filler")).toHaveCount(2);
  // Undo from the palette.
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("undo");
  await page.keyboard.press("Enter");
  await expect(frame.locator("section.filler")).toHaveCount(1);

  // Keys on the canvas: Ctrl+D duplicates the selected section, Ctrl+Z undoes,
  // Delete removes, Ctrl+Shift+Z redoes.
  await frame.locator("section.filler h2").click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  await expect(kind).toHaveText("Section");
  await page.keyboard.press("ControlOrMeta+D");
  await expect(frame.locator("section.filler")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator("section.filler")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(frame.locator("section.filler")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator("section.filler")).toHaveCount(1);
  await frame.locator("section.filler h2").click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Enter");
  await expect(kind).toHaveText("Section");
  await page.keyboard.press("Delete");
  await expect(frame.locator("section.filler")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator("section.filler")).toHaveCount(1);
  await expect.poll(() => editorText(page)).toBe(indexSource);

  // Select parent from the palette.
  await frame.locator("section.filler h2").click();
  await expect(kind).toHaveText("Heading");
  await page.locator("#explorer-toggle").focus();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("parent");
  await page.keyboard.press("Enter");
  await expect(kind).toHaveText("Section");
});

test("a component is added after the selected section, as one undo step", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await frame.locator("section.hero h1").click();
  await page.keyboard.press("ControlOrMeta+K");
  await page.keyboard.type("feature");
  await expect(active(page)).toHaveAttribute("aria-label", /^Add Feature block, <feature-block> after the selected section/);
  await expect(option(page, /^Open Feature block component, components\/feature-block\/feature-block\.html/)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(frame.locator("section.hero + feature-block + section.cards")).toHaveCount(1);
  await expect(page.locator("#status")).toHaveText("Feature block added");
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator("feature-block")).toHaveCount(0);
  await expect.poll(() => editorText(page)).toBe(indexSource);
});

test("? shows every keyboard shortcut; typing ? in a field does not", async ({ page }) => {
  await page.locator("#explorer-toggle").focus();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  for (const label of ["Command palette", "Go to page or file", "Undo", "Redo", "Move the selected section", "Rename", "Code editor commands"])
    await expect(sheet.getByText(label, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.locator("#explorer-toggle")).toBeFocused();
  // In the preview, when not typing, ? opens it too.
  await page.frameLocator(".native-preview-frame").locator("section.filler h2").click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("?");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  // From the palette's footer.
  await page.keyboard.press("ControlOrMeta+K");
  await palette(page).getByRole("button", { name: /Shortcuts/ }).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  // Typing in the code editor: ? is a character.
  await page.locator("#content [role='textbox']").first().focus();
  await page.keyboard.press("?");
  await expect(sheet).toBeHidden();
  await page.keyboard.press("ControlOrMeta+Z");
});
