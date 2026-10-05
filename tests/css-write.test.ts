import assert from "node:assert/strict";
import { test } from "node:test";
import { cssClassSelector, locateClassRule, locateWriteRule, scanCss, siteVariables, resolveVariableValue, variableResolver, writeCssProperties } from "../src/page-builder/css-write";
import { getCurrentBreakpoint, setCurrentBreakpoint, subscribeBreakpoint } from "../src/page-builder/breakpoints";
const write = (css: string, values: Record<string, string | null>, extra = {}) => writeCssProperties(css, { selector: ".card", ...extra }, values);

test("replaces one authored declaration without reformatting unrelated source", () => {
  assert.equal(write("/* Card */\n.card {\n  padding: 12px; /* breathing room */\n  color: red;\n}\n", { padding: "var(--space-m)" }), "/* Card */\n.card {\n  padding: var(--space-m); /* breathing room */\n  color: red;\n}\n");
});
test("adds several properties in one clean rule", () => {
  assert.equal(write(".card {\n  display: flex;\n}\n", { gap: "12px", opacity: "0.8" }), ".card {\n  display: flex;\n  gap: 12px;\n  opacity: 0.8;\n}\n");
});
test("single line rules stay single line", () => {
  assert.equal(write(".card { color: red; }", { padding: "2px" }), ".card { color: red; padding: 2px; }");
});
test("removes properties and their otherwise empty lines", () => {
  assert.equal(write(".card {\n  padding: 2px;\n  color: red;\n}\n", { padding: null }), ".card {\n  color: red;\n}\n");
});
test("removing a missing property does not create a rule", () => {
  assert.equal(write("body {}\n", { gap: "" }), "body {}\n");
});
test("appends a new class rule after the existing stylesheet", () => {
  assert.equal(write("body {}\n", { padding: "12px" }), "body {}\n\n.card {\n  padding: 12px;\n}\n");
});
test("CRLF is preserved when replacing, adding and appending media", () => {
  const css = ".card {\r\n    color: red;\r\n}\r\n";
  const next = write(css, { color: "blue", padding: "2px" });
  assert.equal(next, ".card {\r\n    color: blue;\r\n    padding: 2px;\r\n}\r\n");
  const media = write(next, { display: "none" }, { breakpoint: 768 });
  assert.equal(media.replaceAll("\r\n", "").includes("\n"), false);
  assert.match(media, /@media \(max-width: 768px\) \{\r\n    \.card/);
});
test("tab indentation is detected inside layers", () => {
  assert.equal(write("@layer elements {\n\t.card {\n\t\tcolor: red;\n\t}\n}\n", { padding: "2px" }), "@layer elements {\n\t.card {\n\t\tcolor: red;\n\t\tpadding: 2px;\n\t}\n}\n");
});
test("comments containing braces and semicolons do not become rules", () => {
  const css = "/* .bad { color: red; } */\n.card { /* } */ color: red; }";
  assert.equal(scanCss(css).length, 1);
  assert.equal(write(css, { color: "blue" }), "/* .bad { color: red; } */\n.card { /* } */ color: blue; }");
});
test("quoted braces, escaped quotes, URLs and functions do not split declarations", () => {
  const css = `.card { content: "a\\\"};{"; background-image: url("data:image/svg+xml;utf8,<svg>{}</svg>"); width: calc(100% - var(--space-m)); color: red; }`;
  const rule = scanCss(css)[0];
  assert.equal(rule.declarations.length, 4);
  assert.equal(write(css, { color: "blue" }), css.replace("color: red", "color: blue"));
});
test("nested style declarations are left alone", () => {
  const css = ".card {\n  color: red;\n  &:hover { color: green; }\n}\n";
  assert.equal(write(css, { color: "blue", gap: "2px" }), ".card {\n  color: blue;\n  &:hover { color: green; }\n  gap: 2px;\n}\n");
});
test("an unterminated final declaration gets its semicolon before additions", () => {
  assert.equal(write(".card { color: red }", { gap: "2px" }), ".card { color: red; gap: 2px; }");
});
test("duplicate properties are removed and the last declaration replaced", () => {
  assert.equal(write(".card { color: red; color: green !important; }", { color: "blue" }), ".card {  color: blue !important; }");
});
test("base writes do not alter tablet declarations", () => {
  const css = ".card { color: red; }\n@media (max-width: 768px) { .card { color: green; } }";
  assert.equal(write(css, { color: "blue" }), css.replace("color: red", "color: blue"));
});
test("writes into an existing media rule and preserves the base", () => {
  const css = ".card { color: red; }\n@media ( max-width : 768px ) { .card { color: green; } }";
  assert.equal(write(css, { color: "blue" }, { breakpoint: 768 }), css.replace("color: green", "color: blue"));
});
test("inserts into a matching existing media block", () => {
  const css = ".card { color: red; }\n@media screen and (max-width: 768px) {\n  .other { color: green; }\n}\n";
  const next = write(css, { display: "none" }, { breakpoint: 768 });
  assert.equal((next.match(/@media/g) ?? []).length, 1);
  assert.equal(locateWriteRule(next, { selector: ".card", breakpoint: 768 })?.declarations[0].value, "none");
});
test("compound media conditions must not capture a whole-breakpoint edit", () => {
  const css = ".card {}\n@media (max-width: 768px) and (orientation: landscape) { .card { color: red; } }";
  assert.equal((write(css, { display: "none" }, { breakpoint: 768 }).match(/@media/g) ?? []).length, 2);
});
test("new media stays within the base rule's nested layer", () => {
  const css = "@layer site {\n  @layer elements {\n    .card {\n      color: red;\n    }\n  }\n}\n";
  const next = write(css, { display: "none" }, { breakpoint: 390 });
  const rule = locateWriteRule(next, { selector: ".card", breakpoint: 390 })!;
  assert.equal(rule.parent?.parent?.selector, "@layer elements");
  assert.match(next, /    @media \(max-width: 390px\) \{\n      \.card \{\n        display: none;/);
});
test("does not borrow a media block from another layer", () => {
  const css = "@layer a { .card {} }\n@layer b { @media (max-width: 768px) { .other {} } }";
  const next = write(css, { color: "blue" }, { breakpoint: 768 });
  assert.equal((next.match(/@media/g) ?? []).length, 2);
  assert.equal(locateWriteRule(next, { selector: ".card", breakpoint: 768 })?.parent?.parent?.selector, "@layer a");
});
test("hover and focus-visible writes are isolated from the base", () => {
  for (const state of [":hover", ":focus-visible"] as const) {
    const css = write(".card { color: red; }\n", { color: "blue" }, { state, breakpoint: 768 });
    assert.equal(locateWriteRule(css, { selector: ".card", breakpoint: 768, state })?.declarations[0].value, "blue");
    assert.equal(locateWriteRule(css, { selector: ".card" })?.declarations[0].value, "red");
  }
});
test("prefers most specific matched parent class rule", () => {
  const files = { "site.css": ".card { color: red; }\n.parent .card { color: blue; }\n#x .card { color: green; }" };
  assert.equal(locateClassRule(files, [ { path: "site.css", selector: ".card", ruleIndex: 0 }, { path: "site.css", selector: ".parent .card", ruleIndex: 1 }, { path: "site.css", selector: "#x .card", ruleIndex: 2 } ], "card", "site.css").selector, ".parent .card");
});
test("source rule indexes include nested layers but exclude keyframes", () => {
  const files = { "site.css": "@keyframes enter { from { opacity: 0; } } @layer elements { .card { color: red; } }" };
  assert.equal(locateClassRule(files, [{ path: "site.css", selector: ".card", ruleIndex: 0 }], "card", "site.css").start, files["site.css"].indexOf(".card"));
});
test("explicit base source location distinguishes duplicate class rules", () => {
  const css = ".card { color: red; }\n.card { color: blue; }";
  assert.equal(write(css, { color: "green" }, { baseStart: 0 }), css.replace("color: red", "color: green"));
});
test("falls back to a first-class rule, never an inline style or tag rule", () => {
  assert.deepEqual(locateClassRule({ "site.css": "p { color: red; }" }, [{ path: "index.html", selector: "style" }, { path: "site.css", selector: "p" }], "lead", "site.css"), { path: "site.css", selector: ".lead" });
});
test("CSS selector escaping handles numeric and punctuated classes", () => {
  assert.equal(cssClassSelector("2xl:card"), ".\\32 xl\\:card");
});
test("variables retain case, path, source rule and raw values", () => {
  const variables = siteVariables({ "tokens.css": "@layer tokens { :root { --space-m: 1rem; --Ink: #123; } } @media (max-width: 390px) { :root { --space-m: 2rem; } }", "index.html": "<p>hello</p>" });
  assert.equal(variables.length, 2);
  assert.equal(variables[1].name, "--Ink");
  const next = writeCssProperties("@layer tokens { :root { --Ink: #123; } }", { selector: ":root", baseStart: 16 }, { "--Ink": "#456" });
  assert.match(next, /--Ink: #456;/);
});
test("rejects injected rules and invalid properties; permits semicolons in strings", () => {
  assert.throws(() => write(".card {}", { color: "red; } body { color: red" }));
  assert.throws(() => write(".card {}", { "x;": "red" }));
  assert.match(write(".card {}", { content: '"a;b"' }), /content: "a;b";/);
});
test("breakpoint subscribers receive changes once and can unsubscribe", () => {
  setCurrentBreakpoint("all"); const seen: string[] = [];
  const unsubscribe = subscribeBreakpoint((bp) => seen.push(bp));
  setCurrentBreakpoint("tablet"); setCurrentBreakpoint("tablet"); unsubscribe(); setCurrentBreakpoint("mobile");
  assert.deepEqual(seen, ["tablet"]); assert.equal(getCurrentBreakpoint(), "mobile"); setCurrentBreakpoint("all");
});

test("site color aliases resolve from site variables rather than editor tokens", () => {
  const variables = siteVariables({ "site.css": ":root { --surface: #abc; --card: var(--surface); --space-s: 4px; --space-m: var(--space-s); }" });
  assert.equal(resolveVariableValue("var(--card)", variables), "#abc");
  assert.equal(resolveVariableValue("var(--space-m)", variables), "4px");
  assert.equal(resolveVariableValue("var(--missing, red)", variables), "red");
});
test("one resolver per variable snapshot resolves exactly as resolveVariableValue, and only from that snapshot", () => {
  const chain = Array.from({ length: 14 }, (_, i) => `--c${i}: ${i === 13 ? "#0f0" : `var(--c${i + 1})`};`).join(" ");
  const variables = siteVariables({ "a.css": `:root { --ink: #111; --a: var(--b); --b: var(--a); --pad: calc(var(--gap, 2px) * 2); ${chain} }`, "b.css": ":root { --ink: #222; }" });
  const resolve = variableResolver(variables);
  // A later duplicate wins, fallbacks and missing names, a cycle, and a chain cut at depth 12.
  const values = ["var(--ink)", "var(--missing)", "var(--missing, red)", "var(--a)", "var(--pad)", "var(--c0)", "var(--c1)", "var(--c2)", "1px var(--ink) solid", "plain"];
  for (const value of values) assert.equal(resolve(value), resolveVariableValue(value, variables), value);
  assert.equal(resolve("var(--ink)"), "#222");
  assert.equal(resolve("var(--c2)"), "#0f0");
  assert.equal(resolve("var(--c1)"), "var(--c13)");
  assert.equal(resolve("var(--c0)"), "var(--c12)");
  // Nothing carries over to another snapshot.
  assert.equal(variableResolver([])("var(--ink)"), "var(--ink)");
  assert.equal(variableResolver(siteVariables({ "c.css": ":root { --ink: #333; }" }))("var(--ink)"), "#333");
});
test("variable selector lists are edited in their original rule", () => {
  const source = ":root, :host { --ink: #123; }";
  const variable = siteVariables({ "tokens.css": source })[0];
  assert.equal(writeCssProperties(source, { selector: variable.selector, baseStart: variable.ruleStart }, { "--ink": "#456" }), ":root, :host { --ink: #456; }");
});

test("malformed CSS fails closed for reads and writes", () => {
  for (const css of [`.card { color: red`, `.card { color: red; }} .other {}`, `.card { color: var(--ink; }`, `.card { content: "open; }`, `/* open`, `.card[open { color: red; }`, `.card { color red; }`, `.card {} trailing-junk`, `.card { color: red padding: 12px; }`, `.card {} {}`]) {
    assert.deepEqual(scanCss(css), []);
    assert.throws(() => write(css, { color: "blue" }), /unfinished|unbalanced|safely parsed/);
  }
});

test("an explicit stale or mismatched rule offset never edits a replacement rule", () => {
  const css = `.other { color: red; }\n.card { color: green; }`;
  for (const baseStart of [0, 123]) {
    assert.equal(locateWriteRule(css, { selector: ".card", baseStart }), undefined);
    assert.throws(() => write(css, { color: "blue" }, { baseStart }), /CSS rule changed/);
    assert.throws(() => write(css, { color: "blue" }, { baseStart, breakpoint: 768, state: ":hover" }), /CSS rule changed/);
  }
});

test("malformed values and selectors cannot insert source boundaries", () => {
  for (const value of [`var(--open`, `"unfinished`, `red /* unfinished`, `blue]`]) assert.throws(() => write(`.card {}`, { color: value }));
  assert.throws(() => writeCssProperties(`.card {}`, { selector: `.card {} body` }, { color: "red" }));
});

test("transforms remain isolated by breakpoint and state inside the original layer", () => {
  const css = `@layer components {\r\n  .card { transform: translateX(0); }\r\n}\r\n`;
  const next = write(css, { transform: "translateX(12px) rotate(5deg)", "transform-origin": "top left" }, { breakpoint: 768, state: ":hover" });
  const rule = locateWriteRule(next, { selector: ".card", breakpoint: 768, state: ":hover" });
  assert.equal(rule?.parent?.parent?.selector, "@layer components");
  assert.equal(rule?.declarations[0].value, "translateX(12px) rotate(5deg)");
  assert.equal(locateWriteRule(next, { selector: ".card" })?.declarations[0].value, "translateX(0)");
  assert.equal(next.replaceAll("\r\n", "").includes("\n"), false);
});

test("value comments survive replacement and removal; quoted comment punctuation stays literal", () => {
  const css = `.card { color/* property */: /* choice */ red; content: "/* literal */"; }`;
  assert.equal(write(css, { color: "blue" }), `.card { color: blue /* property */ /* choice */; content: "/* literal */"; }`);
  assert.equal(write(css, { color: null }), `.card { /* property */ /* choice */ content: "/* literal */"; }`);
  const rule = scanCss(`[title="/* literal */"] { color: red; }`)[0];
  assert.equal(rule.selector, `[title="/* literal */"]`);
});

test("a source snapshot rejects changes even when another rule occupies the same offset and selector", () => {
  const before = `.card { color: red; }`;
  const after = `.card { color: blue; }`;
  assert.throws(() => write(after, { padding: "12px" }, { baseStart: 0, expectedSource: before }), /stylesheet changed/);
  assert.equal(write(before, { padding: "12px" }, { baseStart: 0, expectedSource: before }), `.card { color: red; padding: 12px; }`);
});

test("escaped string continuations preserve CRLF offsets", () => {
  const css = `.card {\r\n  content: "first\\\r\nsecond";\r\n  color: red;\r\n}\r\n`;
  assert.equal(write(css, { color: "blue" }), css.replace("color: red", "color: blue"));
});

test("a valid stylesheet containing only directives retains quoted punctuation when appending", () => {
  const css = `/* imports */\r\n@import url("https://example.test/{theme}.css");\r\n`;
  assert.equal(write(css, { color: "red" }), css + `\r\n.card {\r\n  color: red;\r\n}\r\n`);
});

test("important priority survives uppercase spelling and a trailing value comment", () => {
  assert.equal(write(`.card { color: red !IMPORTANT /* priority */; }`, { color: "blue" }), `.card { color: blue !important /* priority */; }`);
});

test("duplicate declarations retain the effective important priority regardless of order", () => {
  assert.equal(write(`.card { color: red !important; color: blue; }`, { color: "green" }), `.card { color: green !important;  }`);
  assert.equal(write(`.card { color: blue; color: red !important; }`, { color: "green" }), `.card {  color: green !important; }`);
  assert.equal(write(`.card { color: red !important; color: blue !important; }`, { color: "green" }), `.card {  color: green !important; }`);
});
