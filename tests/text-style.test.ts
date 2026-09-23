import assert from "node:assert/strict";
import { test } from "node:test";
import { classFontSizeEditCovered, listClassFontSizes, planClassFontSize, readClassFontSize } from "../src/text-style";

const cssPath = "src/styles/site.css";
const buttonAstro = '<a class="button">Hello</a>\n';
const buttonOpening = { start: 0, end: '<a class="button">'.length };

function plannedClassFontSize(css: string, value: string | undefined) {
  const result = planClassFontSize({ astroPath, astroSource: buttonAstro, opening: buttonOpening, files: {
    [astroPath]: buttonAstro, [cssPath]: css,
  }, matchedSelectors: [".button"], value });
  assert.equal(result.ok, true);
  assert.ok(result.ok && "edit" in result);
  return css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end);
}

test("classFontSizeEditCovered: pure class font-size value change is covered", () => {
  const before = ".button { color: red; font-size: var(--text-m); }\n";
  const after = ".button { color: red; font-size: var(--text-4xl); }\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), true);
});

test("classFontSizeEditCovered: nested class font-size stays covered, siblings untouched", () => {
  const before = ".button {\n  font-size: var(--text-m);\n  &.small { font-size: var(--text-s); }\n}\n";
  const after = ".button {\n  font-size: var(--text-l);\n  &.small { font-size: var(--text-s); }\n}\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), true);
});

test("classFontSizeEditCovered: removing the class font-size (size Default) is covered", () => {
  const before = ".btn,\n.button {\n  color: white;\n  font-size: var(--text-m);\n  font-weight: 600;\n}\n";
  const after = ".btn,\n.button {\n  color: white;\n  \n  font-weight: 600;\n}\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), true);
});

test("classFontSizeEditCovered: re-adding a planned class font-size after Default is covered", () => {
  const before = ".btn,\n.button {\n  color: white;\n  \n  font-weight: 600;\n}\n";
  const after = ".btn,\n.button {\n  color: white;\n  \n  font-weight: 600;\n  font-size: var(--text-xl);\n}\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), true);
});

test("classFontSizeEditCovered: exact planned nested remove and re-add are covered", () => {
  const sized = `.btn,
.button {
  color: white;
  font-size: var(--text-m);
  font-weight: 600;

  &.small { font-size: var(--text-s); }
}
`;
  const withoutSize = plannedClassFontSize(sized, undefined);
  assert.equal(withoutSize, ".btn,\n" +
    ".button {\n" +
    "  color: white;\n" +
    "  \n" +
    "  font-weight: 600;\n\n" +
    "  &.small { font-size: var(--text-s); }\n" +
    "}\n");
  const resized = plannedClassFontSize(withoutSize, "var(--text-xl)");
  assert.equal(resized, ".btn,\n" +
    ".button {\n" +
    "  color: white;\n" +
    "  \n" +
    "  font-weight: 600;\n\n" +
    "  &.small { font-size: var(--text-s); };\n" +
    "  font-size: var(--text-xl);\n" +
    "}\n");
  assert.equal(classFontSizeEditCovered(cssPath, sized, withoutSize), true);
  assert.equal(classFontSizeEditCovered(cssPath, withoutSize, resized), true);
  assert.equal(classFontSizeEditCovered(cssPath, resized, withoutSize), true);
});

test("classFontSizeEditCovered: planned insert after unterminated declaration is covered", () => {
  const before = ".button {\n  color: red\n}\n";
  const after = plannedClassFontSize(before, "var(--text-xl)");
  assert.equal(after, ".button {\n  color: red;\n  font-size: var(--text-xl);\n}\n");
  assert.equal(classFontSizeEditCovered(cssPath, before, after), true);
  assert.equal(classFontSizeEditCovered(cssPath, after, before), true);
});

test("classFontSizeEditCovered: many class font-size edits fall back instead of expanding candidates", () => {
  const before = Array.from({ length: 7 }, (_, index) => `.c${index} {\n  \n  font-weight: 600;\n}\n`).join("");
  const after = Array.from({ length: 7 }, (_, index) => `.c${index} {\n  \n  font-weight: 600;\n  font-size: var(--text-xl);\n}\n`).join("");
  assert.equal(classFontSizeEditCovered(cssPath, before, after), false);
});

