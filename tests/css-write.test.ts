import assert from "node:assert/strict";
import { test } from "node:test";
import { scanCss } from "../src/page-builder/css-write";
import { setCurrentBreakpoint, subscribeBreakpoint } from "../src/page-builder/breakpoints";

test("comments containing braces and semicolons do not become rules", () => {
  const css = "/* .bad { color: red; } */\n.card { /* } */ color: red; }";
  assert.equal(scanCss(css).length, 1);
});

test("quoted braces, escaped quotes, URLs and functions do not split declarations", () => {
  const css = `.card { content: "a\\\"};{"; background-image: url("data:image/svg+xml;utf8,<svg>{}</svg>"); width: calc(100% - var(--space-m)); color: red; }`;
  const rule = scanCss(css)[0];
  assert.equal(rule.declarations.length, 4);
});

test("breakpoint subscribers receive changes once and can unsubscribe", () => {
  setCurrentBreakpoint("all"); const seen: string[] = [];
  const unsubscribe = subscribeBreakpoint((bp) => seen.push(bp));
  setCurrentBreakpoint("tablet"); setCurrentBreakpoint("tablet"); unsubscribe(); setCurrentBreakpoint("mobile");
  assert.deepEqual(seen, ["tablet"]); setCurrentBreakpoint("all");
});

test("malformed CSS fails closed for reads", () => {
  for (const css of [`.card { color: red`, `.card { color: red; }} .other {}`, `.card { color: var(--ink; }`, `.card { content: "open; }`, `/* open`, `.card[open { color: red; }`, `.card { color red; }`, `.card {} trailing-junk`, `.card { color: red padding: 12px; }`, `.card {} {}`]) {
    assert.deepEqual(scanCss(css), []);
  }
});

test("quoted comment punctuation stays literal when reading selectors", () => {
  const rule = scanCss(`[title="/* literal */"] { color: red; }`)[0];
  assert.equal(rule.selector, `[title="/* literal */"]`);
});
