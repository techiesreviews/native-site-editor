import { expect, test, type Page } from "@playwright/test";

// One check per Monaco contribution src/components/monaco.ts keeps, driven
// through the real code pane with the keys and mouse a person uses, so a later
// trim cannot silently drop one. Only the UI is used (no import of the monaco
// module), so this also runs against the production build, which is the run
// that counts after changing monaco.ts (the dev server's pre-bundling can keep
// a dropped contribution alive):
//   npm run build:ui && ASE_NATIVE_SAVE_DIST=1 npx playwright test --project=native-save native-monaco-features
// Keys are Monaco's Linux bindings (where the tests run).
// Every test fails on any page error, which is how a dropped service singleton
// shows ("[createInstance] ... depends on UNKNOWN service ...").

const HOST = "#content";
const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /createInstance|UNKNOWN service|monaco|editor/i.test(message.text())) errors.push(message.text());
  });
});
test.afterEach(() => {
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

const pane = (page: Page) => page.locator(`${HOST} .monaco-editor`).first();
const lines = (page: Page) => page.locator(`${HOST} .view-lines`).first();

async function open(page: Page, baseURL: string | undefined, file: string) {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=${encodeURIComponent(file)}`);
  await expect(lines(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`${HOST} .view-line`).first()).toBeVisible();
}

// Replaces the pane's text by pasting it (no auto-closing or auto-indent) and
// leaves the cursor at the end.
async function setSource(page: Page, text: string) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await lines(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => source(page)).toBe(text.replace(/\n+$/, ""));
}

// Copy the complete selection for fixtures longer than Monaco's rendered
// viewport. Clear the clipboard first so a failed copy cannot reuse the paste.
async function setLongSource(page: Page, text: string) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await lines(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await page.keyboard.press("ArrowLeft");
}

// The rendered lines, top to bottom (the files here are short, so all show).
async function source(page: Page) {
  return lines(page).evaluate((element) => {
    const rows = [...element.querySelectorAll<HTMLElement>(".view-line")]
      .sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
      .map((row) => {
        // Leave out injected text (the color swatch before a CSS color).
        const copy = row.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".colorpicker-color-decoration").forEach((swatch) => {
          if (!swatch.textContent?.trim()) swatch.remove();
        });
        return (copy.textContent ?? "").replace(/ /g, " ");
      });
    while (rows.length && rows[rows.length - 1] === "") rows.pop();
    return rows.join("\n");
  });
}

// Moves the cursor to a 1-based line and column with the plain arrow keys.
async function cursorTo(page: Page, line: number, column = 1) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let i = 1; i < line; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Home");
  for (let i = 1; i < column; i++) await page.keyboard.press("ArrowRight");
}

// The cursor's 1-based line, from where it renders (short files, no scroll).
async function cursorLine(page: Page) {
  return page.locator(`${HOST} .cursors-layer .cursor`).first().evaluate((cursor) => {
    const tops = [...document.querySelectorAll<HTMLElement>("#content .view-lines .view-line")]
      .map((row) => parseFloat(row.style.top)).sort((a, b) => a - b);
    return tops.findIndex((top) => Math.abs(top - parseFloat((cursor as HTMLElement).style.top)) < 2) + 1;
  });
}

// The text span of `word` on a 0-based rendered line, for mouse hovers.
function token(page: Page, row: number, word: string) {
  return page.locator(`${HOST} .view-line`).filter({ hasText: word }).nth(row).locator("span span", { hasText: word }).first();
}

test("editing keys: lines, words, multi-cursor, line selection, clipboard, tab focus", async ({ page, baseURL }) => {
  await open(page, baseURL, "robots.txt");
  // coreCommands: typing, Enter, Home/End.
  await setSource(page, "one\ntwo\nthree");
  // linesOperations: Alt+Down moves, Ctrl+Shift+Alt+Down copies, Ctrl+Shift+K
  // deletes. (Keys here are Monaco's Linux bindings, where the tests run.)
  await cursorTo(page, 1);
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => source(page)).toBe("two\none\nthree");
  await page.keyboard.press("Control+Shift+Alt+ArrowDown");
  await expect.poll(() => source(page)).toBe("two\none\none\nthree");
  await page.keyboard.press("ControlOrMeta+Shift+k");
  await expect.poll(() => source(page)).toBe("two\none\nthree");
  // wordOperations: Ctrl+Backspace deletes a word.
  await setSource(page, "alpha beta");
  await page.keyboard.press("Control+Backspace");
  await expect.poll(() => source(page)).toBe("alpha ");
  // multicursor: Ctrl+D adds the next match; Shift+Alt+Down a cursor below.
  await setSource(page, "foo bar foo");
  await cursorTo(page, 1, 2);
  await page.keyboard.press("ControlOrMeta+d");
  await page.keyboard.press("ControlOrMeta+d");
  await page.keyboard.insertText("baz");
  await expect.poll(() => source(page)).toBe("baz bar baz");
  await setSource(page, "a\nb");
  await cursorTo(page, 1);
  await page.keyboard.press("Shift+Alt+ArrowDown");
  await page.keyboard.insertText("-");
  await expect.poll(() => source(page)).toBe("-a\n-b");
  // lineSelection: Ctrl+L selects the line, typing replaces it.
  await setSource(page, "keep\ndrop\nkeep");
  await cursorTo(page, 2);
  await page.keyboard.press("ControlOrMeta+l");
  await page.keyboard.insertText("new\n");
  await expect.poll(() => source(page)).toBe("keep\nnew\nkeep");
  // clipboard: Ctrl+C on an empty selection copies the line, Ctrl+V pastes it.
  await setSource(page, "copied\nend");
  await cursorTo(page, 1);
  await page.keyboard.press("ControlOrMeta+c");
  await cursorTo(page, 2);
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => source(page)).toBe("copied\ncopied\nend");
  // toggleTabFocusMode: Ctrl+M makes Tab leave the editor instead of indenting.
  await page.keyboard.press("Control+m");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".monaco-editor"))).toBe(false);
  await expect.poll(() => source(page)).toBe("copied\ncopied\nend");
  await lines(page).click();
  await page.keyboard.press("Control+m");
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Tab");
  await expect.poll(() => source(page)).toMatch(/^copied\ncopied\nend\s+$/);
});

test("drag a selection, and the unusual line terminator prompt", async ({ page, baseURL }) => {
  await open(page, baseURL, "robots.txt");
  // dnd: drag the selected word to the end of the line.
  await setSource(page, "move stay");
  const word = token(page, 0, "move");
  await cursorTo(page, 1);
  await page.keyboard.press("Shift+End");
  for (const _ of "stay ") await page.keyboard.press("Shift+ArrowLeft");
  const from = (await word.boundingBox())!;
  const to = (await token(page, 0, "stay").boundingBox())!;
  await page.mouse.move(from.x + 4, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width + 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => source(page)).toBe(" staymove");
  // unusualLineTerminators: a pasted U+2028 asks before it is removed.
  const asked = new Promise<string>((done) => page.once("dialog", (dialog) => {
    done(dialog.message());
    void dialog.dismiss();
  }));
  await page.evaluate(() => navigator.clipboard.writeText("a b"));
  await page.keyboard.press("ControlOrMeta+v");
  expect(await asked).toMatch(/line terminators/i);
});

test("find and replace", async ({ page, baseURL }) => {
  await open(page, baseURL, "robots.txt");
  await setSource(page, "foo bar foo");
  await page.keyboard.press("ControlOrMeta+f");
  const widget = page.locator(`${HOST} .find-widget`);
  await expect(widget).toBeVisible();
  await page.keyboard.insertText("foo");
  await expect(widget.locator(".matchesCount")).toHaveText(/1 of 2|2 of 2/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+h");
  const replace = widget.locator(".replace-part textarea");
  await expect(replace).toBeVisible();
  await replace.fill("qux");
  await widget.locator(".codicon-find-replace-all").click();
  await expect.poll(() => source(page)).toBe("qux bar qux");
});

test("CSS: folding, brackets, comments, selection, colors, occurrences", async ({ page, baseURL }) => {
  await open(page, baseURL, "styles/site.css");
  await setSource(page, ".a {\n  color: red;\n}\n.b {\n  color: blue;\n}");
  // folding: Ctrl+Shift+[ folds the rule, the gutter chevron unfolds it.
  await cursorTo(page, 1, 3);
  await page.keyboard.press("ControlOrMeta+Shift+BracketLeft");
  await expect(lines(page)).not.toContainText("red");
  await page.locator(`${HOST} .codicon-folding-collapsed`).first().click({ force: true });
  await expect(lines(page)).toContainText("red");
  // bracketMatching: the cursor beside { marks it and its }.
  await cursorTo(page, 1, 5);
  await expect(page.locator(`${HOST} .bracket-match`)).toHaveCount(2);
  // colorPicker: a swatch before each color.
  await expect(page.locator(`${HOST} .colorpicker-color-decoration`)).toHaveCount(2);
  // wordHighlighter: the other "color" is highlighted.
  await cursorTo(page, 2, 4);
  await expect(page.locator(`${HOST} [class*="wordHighlight"]`).first()).toBeAttached();
  // smartSelect: Shift+Alt+Right selects the word, typing replaces it.
  await cursorTo(page, 5, 4);
  await page.keyboard.press("Shift+Alt+ArrowRight");
  await expect(page.locator(`${HOST} .selected-text`).first()).toBeAttached();
  await page.keyboard.insertText("background");
  await expect.poll(() => source(page)).toContain("  background: blue;");
  // comment: Ctrl+/ comments the line out and back.
  await cursorTo(page, 2);
  await page.keyboard.press("ControlOrMeta+Slash");
  await expect.poll(() => source(page)).toContain("/* color: red; */");
  await page.keyboard.press("ControlOrMeta+Slash");
  await expect.poll(() => source(page)).toContain("\n  color: red;\n");
});

test("CSS: diagnostics, hover, F8 and suggestions", async ({ page, baseURL }) => {
  await open(page, baseURL, "styles/site.css");
  await setSource(page, ".a {\n  colr: red;\n}\n.b { }");
  // Diagnostics from the CSS worker.
  const squiggle = page.locator(`${HOST} .squiggly-warning`).first();
  await expect(squiggle).toBeAttached({ timeout: 20_000 });
  // hover: the problem's message on the mouse.
  await token(page, 0, "colr").hover();
  const hover = page.locator(`${HOST} .monaco-hover`).filter({ hasText: "Unknown property" });
  await expect(hover).toBeVisible();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  // gotoError: F8 opens the problem under the line.
  await cursorTo(page, 1);
  await page.keyboard.press("F8");
  await expect(page.locator(`${HOST} .marker-widget`)).toContainText("Unknown property");
  await page.keyboard.press("Escape");
  await expect(page.locator(`${HOST} .marker-widget`)).toHaveCount(0);
  // suggest: Ctrl+Space lists properties.
  await cursorTo(page, 4, 6);
  await page.keyboard.insertText("disp");
  await page.keyboard.press("Control+Space");
  const suggest = page.locator(`${HOST} .suggest-widget`);
  await expect(suggest).toBeVisible();
  await expect(suggest).toContainText("display");
  await page.keyboard.press("Enter");
  await expect.poll(() => source(page)).toContain(".b { display");
});

test("JS IntelliSense: completions, signature help, hover, definition, references, rename, diagnostics, code actions", async ({ page, baseURL }) => {
  await open(page, baseURL, "components/components.js");
  await setSource(page, "function greet(name) {\n  return name;\n}\ngreet(\"x\");\n");
  // hover: the TS worker's type for the call.
  await expect(async () => {
    await page.mouse.move(0, 0);
    await token(page, 0, "greet").hover();
    await expect(page.locator(`${HOST} .monaco-hover`).filter({ hasText: "function greet" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await page.mouse.move(0, 0);
  // suggest: members of document.
  await lines(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("document.getEl");
  await page.keyboard.press("Control+Space");
  const suggest = page.locator(`${HOST} .suggest-widget`);
  await expect(suggest).toContainText("getElementById", { timeout: 20_000 });
  await page.keyboard.press("Escape");
  // parameterHints: Math.max( shows its signature.
  await page.keyboard.press("Enter");
  await page.keyboard.type("Math.max(");
  await expect(page.locator(`${HOST} .parameter-hints-widget`)).toContainText("values", { timeout: 20_000 });
  await page.keyboard.press("Escape");
  // gotoSymbol: F12 on the call jumps to the declaration (line 1).
  await cursorTo(page, 4, 2);
  await page.keyboard.press("F12");
  await expect.poll(() => cursorLine(page), { timeout: 20_000 }).toBe(1);
  await page.keyboard.press("End");
  await page.keyboard.insertText(" // here");
  await expect.poll(() => source(page)).toMatch(/^function greet\(name\) \{ \/\/ here\n/);
  // referenceSearch: Shift+F12 peeks both references.
  await cursorTo(page, 4, 2);
  await page.keyboard.press("Shift+F12");
  const peek = page.locator(`${HOST} .peekview-widget`);
  await expect(peek).toBeVisible();
  await expect(peek).toContainText(/References \(2\)|2 references/);
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  // rename: F2 renames the declaration and the call.
  await cursorTo(page, 4, 2);
  await page.keyboard.press("F2");
  const box = page.locator(`${HOST} .rename-box input`);
  await expect(box).toBeVisible();
  await box.fill("hello");
  await page.keyboard.press("Enter");
  await expect.poll(() => source(page)).toMatch(/^function hello\(name\)[\s\S]*\nhello\("x"\);/);
  // Diagnostics: a syntax error is underlined.
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nconst = ;");
  await expect(page.locator(`${HOST} .squiggly-error`).first()).toBeAttached({ timeout: 20_000 });
  // codeAction: Ctrl+. asks the providers (TS quick fixes; none for this line).
  await page.keyboard.press("ControlOrMeta+Period");
  await expect(page.locator(`${HOST} .monaco-editor-overlaymessage, .action-widget`).first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("format, go to line, command palette and the context menu", async ({ page, baseURL }) => {
  await open(page, baseURL, "components/components.js");
  // format: Ctrl+Shift+I (Linux; Shift+Alt+F elsewhere) formats with the TS service.
  await setSource(page, "function   f(){return 1}");
  await page.keyboard.press("Control+Shift+i");
  await expect.poll(() => source(page), { timeout: 20_000 }).toBe("function f() { return 1 }");
  // gotoLine: Ctrl+G opens the quick input, Enter goes there.
  await setSource(page, "one\ntwo\nthree");
  await page.keyboard.press("Control+g");
  const quick = page.locator(`${HOST} .quick-input-widget`);
  await expect(quick).toBeVisible();
  await page.keyboard.insertText("2");
  await page.keyboard.press("Enter");
  await expect(quick).toBeHidden();
  await page.keyboard.insertText("> ");
  await expect.poll(() => source(page)).toBe("one\n> two\nthree");
  // quickCommand: F1 runs an editor action by name.
  await setSource(page, "shout");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("F1");
  await expect(quick).toBeVisible();
  await page.keyboard.insertText("Transform to Uppercase");
  await expect(quick.locator(".quick-input-list")).toContainText("Transform to Uppercase");
  await page.keyboard.press("Enter");
  await expect.poll(() => source(page)).toBe("SHOUT");
  // contextmenu: right click lists the clipboard, navigation and palette items.
  await lines(page).click({ button: "right" });
  const menu = page.locator(".monaco-menu").first();
  await expect(menu).toBeVisible();
  for (const item of ["Go to Definition", "Change All Occurrences", "Cut", "Copy", "Paste", "Command Palette"])
    await expect(menu).toContainText(item);
  await page.keyboard.press("Escape");
});

test("HTML: links, invisible characters, completions, and folded sections", async ({ page, baseURL }) => {
  await open(page, baseURL, "about/index.html");
  await setSource(page, '<a href="https://example.com/">x​y</a>\n<div>\n  <p>inside</p>\n</div>\n');
  // links: href targets are links.
  await expect(page.locator(`${HOST} .detected-link`).first()).toBeAttached({ timeout: 20_000 });
  // unicodeHighlighter: the zero-width space is boxed.
  await expect(page.locator(`${HOST} .unicode-highlight`).first()).toBeAttached();
  // folding (HTML worker ranges) and the unfold chevron.
  await cursorTo(page, 2, 2);
  await page.keyboard.press("ControlOrMeta+Shift+BracketLeft");
  await expect(lines(page)).not.toContainText("inside");
  await page.keyboard.press("ControlOrMeta+Shift+BracketRight");
  await expect(lines(page)).toContainText("inside");
  // suggest + snippet: an HTML tag completion.
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("<sec");
  await page.keyboard.press("Control+Space");
  await expect(page.locator(`${HOST} .suggest-widget`)).toContainText("section", { timeout: 20_000 });
  await page.keyboard.press("Escape");
});

test("the version compare is a read-only diff with both sides", async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#repo=501&branch=main&file=index.html`);
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  const source = await (await page.request.get(`${baseURL}/__demo/file?path=index.html`)).text();
  await page.request.post(`${baseURL}/__demo/external-edit`, {
    data: { path: "index.html", content: source.replace("A native browser preview", "Edited on GitHub") },
  });
  await page.reload();
  await expect(page.locator("#status")).toContainText("Up to date with main", { timeout: 30_000 });
  await page.locator("#history-button").click();
  const items = page.getByRole("dialog", { name: "History" }).locator(".commit-history__item");
  await expect(items).toHaveCount(2);
  await items.nth(1).locator(".commit-history__view").click();
  const diff = page.locator(`${HOST} .monaco-diff-editor`);
  await expect(diff).toBeVisible();
  await expect(diff.locator(".editor.original")).toBeVisible();
  await expect(diff.locator(".editor.modified")).toBeVisible();
  // The changed line shows as removed and added.
  await expect(diff.locator(".line-delete, .char-delete").first()).toBeAttached();
  await expect(diff.locator(".line-insert, .char-insert").first()).toBeAttached();
  // readOnlyMessage: typing says the view is read only and changes nothing.
  const changed = diff.locator(".editor.modified .view-line", { hasText: "Edited on GitHub" });
  await changed.locator("span span").last().click();
  await page.keyboard.type("x");
  await expect(page.locator(`${HOST} .monaco-editor-overlaymessage`)).toContainText(/read-only/i);
  await expect(changed).toContainText("Edited on GitHub</h1>");
});

