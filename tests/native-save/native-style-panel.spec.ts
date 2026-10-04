import { expect, test, type Page } from "@playwright/test";
import { storedDraft } from "./drafts";
import { showStylePanel, styleGrip } from "./style-panel-controls";
const panel = (page: Page) => page.getByRole("complementary", { name: "Style panel" });
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
async function open(page: Page, baseURL: string | undefined, repo = 501) {
  await page.goto(`${baseURL}/#repo=${repo}&branch=main&file=index.html`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "index.html", { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible();
}
const grip = styleGrip;
async function select(page: Page, selector = ".lead") {
  await frame(page).locator(selector).click();
  await showStylePanel(page);
  await expect(panel(page).getByText("Spacing", { exact: true })).toBeVisible();
}
async function fill(page: Page, label: string, value: string) {
  await panel(page).getByRole("textbox", { name: label, exact: true }).fill(value);
  await panel(page).getByRole("textbox", { name: label, exact: true }).press("Enter");
}
const css = async (page: Page, path = "styles/site.css") => (await storedDraft(page, path))?.content ?? "";

test("box model padding updates CSS and preview; shared undo restores both", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  const padding = panel(page).getByRole("textbox", { name: "Padding top", exact: true });
  await expect(padding).toHaveAttribute("placeholder", "0px");
  await fill(page, "Padding top", "24");
  await expect(frame(page).locator(".lead")).toHaveCSS("padding-top", "24px");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*padding-top: 24px;/s);
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  await expect(page.locator("#content-secondary .view-lines")).toContainText("padding-top: 24px;");
  await panel(page).getByRole("button", { name: "Link padding sides" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame(page).locator(".lead")).toHaveCSS("padding-top", "0px");
  await expect.poll(() => css(page)).not.toContain("padding-top: 24px");
});

test("site variable preset writes var() and global colours edit in place", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await panel(page).getByText("Typography", { exact: true }).click();
  await panel(page).getByRole("combobox", { name: "Text colour preset", exact: true }).selectOption("--accent");
  await expect(frame(page).locator(".lead")).toHaveCSS("color", "rgb(47, 109, 58)");
  await expect.poll(() => css(page)).toMatch(/\.lead \{[^}]*color: var\(--accent\);/s);
  await panel(page).getByRole("button", { name: "Global styles", exact: true }).click();
  await fill(page, "--accent", "#345678");
  await expect(frame(page).locator(".lead")).toHaveCSS("color", "rgb(52, 86, 120)");
  await expect.poll(() => css(page)).toContain("--accent: #345678;");
});

test("tablet and hover changes write media and state rules; hide stays scoped", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await panel(page).getByRole("combobox", { name: "Style breakpoint" }).selectOption("tablet");
  await fill(page, "Padding top", "18px");
  await expect.poll(() => css(page)).toMatch(/@media \(max-width: 768px\) \{\s*\.lead \{\s*padding-top: 18px;/);
  await panel(page).getByRole("combobox", { name: "Style state" }).selectOption(":hover");
  await fill(page, "Padding top", "26px");
  await expect.poll(() => css(page)).toMatch(/\.lead:hover \{\s*padding-top: 26px;/);
  await panel(page).getByRole("combobox", { name: "Style state" }).selectOption("");
  await panel(page).getByRole("button", { name: "Hide on this size" }).click();
  await expect.poll(() => css(page)).toMatch(/@media \(max-width: 768px\) \{\s*\.lead \{[^}]*display: none;/s);
  await expect(frame(page).locator(".lead")).toBeHidden();
  await panel(page).getByRole("combobox", { name: "Style breakpoint" }).selectOption("all");
  await expect(frame(page).locator(".lead")).toBeVisible();
  await expect(panel(page).getByRole("textbox", { name: "Padding top", exact: true })).toHaveValue("");
});

test("Add class writes HTML before styling a heading; never writes inline CSS", async ({ page, baseURL }) => {
  await open(page, baseURL);
  await frame(page).locator(".hero h1").click();
  await showStylePanel(page);
  await panel(page).getByRole("textbox", { name: "Class name" }).fill("hero-title");
  await panel(page).getByRole("button", { name: "Add class", exact: true }).click();
  await expect(frame(page).locator("h1.hero-title")).toBeVisible();
  await fill(page, "Padding top", "16px");
  await expect(frame(page).locator("h1.hero-title")).toHaveCSS("padding-top", "16px");
  await expect.poll(() => css(page)).toMatch(/\.hero-title \{\s*padding-top: 16px;/);
  const html = (await storedDraft(page, "index.html"))!.content;
  expect(html).toContain('class="hero-title"'); expect(html).not.toContain("style=");
});

test("linked box sides and pixel scrub each commit one undo step", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await panel(page).getByRole("button", { name: "Link padding sides" }).click();
  await fill(page, "Padding left", "12px");
  for (const side of ["top", "right", "bottom", "left"]) await expect(frame(page).locator(".lead")).toHaveCSS(`padding-${side}`, "12px");
  const input = panel(page).getByRole("textbox", { name: "Padding left", exact: true });
  const box = (await input.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(frame(page).locator(".lead")).toHaveCSS("padding-left", "22px");
  await panel(page).getByRole("button", { name: "Link padding sides" }).focus(); await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame(page).locator(".lead")).toHaveCSS("padding-left", "12px");
});

test("panel uses theme tokens in light and dark; Escape and Collapse hand focus to the separator, Enter restores the width", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  const width = await grip(page).getAttribute("aria-valuenow");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: `.scratch/style/panel-${colorScheme}.png` });
  }
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).focus(); await page.keyboard.press("Escape");
  // Collapsing moves focus to the separator, the dock's one control left reachable.
  await expect(grip(page)).toBeFocused();
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(panel(page).getByRole("textbox", { name: "Padding top", exact: true })).not.toBeVisible();
  // Collapsed, the dock exposes nothing but its separator.
  await expect(panel(page).getByRole("button")).toHaveCount(0);
  // Enter on the focused separator restores the last width and the same fields.
  await page.keyboard.press("Enter");
  await expect(grip(page)).toHaveAttribute("aria-valuenow", width!);
  await expect(panel(page).getByRole("textbox", { name: "Padding top", exact: true })).toBeVisible();
  // The header's Collapse button behaves the same.
  await panel(page).getByRole("button", { name: "Collapse Style panel", exact: true }).click();
  await expect(grip(page)).toBeFocused();
  await expect(grip(page)).toHaveAttribute("aria-valuenow", "0");
  await expect(panel(page).getByRole("textbox", { name: "Padding top", exact: true })).not.toBeVisible();
  await page.keyboard.press("Enter");
  await expect(grip(page)).toHaveAttribute("aria-valuenow", width!);
  await expect(panel(page).getByRole("textbox", { name: "Padding top", exact: true })).toBeVisible();
});

