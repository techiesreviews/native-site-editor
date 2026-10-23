import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { selectText } from "./click-text";
import { editorMounted } from "./drafts";

// Click to type (clean-up slice 28): one click on text (a link's and a
// button's too) types there at once, the caret where it was clicked; a press
// and drag from text moves its block; a double-click selects a word and
// Shift+click extends; Escape selects the whole block; an image is selected
// by a click and its popup opens on a double-click.
// Default fixture group: native-starter (#repo=501).
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const withLinks = indexSource.replace(
  `<img class="hero-image"`,
  `<p data-key="hero-more">Read <a href="/about.html" data-key="hero-link">the about page</a> first.</p>\n    <a class="btn" href="/about.html" data-key="hero-cta">Get started</a>\n    <img class="hero-image"`,
);
const withPrice = withLinks.replace(`<img class="hero-image"`, `<p data-key="price">Was <del>£40</del> £30</p>\n    <img class="hero-image"`);
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByRole("button");
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));

// Tall enough that the whole hero shows: points measured before a press stay put.
test.use({ viewport: { width: 1400, height: 1500 } });

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  await pasteSource(page, withLinks);
  await expect(frame(page).locator(".hero a.btn")).toHaveText("Get started");
});

/** Replaces index.html in the code editor with `text`, as pasted. */
async function pasteSource(page: Page, text: string) {
  const textbox = page.locator("#content [role='textbox']").first();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), text);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

/** The page point just inside the end of `word` in the element's text (a click there puts the caret after it). */
async function afterWord(page: Page, selector: string, word: string) {
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const at = await frame(page).locator(selector).first().evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent!.indexOf(word);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      const r = range.getBoundingClientRect();
      return { x: r.right - 1, y: r.top + r.height / 2 };
    }
    throw new Error(`no "${word}" in ${el.outerHTML}`);
  }, word);
  return { x: box.x + at.x, y: box.y + at.y };
}

const kind = (page: Page) => bar(page).locator(".edit-bar__kind");
const filler = (n: number) => `[data-key='filler-${n}']`;

/** Presses at `from`, moves past the 7 px threshold to `to` and releases: the block drags as a Paragraph. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost(page)).toHaveText("Paragraph");
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
}

/** A page point just above the element's bottom edge, across its middle: a drop there lands after it. */
async function below(page: Page, selector: string) {
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const r = await frame(page).locator(selector).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.bottom - 3 }; });
  return { x: box.x + r.x, y: box.y + r.y };
}

const selectedText = (page: Page) => frame(page).locator("body").evaluate(() => getSelection()!.toString());

test("one click on a heading, a paragraph, a link's text or a button's text types there at once", async ({ page }) => {
  const cases = [
    { selector: ".hero h1", kind: "Heading", word: "native", typed: "!", after: "A native! browser preview" },
    { selector: ".hero p.lead", kind: "Paragraph", word: "plain", typed: " old", after: "Edit plain old HTML" },
    { selector: "[data-key='hero-link']", kind: "Link", word: "about", typed: "-us", after: "the about-us page" },
    { selector: ".hero a.btn", kind: "Button", word: "Get", typed: " me", after: "Get me started" },
  ];
  for (const { selector, kind, word, typed, after } of cases) {
    const el = frame(page).locator(selector).first();
    const at = await afterWord(page, selector, word);
    await page.mouse.click(at.x, at.y);
    await expect(el).toHaveAttribute("contenteditable", /plaintext-only|true/);
    await expect(el).toBeFocused();
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText(kind);
    await page.keyboard.type(typed);
    await expect(el).toContainText(after);
    await page.keyboard.press("Escape");
    await expect(el).not.toHaveAttribute("contenteditable", /.+/);
    await expect(bar(page).locator(".edit-bar__kind")).toHaveText(kind);
    // Escape climbs a level at a time to the page, so the edit bar covers none of the next text.
    await expect.poll(() => crumbs(page).count()).toBeGreaterThan(1);
    for (let shown = await crumbs(page).count(); shown > 1; shown--) {
      await page.keyboard.press("Escape");
      await expect(crumbs(page)).toHaveCount(shown - 1);
    }
    await expect(bar(page)).toBeHidden();
  }
  // The link's address stays; the clicks followed no link.
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath);
  await expect.poll(() => source(page)).toContain(`<h1 data-key="hero-title">A native! browser preview</h1>`);
  const written = (await source(page))!;
  expect(written).toContain("Edit plain old HTML");
  expect(written).toContain(`<a href="/about.html" data-key="hero-link">the about-us page</a>`);
  expect(written).toContain(`<a class="btn" href="/about.html" data-key="hero-cta">Get me started</a>`);
});

