import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { connect } from "./agent-pins-support";
import { storedDrafts } from "./drafts";
import { waitForConnection } from "./mcp-prompt";

// The edit bar over the native preview: anchored to the selection, with
// heading level, text size, Bold, Italic and the link Address editing the source.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const nativeHash = `#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`;

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/${nativeHash}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(page.locator(".native-preview-frame")).toBeVisible({ timeout: 30_000 });
});

async function editorText(page: Page, host: string) {
  const textbox = page.locator(`${host} [role="textbox"]`).first();
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+C");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.keyboard.press("ArrowRight");
  return text;
}

const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar" });

test("the bar anchors to the selected heading and changes its level in source and preview", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const heading = frame.locator(".hero h1");
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await heading.click();

  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  const frameBox = (await page.locator(".native-preview-frame").boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  const barBox = (await bar(page).boundingBox())!;
  expect(barBox.x).toBeGreaterThanOrEqual(frameBox.x + 8 - 1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width - 8 + 1);
  const side = await bar(page).getAttribute("data-side");
  if (side === "above") expect(Math.abs(headingBox.y - (barBox.y + barBox.height) - 8)).toBeLessThanOrEqual(1.5);
  else if (side === "below") expect(Math.abs(barBox.y - (headingBox.y + headingBox.height) - 8)).toBeLessThanOrEqual(1.5);
  else expect(side).toBe("pinned");

  const level = bar(page).getByRole("combobox", { name: "Heading level" });
  await expect(level).toHaveValue("h1");
  await level.selectOption("h3");
  await expect(frame.locator(".hero h3")).toHaveText("A native browser preview");
  await expect(frame.locator(".hero h1")).toHaveCount(0);
  await expect.poll(() => editorText(page, "#content")).toContain('<h3 data-key="hero-title">A native browser preview</h3>');
  // The renamed element is selected again, so the bar keeps its controls.
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toHaveValue("h3");
  await expect(page.locator("#status")).toHaveText("Heading level H3");

  // Ctrl+Z with focus in the bar runs the shared history.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(frame.locator(".hero h1")).toHaveText("A native browser preview");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toHaveValue("h1");
});

test("text size, Bold and Italic edit the element's source and reflect its state", { tag: "@smoke" }, async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const lead = frame.locator(".hero p.lead");
  await expect(lead).toBeVisible({ timeout: 30_000 });
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(bar(page).getByRole("combobox", { name: "Heading level" })).toHaveCount(0);

  const size = bar(page).getByRole("combobox", { name: "Text size" });
  await expect(size).toHaveValue("default");
  await size.selectOption("l");
  await expect(lead).toHaveCSS("font-size", "20px");
  await expect.poll(() => editorText(page, "#content")).toContain('<p class="lead" data-key="hero-lead" style="font-size: 1.25rem">');
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveValue("l");
  await expect(page.locator("#status")).toHaveText("Text size L");

  const bold = bar(page).getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(lead.locator("strong")).toHaveCount(1);
  await expect.poll(() => editorText(page, "#content")).toContain('style="font-size: 1.25rem"><strong>Edit plain HTML');
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  const italic = bar(page).getByRole("button", { name: "Italic" });
  await italic.click();
  await expect(lead.locator("em > strong")).toHaveCount(1);
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  // Bold stays reported while the whole content is wrapped, one level down.
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  await bar(page).getByRole("button", { name: "Italic" }).click();
  await expect(lead.locator("em")).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await bar(page).getByRole("button", { name: "Bold" }).click();
  await expect(lead.locator("strong")).toHaveCount(0);
  await expect(page.locator("#status")).toHaveText("Bold off");

  // Back to the default size removes the whole style attribute.
  await bar(page).getByRole("combobox", { name: "Text size" }).selectOption("default");
  await expect.poll(() => editorText(page, "#content")).toBe(indexSource);
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveValue("default");
});