test("classFontSizeEditCovered: removal plus a coincident non-font-size change falls back", () => {
  const before = ".button {\n  color: white;\n  font-size: var(--text-m);\n}\n";
  const after = ".button {\n  color: black;\n  \n}\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), false);
});

test("classFontSizeEditCovered: planned font-size edit plus other CSS change falls back", () => {
  const before = ".button {\n  color: white;\n  font-size: var(--text-m);\n}\n";
  const after = plannedClassFontSize(before, undefined).replace("white", "black");
  assert.equal(classFontSizeEditCovered(cssPath, before, after), false);
});

test("classFontSizeEditCovered: same font-size edit in another path falls back", () => {
  const before = ".button { font-size: var(--text-m); }\n";
  const after = ".button { font-size: var(--text-xl); }\n";
  assert.equal(classFontSizeEditCovered("src/pages/index.astro", before, after), false);
});

test("classFontSizeEditCovered: a coincident non-font-size change falls back", () => {
  const before = ".button { color: red; font-size: var(--text-m); }\n";
  const after = ".button { color: blue; font-size: var(--text-4xl); }\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), false);
});

test("classFontSizeEditCovered: element-selector font-size change falls back", () => {
  const before = "h1 { font-size: 40px; }\n.button { font-size: var(--text-m); }\n";
  const after = "h1 { font-size: 60px; }\n.button { font-size: var(--text-m); }\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), false);
});

test("classFontSizeEditCovered: no change is not covered", () => {
  const css = ".button { font-size: var(--text-m); }\n";
  assert.equal(classFontSizeEditCovered(cssPath, css, css), false);
});

test("classFontSizeEditCovered: invalid literal value falls back", () => {
  const before = ".button { font-size: var(--text-m); }\n";
  const after = ".button { font-size: red; }\n";
  assert.equal(classFontSizeEditCovered(cssPath, before, after), false);
});

const astroPath = "src/pages/index.astro";
const astro = '<p class="lead">Hello</p>\n';
const opening = { start: 0, end: '<p class="lead">'.length };

test("edits font-size in the unique matched simple class rule", () => {
  const css = ".lead { color: red; font-size: 1rem; line-height: 1.5; }\n";
  const result = planClassFontSize({ astroPath, astroSource: astro, opening, files: {
    [astroPath]: astro, "src/styles/site.css": css,
  }, matchedSelectors: [".lead"], value: "var(--text-l)" });
  assert.deepEqual(result, { ok: true, selector: ".lead", targetPath: "src/styles/site.css", edit: {
    start: css.indexOf("1rem"), end: css.indexOf("1rem") + 4, expected: "1rem", text: "var(--text-l)",
  } });
});

test("adds font-size without rewriting the rule's other declarations", () => {
  const css = ".lead {\n  color: red;\n}\n";
  const result = planClassFontSize({ astroPath, astroSource: astro, opening, files: {
    [astroPath]: astro, "src/styles/site.css": css,
  }, matchedSelectors: [".lead"], value: "2.25rem" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.targetPath, "src/styles/site.css");
  assert.equal(css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end),
    ".lead {\n  color: red;\n  font-size: 2.25rem;\n}\n");
});

