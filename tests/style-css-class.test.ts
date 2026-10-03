import assert from "node:assert/strict";
import { test } from "node:test";
import { cssClassSelector, writeCssProperties } from "../src/page-builder/css-write";

test("native non-breaking-space class tokens never match descendant selectors", () => {
  const source = ".spaced token { color: red; }\n.spaced\u00a0token { color: blue; }\n";
  assert.equal(writeCssProperties(source, { selector: cssClassSelector("spaced\u00a0token") }, { color: "green" }), source.replace("color: blue", "color: green"));
});
test("a class ending in non-ASCII whitespace retains its selector token", () => {
  const source = ".token\u00a0 { color: blue; }";
  assert.equal(writeCssProperties(source, { selector: cssClassSelector("token\u00a0") }, { color: "green" }), source.replace("color: blue", "color: green"));
});

test("selector matching preserves quoted whitespace and escaped spaces", () => {
  for (const [first, second] of [
    ['[data-x="a  b"]', '[data-x="a b"]'],
    [String.raw`.a\  b`, String.raw`.a\ b`],
    [String.raw`.a\20  b`, String.raw`.a\20 b`],
    ['.a/* keep  spaces */ .b', '.a/* keep spaces */ .b'],
  ]) {
    const source = `${first} { color: red; }\n${second} { color: blue; }`;
    assert.equal(writeCssProperties(source, { selector: first }, { color: "green" }), source.replace("color: red", "color: green"));
  }
});
