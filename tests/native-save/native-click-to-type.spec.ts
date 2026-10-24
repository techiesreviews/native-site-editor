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
const withFormatting = withLinks.replace(`<img class="hero-image"`,
  `<p data-key="formatted"><strong>Please</strong> read <a href="/about.html" data-key="formatted-link"><strong>about</strong> us</a> now.</p>\n    <img class="hero-image"`);
const withNormalLines = withLinks.replace(`<img class="hero-image"`,
  `<p data-key="normal" style="line-height: normal; max-width: 20em">A paragraph with the browser's own line height, long enough to wrap onto a second line and a third one too.</p>\n    <img class="hero-image"`);
const frame = (page: Page) => page.frameLocator(".native-preview-frame");
const bar = (page: Page) => page.getByRole("toolbar", { name: "Edit bar", exact: true });
const ghost = (page: Page) => page.locator(".pb-drag-ghost");
const crumbs = (page: Page) => page.getByRole("navigation", { name: "Selected element and its ancestors" }).getByRole("button");
const undo = (page: Page) => page.evaluate(async () => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", "index.html"));
const source = async (page: Page) => (await editorMounted(page), page.evaluate(async () => (await import("/src/components/code-editor.ts")).getMountedSource("index.html")));

// Tall enough that the whole hero shows: points measured before a press stay put.
test.use({ viewport: { width: 1400, height: 1500 } });

test.beforeEach(async ({ page, baseURL }) => {
  // In every frame, ahead of the preview runtime's own listener: renders held while `heldRenders` is set (holdRenders).
  await page.addInitScript(() => {
    const w = window as Held;
    w.addEventListener("message", (e) => {
      if (!w.heldRenders || (e.data as { type?: string } | null)?.type !== "update") return;
      e.stopImmediatePropagation();
      w.heldRenders.push(e.data);
    }, true);
  });
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

/** Presses at `from`, moves past the 7 px threshold to `to` and releases: the block drags, named `name`. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, name = "Paragraph") {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost(page)).toHaveText(name);
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
}

/** Each point lies vertically inside the frame, clear of the 72 px bands at its top and bottom where a drag scrolls it. */
async function clearOfScrollBands(page: Page, ...points: { x: number; y: number }[]) {
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  for (const { y } of points) expect(y - box.y >= 72 && box.y + box.height - y >= 72, `y ${y} in a frame from ${box.y} to ${box.y + box.height}`).toBe(true);
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

// The whole page shows in a taller frame, so nothing scrolls under a drag: a drag held within
// 72 px of the frame's top or bottom scrolls it every frame (a slow machine scrolled the drop
// onto the footer), and the render a press asks for brings the text being typed in back into view.
test.describe("drags", () => {
  test.use({ viewport: { width: 1400, height: 2000 } });

  test("a press and drag that starts on text moves its block, also while typing in it", async ({ page }) => {
    const original = (await source(page))!;
    const first = { from: await afterWord(page, filler(1), "section"), to: await below(page, filler(2)) };
    await clearOfScrollBands(page, first.from, first.to);
    await drag(page, first.from, first.to);
    await expect.poll(async () => (await source(page))!.indexOf(`data-key="filler-1"`) > (await source(page))!.indexOf(`data-key="filler-2"`)).toBe(true);
    await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
    const firstMove = (await source(page))!;
    expect(firstMove).not.toBe(original);
    // Typing in filler-2, a press on its text drags it below filler-3, the typed text kept.
    // Clicked at its line's end: the moved paragraph's edit bar covers the line's start.
    let at = await afterWord(page, filler(2), "verification");
    await page.mouse.click(at.x, at.y);
    await expect(frame(page).locator(filler(2))).toHaveAttribute("contenteditable", /.+/);
    await page.keyboard.type(" typed");
    at = await afterWord(page, filler(2), "filler");
    const to = await below(page, filler(3));
    await clearOfScrollBands(page, at, to);
    await drag(page, at, to);
    const typed = "scroll verification typed.</p>";
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
    // No Escape: the press on filler-2 writes the heading's text; the drag's start waits for the
    // render that asks for (held here until the pointer has moved), then the drag runs.
    const from = await afterWord(page, filler(2), "Paragraph"), to = await below(page, filler(3));
    await clearOfScrollBands(page, from, to);
    const release = await holdRenders(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await expect(ghost(page)).toHaveCount(0);
    expect(await release()).toBeGreaterThan(0);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(ghost(page)).toHaveText("Paragraph");
    await page.mouse.up();
    await expect(ghost(page)).toHaveCount(0);
    const moved = (now: string) => now.includes("A native! browser") && now.indexOf(`data-key="filler-2"`) > now.indexOf(`data-key="filler-3"`);
    await expect.poll(async () => moved((await source(page))!)).toBe(true);
    await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
    // Two undo steps: the move, then the typing.
    expect(await undo(page)).toBe(true);
    await expect.poll(async () => { const now = (await source(page))!; return now.includes("A native! browser") && now.indexOf(`data-key="filler-2"`) < now.indexOf(`data-key="filler-3"`); }).toBe(true);
    expect(await undo(page)).toBe(true);
    await expect.poll(() => source(page)).toBe(original);
  });
});

test("in a scrolled frame, a press and drag from the text being typed in moves its block, the scroll kept", async ({ page }) => {
  // Scrolled as far as filler-2's middle allows; the drag's points stay clear of the scroll bands.
  const scrollTop = () => frame(page).locator("body").evaluate(() => document.scrollingElement!.scrollTop);
  await frame(page).locator(filler(2)).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  const scrolled = await scrollTop();
  expect(scrolled).toBeGreaterThan(0);
  const before = (await source(page))!;
  let at = await afterWord(page, filler(2), "verification");
  await page.mouse.click(at.x, at.y);
  await expect(frame(page).locator(filler(2))).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.type(" typed");
  at = await afterWord(page, filler(2), "filler");
  const to = await below(page, filler(3));
  await clearOfScrollBands(page, at, to);
  await drag(page, at, to);
  const typed = "scroll verification typed.</p>";
  await expect.poll(async () => { const now = (await source(page))!; return now.indexOf(typed) > now.indexOf(`data-key="filler-3"`); }).toBe(true);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  expect(await scrollTop()).toBe(scrolled);
  // Two undo steps: the move, then the typing.
  expect(await undo(page)).toBe(true);
  await expect.poll(async () => { const now = (await source(page))!; return now.indexOf(typed) >= 0 && now.indexOf(typed) < now.indexOf(`data-key="filler-3"`); }).toBe(true);
  expect(await undo(page)).toBe(true);
  await expect.poll(() => source(page)).toBe(before);
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

test("a click on a link's formatted text types in the link; a click on a bold word types in its line", async ({ page }) => {
  await pasteSource(page, withFormatting);
  const line = frame(page).locator("[data-key='formatted']");
  const link = frame(page).locator("[data-key='formatted-link']");
  await expect(link.locator("strong")).toHaveText("about");
  // "about" is a <strong> inside the link: the link is typed in, two levels up.
  const at = await afterWord(page, "[data-key='formatted-link']", "abo");
  await page.mouse.click(at.x, at.y);
  await expect(link).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(link).toBeFocused();
  await expect(kind(page)).toHaveText("Link");
  await page.keyboard.type("X");
  await page.keyboard.press("Escape");
  await expect.poll(() => source(page)).toContain(`<a href="/about.html" data-key="formatted-link"><strong>aboXut</strong> us</a>`);
  // "Please" is a <strong> straight in the paragraph: the whole line is typed in.
  const please = await afterWord(page, "[data-key='formatted']", "Ple");
  await page.mouse.click(please.x, please.y);
  await expect(line).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(line.locator("strong").first()).not.toHaveAttribute("contenteditable", /.+/);
  await expect(kind(page)).toHaveText("Paragraph");
});

test("with the browser's own line height (normal), a click between two lines still types", async ({ page }) => {
  await pasteSource(page, withNormalLines);
  const para = frame(page).locator("[data-key='normal']");
  await expect(para).toBeVisible();
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const lines = await para.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    const second = rects.find((r) => r.top > rects[0].bottom - 1)!;
    return { lineHeight: getComputedStyle(el).lineHeight, x: rects[0].left + 40, y: (rects[0].bottom + second.top) / 2 };
  });
  expect(lines.lineHeight).toBe("normal");
  await page.mouse.click(box.x + lines.x, box.y + lines.y);
  await expect(para).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await expect(para).toBeFocused();
});

type Held = typeof window & { heldRenders?: unknown[] };

/** Holds the editor's renders (its `update` messages) in the preview; the function returned replays them. */
async function holdRenders(page: Page) {
  await frame(page).locator("body").evaluate(() => { (window as Held).heldRenders = []; });
  return async () => {
    const held = await frame(page).locator("body").evaluate(() => { const w = window as Held; const list = w.heldRenders ?? []; w.heldRenders = undefined; return list; });
    await page.locator(".native-preview-frame").evaluate((el, list) => { for (const data of list) (el as HTMLIFrameElement).contentWindow!.postMessage(data, "*"); }, held);
    return held.length;
  };
}

test("a drag released before the render its typed text asked for is a click: no move, the text written, the pressed block selected", async ({ page }) => {
  await frame(page).locator(filler(2)).scrollIntoViewIfNeeded();
  let at = await afterWord(page, filler(2), "Paragraph");
  await page.mouse.click(at.x, at.y);
  await expect(frame(page).locator(filler(2))).toHaveAttribute("contenteditable", /.+/);
  await page.keyboard.type(" typed");
  const release = await holdRenders(page);
  // Pressed on filler-3 and moved 10 px: the typed text is written, the start waits for the held render; then released.
  at = await afterWord(page, filler(3), "three");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x, at.y + 10, { steps: 2 });
  await page.mouse.up();
  await expect(ghost(page)).toHaveCount(0);
  expect(await release()).toBeGreaterThan(0);
  const typed = `<p data-key="filler-2">Paragraph typed two of filler`;
  await expect.poll(async () => { const now = (await source(page))!; return now.indexOf(typed) >= 0 && now.indexOf(typed) < now.indexOf(`data-key="filler-3"`); }).toBe(true);
  // The release was no swallowed no-op: the pressed paragraph is selected, not typed in.
  await expect(kind(page)).toHaveText("Paragraph");
  await expect(page.getByRole("tree", { name: "Page structure", exact: true }).locator("[role=treeitem][aria-selected=true]")).toHaveAccessibleName(/Paragraph three/);
  await expect(frame(page).locator("[contenteditable]")).toHaveCount(0);
  await expect(ghost(page)).toHaveCount(0);
});

test("in Edit component mode, a part being typed in drags to another place in the template, two undo steps", async ({ page }) => {
  const template = "components/project-card/project-card.html";
  const mounted = () => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).getMountedSource(path), template);
  // On the page the note is the shared template's: a click selects the card, whose bar opens Edit component mode.
  await frame(page).locator("project-card[data-key='card-1']").locator("card-note").click();
  await expect(kind(page)).toHaveText("Project card");
  await bar(page).getByRole("button", { name: "Edit Project card component", exact: true }).click();
  await expect(page.locator("#current-page")).toHaveAttribute("data-path", template);
  await expect.poll(async () => typeof (await mounted())).toBe("string");
  const original = (await mounted())!;
  const card = "project-card[data-key='card-1']";
  const note = frame(page).locator(card).locator("card-note");
  const title = frame(page).locator(card).locator("h3");
  const box = (await page.locator(".native-preview-frame").boundingBox())!;
  const point = async (target: typeof note, fy: number) => {
    const r = await target.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, top: b.top, height: b.height }; });
    return { x: box.x + r.x, y: box.y + r.top + r.height * fy };
  };
  // A click on the note's text types in the template's note.
  await note.scrollIntoViewIfNeeded();
  const at = await afterWord(page, `${card} card-note`, "across");
  await page.mouse.click(at.x, at.y);
  await expect(note).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  // Pressed on its text and dragged above the title: the part moves, its typed text kept.
  const onTitle = await point(title, 0.2);
  await clearOfScrollBands(page, at, onTitle);
  await drag(page, at, onTitle, "Card note");
  const flat = (html: string) => html.replace(/\s+(?=<)/g, "");
  await expect.poll(async () => { const now = flat((await mounted()) ?? ""); return now.includes("Shared across cards!</card-note>") && now.indexOf("<card-note") < now.indexOf("<h3"); }).toBe(true);
  // Two undo steps: the move, then the typing.
  const undoTemplate = () => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).runVisualHistory("undo", path), template);
  expect(await undoTemplate()).toBe(true);
  await expect.poll(async () => { const now = flat((await mounted()) ?? ""); return now.includes("Shared across cards!</card-note>") && now.indexOf("<card-note") > now.indexOf("<h3"); }).toBe(true);
  expect(await undoTemplate()).toBe(true);
  await expect.poll(() => mounted()).toBe(original);
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