test("B and Ctrl+I wrap only the selected word in strong and em, and B unwraps it again", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  const lead = frame.locator(".hero p.lead");
  await expect(lead).toBeVisible({ timeout: 30_000 });
  await lead.click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  // Select the word "plain" (text offsets 5..10 of "Edit plain HTML…").
  const selectWord = () => child!.evaluate(() => {
    const p = document.querySelector(".hero p.lead")!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let seen = 0;
    const range = document.createRange();
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const length = text.textContent!.length;
      if (seen <= 5 && 5 < seen + length) range.setStart(text, 5 - seen);
      if (seen < 10 && 10 <= seen + length) { range.setEnd(text, 10 - seen); break; }
      seen += length;
    }
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  expect(await selectWord()).toBe("plain");
  const bold = bar(page).getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(lead.locator("strong")).toHaveText("plain");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <strong>plain</strong> HTML, CSS");
  // The word stays selected, now inside strong, so B reads as pressed.
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#status")).toHaveText("Bold on");

  // Ctrl+I inside the preview wraps the same word in em.
  await child!.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true, bubbles: true, cancelable: true })));
  await expect(lead.locator("strong > em")).toHaveText("plain");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <strong><em>plain</em></strong> HTML");
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");

  // B on the wrapped word removes the strong around it and leaves the em.
  await bar(page).getByRole("button", { name: "Bold" }).click();
  await expect(lead.locator("strong")).toHaveCount(0);
  await expect(lead.locator("em")).toHaveText("plain");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <em>plain</em> HTML");
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");

  // Ctrl+B with focus in the bar toggles too; then the selection spanning a tag boundary is refused.
  await bar(page).getByRole("button", { name: "Italic" }).focus();
  await page.keyboard.press("Control+B");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <em><strong>plain</strong></em> HTML");
  await child!.evaluate(() => {
    const p = document.querySelector(".hero p.lead")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 2);
    range.setEnd(p.querySelector("strong")!.firstChild!, 3);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  await bar(page).getByRole("button", { name: "Italic" }).click();
  await expect(page.locator("#status")).toHaveText("Select text within one element to make it italic.");
  await expect.poll(() => editorText(page, "#content")).toContain("Edit <em><strong>plain</strong></em> HTML");
});