test("sticky scroll and Go to Symbol keep the document outline", async ({ page, baseURL }) => {
  await open(page, baseURL, "components/components.js");
  const body = Array.from({ length: 90 }, (_, index) => `  console.log(${index});`).join("\n");
  await setLongSource(page, `function outer() {\n${body}\n}\nfunction target() { return 42; }`);
  // The scope header stays visible when its first line leaves the viewport.
  await page.keyboard.press("ControlOrMeta+Home");
  await pane(page).hover();
  await page.mouse.wheel(0, 550);
  await expect(page.locator(`${HOST} .sticky-widget`)).toContainText("function outer", { timeout: 20_000 });
  // Ctrl+Shift+O asks the JS worker for the same document's symbols.
  await lines(page).click();
  await page.keyboard.press("ControlOrMeta+Shift+o");
  const quick = page.locator(`${HOST} .quick-input-widget`);
  await expect(quick).toBeVisible();
  await page.keyboard.insertText("target");
  await expect(quick.locator(".quick-input-list")).toContainText("target", { timeout: 20_000 });
  await page.keyboard.press("Enter");
  await expect(quick).toBeHidden();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" // selected symbol");
  await expect(lines(page)).toContainText("function target() { return 42; } // selected symbol");
});

test("cursor undo and existing editing actions stay available", async ({ page, baseURL }) => {
  await open(page, baseURL, "robots.txt");
  await setSource(page, "first\nsecond");
  await cursorTo(page, 1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ControlOrMeta+u");
  await page.keyboard.insertText("> ");
  await expect.poll(() => source(page)).toBe("> first\nsecond");
  // Platform-specific bindings still have their existing palette actions.
  const quick = page.locator(`${HOST} .quick-input-widget`);
  for (const action of ["Transpose Letters", "Move Selected Text Left", "Increase Editor Font Size", "Reindent Lines", "Convert Indentation to Spaces"]) {
    await page.keyboard.press("F1");
    await expect(quick).toBeVisible();
    await page.keyboard.insertText(action);
    await expect(quick.locator(".quick-input-list")).toContainText(action);
    await page.keyboard.press("Escape");
  }
});