test("transform fields write plain CSS in the selected media and state scope", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await panel(page).getByRole("combobox", { name: "Style breakpoint" }).selectOption("mobile");
  await panel(page).getByRole("combobox", { name: "Style state" }).selectOption(":focus-visible");
  await panel(page).getByText("Effects", { exact: true }).click();
  await fill(page, "Transform", "translateX(12px) rotate(5deg)");
  await fill(page, "Transform origin", "top left");
  await expect.poll(() => css(page)).toMatch(/@media \(max-width: 390px\) \{\s*\.lead:focus-visible \{[^}]*transform: translateX\(12px\) rotate\(5deg\);[^}]*transform-origin: top left;/s);
  await panel(page).getByRole("combobox", { name: "Style breakpoint" }).selectOption("all");
  await panel(page).getByRole("combobox", { name: "Style state" }).selectOption("");
  await expect(panel(page).getByRole("textbox", { name: "Transform", exact: true })).toHaveValue("");
});

test("a detached field cannot write after the selected element changes", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await panel(page).getByRole("textbox", { name: "Padding top", exact: true }).evaluate((input) => {
    (window as typeof window & { staleStyleInput?: HTMLInputElement }).staleStyleInput = input as HTMLInputElement;
  });
  await frame(page).locator("section.cards").evaluate((element) => (element as HTMLElement).click());
  await expect(panel(page).locator(".style-panel__selector")).toHaveText(".cards");
  await page.evaluate(() => {
    const input = (window as typeof window & { staleStyleInput?: HTMLInputElement }).staleStyleInput!;
    input.value = "33px";
    input.dispatchEvent(new Event("change"));
  });
  await expect(page.locator("#notice")).toContainText("The style target changed.");
  expect(await css(page)).not.toContain("padding-top: 33px");
});

test("an unfinished stylesheet rejects edits without changing its CSS draft", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await expect(page.locator("#secondary-title")).toHaveText("styles/site.css");
  await page.locator(`#content-secondary [role="textbox"]`).first().focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n.broken {\n");
  await expect.poll(() => css(page)).toContain(".broken {");
  const before = await css(page);
  await fill(page, "Padding top", "14px");
  await expect(page.locator("#notice")).toContainText("unbalanced CSS delimiters");
  expect(await css(page)).toBe(before);
});

test("focused selects and presets accept repeated own edits", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  await panel(page).getByText("Layout", { exact: true }).click();
  const display = panel(page).getByRole("combobox", { name: "Display", exact: true });
  await display.focus();
  for (const value of ["block", "flex", "grid"]) {
    await display.selectOption(value);
    await expect.poll(() => css(page)).toContain(`display: ${value};`);
    await expect(display).toBeFocused();
    await expect(frame(page).locator(".lead")).toHaveCSS("display", value);
  }
  await panel(page).getByText("Typography", { exact: true }).click();
  const preset = panel(page).getByRole("combobox", { name: "Text colour preset", exact: true });
  await preset.focus();
  for (const name of ["--accent", "--muted", "--accent"]) {
    await preset.selectOption(name);
    await expect.poll(() => css(page)).toContain(`color: var(${name});`);
    await expect(preset).toBeFocused();
  }
});

test("canvas and Style panel share breakpoint scope without snapping a custom width", async ({ page, baseURL }) => {
  await open(page, baseURL); await select(page);
  const width = page.getByRole("textbox", { name: "Frame width in pixels" });
  const breakpoint = panel(page).getByRole("combobox", { name: "Style breakpoint" });
  await width.fill("420");
  await width.press("Enter");
  await expect(breakpoint).toHaveValue("tablet");
  await expect(width).toHaveValue("420");
  await expect(page.locator(".canvas-stage")).toHaveCSS("width", "420px");
  await fill(page, "Padding top", "19px");
  await expect.poll(() => css(page)).toMatch(/@media \(max-width: 768px\) \{\s*\.lead \{\s*padding-top: 19px;/);
  await breakpoint.selectOption("mobile");
  await expect(width).toHaveValue("390");
  await expect(page.getByRole("button", { name: "Mobile, 390 px" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Desktop, fills the canvas" }).click();
  await expect(breakpoint).toHaveValue("all");
});