test("adds font-size after an unterminated final declaration", () => {
  for (const css of [
    ".lead { color: red }\n",
    ".lead {\n  color: red\n}\n",
    ".lead { color: red /* keep */ }\n",
  ]) {
    const result = planClassFontSize({ astroPath, astroSource: astro, opening, files: {
      [astroPath]: astro, "src/styles/site.css": css,
    }, matchedSelectors: [".lead"], value: "var(--text-xl)" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const updated = css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end);
    assert.match(updated, /color:\s*red(?:\s*\/\* keep \*\/)?;/);
    assert.match(updated, /font-size:\s*var\(--text-xl\);/);
  }
});

test("creates a page style rule when the literal single class has no rule", () => {
  const result = planClassFontSize({ astroPath, astroSource: astro, opening,
    files: { [astroPath]: astro }, matchedSelectors: [], value: "var(--text-m)" });
  assert.deepEqual(result, { ok: true, selector: ".lead", targetPath: astroPath, edit: {
    start: astro.length, end: astro.length, expected: "", text: "\n<style>\n.lead { font-size: var(--text-m); }\n</style>\n",
  } });
});

test("reads the class from current source instead of trusting stale opening offsets", () => {
  const current = '<p data-x="1" class="fresh">Hello</p>\n';
  const result = planClassFontSize({ astroPath, astroSource: current,
    opening: { start: 0, end: '<p data-x="1" class="fresh">'.length },
    files: { [astroPath]: current, "src/site.css": ".fresh { color: blue; }" },
    matchedSelectors: [".fresh"], value: "1rem" });
  assert.equal(result.ok && result.selector, ".fresh");
});

test("reads and lists only safe top-level simple class font sizes", () => {
  const css = ".lead { color: red; font-size: 2.25rem; }\n.card:hover { font-size: 1rem; }\n";
  assert.equal(readClassFontSize("src/site.css", css, ".lead"), "2.25rem");
  assert.deepEqual(listClassFontSizes("src/site.css", css), [{ selector: ".lead", value: "2.25rem" }]);
  assert.deepEqual(listClassFontSizes("src/site.css", ".lead { font-size: 1rem;"), []);
});

test("removes only the existing font-size declaration for Default", () => {
  const css = ".lead { color: red; font-size: 1rem; line-height: 1.5; }";
  const result = planClassFontSize({ astroPath, astroSource: astro, opening,
    files: { [astroPath]: astro, "src/site.css": css }, matchedSelectors: [".lead"], value: undefined });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end),
    ".lead { color: red;  line-height: 1.5; }");
});

test("removes uppercase font-size without losing a leading comment", () => {
  const css = ".lead { color: red; /* note */ FONT-SIZE: 1rem; line-height: 1.5; }";
  const result = planClassFontSize({ astroPath, astroSource: astro, opening,
    files: { [astroPath]: astro, "src/site.css": css }, matchedSelectors: [".lead"], value: undefined });
  assert.equal(result.ok, true);
  if (!result.ok || !("edit" in result)) return;
  assert.equal(css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end),
    ".lead { color: red; /* note */  line-height: 1.5; }");
});

test("moves a classless heading inline size to a readable page class", () => {
  const source = '<h2 style="color: red; font-size: 1rem;">Hello</h2>\n';
  const result = planClassFontSize({ astroPath, astroSource: source,
    opening: { start: 0, end: source.indexOf(">") + 1 }, files: { [astroPath]: source },
    matchedSelectors: [], value: "var(--text-xl)" });
  assert.equal(result.ok && "edits" in result, true);
  if (!result.ok || !("edits" in result)) return;
  assert.equal(result.selector, ".heading-title");
  assert.deepEqual(result.edits, [
    { targetPath: astroPath, start: 0, end: source.indexOf(">") + 1,
      expected: '<h2 style="color: red; font-size: 1rem;">', text: '<h2 style="color: red;" class="heading-title">' },
    { targetPath: astroPath, start: source.length, end: source.length, expected: "",
      text: "\n<style>\n.heading-title { font-size: var(--text-xl); }\n</style>\n" },
  ]);
});

test("moves classless button and link sizes to readable page classes", () => {
  for (const [openingText, className] of [
    ['<a href="/start" style="font-size: 1rem;">', "link-text"],
    ['<button style="font-size: 1rem;">', "button-text"],
  ] as const) {
    const source = `${openingText}Hello</${openingText.startsWith("<a") ? "a" : "button"}>\n`;
    const result = planClassFontSize({ astroPath, astroSource: source,
      opening: { start: 0, end: openingText.length },
      files: { [astroPath]: source }, matchedSelectors: [], value: "var(--text-xl)" });
    assert.equal(result.ok, true);
    if (!result.ok || !("edits" in result)) return;
    assert.equal(result.selector, `.${className}`);
    assert.equal(result.edits[0].text, openingText.replace(' style="font-size: 1rem;"', ` class="${className}"`));
    assert.equal(result.edits[1].text, `\n<style>\n.${className} { font-size: var(--text-xl); }\n</style>\n`);
  }
});

