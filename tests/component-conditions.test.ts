import { test } from "node:test";
import assert from "node:assert/strict";
import { readSlotConditions, planSlotCondition, slotConditionVisible } from "../src/page-builder/component-conditions";
import { readInstance, slotStates, parseSource } from "../src/page-builder/component-model";
const source = `<article x='&amp;'\r\n data-key="keep"><slot name='a'>Fallback</slot><slot name="b"></slot><p DATA-IF = 'a&#32;b' class='unchanged'>wrapper</p></article>`;
test("guarded start tag edits preserve unrelated source bytes", () => {
  const model = readSlotConditions(source);
  const target = model.targets[2];
  const plan = planSlotCondition(source, target.node, ["b"]);
  assert.equal(plan.expectedSource, source);
  assert.equal(plan.expected, `<p DATA-IF = 'a&#32;b' class='unchanged'>`);
  assert.equal(plan.text, `<p data-if="b" class='unchanged'>`);
  const next = source.slice(0, plan.start) + plan.text + source.slice(plan.end);
  assert.equal(next, source.replace("DATA-IF = 'a&#32;b'", 'data-if="b"'));
  assert.equal(planSlotCondition(source, target.node, undefined).text, `<p  class='unchanged'>`);
  assert.throws(() => planSlotCondition(source, [99], ["a"]), /no longer exists/);
  assert.throws(() => planSlotCondition(source, target.node, ["a", "a"]), /Duplicate/);
  assert.throws(() => planSlotCondition(source, target.node, ["missing"]), /Unknown/);
});
test("AND truth table, bare slot, ordinary empty, unknown and fallback", () => {
  const template = `<article><slot name="a" data-if>Fallback</slot><slot name="b"></slot><p data-if="a b">Both</p><p data-if>Always</p><p data-if="missing">Unknown</p></article>`;
  const targets = readSlotConditions(template).targets;
  for (const [names, visible] of [[[], false], [["a"], false], [["b"], false], [["a", "b"], true]] as const)
    assert.equal(slotConditionVisible(targets[2], new Set(names)), visible);
  assert.equal(slotConditionVisible(targets[0], new Set()), false);
  assert.equal(slotConditionVisible(targets[0], new Set(["a"])), true);
  assert.equal(slotConditionVisible(targets[3], new Set()), true);
  assert.equal(slotConditionVisible(targets[4], new Set(["missing"])), false);
  const page = `<test-card></test-card>`;
  const element = parseSource(page)[0];
  assert.equal(element.type, "element");
  if (element.type === "element") assert.equal(slotStates(template, readInstance(page, { tag: element.tag, start: element.start, end: element.end, close: element.close })).get("a")?.shown, false);
});
test("ASCII attribute lexing preserves NBSP, entities, and rejects duplicate attributes", () => {
  const template = `<slot name='a' x\u00a0data-if='keep' data-if='a' />`;
  const target = readSlotConditions(template).targets[0];
  assert.equal(planSlotCondition(template, target.node, ["a"]).text, `<slot name='a' x\u00a0data-if='keep' data-if="a" />`);
  assert.throws(() => planSlotCondition(`<slot data-if data-if>`, [0], undefined), /Duplicate/);
  assert.equal(readSlotConditions(`<slot data-if>`).targets[0].names[0], "");
  assert.equal(planSlotCondition(`<slot>`, [0], [""]).text, `<slot data-if>`);
});
