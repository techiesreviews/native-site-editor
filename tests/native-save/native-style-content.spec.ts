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
  expect(refs.status).toContain("--accent selected");
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

test("arrowing into the list then clicking elsewhere restores the old value at once; no CSS write or Undo step", async ({ page, baseURL }) => {
  await open(page, baseURL);
  const color = await colour(page);
  const before = await color.inputValue(), source = await css(page), html = (await storedDraft(page, "index.html"))?.content;
  await color.fill(""); await color.pressSequentially("--a");
  await color.press("ArrowDown"); await expect(list(page)).toBeVisible();
  await panel(page).locator(".style-panel__header strong").click();
  await expect(list(page)).toHaveCount(0);
  await expect(color).toHaveValue(before);
  await expect(page.locator("#notice")).toContainText("Variable not applied");
  expect(await css(page)).toBe(source);
  // Nothing was recorded: Undo leaves the source as it was before typing.
  await page.locator(".style-panel__header").click(); await color.focus(); await color.press("ControlOrMeta+Z");
  await page.waitForTimeout(300);
  expect(await css(page)).toBe(source); expect((await storedDraft(page, "index.html"))?.content).toBe(html);
  // Tab away behaves the same.
  await color.fill(""); await color.pressSequentially("--acc"); await color.press("Tab");
  await expect(color).toHaveValue(before); expect(await css(page)).toBe(source);
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
  await expect(page.locator("#notice")).not.toContainText("Variable not applied");
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
