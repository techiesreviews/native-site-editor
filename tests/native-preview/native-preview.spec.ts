import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = "fixtures/native-starter";
const indexPath = "src/pages/index.html";
const cssPath = "src/styles/site.css";
const cardPath = "src/components/project-card/project-card.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const cssSource = readFileSync(resolve(fixture, cssPath), "utf8");
const cardSource = readFileSync(resolve(fixture, cardPath), "utf8");

const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;
const pageErrors: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  pageErrors.length = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

// Focus Monaco's hidden input rather than clicking the canvas, so the preview
// pane above the code pane can never intercept the pointer.
async function pasteSource(page: Page, contains: string, source: string) {
  await expect(page.locator("#content .view-lines")).toContainText(contains, { timeout: 20_000 });
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), source);
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

// Native Monaco uses the EditContext API: the editable surface is a
// role="textbox" element, not a hidden <textarea>. Focus it without a pointer so
// the preview pane above can never intercept the interaction.
async function focusEditor(page: Page) {
  await page.locator("#content [role=\"textbox\"]").first().evaluate((el) => (el as HTMLElement).focus());
}

async function frameWindow(page: Page) {
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const frame = await handle!.contentFrame();
  return frame!;
}

async function openExplorer(page: Page) {
  if (!(await page.locator("#explorer").isVisible())) await page.locator("#explorer-toggle").click();
  await expect(page.locator("#explorer")).toBeVisible();
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  const files = page.getByRole("tab", { name: "Files" });
  if (await files.isVisible()) await files.click();
}

async function openFile(page: Page, path: string, contains: string) {
  await openExplorer(page);
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    const item = page.locator("#explorer").getByRole("button", { name: part, exact: true }).first();
    // Wait for each level to render (directory children load asynchronously)
    // instead of skipping when not yet present.
    await expect(item).toBeVisible({ timeout: 20_000 });
    const expanded = await item.getAttribute("aria-expanded");
    if (index === parts.length - 1 || expanded === "false") await item.click();
  }
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", path);
  await expect(page.locator("#content .view-lines")).toContainText(contains, { timeout: 20_000 });
}

test("renders native pages, components and shared chrome without a build", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByText("Reusable cards")).toBeVisible();
  // Header and footer are shared custom elements rendered from templates.
  await expect(frame.getByText("Native Studio")).toBeVisible();
  await expect(frame.getByText(/Shared footer across every route/)).toBeVisible();
  // srcdoc is set, and the frame never navigates via src.
  expect(await page.locator(".native-preview-frame").getAttribute("src")).toBeNull();
  expect(await page.locator(".native-preview-frame").getAttribute("srcdoc")).toContain("/native-preview-runtime.js");
});

test("HTML and CSS edits patch the live preview in place, same window, scroll kept", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });

  // Stamp a sentinel on the live preview window and scroll it, so we can prove
  // the very same window survives the edit (no reload/navigation).
  const win = await frameWindow(page);
  const before = await win.evaluate(() => {
    (window as unknown as { __nativeId?: string }).__nativeId = "sentinel-" + Math.random();
    (document.scrollingElement as Element).scrollTop = 120;
    return {
      id: (window as unknown as { __nativeId: string }).__nativeId,
      scroll: (document.scrollingElement as Element).scrollTop,
    };
  });
  expect(before.scroll).toBe(120);

  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Edited in place"));
  await expect(frame.getByRole("heading", { name: "Edited in place" })).toBeVisible();

  const after = await win.evaluate(() => ({
    id: (window as unknown as { __nativeId?: string }).__nativeId,
    scroll: (document.scrollingElement as Element).scrollTop,
  }));
  expect(after.id).toBe(before.id); // same window object → no reload
  expect(after.scroll).toBe(120); // scroll preserved across the edit

  await openFile(page, cssPath, "--accent");
  await pasteSource(page, "--accent", cssSource.replace("--muted: #5c665a;", "--muted: rgb(190, 20, 40);"));
  await expect
    .poll(() => frame.locator(".lead").evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(190, 20, 40)");
  // Still the same never-navigated window after two edits.
  const afterCss = await win.evaluate(() => (window as unknown as { __nativeId?: string }).__nativeId);
  expect(afterCss).toBe(before.id);
});

test("sections without data-key keep their nodes when moved, inserted around or duplicated", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  const section = (name: string) => `  <section class="probe"><h2>${name}</h2></section>\n`;
  const page1 = (...names: string[]) => `<main>\n${names.map(section).join("")}</main>\n`;
  const win = await frameWindow(page);
  // Stamp each rendered section with its heading, then read the stamps back in page order.
  const stamp = () => win.evaluate(() => document.querySelectorAll("section.probe").forEach((el) => {
    (el as HTMLElement & { stamp?: string }).stamp = el.textContent ?? "";
  }));
  const stamps = () => win.evaluate(() =>
    [...document.querySelectorAll("section.probe")].map((el) => (el as HTMLElement & { stamp?: string }).stamp ?? "new"));

  await pasteSource(page, "A native browser preview", page1("A", "B", "C"));
  await expect(frame.locator("section.probe")).toHaveCount(3);
  await stamp();
  // B moved to the top, a new section before C: A, B and C are the same nodes.
  await pasteSource(page, "<main>", page1("B", "A", "New", "C"));
  await expect(frame.locator("section.probe h2")).toHaveText(["B", "A", "New", "C"]);
  expect(await stamps()).toEqual(["B", "A", "new", "C"]);
  // A duplicated and C removed: the first A keeps its node, the copy is new.
  await stamp();
  await pasteSource(page, "<main>", page1("B", "A", "A", "New"));
  await expect(frame.locator("section.probe h2")).toHaveText(["B", "A", "A", "New"]);
  expect(await stamps()).toEqual(["B", "A", "new", "New"]);
});