test("uses a unique paragraph class suffix and treats classless Default as a no-op", () => {
  const source = "<p>Hello</p>\n<!-- paragraph-text -->";
  const input = { astroPath, astroSource: source, opening: { start: 0, end: 3 },
    files: { [astroPath]: source }, matchedSelectors: [] as string[] };
  const sized = planClassFontSize({ ...input, value: "1rem" });
  assert.equal(sized.ok && sized.selector, ".paragraph-text-2");
  assert.deepEqual(planClassFontSize({ ...input, value: undefined }), { ok: true, noop: true, edits: [] });
});

test("rejects a top-level class rule duplicated inside a conditional at-rule", () => {
  const css = ".lead { font-size: 1rem; }\n@media (min-width: 0px) { .lead { font-size: 2rem; } }\n";
  const result = planClassFontSize({ astroPath, astroSource: astro, opening,
    files: { [astroPath]: astro, "src/site.css": css }, matchedSelectors: [".lead"], value: "var(--text-l)" });
  assert.equal(result.ok, false);
});

test("rejects same-name rules in unsupported SCSS and attributed Astro style blocks", () => {
  for (const files of [
    { "src/site.scss": ".lead { font-size: 1rem; }" },
    { "src/component.astro": "<style is:global>.lead { font-size: 1rem; }</style>" },
  ]) {
    const result = planClassFontSize({ astroPath, astroSource: astro, opening,
      files: { [astroPath]: astro, ...files }, matchedSelectors: [".lead"], value: "var(--text-l)" });
    assert.equal(result.ok, false);
  }
});