test("a selected link takes an address as typed with page suggestions, and the bar hides when scrolled away or another file opens", async ({ page }) => {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("heading", { name: "A native browser preview" })).toBeVisible({ timeout: 30_000 });
  await frame.locator(".hero h1").click();
  await expect(bar(page)).toBeVisible();
  const handle = await page.locator(".native-preview-frame").elementHandle();
  const child = await handle!.contentFrame();
  await child!.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(bar(page)).toBeHidden();
  await child!.evaluate(() => window.scrollTo(0, 0));
  await expect(bar(page)).toBeVisible();

  // Heading controls have no move controls: only a whole section moves from the bar's buttons; the name drags.
  // Any element on the page can be removed (slice 81).
  expect(await bar(page).locator("button, select").evaluateAll(controls => controls.map(control => ({
    name: control.getAttribute("aria-label") ?? control.textContent?.trim(), disabled: (control as HTMLButtonElement | HTMLSelectElement).disabled,
  })))).toEqual([
    { name: "Heading", disabled: false }, { name: "Heading level", disabled: false }, { name: "Text size", disabled: false },
    { name: "Bold", disabled: false }, { name: "Italic", disabled: false }, { name: "Remove", disabled: false },
  ]);
  await expect(bar(page).getByRole("button", { name: "Make component", exact: true })).toHaveCount(0);
  // Tab walks every enabled control; native selects retain their own arrow keys.
  await bar(page).getByRole("combobox", { name: "Heading level" }).focus();
  for (const control of [
    bar(page).getByRole("combobox", { name: "Text size", exact: true }),
    bar(page).getByRole("button", { name: "Bold", exact: true }),
    bar(page).getByRole("button", { name: "Italic", exact: true }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
  }
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(bar(page).getByRole("button", { name: "Italic", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(bar(page).getByRole("button", { name: "Remove", exact: true })).toBeFocused();
  // Past the end, back to the start: the heading's name (its drag handle).
  await page.keyboard.press("ArrowRight");
  await expect(bar(page).locator(".edit-bar__handle")).toBeFocused();
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toBeFocused();
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Home");
  await expect(bar(page).locator(".edit-bar__handle")).toBeFocused();
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("End");
  await expect(bar(page).getByRole("button", { name: "Remove", exact: true })).toBeFocused();

  // A section gets a bar without text controls; the page's main container none at all.
  await child!.evaluate(() => (document.querySelector("section.hero") as HTMLElement).click());
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
  await expect(bar(page).getByRole("combobox", { name: "Text size" })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveCount(0);
  // Selecting the page's main container shows no bar.
  await child!.evaluate(() => (document.querySelector("main") as HTMLElement).click());
  await expect(page.locator("#content .code-editor__element")).toHaveCount(1);
  await expect(bar(page)).toBeHidden();

  // A link's Address applies as typed: pages of the site are suggested, and
  // any other text is the address itself. No Page menu, no Follow link, no Apply.
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Site header");
  await expect(page.getByRole("treeitem", { name: "Site header", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await editorText(page, "#content")).toBe(indexSource);
  expect(await storedDrafts(page)).toEqual([]);
  // Enter the shared template explicitly before editing its nav link.
  await bar(page).getByRole("button", { name: "Edit Site header component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-header/site-header.html");
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  await expect(bar(page).getByRole("button", { name: "Follow link" })).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Page" })).toHaveCount(0);
  await bar(page).getByRole("button", { name: "Address" }).click();
  const popover = page.locator(".edit-bar__popover");
  const address = popover.getByRole("combobox", { name: "Address" });
  await expect(address).toHaveValue("/about/");
  await expect(popover.getByRole("button", { name: "Apply" })).toHaveCount(0);
  const pages = popover.getByRole("listbox", { name: "Pages of this site" });
  await expect(pages.getByRole("option")).toHaveCount(2);
  await expect(pages.getByRole("option", { name: "/about/" })).toHaveAttribute("aria-selected", "true");
  await address.fill("https://example.test/");
  // No page matches a web address; the field stays open and focused while the
  // bar re-renders from the changed source (its button title shows the new href).
  await expect(pages).toBeHidden();
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveAttribute("title", "Address: https://example.test/");
  await expect(bar(page).getByRole("button", { name: "Address" })).toHaveAttribute("aria-expanded", "true");
  await expect(address).toBeFocused();
  await expect(frame.getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "https://example.test/");
  await address.fill("ab");
  await expect(pages.getByRole("option")).toHaveCount(1);
  await expect(pages.getByRole("option", { name: "/about/" })).toBeVisible();
  // Enter takes the one page left.
  await page.keyboard.press("Enter");
  await expect(popover).toBeHidden();
  await expect.poll(() => editorText(page, "#content")).toContain(`<a href="/about/" data-key="nav-about">About</a>`);
  expect(await editorText(page, "#content")).not.toContain("https://example.test/");
  // Or a page is picked from the list.
  await bar(page).getByRole("button", { name: "Address" }).click();
  await pages.getByRole("option", { name: "Native Studio (/)", exact: true }).click();
  await expect(popover).toBeHidden();
  await expect.poll(() => editorText(page, "#content")).toContain(`<a href="/" data-key="nav-about">About</a>`);
  await expect(page.locator("#status")).toHaveText("Link changed");
  // One undo step per opening of the field.
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => editorText(page, "#content")).toContain(`<a href="/about/" data-key="nav-about">About</a>`);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  // Ctrl/⌘+click still follows a page link.
  await frame.getByRole("link", { name: "About", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(frame.getByRole("heading", { name: "About this project" })).toBeVisible();
  await expect(bar(page)).toBeHidden();

  await frame.locator(".hero h1").click();
  await expect(bar(page)).toBeVisible();
  // Opening another file over the selected page hides the bar.
  await page.locator("#explorer-toggle").click();
  // The file tree is the explorer's Files tab; a native site opens on Pages.
  await page.getByRole("tab", { name: "Files" }).click();
  await page.locator("#files").getByRole("button", { name: "styles", exact: true }).click();
  await page.locator("#files").getByRole("button", { name: "site.css", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "styles/site.css");
  await expect(bar(page)).toBeHidden();
});

type Boxed = { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> };
const box = async (locator: Boxed) => (await locator.boundingBox())!;
// A typed stand-in for the browser's VisualViewport, installed before the editor loads: a
// keyboard shrinks its height at a fixed scale, a pinch-zoom changes its scale and offset.
type ViewStub = Pick<VisualViewport, "offsetTop" | "offsetLeft" | "pageTop" | "pageLeft" | "width" | "height" | "scale"> & EventTarget;
const stubView = (page: Page) => page.addInitScript(() => {
  const view: ViewStub = Object.assign(new EventTarget(), { offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, width: innerWidth, height: innerHeight, scale: 1 });
  Object.defineProperty(window, "visualViewport", { get: () => view, configurable: true });
});
const setView = (page: Page, change: Partial<Pick<ViewStub, "offsetTop" | "height" | "scale">>) => page.evaluate((next) => {
  Object.assign(window.visualViewport!, next);
  window.visualViewport!.dispatchEvent(new Event("resize"));
}, change);
// The site header's About link, selected inside its component (a link's bar has Address).
async function openHeaderLink(page: Page) {
  const frame = page.frameLocator(".native-preview-frame");
  await expect(frame.getByRole("link", { name: "About", exact: true })).toBeVisible({ timeout: 30_000 });
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await bar(page).getByRole("button", { name: "Edit Site header component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", "components/site-header/site-header.html");
  await frame.getByRole("link", { name: "About", exact: true }).click();
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Link");
  await expect(bar(page)).toHaveAttribute("data-side", "docked");
}
// A filler paragraph chosen with its foot at the canvas foot: its own check scrolls it just above the docked bar.
async function footParagraph(page: Page, key = "filler-3") {
  const paragraph = page.frameLocator(".native-preview-frame").locator(`[data-key="${key}"]`);
  await expect(paragraph).toBeVisible({ timeout: 30_000 });
  await paragraph.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 4));
  await paragraph.click();
  await expect(bar(page)).toHaveAttribute("data-side", "docked");
  await expect.poll(async () => { const shown = await box(paragraph); return shown.y + shown.height <= (await box(bar(page))).y; }).toBe(true);
  await page.waitForTimeout(600); // fixed-wait: that scroll has finished
  return paragraph;
}
// The editor's own toast module (the one the app loaded), as a background job would show one.
const showToast = (page: Page, text: string) => page.evaluate(async (words) => (await import("/src/components/toast.ts")).showToast(words), text);

test.describe("on a desktop window with the 390 px device frame", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the bar stays by the selection, not docked", async ({ page }) => {
    await page.getByRole("button", { name: "Mobile, 390 px" }).click();
    const heading = page.frameLocator(".native-preview-frame").locator(".hero h1");
    await expect(heading).toBeVisible();
    await expect.poll(async () => Math.round((await box(page.locator(".native-preview-frame"))).width)).toBe(390);
    await heading.click();
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
    await expect(bar(page)).toHaveAttribute("data-side", /^(above|below|pinned)$/);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a Heading just added from the Blocks rail is selected with its bar docked under the page and its toast above the bar", async ({ page }) => {
    // The "Heading added … Undo" toast shows before the bar does.
    await page.getByRole("navigation", { name: "Blocks" }).getByRole("button", { name: "Heading", exact: true }).click();
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
    await expect(bar(page).getByRole("button", { name: "Bold" })).toBeVisible();
    const strip = page.locator(".editor-toast");
    await expect(strip).toContainText("Heading added");
    // The toast moves above the bar; the bar never rises over the page.
    await expect.poll(async () => {
      const barBox = await box(bar(page));
      const stripBox = await box(strip);
      return stripBox.y + stripBox.height <= barBox.y + 0.5;
    }).toBe(true);
    const frameBox = await box(page.locator(".native-preview-frame"));
    for (let check = 0; check < 3; check++) {
      const barBox = await box(bar(page));
      expect(barBox.y).toBeGreaterThanOrEqual(frameBox.y + frameBox.height - 1);
      const stripBox = await box(strip);
      expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(barBox.y + 0.5);
      await page.waitForTimeout(200); // fixed-wait: samples across the toast's entrance and the scroll into view
    }
    const barBox = await box(bar(page));
    expect(barBox.x).toBeGreaterThanOrEqual(frameBox.x - 1);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width + 1);
  });

  test("the bar docks at the canvas foot, clear of the selected paragraph and of the page's end", async ({ page }) => {
    const frame = page.frameLocator(".native-preview-frame");
    const paragraph = frame.locator('[data-key="filler-3"]');
    await expect(paragraph).toBeVisible({ timeout: 30_000 });
    // Its last line at the canvas foot, where the bar docks.
    await paragraph.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 4));
    await paragraph.click();
    await expect(bar(page)).toHaveAttribute("data-side", "docked");
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
    const pane = await box(page.locator(".native-preview-pane"));
    const barBox = await box(bar(page));
    // Across the canvas at its foot, under the frame: no page sits under it.
    expect(Math.abs(barBox.y + barBox.height - (pane.y + pane.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(barBox.width - pane.width)).toBeLessThanOrEqual(1);
    const frameBox = await box(page.locator(".native-preview-frame"));
    expect(frameBox.y + frameBox.height).toBeLessThanOrEqual(barBox.y + 1);
    // The selected paragraph is scrolled into view above it.
    await expect.poll(async () => { const shown = await box(paragraph); return shown.y + shown.height <= barBox.y && shown.y >= pane.y; }).toBe(true);
    // The page's end scrolls clear above the bar, and the bar does not move with the page.
    await paragraph.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footer = frame.locator("site-footer");
    await expect.poll(async () => { const end = await box(footer); return end.y + end.height <= barBox.y + 1; }).toBe(true);
    expect((await box(bar(page))).y).toBe(barBox.y);
  });

  test("the docked bar rides on top of the on-screen keyboard and goes back down when it closes", async ({ page }) => {
    await stubView(page);
    await page.reload();
    const paragraph = page.frameLocator(".native-preview-frame").locator('[data-key="hero-lead"]');
    await expect(paragraph).toBeVisible({ timeout: 30_000 });
    await paragraph.click();
    await expect(bar(page)).toHaveAttribute("data-side", "docked");
    const pane = await box(page.locator(".native-preview-pane"));
    await setView(page, { height: 500 });
    await expect.poll(async () => { const at = await box(bar(page)); return Math.round(at.y + at.height); }).toBe(500);
    await setView(page, { height: 844 });
    await expect.poll(async () => { const at = await box(bar(page)); return Math.round(at.y + at.height - (pane.y + pane.height)); }).toBe(0);
  });

  test("opening the keyboard over a selection in view scrolls it back above the lifted bar", async ({ page }) => {
    await stubView(page);
    await page.reload();
    // Far enough from the page's end for the page to scroll it above the keyboard: the keyboard does not shorten the canvas.
    const paragraph = await footParagraph(page, "filler-1");
    // Its foot about 100 px above the bar.
    await paragraph.evaluate((el, by) => el.ownerDocument.defaultView!.scrollBy(0, by), 100 - 8);
    await expect.poll(async () => (await box(bar(page))).y - ((await box(paragraph)).y + (await box(paragraph)).height)).toBeGreaterThan(90);
    await setView(page, { height: 500 });
    await expect.poll(async () => { const at = await box(bar(page)); return Math.round(at.y + at.height); }).toBe(500);
    await expect.poll(async () => { const shown = await box(paragraph); return shown.y + shown.height <= (await box(bar(page))).y + 0.5; }).toBe(true);
  });

  test("a tall section chosen in a visual viewport panned down shows its top below the view's top", async ({ page }) => {
    await stubView(page);
    await page.reload();
    // Mid-page, so the page can scroll it either way; three stacked cards, taller than the room.
    const section = page.frameLocator(".native-preview-frame").locator('section[data-key="cards"]');
    await expect(section).toBeVisible({ timeout: 30_000 });
    // The view panned down to 500 px, as iOS does to keep a caret near the foot in sight.
    await setView(page, { height: 300, offsetTop: 500 });
    // Its top 360 px into the frame, its foot far below the bar.
    await section.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 360));
    await section.evaluate((el) => (el as HTMLElement).click());
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Section");
    // Scrolled up to just under the view's top, not to the frame's top (296) out of sight.
    await expect.poll(async () => Math.round((await box(section)).y)).toBeLessThan(560);
    expect((await box(section)).y).toBeGreaterThanOrEqual(500);
  });

  test("the bar growing taller over a selection in view scrolls it back above the bar", async ({ page }) => {
    const paragraph = await footParagraph(page);
    await bar(page).evaluate((el) => { el.style.paddingBlockStart = "40px"; });
    await expect.poll(async () => { const shown = await box(paragraph); return shown.y + shown.height <= (await box(bar(page))).y + 0.5; }).toBe(true);
  });

  test("a pinch-zoom lifts the bar to the zoomed view's foot and does not scroll the page", async ({ page }) => {
    await stubView(page);
    await page.reload();
    const paragraph = page.frameLocator(".native-preview-frame").locator('[data-key="filler-3"]');
    await expect(paragraph).toBeVisible({ timeout: 30_000 });
    await paragraph.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 4));
    await paragraph.click();
    await expect(bar(page)).toHaveAttribute("data-side", "docked");
    // In view just above the bar, after the new selection's own scroll.
    await expect.poll(async () => { const shown = await box(paragraph); return shown.y + shown.height <= (await box(bar(page))).y; }).toBe(true);
    await page.waitForTimeout(600); // fixed-wait: that scroll has finished
    const scrolled = () => paragraph.evaluate(() => window.scrollY);
    const before = await scrolled();
    // Zoomed in twice and panned down: the zoomed view ends at 722, above the paragraph.
    await setView(page, { scale: 2, height: 422, offsetTop: 300 });
    await expect.poll(async () => { const at = await box(bar(page)); return Math.round(at.y + at.height); }).toBe(722);
    await page.waitForTimeout(900); // fixed-wait: past the 400 ms settle and a smooth scroll, nothing may have moved
    expect(await scrolled()).toBe(before);
  });

  test("a menu from the docked bar stays above the bar on top of the keyboard", async ({ page }) => {
    await stubView(page);
    await page.reload();
    await openHeaderLink(page);
    await setView(page, { height: 500 });
    await expect.poll(async () => { const at = await box(bar(page)); return Math.round(at.y + at.height); }).toBe(500);
    await bar(page).getByRole("button", { name: "Address" }).click();
    const popover = page.locator(".edit-bar__popover");
    await expect(popover.getByRole("combobox", { name: "Address" })).toBeFocused();
    const shown = await box(popover);
    expect(shown.y + shown.height).toBeLessThanOrEqual((await box(bar(page))).y + 0.5);
    expect(shown.y).toBeGreaterThanOrEqual((await box(page.locator(".native-preview-frame"))).y - 0.5);
  });

  test("turning the window desktop-wide puts the bar back by the selection", async ({ page }) => {
    await stubView(page);
    await page.reload();
    const paragraph = page.frameLocator(".native-preview-frame").locator('[data-key="hero-lead"]');
    await expect(paragraph).toBeVisible({ timeout: 30_000 });
    await paragraph.click();
    await expect(bar(page)).toHaveAttribute("data-side", "docked");
    await expect(bar(page)).toHaveAttribute("data-toast-avoid", "");
    await setView(page, { height: 500 });
    await expect.poll(() => bar(page).evaluate((el) => el.style.translate)).not.toBe("");
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar(page)).toHaveAttribute("data-side", /^(above|below|pinned)$/);
    expect(await bar(page).evaluate((el) => el.style.translate)).toBe("");
    await expect(bar(page)).not.toHaveAttribute("data-toast-avoid");
  });

  test("Ask agent's note on a selection under the lifted bar stays above the bar", async ({ page, baseURL }) => {
    await stubView(page);
    await page.reload();
    const client = await connect(page, baseURL);
    try {
      await expect.poll(async () => {
        const response = await client.callTool({ name: "get_site", arguments: { agent: "Copy editor" } });
        return response.isError ? false : JSON.parse((response.content as { text: string }[])[0].text).available ?? true;
      }, { timeout: 15_000 }).toBe(true);
      await waitForConnection(page);
      const paragraph = page.frameLocator(".native-preview-frame").locator('[data-key="filler-3"]');
      await paragraph.click();
      await expect(bar(page)).toHaveAttribute("data-side", "docked");
      await page.waitForTimeout(600); // fixed-wait: the new selection's own check has run
      await setView(page, { height: 500 });
      const lifted = await box(bar(page));
      // The user scrolls it under the lifted bar, inside the frame.
      const frameBox = await box(page.locator(".native-preview-frame"));
      await paragraph.evaluate((el, under) => window.scrollBy(0, el.getBoundingClientRect().top - under), lifted.y + 40 - frameBox.y);
      // Far enough under that the note's own place, just above it, is under the bar too.
      await expect.poll(async () => (await box(paragraph)).y).toBeGreaterThan(lifted.y + 30);
      await bar(page).getByRole("button", { name: "Ask agent" }).click();
      const note = page.locator(".edit-bar__note");
      await expect(note).toBeVisible();
      const noted = await box(note);
      expect(noted.y + noted.height).toBeLessThanOrEqual((await box(bar(page))).y + 0.5);
    } finally {
      await client.close();
    }
  });

  test("a toast shown after the bar stands above it", async ({ page }) => {
    const paragraph = page.frameLocator(".native-preview-frame").locator('[data-key="hero-lead"]');
    await expect(paragraph).toBeVisible({ timeout: 30_000 });
    await paragraph.click();
    await expect(bar(page)).toHaveAttribute("data-side", "docked");
    await showToast(page, "Saved a draft");
    const strip = page.locator(".editor-toast");
    await expect(strip).toContainText("Saved a draft");
    await expect.poll(async () => { const stripBox = await box(strip); return stripBox.y + stripBox.height <= (await box(bar(page))).y + 0.5; }).toBe(true);
  });

  test("a selection the user scrolled under the bar stays put when a toast shows", async ({ page }) => {
    const paragraph = page.frameLocator(".native-preview-frame").locator('[data-key="hero-lead"]');
    await expect(paragraph).toBeVisible({ timeout: 30_000 });
    await paragraph.click();
    await expect(bar(page)).toHaveAttribute("data-side", "docked");
    await page.waitForTimeout(600); // fixed-wait: the new selection's own check (400 ms after the click) has run and found it in view
    // Scroll back to the top of the page, then far enough that the paragraph is below the bar.
    await paragraph.evaluate((el) => {
      window.scrollTo(0, 0);
      el.closest("section")!.style.marginBlockStart = `${innerHeight}px`;
    });
    const frameBox = await box(page.locator(".native-preview-frame"));
    await expect.poll(async () => (await box(paragraph)).y).toBeGreaterThan(frameBox.y + frameBox.height);
    const scrolled = () => paragraph.evaluate(() => window.scrollY);
    const before = await scrolled();
    await showToast(page, "Saved a draft");
    await expect(page.locator(".editor-toast")).toContainText("Saved a draft");
    await page.waitForTimeout(900); // fixed-wait: past the 400 ms settle and a smooth scroll, nothing may have moved
    expect(await scrolled()).toBe(before);
  });

  test("a menu or field from the docked bar opens upward, inside the room above it", async ({ page }) => {
    await openHeaderLink(page);
    await bar(page).getByRole("button", { name: "Address" }).click();
    const popover = page.locator(".edit-bar__popover");
    await expect(popover.getByRole("combobox", { name: "Address" })).toBeFocused();
    const shown = await box(popover);
    const frameBox = await box(page.locator(".native-preview-frame"));
    expect(shown.y + shown.height).toBeLessThanOrEqual((await box(bar(page))).y + 0.5);
    expect(shown.y).toBeGreaterThanOrEqual(frameBox.y - 0.5);
    expect(await popover.evaluate((el) => parseFloat(getComputedStyle(el).maxHeight))).toBeLessThanOrEqual(320);
  });
});