test("editing while the preview is on About does not snap it back Home", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  // Navigate the preview to About while index.html stays the open file.
  await frame.getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  // A source edit to the still-open index.html must not change the preview route.
  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Edited home while on about"));
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  await expect(frame.getByRole("heading", { name: "Edited home while on about" })).toHaveCount(0);
});

test("component template edits update every instance", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByText("Reusable cards")).toBeVisible({ timeout: 30_000 });
  await openFile(page, cardPath, "project-card");
  await pasteSource(
    page,
    "project-card",
    cardSource.replace(
      '<article class="project-card" data-key="project-card">',
      '<article class="project-card" data-key="project-card">\n  <span class="card-badge" data-key="badge">New</span>',
    ),
  );
  await expect(frame.locator(".card-badge")).toHaveCount(3);
});

test("nested shared-component template edits reach every instance", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByText("Reusable cards")).toBeVisible({ timeout: 30_000 });
  // card-note is nested inside project-card's shadow root, three instances deep.
  await expect(frame.locator(".card-note")).toHaveCount(3);
  await openFile(page, "src/components/card-note/card-note.html", "card-note");
  const noteSource = readFileSync(resolve(fixture, "src/components/card-note/card-note.html"), "utf8");
  await pasteSource(page, "card-note", noteSource.replace('class="card-note"', 'class="card-note edited-note"'));
  await expect(frame.locator(".card-note.edited-note")).toHaveCount(3);
});

test("Undo and Redo drive the preview, and saved drafts survive reload", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await pasteSource(page, "A native browser preview", indexSource.replace("A native browser preview", "Draft heading"));
  await expect(frame.getByRole("heading", { name: "Draft heading" })).toBeVisible();

  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Y");
  await expect(frame.getByRole("heading", { name: "Draft heading" })).toBeVisible();

  // A real reload of the app; the scoped browser draft re-applies to the preview.
  await page.reload();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByRole("heading", { name: "Draft heading" })).toBeVisible({ timeout: 30_000 });
});

test("preview route links switch pages while preserving the frame", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await frame.getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  expect(await page.locator(".native-preview-frame").getAttribute("src")).toBeNull();
  await frame.getByRole("link", { name: "Home", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible();
});

test("a stylesheet a shared sheet imports applies in its layer and lists its rules under its own path", async ({ page }) => {
  const sectionsPath = "src/styles/sections.css";
  const sectionsSource = readFileSync(resolve(fixture, sectionsPath), "utf8");
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  const filler = frame.locator("section.filler");
  expect(await filler.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");

  // sections.css is not in the manifest: site.css imports it into a layer.
  await openFile(page, cssPath, "--accent");
  await pasteSource(page, "--accent", `@import url("sections.css") layer(sections);\n${cssSource}`);
  await expect.poll(() => filler.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("6px");
  expect(await filler.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(47, 109, 58)");
  const layers = await (await frameWindow(page)).evaluate(() =>
    document.adoptedStyleSheets.flatMap((sheet) => Array.from(sheet.cssRules))
      .filter((rule) => rule instanceof CSSLayerBlockRule).map((rule) => (rule as CSSLayerBlockRule).name));
  expect(layers).toEqual(["sections"]);

  // Selecting the section lists the imported rule with the imported file's path and range.
  await filler.click({ position: { x: 12, y: 2 } });
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(page.locator("#secondary-title")).toHaveText(sectionsPath);
  const chip = page.locator("#secondary-rules button", { hasText: ".filler" });
  await expect(chip).toHaveAttribute("title", new RegExp(`^\\.filler\n${sectionsPath} \\(imported by ${cssPath}\\)\n@layer sections\n`));
  await expect(chip).toHaveAttribute("data-cascade", "wins");
  await expect(chip).toContainText("sections");
  // The caret sits at the rule's start in the imported file; with nothing
  // selected, a copy takes that whole line.
  const secondary = page.locator("#content-secondary [role=\"textbox\"]").first();
  await expect.poll(async () => {
    await secondary.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("ControlOrMeta+C");
    return page.evaluate(() => navigator.clipboard.readText());
  }).toBe(".filler {\n");

  // Editing the imported file refreshes the preview.
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), sectionsSource.replace("6px", "9px"));
  await secondary.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect.poll(() => filler.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("9px");

  // On a fresh load the imported file is read before the first render.
  await page.reload();
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  expect(await filler.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("9px");
  await expect(page.locator(".native-preview-error")).toBeHidden();
});
