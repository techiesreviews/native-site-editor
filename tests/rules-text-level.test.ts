import assert from "node:assert/strict";
import test from "node:test";
import { HTML_PHRASING, INLINE_FORMATTING, TEXT_LEVEL, TEXT_LINE_TAGS, TEXT_RUN_TAGS, TEXT_TAGS } from "../src/page-builder/rules/text-level.ts";

const sorted = (set: Set<string>) => [...set].sort();

test("inline formatting: the one list of tags a line of text may hold, edits and data included", () => {
  assert.deepEqual(sorted(INLINE_FORMATTING), [
    "a", "abbr", "b", "br", "cite", "code", "data", "del", "em", "i", "ins", "kbd", "mark", "q", "s", "small", "span",
    "strong", "sub", "sup", "time", "u", "var", "wbr",
  ]);
  assert.equal(INLINE_FORMATTING.has("slot"), false, "the runtime and the template reader add slot where they use it");
});

test("text tags: text blocks, cells and formatting that is text on its own", () => {
  assert.deepEqual(sorted(TEXT_TAGS), [
    "a", "b", "blockquote", "button", "caption", "cite", "code", "dd", "div", "dt", "em", "figcaption", "h1", "h2", "h3",
    "h4", "h5", "h6", "i", "label", "legend", "li", "mark", "p", "q", "small", "span", "strong", "summary", "td", "th",
  ]);
  // The lines the edit bar formats whole are the text tags but the formatting typed into on its own.
  assert.deepEqual(sorted(TEXT_LINE_TAGS), sorted(TEXT_TAGS).filter((tag) => !["strong", "em", "b", "i", "cite", "q", "mark", "code"].includes(tag)));
});

test("text runs: elements that are one Page structure row for a line with formatting in it", () => {
  assert.deepEqual(sorted(TEXT_RUN_TAGS), [
    "a", "b", "blockquote", "button", "caption", "cite", "code", "dd", "dt", "em", "figcaption", "h1", "h2", "h3", "h4",
    "h5", "h6", "i", "label", "legend", "li", "mark", "p", "q", "small", "strong", "summary", "td", "th",
  ]);
  // Formatting that is a row or typed into on its own is also formatting inside a line.
  for (const tag of [...TEXT_RUN_TAGS, ...TEXT_TAGS].filter((tag) => TEXT_LEVEL.has(tag)))
    assert.ok(INLINE_FORMATTING.has(tag), tag);
});

test("HTML phrasing content and text-level semantics are different sets, named apart", () => {
  assert.deepEqual(sorted(HTML_PHRASING), [
    "a", "abbr", "b", "bdi", "bdo", "br", "button", "cite", "code", "data", "dfn", "em", "i", "img", "input", "kbd",
    "label", "mark", "picture", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
  ]);
  assert.deepEqual(sorted(TEXT_LEVEL), [
    "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "s", "samp",
    "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
  ]);
  // Phrasing content includes images and controls; text-level elements never do.
  for (const tag of ["img", "picture", "input", "button", "label"]) assert.ok(HTML_PHRASING.has(tag) && !TEXT_LEVEL.has(tag), tag);
});
