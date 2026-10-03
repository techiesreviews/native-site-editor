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
  assert.equal(slotConditionVisible(targets[3], new Set()), undefined);
  assert.equal(slotConditionVisible(targets[4], new Set(["missing"])), undefined);
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

test("unsupported empty wrappers and unknown requirements require explicit removal", () => {
  for (const value of ["", "missing", "a missing"]) {
    const template = `<slot name="a"></slot><div data-if="${value}">Keep</div>`;
    const target = readSlotConditions(template).targets[1];
    assert.ok(target.problem);
    assert.equal(slotConditionVisible(target, new Set(["a", ""])), undefined);
    assert.throws(() => planSlotCondition(template, target.node, ["a"]), /Unsupported|Unknown/);
    assert.equal(planSlotCondition(template, target.node, undefined).text, '<div >');
  }
});
test("raw whitespace slot names block incompatible authoring without changing source", () => {
  const template = '<slot name=" a "></slot><slot name="b"></slot>';
  const model = readSlotConditions(template);
  assert.deepEqual(model.slotNames, [" a ", "b"]);
  assert.match(model.authoringProblem!, /exact name/);
  assert.throws(() => planSlotCondition(template, model.targets[1].node, ["b"]), /Unsupported slot name/);
});
test("Unicode tag names preserve condition offsets and stray slash resumes HTML attributes", () => {
  const unicode = '<!-- İstanbul --><slot name="a"></slot><X-İ data-if="a" title="Exact">İstanbul</X-İ>';
  const unicodeTarget = readSlotConditions(unicode).targets[1];
  const unicodePlan = planSlotCondition(unicode, unicodeTarget.node, undefined);
  assert.equal(unicodePlan.start, unicode.indexOf('<X-İ'));
  assert.equal(unicodePlan.expected, '<X-İ data-if="a" title="Exact">');
  assert.equal(unicode.slice(0, unicodePlan.start) + unicodePlan.text + unicode.slice(unicodePlan.end), unicode.replace(' data-if="a"', ' '));
  const element = parseSource(unicode).filter(node => node.type === 'element')[1];
  assert.equal(element.name, 'x-İ');
  assert.equal(unicode.slice(element.start, element.end), '<X-İ data-if="a" title="Exact">İstanbul</X-İ>');
  const template = '<slot name="x"></slot><div / data-if="x" keep=raw>Keep</div>';
  const target = readSlotConditions(template).targets[1];
  assert.deepEqual(target.names, ["x"]);
  const plan = planSlotCondition(template, target.node, ["x"]);
  assert.equal(plan.text, '<div / data-if="x" keep=raw>');
  assert.equal(planSlotCondition(template, target.node, undefined).text, '<div /  keep=raw>');
  assert.throws(() => planSlotCondition('<slot name="x" / data-if="x" / data-if="x">', [0], ["x"]), /Duplicate/);
});
