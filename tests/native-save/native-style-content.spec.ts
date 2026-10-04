import { test, expect, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { showStylePanel } from "./style-panel-controls";
const panel = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const css = async (page: Page) => (await storedDraft(page, "styles/site.css"))?.content ?? "";
async function open(page: Page, baseURL: string | undefined, selector = ".lead") {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(frame(page).locator(selector)).toBeVisible();
  await expect.poll(() => page.evaluate(async () => typeof (await import("/src/components/code-editor.ts")).getMountedSource("styles/site.css"))).toBe("string");
  await frame(page).locator(selector).click();
  await showStylePanel(page);
}

test("one scroll area holds scope, classes and controls; search stays above it at short heights", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, baseURL, ".hero-image");
  const scroll = panel(page).locator(".style-panel__scroll");
  await expect(scroll).toHaveCount(1);
  await expect(scroll.getByRole("combobox", { name: "Style breakpoint" })).toBeVisible();
  await expect(scroll.getByRole("textbox", { name: "Class name" })).toBeVisible();
  expect((await scroll.boundingBox())!.height).toBeGreaterThan(400);
  await page.setViewportSize({ width: 1440, height: 560 });
  const focus = panel(page).getByText("Image focus", { exact: true });
  await focus.scrollIntoViewIfNeeded();
  const search = (await panel(page).locator(".style-panel__search").boundingBox())!, label = (await focus.boundingBox())!;
  expect(label.y).toBeGreaterThanOrEqual(search.y + search.height);
  await focus.click();
  await expect(panel(page).getByRole("region", { name: "Image focus" })).toBeVisible();
});

async function prependCss(page: Page, text: string) {
  await page.evaluate(async text => {
    const editor = await import("/src/components/code-editor.ts");
    if (editor.getMountedSource("styles/site.css") === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({ path: "styles/site.css", start: 0, end: 0, expected: "", text });
  }, text);
}

const colour = async (page: Page) => {
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("text colour");
  return panel(page).getByRole("textbox", { name: "Text colour", exact: true });
};
const list = (page: Page) => panel(page).getByRole("listbox", { name: "Text colour variables" });
/** The field's list references point at live elements, or are absent. */
async function references(page: Page) {
  return page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>('.style-panel input[aria-label="Text colour"]')!;
    const controls = field.getAttribute("aria-controls"), active = field.getAttribute("aria-activedescendant");
    return { controls, active, controlsLive: !controls || !!document.getElementById(controls), activeLive: !active || !!document.getElementById(active),
      activeSelected: active ? document.getElementById(active)?.getAttribute("aria-selected") : null, activeName: active ? (document.getElementById(active) as HTMLElement | null)?.dataset.name : null,
      status: document.querySelector(".style-panel__live")?.textContent ?? "" };
  });
}

test("typed -- opens a listbox; focus stays in the field; active option is referenced, chosen with Enter, one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  await color.fill(""); await color.pressSequentially("--acc");
  await expect(list(page)).toBeVisible(); await expect(color).toBeFocused();
  await expect(list(page).getByRole("option", { name: /^--muted ·/ })).toHaveCount(0);
  await expect(list(page).locator("button")).toHaveCount(0);
  let refs = await references(page);
  expect(refs).toMatchObject({ controls: "style-panel-variable-list", controlsLive: true, activeLive: true, activeSelected: "true", activeName: "--accent" });
  // The opening count stays; the active option is announced through aria-activedescendant.
  expect(refs.status).toBe("1 variable available.");
  const box = (await list(page).boundingBox())!, viewport = page.viewportSize()!;
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await color.press("Enter");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: var\(--accent\);/s);
  await expect(color).toHaveValue("var(--accent)"); await expect(color).toBeFocused();
  await expect(list(page)).toHaveCount(0);
  refs = await references(page); expect(refs.controls).toBeNull(); expect(refs.active).toBeNull();
  await color.press("ControlOrMeta+Z");
  await expect.poll(() => css(page)).not.toContain("color: var(--accent);");
  // A raw custom property name is never written.
  await color.fill(""); await color.pressSequentially("--zzz-none"); await expect(list(page)).toHaveCount(0);
  await color.press("Enter");
  await expect(page.locator("#notice")).toContainText("Choose a variable");
  expect(await css(page)).not.toContain("--zzz-none");
});

