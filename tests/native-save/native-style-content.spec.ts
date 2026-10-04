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

test("typed -- offers variables inline, keeps field focus and writes var() with one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("text colour");
  const color = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  await color.fill(""); await color.pressSequentially("--acc");
  const menu = panel(page).getByRole("menu", { name: "Text colour variables" });
  await expect(menu).toBeVisible(); await expect(color).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: /^--muted ·/ })).toHaveCount(0);
  const box = (await menu.boundingBox())!, viewport = page.viewportSize()!;
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await color.press("ArrowDown"); await expect(menu.getByRole("menuitem", { name: /^--accent ·/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: var\(--accent\);/s);
  await expect(color).toHaveValue("var(--accent)");
  await color.press("ControlOrMeta+Z");
  await expect.poll(() => css(page)).not.toContain("color: var(--accent);");
  // A raw custom property name is never written.
  await color.fill(""); await color.pressSequentially("--zzz-none"); await expect(menu).toHaveCount(0);
  await color.press("Enter");
  await expect(page.locator("#notice")).toContainText("Choose a variable");
  expect(await css(page)).not.toContain("--zzz-none");
});

test("Add class suggests existing classes inline and adds the choice with one Undo", async ({ page, baseURL }) => {
  await open(page, baseURL, ".hero h1");
  const input = panel(page).getByRole("textbox", { name: "Class name" });
  await input.pressSequentially("le");
  const list = panel(page).getByRole("listbox", { name: "Existing classes" });
  await expect(list.getByRole("option", { name: "lead", exact: true })).toBeVisible();
  await expect(input).toBeFocused();
  await input.press("ArrowDown"); await expect(list.getByRole("option").first()).toBeFocused();
  await list.getByRole("option", { name: "lead", exact: true }).click();
  await expect(frame(page).locator(".hero h1.lead")).toBeVisible();
  await expect.poll(async () => (await storedDraft(page, "index.html"))?.content ?? "").toMatch(/<h1[^>]*class="[^"]*lead/);
  await expect(panel(page).getByRole("button", { name: "Style class lead" })).toBeVisible();
  await panel(page).getByRole("button", { name: "Style class lead" }).press("ControlOrMeta+Z");
  await expect(frame(page).locator(".hero h1.lead")).toHaveCount(0);
});

async function prependCss(page: Page, text: string) {
  await page.evaluate(async text => {
    const editor = await import("/src/components/code-editor.ts");
    if (editor.getMountedSource("styles/site.css") === undefined) throw new Error("Missing source model");
    editor.replaceActiveRange({ path: "styles/site.css", start: 0, end: 0, expected: "", text });
  }, text);
}

test("typed completion ranks exact then prefix then contained; Enter takes the highlighted exact match", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await prependCss(page, ":root { --brand-accent: #123456; --accent-2: #654321; }\n");
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("text colour");
  const color = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  await color.fill(""); await color.pressSequentially("--accent");
  const menu = panel(page).getByRole("menu", { name: "Text colour variables" });
  const names = await menu.locator(".style-panel__variable-choice strong").allTextContents();
  expect(names).toEqual(["--accent", "--accent-2", "--brand-accent"]);
  const active = menu.locator(".style-panel__variable-choice button.is-active");
  await expect(active).toHaveCount(1); await expect(active).toContainText("--accent");
  await expect(active).toBeVisible();
  expect(await active.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await color.press("Enter");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: var\(--accent\);/s);
  await expect(color).toHaveValue("var(--accent)"); await expect(color).toBeFocused();
});

test("leaving a typed variable without a choice restores the field and says so", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await panel(page).getByRole("searchbox", { name: "Search styles" }).fill("text colour");
  const color = panel(page).getByRole("textbox", { name: "Text colour", exact: true });
  const before = await color.inputValue(), source = await css(page);
  await color.fill(""); await color.pressSequentially("--acc");
  await expect(panel(page).getByRole("menu", { name: "Text colour variables" })).toBeVisible();
  await color.press("Tab");
  await expect(panel(page).getByRole("menu")).toHaveCount(0);
  await expect(color).toHaveValue(before);
  await expect(page.locator("#notice")).toContainText("Variable not applied");
  expect(await css(page)).toBe(source);
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
  await input.press("ArrowDown");
  await expect(list.getByRole("option", { name: "pdf-link", exact: true })).toHaveAttribute("aria-selected", "true");
});
