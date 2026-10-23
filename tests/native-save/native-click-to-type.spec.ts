import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { editorMounted } from "./drafts";

// Click to type (clean-up slice 28): one click on text (a link's and a
// button's too) types there at once, the caret where it was clicked; a press
// and drag from text moves its block; a double-click selects a word and
// Shift+click extends; Escape selects the whole block; an image is selected
// by a click and its popup opens on a double-click.
const fixture = "fixtures/native-starter";
const indexPath = "index.html";
const indexSource = readFileSync(resolve(fixture, indexPath), "utf8");
const withLinks = indexSource.replace(
  `<img class="hero-image"`,
  `<p data-key="hero-more">Read <a href="/about.html" data-key="hero-link">the about page</a> first.</p>\n    <a class="btn" href="/about.html" data-key="hero-cta">Get started</a>\n    <img class="hero-image"`,
);
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));

// Tall enough that the whole hero shows: points measured before a press stay put.
test.use({ viewport: { width: 1400, height: 1500 } });

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(indexPath)}`);
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", indexPath, { timeout: 30_000 });
  await expect(frame(page).locator(".hero h1")).toBeVisible({ timeout: 30_000 });
  await editorMounted(page);
  const textbox = page.locator("#content [role='textbox']").first();
  await page.evaluate(async (text) => navigator.clipboard.writeText(text), withLinks);
  await textbox.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(frame(page).locator(".hero a.btn")).toHaveText("Get started");
});

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
    // Escape climbs to the page, so the edit bar covers none of the next text.
    for (let up = 0; up < 6 && await bar(page).isVisible(); up++) await page.keyboard.press("Escape");
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
  const filler = (n: number) => `[data-key='filler-${n}']`;
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(ghost(page)).toHaveText("Paragraph");
    await page.mouse.up();
    await expect(ghost(page)).toHaveCount(0);
  };
  const below = async (selector: string) => {
    const box = (await page.locator(".native-preview-frame").boundingBox())!;
    const r = await frame(page).locator(selector).evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.bottom - 3 }; });
    return { x: box.x + r.x, y: box.y + r.y };
  };
  await frame(page).locator(filler(1)).scrollIntoViewIfNeeded();
  await drag(await afterWord(page, filler(1), "section"), await below(filler(2)));
  await expect.poll(async () => (await source(page))!.indexOf(`data-key="filler-1"`) > (await source(page))!.indexOf(`data-key="filler-2"`)).toBe(true);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  // Typing in filler-2, a press on its text drags it below filler-3.
  let at = await afterWord(page, filler(2), "Paragraph");
  await page.mouse.click(at.x, at.y);
  await expect(frame(page).locator(filler(2))).toHaveAttribute("contenteditable", /.+/);
  at = await afterWord(page, filler(2), "filler");
  await drag(at, await below(filler(3)));
  await expect.poll(async () => (await source(page))!.indexOf(`data-key="filler-2"`) > (await source(page))!.indexOf(`data-key="filler-3"`)).toBe(true);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  expect(await source(page)).not.toBe(original);
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