for (const [name, declarationText] of [
  ["quoted value", '--note: "; font-size: 1rem;"; color: red;'],
  ["comment", "/* ; font-size: 1rem; */ color: red;"],
  ["parenthesized value", "--note: fn(; font-size: 1rem;); color: red;"],
] as const) test(`does not edit font-size text inside a ${name}`, () => {
  const css = `.lead { ${declarationText} }`;
  const result = planClassFontSize({ astroPath, astroSource: astro, opening,
    files: { [astroPath]: astro, "src/site.css": css }, matchedSelectors: [".lead"], value: "var(--text-l)" });
  assert.equal(result.ok && "edit" in result, true);
  if (!result.ok || !("edit" in result)) return;
  const updated = css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end);
  assert.match(updated, new RegExp(declarationText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(updated, /font-size:\s*var\(--text-l\);/);
});

test("does not mistake data-class or quoted attribute text for the class attribute", () => {
  for (const source of [
    '<p data-class="lead">Hello</p>',
    `<p data-note='class="lead"'>Hello</p>`,
  ]) {
    const result = planClassFontSize({ astroPath, astroSource: source,
      opening: { start: 0, end: source.indexOf(">") + 1 }, files: { [astroPath]: source, "src/site.css": ".lead {}" },
      matchedSelectors: [], value: "1rem" });
    assert.equal(result.ok && result.selector, ".paragraph-text");
  }
});

test("does not remove font-size text inside a classless inline-style string", () => {
  const source = `<p style="--note: '; font-size: 1rem;'; color: red;">Hello</p>\n`;
  const result = planClassFontSize({ astroPath, astroSource: source,
    opening: { start: 0, end: source.indexOf(">") + 1 }, files: { [astroPath]: source },
    matchedSelectors: [], value: "var(--text-l)" });
  assert.equal(result.ok && "edits" in result, true);
  if (!result.ok || !("edits" in result)) return;
  assert.match(result.edits[0].text, /--note: '; font-size: 1rem;'; color: red;/);
});

for (const [name, source, selectors, files] of [
  ["multiple classes", '<p class="lead wide">Hello</p>', [".lead"], { "src/site.css": ".lead {}" }],
  ["dynamic class", '<p class={kind}>Hello</p>', [".lead"], { "src/site.css": ".lead {}" }],
  ["complex matched selector", astro, ["article .lead"], { "src/site.css": "article .lead {}" }],
  ["multiple simple rules", astro, [".lead"], { "src/a.css": ".lead {}", "src/b.css": ".lead {}" }],
  ["conditional rule", astro, [".lead"], { "src/site.css": "@media (width > 1px) { .lead {} }" }],
] as const) test(`rejects ${name}`, () => {
  const end = source.indexOf(">") + 1;
  const result = planClassFontSize({ astroPath, astroSource: source, opening: { start: 0, end },
    files: { [astroPath]: source, ...files }, matchedSelectors: [...selectors], value: "1rem" });
  assert.equal(result.ok, false);
});

test("does not claim to resize text overridden by an inline font shorthand", () => {
  for (const openingText of ['<p style="font: 1rem serif;">', '<p class="lead" style="font: 1rem serif;">']) {
    const source = openingText + 'Hello</p>';
    const result = planClassFontSize({ astroPath, astroSource: source, opening: { start: 0, end: openingText.length },
      files: { [astroPath]: source, "src/site.css": ".lead { font-size: 1rem; }" }, matchedSelectors: [".lead"], value: "var(--text-xl)" });
    assert.equal(result.ok, false);
  }
});

test("does not edit an unrelated scoped class that does not match the selected element", () => {
  const result = planClassFontSize({ astroPath, astroSource: astro, opening,
    files: { [astroPath]: astro, "src/components/Other.astro": '<p class="lead">Other</p><style>.lead { font-size: 1rem; }</style>' },
    matchedSelectors: ["p"], value: "var(--text-xl)" });
  assert.equal(result.ok, false);
});

test("edits only the parent font-size in a grouped nested class rule", () => {
  const css = `.btn, .button {
  color: white;
  font-size: var(--text-m);
  &.small { font-size: var(--text-s); }
  &.large { font-size: var(--text-l); }
  --note: "{ font-size: nope; }";
  /* { font-size: nope; } */
}
`;
  const source = '<button class="button">Hello</button>\n';
  const result = planClassFontSize({ astroPath, astroSource: source,
    opening: { start: 0, end: '<button class="button">'.length },
    files: { [astroPath]: source, "src/site.css": css }, matchedSelectors: [".button"], value: "var(--text-4xl)" });
  assert.equal(result.ok, true);
  if (!result.ok || !("edit" in result)) return;
  const updated = css.slice(0, result.edit.start) + result.edit.text + css.slice(result.edit.end);
  assert.match(updated, /font-size:\s*var\(--text-4xl\);/);
  assert.match(updated, /&\.small \{ font-size: var\(--text-s\); \}/);
  assert.match(updated, /&\.large \{ font-size: var\(--text-l\); \}/);
  assert.match(updated, /--note: "\{ font-size: nope; \}";/);
});

test("does not read nested child font-size as the parent class size", () => {
  const css = `.btn, .button {
  color: white;
  &.small { font-size: var(--text-s); }
}
`;
  assert.equal(readClassFontSize("src/site.css", css, ".button"), undefined);
  assert.deepEqual(listClassFontSizes("src/site.css", css), []);
});


test("uses the one exact matched class from a multi-class opening", () => {
  const source = '<button class="button helper secondary">Hello</button>\n';
  const css = ".button { font-size: var(--text-m); }\n.helper { color: red; }\n";
  const result = planClassFontSize({ astroPath, astroSource: source,
    opening: { start: 0, end: '<button class="button helper secondary">'.length },
    files: { [astroPath]: source, "src/site.css": css }, matchedSelectors: [".button"], value: "var(--text-l)", preferredClass: "button" });
  assert.equal(result.ok, true);
  if (!result.ok || !("edit" in result)) return;
  assert.equal(result.selector, ".button");
  assert.equal(result.edit.expected, "var(--text-m)");
});

test("rejects multi-class openings without a prepared preferred class", () => {
  const source = '<button class="button helper">Hello</button>\n';
  const result = planClassFontSize({ astroPath, astroSource: source,
    opening: { start: 0, end: '<button class="button helper">'.length },
    files: { [astroPath]: source, "src/site.css": ".button {}\n.helper {}\n" }, matchedSelectors: [".button", ".helper"], value: "1rem" });
  assert.equal(result.ok, false);
});
