import assert from "node:assert/strict";
import test from "node:test";
import { descendants, elementText, elementTextEdit, elementTextWrite, parseSource, sourceChange, type RangeEdit } from "../src/page-builder/component-model.ts";

// Slice 102: a Structure row edits a plain element's text in place, by the slot editor's rules.
const first = (source: string, name: string) => [...descendants(parseSource(source))].find(el => el.name === name)!;
const apply = (source: string, edit: RangeEdit | { error: string }) => {
  assert.ok(!("error" in edit), "error" in edit ? edit.error : "");
  return source.slice(0, edit.start) + edit.text + source.slice(edit.end);
};

test("a heading's text edits as one line, escaped", () => {
  const page = "<main>\n  <h1 class=\"hero\">Hello world</h1>\n</main>";
  const h1 = first(page, "h1");
  assert.deepEqual(elementText(page, h1), { lines: "Hello world", breaks: true, plain: true });
  assert.equal(apply(page, elementTextEdit(page, h1, "Hello <there> & you")), "<main>\n  <h1 class=\"hero\">Hello &lt;there&gt; &amp; you</h1>\n</main>");
  // Unchanged text is an empty edit.
  const same = elementTextEdit(page, h1, "Hello world");
  assert.ok(!("error" in same) && same.text === "" && same.start === same.end);
});

test("a paragraph with a link keeps its link when the text around it changes", () => {
  const page = "<p>Read <a href=\"/about\">about us</a> today.</p>";
  const p = first(page, "p");
  assert.deepEqual(elementText(page, p), { lines: "Read about us today.", breaks: true, plain: false });
  assert.equal(apply(page, elementTextEdit(page, p, "Read about us now.")), "<p>Read <a href=\"/about\">about us</a> now.</p>");
  assert.equal(apply(page, elementTextEdit(page, p, "Read about them today.")), "<p>Read <a href=\"/about\">about them</a> today.</p>");
  const across = elementTextEdit(page, p, "Rex us today.");
  assert.ok("error" in across, "a change cutting into the link is refused, not flattened");
});

test("a button's label and a link's text edit", () => {
  const page = "<button type=\"button\">Sign up</button><a class=\"button\" href=\"/go\">Start <strong>now</strong></a>";
  assert.equal(apply(page, elementTextEdit(page, first(page, "button"), "Join")), "<button type=\"button\">Join</button><a class=\"button\" href=\"/go\">Start <strong>now</strong></a>");
  assert.equal(apply(page, elementTextEdit(page, first(page, "a"), "Begin now")), "<button type=\"button\">Sign up</button><a class=\"button\" href=\"/go\">Begin <strong>now</strong></a>");
});

test("line breaks are the element's <br>s, spelled as it spells them", () => {
  const page = "<p>One<br/>Two</p>";
  const p = first(page, "p");
  assert.deepEqual(elementText(page, p), { lines: "One\nTwo", breaks: true, plain: true });
  assert.equal(apply(page, elementTextEdit(page, p, "One\nTwo\nThree")), "<p>One<br/>Two<br/>Three</p>");
});

test("elements holding more than text have no text field", () => {
  const page = "<section><h2>Title</h2></section><p>Pic <img src=\"/a.png\" alt=\"\"></p><div><p>Inner</p></div><h3>Open";
  assert.equal(elementText(page, first(page, "section")), undefined);
  assert.equal(elementText(page, first(page, "p")), undefined);
  assert.equal(elementText(page, first(page, "div")), undefined);
  assert.equal(elementText(page, first(page, "h3")), undefined, "no end tag: nothing to place the text in");
  assert.ok("error" in elementTextEdit(page, first(page, "section"), "x"));
});

test("a field's writes are worked out from the text it opened on, so steps on the way need not place by themselves", () => {
  const opening = "<p>Read <a href=\"/about\">about us</a> today.</p>";
  const p = first(opening, "p");
  // "today." taken out, then "now." typed letter by letter: "Read about us n" alone
  // cannot be placed from "Read about us " (the space sits after the link).
  let current = opening;
  for (const text of ["Read about us ", "Read about us n", "Read about us no", "Read about us now."]) current = apply(current, elementTextWrite(opening, p, current, text));
  assert.equal(current, "<p>Read <a href=\"/about\">about us</a> now.</p>");
  // Typing the first text again takes it all back.
  assert.equal(apply(current, elementTextWrite(opening, p, current, "Read about us today.")), opening);
  assert.ok("error" in elementTextWrite(opening, p, current, "Rex us today."));
});

test("sourceChange is the one range between two sources", () => {
  assert.deepEqual(sourceChange("abcdef", "abXYef"), { start: 2, end: 4, text: "XY" });
  assert.deepEqual(sourceChange("same", "same"), { start: 4, end: 4, text: "" });
});
