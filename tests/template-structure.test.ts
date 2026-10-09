import assert from "node:assert/strict";
import test from "node:test";
import { slotChipState, templateRoot, templateStructure } from "../src/page-builder/component-model.ts";

test("only a single non-slot element is a template root", () => {
  assert.deepEqual(templateRoot('<!-- Template -->\n<section><section>Child</section></section>\n'), [0]);
  assert.deepEqual(templateRoot('<article><slot></slot></article>'), [0]);
  for (const source of ['', 'Text only', '<slot><section>Fallback</section></slot>', '<section></section><article></article>'])
    assert.equal(templateRoot(source), undefined);
});

test("slot wrappers disappear; the first fallback carries the slot's chip at its source path", () => {
  const source = '<section><slot name="title"><h2>Title</h2><p>More</p></slot><p class="lede">Fixed</p></section>';
  const rows = templateStructure(source);
  assert.deepEqual(rows.map(row => [row.tag, row.node, row.chips]), [
    ["h2", [0, 0, 0], [[0, 0, 0]]], ["p", [0, 0, 1], []], ["p", [0, 1], [[0, 1]]],
  ]);
  assert.equal(slotChipState(source, rows[0].chips[0])?.state, "slot");
  assert.equal(slotChipState(source, rows[2].chips[0])?.state, "fixed");
});

test("text-only and empty slots put their badges on the holder; a root empty slot gets an Empty row", () => {
  const source = '<section><p><slot name="x">Text</slot></p><p class="actions"><slot name="link"></slot></p><slot name="empty"></slot></section>';
  const rows = templateStructure(source);
  assert.deepEqual(rows.map(row => [row.tag, row.text, row.node, row.chips]), [
    ["p", "Text", [0, 0], [[0, 0, 0]]], ["p", "", [0, 1], [[0, 1, 0]]], ["slot", "", [0, 2], [[0, 2]]],
  ]);
  assert.deepEqual(rows.map(row => slotChipState(source, row.chips[0])?.name), ["x", "link", "empty"]);
});

test("items carry their chip on the first nested instance, which stays a leaf with its template heading", () => {
  const source = '<section><div><slot><card-project><p>Assigned</p></card-project><card-project></card-project></slot></div></section>';
  const templateOf = (tag: string) => tag === "card-project" ? '<article><h3>Untitled project</h3><p>Details</p></article>' : undefined;
  const rows = templateStructure(source, templateOf);
  assert.deepEqual(rows[0].chips, []);
  const cards = rows[0].children;
  assert.equal(cards[0].heading, "Untitled project");
  assert.deepEqual(cards.map(row => row.children), [[], []]);
  assert.deepEqual(cards.map(row => row.chips), [[[0, 0, 0, 0]], []]);
  assert.deepEqual(slotChipState(source, cards[0].chips[0], templateOf), { state: "items", name: "", slot: [0, 0, 0], count: 2 });
});

test("inline text runs collapse whitespace and entities, preserve breaks and cap snippets at 80 characters", () => {
  const rows = templateStructure('<section><p> Hello <strong>bold &amp; <em>fine</em></strong><br> world </p><div><a>One</a><a>Two</a></div><p>' + 'x'.repeat(100) + '</p></section>');
  assert.equal(rows[0].text, "Hello bold & fine world");
  assert.deepEqual(rows[0].children, []);
  assert.equal(rows[1].children.length, 2);
  assert.equal(rows[2].text.length, 80);
});

test("multiple roots stay rows; slot holders, table cells and nested instance parts carry no fixed chips", () => {
  const rows = templateStructure('<div><slot name="title"><h2>Title</h2></slot></div><table><tr><td>Cell</td></tr></table><card-project><p>Nested</p></card-project>');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.chips), [[], [], []]);
  assert.deepEqual(rows[1].children[0].children[0].chips, []);
  assert.deepEqual(rows[2].children, []);
});

test("container headings follow fallback ownership instead of taking a nested section's heading", () => {
  const rows = templateStructure('<main><div><slot name="title"><h2>Own</h2></slot></div><section><h2>Nested</h2></section></main>');
  assert.equal(rows[0].heading, "Own");
  assert.equal(rows[1].heading, "Nested");
});

test("a slot inside a nested instance's content badges that instance's row (the card's note)", () => {
  const source = '<article><card-note><slot name="note" slot="text"><p>Project</p></slot></card-note><slot name="title"><h3>Untitled</h3></slot></article>';
  const rows = templateStructure(source, (tag) => tag === "card-note" ? '<slot name="text"><p>Project</p></slot>' : undefined);
  assert.deepEqual(rows.map(row => [row.tag, row.chips]), [["card-note", [[0, 0, 0]]], ["h3", [[0, 1, 0]]]]);
  assert.deepEqual(slotChipState(source, rows[0].chips[0]), { state: "slot", name: "note", slot: [0, 0, 0] });
});
