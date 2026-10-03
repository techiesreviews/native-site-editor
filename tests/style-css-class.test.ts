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
