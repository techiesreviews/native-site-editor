import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HEADING_LEVEL, HEADING_LEVELS, headingLevel, sectionHeadingMarkup } from "./section-heading-options.ts";

// The Section heading part's options become markup: one class, a real heading, the words escaped.

test("section heading: levels are 2 to 4, anything else is 3", () => {
  assert.deepEqual([...HEADING_LEVELS], [2, 3, 4]);
  for (const level of HEADING_LEVELS) assert.equal(headingLevel(level), level);
  assert.equal(headingLevel("4"), 4, "a level from a text option");
  assert.equal(headingLevel(undefined), DEFAULT_HEADING_LEVEL);
  assert.equal(headingLevel(1), 3);
  assert.equal(headingLevel(7), 3);
  assert.equal(headingLevel("big"), 3);
});

test("section heading: the words are a real heading, the end slot follows them", () => {
  assert.equal(sectionHeadingMarkup("Pages"), '<div class="ui-section-heading"><h3>Pages</h3></div>');
  assert.equal(sectionHeadingMarkup("Pages", { level: 2 }), '<div class="ui-section-heading"><h2>Pages</h2></div>');
  assert.equal(sectionHeadingMarkup("Pages", { level: "4" }, "12"), '<div class="ui-section-heading"><h4>Pages</h4><span data-slot="end">12</span></div>');
  assert.equal(sectionHeadingMarkup("Pages", {}, true), '<div class="ui-section-heading"><h3>Pages</h3><span data-slot="end"></span></div>', "an empty slot for the caller's node");
  assert.equal(sectionHeadingMarkup("Pages", {}, "   "), sectionHeadingMarkup("Pages"), "a blank end leaves no slot");
  assert.equal(sectionHeadingMarkup("Pages", {}, undefined), sectionHeadingMarkup("Pages"));
});

test("section heading: words and end text are escaped, and the words are not changed to capitals in the markup", () => {
  assert.equal(sectionHeadingMarkup("Pages & files <new>", {}, "<1>"), '<div class="ui-section-heading"><h3>Pages &amp; files &lt;new&gt;</h3><span data-slot="end">&lt;1&gt;</span></div>');
});