test("typed completion ranks exact, prefix, contained; arrows move the referenced option; Escape closes cleanly", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await prependCss(page, ":root { --brand-accent: #123456; --accent-2: #654321; }\n");
  const color = await colour(page);
  await color.fill(""); await color.pressSequentially("--accent");
  expect(await list(page).locator(".style-panel__variable-option strong").allTextContents()).toEqual(["--accent", "--accent-2", "--brand-accent"]);
  const active = list(page).locator('[role="option"][aria-selected="true"]');
  await expect(active).toHaveCount(1); await expect(active).toContainText("--accent"); await expect(active).toBeVisible();
  expect(await active.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await color.press("ArrowDown"); expect((await references(page)).activeName).toBe("--accent-2");
  await color.press("ArrowUp"); await color.press("ArrowUp"); expect((await references(page)).activeName).toBe("--brand-accent");
  await color.press("Escape");
  await expect(list(page)).toHaveCount(0); await expect(color).toBeFocused();
  const refs = await references(page); expect(refs.controls).toBeNull(); expect(refs.active).toBeNull(); expect(refs.status).toContain("closed");
  await color.fill(""); await color.pressSequentially("--accent"); await color.press("Enter");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: var\(--accent\);/s);
});

const inline = (page: Page) => panel(page).locator(".style-panel__field-notice");
/** A cancelled variable is informational: no global alert and no failed-request status. */
async function noGlobalError(page: Page) {
  await expect(page.locator("#notice")).toBeHidden();
  await expect(page.locator("#status")).not.toHaveText("The last request did not complete.");
}
async function cancelledInline(page: Page, property: string) {
  await expect(inline(page)).toHaveCount(1);
  await expect(inline(page)).toHaveText(/Variable not applied/);
  await expect(inline(page)).toHaveAttribute("data-notice-for", property);
  await expect(panel(page).locator(".style-panel__live")).toHaveText(/Variable not applied/);
  await noGlobalError(page);
}

test("an unapplied typed variable after a real edit: click-away and Tab restore it, and Undo reverts only the real edit", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  const original = await css(page);
  // A real accepted edit gives Undo a positive baseline.
  await color.fill("purple"); await color.press("Enter");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: purple;/s);
  const edited = await css(page);
  await color.fill(""); await color.pressSequentially("--a");
  await color.press("ArrowDown"); await expect(list(page)).toBeVisible();
  await panel(page).locator(".style-panel__header strong").click();
  await expect(list(page)).toHaveCount(0);
  await expect(color).toHaveValue("purple");
  await cancelledInline(page, "color");
  expect(await css(page)).toBe(edited);
  // Typing again clears the notice; Tab away without a choice shows it again.
  await color.fill(""); await color.pressSequentially("--acc"); await expect(inline(page)).toHaveCount(0);
  await color.press("Tab");
  await expect(color).toHaveValue("purple"); await cancelledInline(page, "color"); expect(await css(page)).toBe(edited);
  // One Undo reverts exactly the real edit; nothing else was recorded.
  await color.focus(); await color.press("ControlOrMeta+Z");
  await expect.poll(() => css(page)).toBe(original);
  await color.press("ControlOrMeta+Z"); await page.waitForTimeout(300);
  expect(await css(page)).toBe(original);
});

test("Shift+F10 on typed --text keeps it pending through a refresh: no false notice, Escape then Tab restores, Use writes var() with one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  const originalValue = await color.inputValue();
  await color.fill(""); await color.pressSequentially("--acc");
  await color.press("Shift+F10");
  const menu = panel(page).getByRole("menu", { name: "Text colour variables" });
  await expect(menu).toBeVisible(); await expect(list(page)).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Go to --accent in styles/site.css", exact: true })).toBeVisible();
  // An external stylesheet change refreshes the panel's values while the menu is open.
  const source = (await css(page));
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts"); const text = editor.getMountedSource("styles/site.css")!;
    editor.replaceActiveRange({ path: "styles/site.css", start: text.length, end: text.length, expected: "", text: "\n/* external */\n" });
  });
  await expect.poll(() => css(page)).toContain("/* external */");
  const refreshed = await css(page); expect(refreshed).not.toBe(source);
  await page.waitForTimeout(200);
  await expect(inline(page)).toHaveCount(0); await noGlobalError(page);
  await expect(color).toHaveValue("--acc");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0); await expect(color).toBeFocused(); await expect(color).toHaveValue("--acc");
  await color.press("Tab");
  await expect(color).toHaveValue(originalValue);
  await cancelledInline(page, "color");
  expect(await css(page)).toBe(refreshed);
  // An explicit choice from the context menu writes once.
  await color.fill(""); await color.pressSequentially("--acc"); await color.press("Shift+F10");
  await menu.getByRole("menuitem", { name: /^--accent ·/ }).click();
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: var\(--accent\);/s);
  await expect(color).toHaveValue("var(--accent)"); await expect(inline(page)).toHaveCount(0);
  await color.press("ControlOrMeta+Z");
  await expect.poll(() => css(page)).toBe(refreshed);
});