test("a click from one text straight onto another types there, and both texts are written", async ({ page }) => {
  const heading = frame(page).locator(".hero h1");
  const lead = frame(page).locator(".hero p.lead");
  let at = await afterWord(page, ".hero h1", "native");
  await page.mouse.click(at.x, at.y);
  await expect(heading).toBeFocused();
  await page.keyboard.type("!");
  // A word right of the edit bar, which shows below the heading over the lead's first line.
  at = await afterWord(page, ".hero p.lead", "place");
  await page.mouse.click(at.x, at.y);
  await expect(lead).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(lead).toBeFocused();
  await page.keyboard.type("X");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(heading).not.toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.press("Escape");
  await expect.poll(() => source(page)).toContain("A native! browser");
  expect(await source(page)).toContain("in placeX");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
});

test("a click between two lines of a paragraph types; a click on its outline selects it without typing", async ({ page }) => {
  const lead = frame(page).locator(".hero p.lead");
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const lines = await lead.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    const second = rects.find((r) => r.top > rects[0].bottom - 1)!;
    const own = el.getBoundingClientRect();
    return { gap: second.top - rects[0].bottom, x: rects[0].left + 40, y: (rects[0].bottom + second.top) / 2, left: own.left, first: rects[0].top + rects[0].height / 2 };
  });
  // The glyphs' rectangles leave a gap between wrapped lines; it is still the paragraph's text.
  expect(lines.gap).toBeGreaterThan(2);
  await page.mouse.click(box.x + lines.x, box.y + lines.y);
  await expect(lead).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(lead).toBeFocused();
  // Selected as a block, a click 1 px inside its left edge, level with the first line, selects without typing.
  await page.keyboard.press("Escape");
  await selectText(lead);
  await page.mouse.click(box.x + lines.left + 1, box.y + lines.first);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(lead).not.toHaveAttribute("contenteditable", /.+/);
});

test("a triple-click in the text being typed in selects the whole paragraph", async ({ page }) => {
  const lead = frame(page).locator(".hero p.lead");
  const at = await afterWord(page, ".hero p.lead", "templates");
  await page.mouse.click(at.x, at.y);
  await expect(lead).toBeFocused();
  await page.mouse.click(at.x, at.y, { clickCount: 3 });
  const text = (await lead.textContent())!;
  await expect.poll(async () => (await selectedText(page)).trim()).toBe(text.trim());
});

test("a click inside the text being typed in moves the caret; a click beside a line selects without typing", async ({ page }) => {
  const lead = frame(page).locator(".hero p.lead");
  let at = await afterWord(page, ".hero p.lead", "Edit");
  await page.mouse.click(at.x, at.y);
  await expect(lead).toBeFocused();
  at = await afterWord(page, ".hero p.lead", "HTML");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.type("5");
  await expect(lead).toContainText("Edit plain HTML5, CSS");
  // The space right of the heading's line is no text: the click selects it, typing nothing.
  const heading = frame(page).locator(".hero h1");
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const beside = await heading.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect(), own = el.getBoundingClientRect();
    return { x: text.right + 24, y: text.top + text.height / 2, room: own.right - text.right };
  });
  expect(beside.room).toBeGreaterThan(48);
  await page.mouse.click(box.x + beside.x, box.y + beside.y);
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Heading");
  await expect(heading).not.toHaveAttribute("contenteditable", /.+/);
  await expect(lead).not.toHaveAttribute("contenteditable", /.+/);
  await expect.poll(() => source(page)).toContain("Edit plain HTML5, CSS");
  // Enter on the selected heading still starts typing.
  await page.keyboard.press("Enter");
  await expect(heading).toHaveAttribute("contenteditable", /plaintext-only|true/);
});

test("a double-click selects a word, Shift+click extends, and Escape selects the whole block", async ({ page }) => {
  const lead = frame(page).locator(".hero p.lead");
  const at = await afterWord(page, ".hero p.lead", "plain");
  await page.mouse.dblclick(at.x - 6, at.y);
  await expect(lead).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect.poll(() => selectedText(page)).toBe("plain");
  const to = await afterWord(page, ".hero p.lead", "HTML");
  await page.keyboard.down("Shift");
  await page.mouse.click(to.x, to.y);
  await page.keyboard.up("Shift");
  // Extended by whole words, as the double-click selected.
  await expect.poll(() => selectedText(page)).toMatch(/^plain HTML,?$/);
  await expect(lead).toBeFocused();
  // Escape: no longer typing, the paragraph selected as the block it is.
  await page.keyboard.press("Escape");
  await expect(lead).not.toHaveAttribute("contenteditable", /.+/);
  await expect.poll(() => selectedText(page)).toBe("");
  await expect(bar(page).locator(".edit-bar__kind")).toHaveText("Paragraph");
  await expect(lead).toHaveText(/^Edit plain HTML, CSS/);
});

