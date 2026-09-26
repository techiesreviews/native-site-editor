import { strict as assert } from "node:assert";
import { test } from "node:test";
import { slottedTwin, withSlottedRules } from "../shared/slotted-css.ts";

test("a selector's twin styles the same element slotted in by a page", () => {
  assert.equal(slottedTwin("h1"), "::slotted(h1)");
  assert.equal(slottedTwin(".lead"), "::slotted(.lead)");
  assert.equal(slottedTwin(".actions a"), ".actions ::slotted(a)");
  assert.equal(slottedTwin(".card > p.note:first-child"), ".card > ::slotted(p.note:first-child)");
  assert.equal(slottedTwin("a:not(.x, .y)"), "::slotted(a:not(.x, .y))");
  assert.equal(slottedTwin("li:nth-child(2n + 1)"), "::slotted(li:nth-child(2n + 1))");
  assert.equal(slottedTwin("li:nth-child(2 of .done)"), "::slotted(li:nth-child(2 of .done))");
  assert.equal(slottedTwin("a[title='a b']"), "::slotted(a[title='a b'])");
  assert.equal(slottedTwin(":host(.dark) h1"), ":host(.dark) ::slotted(h1)");
  assert.equal(slottedTwin("> a"), "> ::slotted(a)");
  assert.equal(slottedTwin("& > a"), "& > ::slotted(a)");
});

test("no twin where ::slotted() cannot take the selector", () => {
  for (const selector of [":host", ":host(.x)", "a::before", "a:after", "::selection", "&:hover", ".x:has(img)", "a:not(.x .y)", ":is(a, :not(.x .y))", "a:not(.x > .y)", "li:nth-child(2 of .a .b)", "::slotted(h1)", ".x ::slotted(a)", "x-y::part(label)"])
    assert.equal(slottedTwin(selector), undefined, selector);
});

test("each style rule's selector list gains its twins; rules and declarations stay", () => {
  const css = `:host { display: block; }
/* heading */
h1,
.lead { margin: 0; }
.actions a:hover { color: red; }`;
  assert.equal(withSlottedRules(css), `:host { display: block; }
/* heading */
h1,
.lead, ::slotted(h1), ::slotted(.lead) { margin: 0; }
.actions a:hover, .actions ::slotted(a:hover) { color: red; }`);
});

test("a list that already has the twin is left as written", () => {
  const css = "h1, ::slotted(h1) { margin: 0; }\n.actions a,\n.actions ::slotted(a) { color: red; }";
  assert.equal(withSlottedRules(css), css);
});

test("grouping rules are entered, other at-rules and custom property blocks skipped", () => {
  const css = `@media (min-width: 40em) { h2 { font-size: 2rem; } }
@layer base { @supports (display: grid) { .grid { display: grid; } } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@font-face { font-family: X; src: url("x;{.woff"); }
@import "a.css";
p { --shape: { a: b }; color: red; }`;
  assert.equal(withSlottedRules(css), `@media (min-width: 40em) { h2, ::slotted(h2) { font-size: 2rem; } }
@layer base { @supports (display: grid) { .grid, ::slotted(.grid) { display: grid; } } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@font-face { font-family: X; src: url("x;{.woff"); }
@import "a.css";
p, ::slotted(p) { --shape: { a: b }; color: red; }`);
});

test("nested rules gain twins unless they start from the parent", () => {
  const css = `.card {
  padding: 1rem;
  h3 { margin: 0; }
  &:hover { color: red; }
  @media (width > 40em) { p { color: blue; } }
  gap: 1rem;
}`;
  assert.equal(withSlottedRules(css), `.card, ::slotted(.card) {
  padding: 1rem;
  h3, ::slotted(h3) { margin: 0; }
  &:hover { color: red; }
  @media (width > 40em) { p, ::slotted(p) { color: blue; } }
  gap: 1rem;
}`);
});

test("strings and comments holding braces do not end a rule", () => {
  const css = `a[title="}"] { content: "{"; }\nb /* { */ { color: red; }`;
  assert.equal(withSlottedRules(css), `a[title="}"], ::slotted(a[title="}"]) { content: "{"; }\nb /* { */, ::slotted(b) { color: red; }`);
});