test("selecting another element while suggesting closes the list without restoring onto the new field", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  await color.fill(""); await color.pressSequentially("--a"); await expect(list(page)).toBeVisible();
  const source = await css(page);
  await frame(page).locator("section.cards").evaluate(element => (element as HTMLElement).click());
  await expect(panel(page).getByRole("button", { name: "Style class cards" })).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await page.waitForTimeout(200);
  await expect(inline(page)).toHaveCount(0); await noGlobalError(page);
  const fresh = await colour(page);
  expect(await fresh.inputValue()).not.toMatch(/--a$/);
  expect(await css(page)).toBe(source);
});

test("Add class: listbox options are not focusable, start unselected, arrows reference one; Enter adds it with one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL, ".hero h1");
  const input = panel(page).getByRole("textbox", { name: "Class name" });
  await input.pressSequentially("le");
  const classes = panel(page).getByRole("listbox", { name: "Existing classes" });
  await expect(classes.getByRole("option", { name: "lead", exact: true })).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-controls", "style-panel-class-suggestions");
  await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
  for (const option of await classes.getByRole("option").all()) await expect(option).toHaveAttribute("aria-selected", "false");
  await expect(classes.locator("button, [tabindex]")).toHaveCount(0);
  await input.press("ArrowDown");
  const first = classes.getByRole("option").first();
  await expect(first).toHaveAttribute("aria-selected", "true"); await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id"))!);
  await expect(first).toHaveText("lead");
  await input.press("Enter");
  await expect(frame(page).locator(".hero h1.lead")).toBeVisible();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toMatch(/<h1[^>]*class="[^"]*lead/);
  await expect(panel(page).getByRole("button", { name: "Style class lead" })).toBeVisible();
  await panel(page).getByRole("button", { name: "Style class lead" }).press("ControlOrMeta+Z");
  await expect(frame(page).locator(".hero h1.lead")).toHaveCount(0);
});

test("Add class: pointer choice and Escape keep references clean", async ({ page, baseURL }) => {
  await open(page, baseURL, ".hero h1");
  const input = panel(page).getByRole("textbox", { name: "Class name" });
  const classes = panel(page).getByRole("listbox", { name: "Existing classes" });
  await input.pressSequentially("le"); await expect(classes).toBeVisible();
  await input.press("Escape");
  await expect(classes).toBeHidden(); await expect(input).not.toHaveAttribute("aria-controls", /.+/); await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
  await input.press("Backspace"); await input.pressSequentially("e");
  await classes.getByRole("option", { name: "lead", exact: true }).click();
  await expect(frame(page).locator(".hero h1.lead")).toBeVisible();
});