test("a press and drag that starts on text moves its block, also while typing in it", async ({ page }) => {
  const original = (await source(page))!;
  await frame(page).locator(filler(1)).scrollIntoViewIfNeeded();
  await drag(page, await afterWord(page, filler(1), "section"), await below(page, filler(2)));
  await expect.poll(async () => (await source(page))!.indexOf(`data-key="filler-1"`) > (await source(page))!.indexOf(`data-key="filler-2"`)).toBe(true);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  const firstMove = (await source(page))!;
  expect(firstMove).not.toBe(original);
  // Typing in filler-2, a press on its text drags it below filler-3, the typed text kept.
  let at = await afterWord(page, filler(2), "Paragraph");
  await page.mouse.click(at.x, at.y);
  await expect(frame(page).locator(filler(2))).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.type(" typed");
  at = await afterWord(page, filler(2), "filler");
  await drag(page, at, await below(page, filler(3)));
  const typed = `<p data-key="filler-2">Paragraph typed two of filler`;
  await expect.poll(async () => { const now = (await source(page))!; return now.indexOf(typed) > now.indexOf(`data-key="filler-3"`); }).toBe(true);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  // Two undo steps: the move, then the typing.
  expect(await undo(page)).toBe(true);
  await expect.poll(async () => { const now = (await source(page))!; return now.indexOf(typed) >= 0 && now.indexOf(typed) < now.indexOf(`data-key="filler-3"`); }).toBe(true);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(firstMove);
});

test("typing in one text, then a press and drag on another block moves that block, the typed text kept", async ({ page }) => {
  const original = (await source(page))!;
  const at = await afterWord(page, ".hero h1", "native");
  await page.mouse.click(at.x, at.y);
  await expect(frame(page).locator(".hero h1")).toBeFocused();
  await page.keyboard.type("!");
  // No Escape: the press on filler-2 writes the heading's text, and the drag still starts.
  await frame(page).locator(filler(2)).scrollIntoViewIfNeeded();
  await drag(page, await afterWord(page, filler(2), "Paragraph"), await below(page, filler(3)));
  const moved = (now: string) => now.includes("A native! browser") && now.indexOf(`data-key="filler-2"`) > now.indexOf(`data-key="filler-3"`);
  await expect.poll(async () => moved((await source(page))!)).toBe(true);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  // Two undo steps: the move, then the typing.
  expect(await undo(page)).toBe(true);
  await expect.poll(async () => { const now = (await source(page))!; return now.includes("A native! browser") && now.indexOf(`data-key="filler-2"`) < now.indexOf(`data-key="filler-3"`); }).toBe(true);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(original);
});

test("a click on text in formatting that is no text of its own (a <del>) types in its line", async ({ page }) => {
  await pasteSource(page, withPrice);
  const price = frame(page).locator("[data-key='price']");
  await expect(price.locator("del")).toHaveText("£40");
  // Between "£4" and "0", inside the <del>.
  const at = await afterWord(page, "[data-key='price']", "£4");
  await page.mouse.click(at.x, at.y);
  await expect(price).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(price).toBeFocused();
  await expect(price.locator("del")).not.toHaveAttribute("contenteditable", /.+/);
  await expect(kind(page)).toHaveText("Paragraph");
  await expect.poll(() => price.evaluate(() => { const sel = getSelection()!; return [sel.anchorNode?.parentElement?.localName, sel.anchorOffset]; })).toEqual(["del", 2]);
  await page.keyboard.type("5");
  await page.keyboard.press("Escape");
  await expect.poll(() => source(page)).toContain(`<p data-key="price">Was <del>£450</del> £30</p>`);
});

test("after the editor refuses typed text, a click on other text still types there", async ({ page }) => {
  const heading = frame(page).locator(".hero h1");
  const lead = frame(page).locator(".hero p.lead");
  let at = await afterWord(page, ".hero h1", "native");
  await page.mouse.click(at.x, at.y);
  await expect(heading).toBeFocused();
  await page.keyboard.type("!");
  // Meanwhile the heading's source text changes: the typed text no longer fits and is refused.
  await page.evaluate(async () => {
    const editor = await import("/src/components/code-editor.ts");
    const text = "A native browser preview";
    const from = editor.getMountedSource("index.html")!.indexOf(text);
    editor.replaceActiveRange({ path: "index.html", start: from, end: from + text.length, expected: text, text: "Other" });
  });
  await expect.poll(() => source(page)).toContain(`<h1 data-key="hero-title">Other</h1>`);
  at = await afterWord(page, ".hero p.lead", "place");
  await page.mouse.click(at.x, at.y);
  await expect(page.getByText("That text change could not be placed in the source.", { exact: false }).first()).toBeVisible();
  // The refresh render that follows leaves the clicked text selected and typed in.
  await expect(heading).toHaveText("Other");
  await expect(lead).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(lead).toBeFocused();
  await expect(kind(page)).toHaveText("Paragraph");
  await page.keyboard.type("X");
  await page.keyboard.press("Escape");
  await expect.poll(() => source(page)).toContain("in placeX");
  await expect(kind(page)).toHaveText("Paragraph");
});

test("one click on an image selects it; a double-click opens the Image popup", async ({ page }) => {
  const image = frame(page).locator(".hero img");
  await image.click();
  await expect(bar(page).locator(".edit-bar__media")).toBeVisible();
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Choose image", exact: true })).toHaveCount(0);
  await image.dblclick();
  await expect(page.getByRole("dialog", { name: "Choose image", exact: true })).toBeVisible();
});
