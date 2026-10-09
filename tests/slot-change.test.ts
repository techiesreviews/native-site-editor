import assert from "node:assert/strict";
import { test } from "node:test";
import { slotChange, slotChipState } from "../src/page-builder/component-model";

const source = `<section><slot name="title"><h2>Title</h2></slot><p class="lede">Intro</p><div><slot><card-project></card-project><card-project></card-project></slot></div></section>`;
function change(node: number[], action: "toggle" | "rename" = "toggle", name = "heading") {
  const chip = slotChipState(source, node)!;
  return slotChange(source, { node, chip, action, name });
}

test("a fixed part becomes a slot, selected inside it", () => {
  assert.deepEqual(change([0, 1]), {
    source: source.replace('<p class="lede">Intro</p>', '<slot name="text"><p class="lede">Intro</p></slot>'),
    change: { kind: "made-slot", name: "text", part: [0, 1] }, select: [0, 1, 0],
  });
});
test("a named slot unwraps while its selected descendant stays selected", () => {
  assert.deepEqual(change([0, 0, 0]), {
    source: source.replace('<slot name="title"><h2>Title</h2></slot>', '<h2>Title</h2>'),
    change: { kind: "made-fixed", name: "title" }, select: [0, 0],
  });
  assert.deepEqual(change([0, 0]), change([0, 0, 0]));
});
test("an unnamed items slot unwraps all children, preserving the selected item", () => {
  assert.deepEqual(change([0, 2, 0, 1]), {
    source: source.replace('<slot><card-project></card-project><card-project></card-project></slot>', '<card-project></card-project><card-project></card-project>'),
    change: { kind: "made-fixed", name: "" }, select: [0, 2, 1],
  });
});
test("rename changes only the name, keeping the selected path; unnamed slots gain a name", () => {
  assert.deepEqual(change([0, 0, 0], "rename"), {
    source: source.replace('name="title"', 'name="heading"'),
    change: { kind: "renamed", from: "title", to: "heading" }, select: [0, 0, 0],
  });
  assert.deepEqual(change([0, 2, 0, 0], "rename", "projects"), {
    source: source.replace('<slot>', '<slot name="projects">'),
    change: { kind: "renamed", from: "", to: "projects" }, select: [0, 2, 0, 0],
  });
});
test("taken and unchanged names, fixed renames, and stale reports refuse without source", () => {
  for (const result of [change([0, 0, 0], "rename", "title"), change([0, 2, 0], "rename", "title"), change([0, 1], "rename")]) {
    assert.ok("error" in result);
    assert.ok(!("source" in result));
  }
  const chip = slotChipState(source, [0, 1])!;
  assert.ok("error" in slotChange(source, { node: [0, 0, 0], chip, action: "toggle" }));
  assert.ok("error" in slotChange(source, { node: [0, 9], chip, action: "toggle" }));
});

test("named items unwrap using the same rule, even when showing a page's count", () => {
  const template = `<div><slot name="projects"><card-project></card-project></slot></div>`;
  const templateOf = (tag: string) => tag === "card-project" ? '<article><slot name="title"><h3>Title</h3></slot></article>' : undefined;
  const chip = slotChipState(template, [0, 0, 0], templateOf)!;
  assert.equal(chip.state, "items");
  if (chip.state !== "items") throw new Error("Expected items slot");
  assert.deepEqual(slotChange(template, { node: [0, 0, 0], chip: { ...chip, count: 3 }, action: "toggle" }, templateOf), {
    source: `<div><card-project></card-project></div>`, change: { kind: "made-fixed", name: "projects" }, select: [0, 0],
  });
});
test("a changed name, slot path or state refuses the old report", () => {
  const node = [0, 0, 0];
  const chip = slotChipState(source, node)!;
  for (const changed of [source.replace('name="title"', 'name="heading"'), source.replace('<slot name="title">', '<slot>'), source.replace('<slot name="title"><h2>Title</h2></slot>', '<h2>Title</h2>')])
    assert.ok("error" in slotChange(changed, { node, chip, action: "toggle" }));
  assert.ok("error" in slotChange(source, { node, chip: { state: "slot", name: "title", slot: [0, 1] }, action: "toggle" }));
});
test("unwrapping an empty slot selects its parent; deep fallback paths lose only the slot", () => {
  const empty = `<div><slot name="title"></slot></div>`;
  assert.deepEqual(slotChange(empty, { node: [0, 0], chip: slotChipState(empty, [0, 0])!, action: "toggle" }), {
    source: "<div></div>", change: { kind: "made-fixed", name: "title" }, select: [0],
  });
  const deep = `<div><slot name="title"><h2><em>Title</em></h2></slot></div>`;
  const result = slotChange(deep, { node: [0, 0, 0, 0], chip: slotChipState(deep, [0, 0, 0, 0])!, action: "toggle" });
  assert.ok("select" in result);
  assert.deepEqual(result.select, [0, 0, 0]);
});
test("a slot on its own lines unwraps to its children at its indentation; a part over lines wraps back to the same source", () => {
  const before = `<section>
  <div class="cards">
    <slot>
      <card-project>
        <h3 slot="title">One</h3>
      </card-project>

      <card-project></card-project>
    </slot>
  </div>
</section>
`;
  const fixed = `<section>
  <div class="cards">
    <card-project>
      <h3 slot="title">One</h3>
    </card-project>

    <card-project></card-project>
  </div>
</section>
`;
  const unwrapped = slotChange(before, { node: [0, 0, 0, 0], chip: slotChipState(before, [0, 0, 0, 0])!, action: "toggle" });
  assert.ok("source" in unwrapped);
  assert.equal(unwrapped.source, fixed);
  const card = `<div>
  <article>
    <p>One</p>
  </article>
</div>`;
  const wrapped = slotChange(card, { node: [0, 0], chip: slotChipState(card, [0, 0])!, action: "toggle" });
  assert.ok("source" in wrapped);
  assert.equal(wrapped.source, `<div>
  <slot name="content">
    <article>
      <p>One</p>
    </article>
  </slot>
</div>`);
  const back = slotChange(wrapped.source, { node: wrapped.select, chip: slotChipState(wrapped.source, wrapped.select)!, action: "toggle" });
  assert.ok("source" in back);
  assert.equal(back.source, card);
});
test("a fixed part takes the name its chip offers, unless a slot has it; text that keeps its spaces is left as it is", () => {
  const chip = slotChipState(source, [0, 1])!;
  assert.equal(chip.state, "fixed");
  const named = slotChange(source, { node: [0, 1], chip: { ...chip, name: "lead" }, action: "toggle" });
  assert.ok("source" in named);
  assert.equal(named.source, source.replace('<p class="lede">Intro</p>', '<slot name="lead"><p class="lede">Intro</p></slot>'));
  assert.deepEqual(named.change, { kind: "made-slot", name: "lead", part: [0, 1] });
  assert.ok("error" in slotChange(source, { node: [0, 1], chip: { ...chip, name: "title" }, action: "toggle" }));
  const pre = `<div>\n  <pre>first\n  second</pre>\n</div>`;
  const wrapped = slotChange(pre, { node: [0, 0], chip: slotChipState(pre, [0, 0])!, action: "toggle" });
  assert.ok("source" in wrapped);
  assert.match(wrapped.source, /<slot name="[^"]+"><pre>first\n  second<\/pre><\/slot>/);
  const back = slotChange(wrapped.source, { node: wrapped.select, chip: slotChipState(wrapped.source, wrapped.select)!, action: "toggle" });
  assert.ok("source" in back);
  assert.equal(back.source, pre);
});