test("class suggestions skip escaped names and attribute selector text", async ({ page, baseURL }) => {
  await open(page, baseURL, ".hero h1");
  await prependCss(page, ".md\\:flex { display: flex; }\n.w-1\\/2 { width: 50%; }\na[href$=\".pdf\"] { color: red; }\n.pdf-link { color: blue; }\n");
  const input = panel(page).getByRole("textbox", { name: "Class name" });
  const list = panel(page).getByRole("listbox", { name: "Existing classes" });
  await input.fill(""); await input.pressSequentially("m");
  await expect(list.getByRole("option", { name: "md", exact: true })).toHaveCount(0);
  await input.fill(""); await input.pressSequentially("w-");
  await expect(list.getByRole("option", { name: "w-1", exact: true })).toHaveCount(0);
  await input.fill(""); await input.pressSequentially("pd");
  await expect(list.getByRole("option", { name: "pdf-link", exact: true })).toBeVisible();
  await expect(list.getByRole("option", { name: "pdf", exact: true })).toHaveCount(0);
  await expect(list.getByRole("option", { name: "pdf-link", exact: true })).toHaveAttribute("aria-selected", "false");
  await input.press("ArrowDown");
  await expect(list.getByRole("option", { name: "pdf-link", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("Style panel shares Page structure's surface in light and dark; fields stay distinct", async ({ page, baseURL }) => {
  await open(page, baseURL);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const colours = await page.evaluate(() => {
      const bg = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
      return { structure: bg(".sidebar"), panel: bg(".style-panel"), search: bg(".style-panel__search"), field: bg('.style-panel input[aria-label="Search styles"]') };
    });
    expect(colours.panel, colorScheme).toBe(colours.structure);
    expect(colours.search, colorScheme).toBe(colours.structure);
    expect(colours.field, colorScheme).not.toBe(colours.structure);
  }
});

test("opening another field's variable menu settles the first field's pending --text inline (keyboard then mouse)", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("colour");
  const color = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  const background = panel(page).getByRole("textbox", { name: "Background colour", exact: true });
  const original = await css(page), colourValue = await color.inputValue();
  await color.fill(""); await color.pressSequentially("--acc"); await color.press("Shift+F10");
  await expect(panel(page).getByRole("menu", { name: "Text colour variables" })).toBeVisible();
  await background.click({ button: "right" });
  await expect(panel(page).getByRole("menu", { name: "Background colour variables" })).toBeVisible();
  await expect(panel(page).getByRole("menu", { name: "Text colour variables" })).toHaveCount(0);
  await expect(color).toHaveValue(colourValue);
  expect(await color.getAttribute("data-pending-variable")).toBeNull();
  await cancelledInline(page, "color");
  expect(await css(page)).toBe(original);
  await page.keyboard.press("Escape");
  await expect(panel(page).getByRole("menu")).toHaveCount(0);
  expect(await css(page)).toBe(original);
});

test("reopening the same field's variable menu keeps its pending --text until that menu closes", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  const original = await css(page), colourValue = await color.inputValue();
  await color.fill(""); await color.pressSequentially("--acc");
  await color.click({ button: "right" });
  const menu = panel(page).getByRole("menu", { name: "Text colour variables" });
  await expect(menu).toBeVisible();
  // The open menu covers the pointer spot; reopen with the field's own contextmenu event.
  await color.dispatchEvent("contextmenu");
  await expect(menu).toHaveCount(1); await expect(color).toHaveValue("--acc");
  await expect(inline(page)).toHaveCount(0); await noGlobalError(page);
  await page.keyboard.press("Escape"); await expect(color).toBeFocused(); await color.press("Tab");
  await expect(color).toHaveValue(colourValue); await cancelledInline(page, "color");
  expect(await css(page)).toBe(original);
  // The notice belongs to this element: selecting another removes it.
  await frame(page).locator("section.cards").evaluate(element => (element as HTMLElement).click());
  await expect(panel(page).getByRole("button", { name: "Style class cards" })).toBeVisible();
  await expect(inline(page)).toHaveCount(0);
});

test("a real refusal still uses the global error, not the inline cancellation notice", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  await color.fill("not-a-colour"); await color.press("Enter");
  await expect(page.locator("#notice")).toContainText("Enter a valid text colour value.");
  await expect(inline(page)).toHaveCount(0);
});

test("new typing forgets a cancellation: a same-element redraw without a source write does not bring the notice back", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  const original = await css(page), colourValue = await color.inputValue();
  await color.fill(""); await color.pressSequentially("--acc"); await color.press("Tab");
  await cancelledInline(page, "color");
  // New input in the field supersedes the notice.
  await color.focus(); await color.fill(colourValue);
  await expect(inline(page)).toHaveCount(0);
  // Redraw the same element twice (breakpoint there and back), with no source write.
  await page.evaluate(async () => { const { setCurrentBreakpoint } = await import("/src/page-builder/breakpoints.ts"); setCurrentBreakpoint("tablet"); });
  await page.evaluate(async () => { const { setCurrentBreakpoint } = await import("/src/page-builder/breakpoints.ts"); setCurrentBreakpoint("all"); });
  await expect(panel(page).getByRole("combobox", { name: "Style breakpoint" })).toHaveValue("all");
  await page.waitForTimeout(200);
  await expect(inline(page)).toHaveCount(0); await noGlobalError(page);
  expect(await css(page)).toBe(original);
  // A later successful write still records exactly one Undo step.
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("text colour");
  const fresh = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  await fresh.fill("purple"); await fresh.press("Enter");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: purple;/s);
  await fresh.press("ControlOrMeta+Z");
  await expect.poll(() => css(page)).toBe(original);
});

test("a spacing-box cancellation shows its notice below the box, naming the field; the box keeps its size", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await expect(panel(page).getByText("Spacing", { exact: true })).toBeVisible();
  const box = panel(page).locator(".style-panel__box--margin");
  const before = (await box.boundingBox())!;
  const original = await css(page);
  const top = panel(page).getByRole("textbox", { name: "Margin top", exact: true });
  const value = await top.inputValue();
  await top.fill(""); await top.pressSequentially("--acc"); await top.press("Tab");
  await expect(top).toHaveValue(value);
  await expect(inline(page)).toHaveCount(1);
  await expect(inline(page)).toHaveText(/^Margin top: Variable not applied/);
  await expect(inline(page)).toHaveAttribute("data-notice-for", "margin-top");
  await noGlobalError(page);
  // The notice is the box's next sibling, outside both rings.
  expect(await box.evaluate(element => element.nextElementSibling?.classList.contains("style-panel__field-notice"))).toBe(true);
  await expect(box.locator(".style-panel__field-notice")).toHaveCount(0);
  const after = (await box.boundingBox())!;
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  const notice = (await inline(page).boundingBox())!;
  expect(notice.y).toBeGreaterThanOrEqual(after.y + after.height);
  expect(notice.x + notice.width).toBeLessThanOrEqual(after.x + after.width + 1);
  expect(await css(page)).toBe(original);
});
