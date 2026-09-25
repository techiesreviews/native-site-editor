import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layerRanks,
  listSpecificity,
  resolveCascade,
  specificity,
  splitSelectorList,
  type CascadeRule,
} from "../shared/cascade.ts";

test("specificity counts ids, classes, types and pseudo-elements", () => {
  assert.deepEqual(specificity("a"), [0, 0, 1]);
  assert.deepEqual(specificity("p a"), [0, 0, 2]);
  assert.deepEqual(specificity(".card__title"), [0, 1, 0]);
  assert.deepEqual(specificity("#main .card > h2 + p"), [1, 1, 2]);
  assert.deepEqual(specificity("a[href^='http']:hover"), [0, 2, 1]);
  assert.deepEqual(specificity("*"), [0, 0, 0]);
  assert.deepEqual(specificity("li::marker"), [0, 0, 2]);
  assert.deepEqual(specificity("p:first-line"), [0, 0, 2]);
  assert.deepEqual(specificity("svg|circle"), [0, 0, 1]);
  assert.deepEqual(specificity("[data-x=\"a]b\"] .y"), [0, 2, 0]);
});

test("specificity of functional pseudo-classes takes their most specific argument", () => {
  assert.deepEqual(specificity(":where(#a, .b) p"), [0, 0, 1]);
  assert.deepEqual(specificity(":is(#a, .b) p"), [1, 0, 1]);
  assert.deepEqual(specificity("a:not(.x, p)"), [0, 1, 1]);
  assert.deepEqual(specificity("section:has(> h2, #x)"), [1, 0, 1]);
  assert.deepEqual(specificity("li:nth-child(2n + 1 of .item)"), [0, 2, 1]);
  assert.deepEqual(specificity("li:nth-child(odd)"), [0, 1, 1]);
  assert.deepEqual(specificity(":is(:is(.a .b), p)"), [0, 2, 0]);
});

test("specificity of shadow selectors and resolved nesting", () => {
  assert.deepEqual(specificity(":host"), [0, 1, 0]);
  assert.deepEqual(specificity(":host(.dark)"), [0, 2, 0]);
  assert.deepEqual(specificity(":host-context(main)"), [0, 1, 1]);
  assert.deepEqual(specificity("::slotted(p)"), [0, 0, 2]);
  assert.deepEqual(specificity("slot[name=a]::slotted(.x)"), [0, 2, 2]);
  // `.card { & a {} }` as the runtime resolves it: & is :is(<parent list>).
  assert.deepEqual(specificity(":is(.card, #hero) a"), [1, 0, 1]);
  assert.deepEqual(listSpecificity("a, .b, #c d"), [1, 0, 1]);
  assert.deepEqual(splitSelectorList("a, :is(b, c), [x=','] d"), ["a", ":is(b, c)", "[x=','] d"]);
});

test("layer ranks follow first declaration, with nested layers inside their parent", () => {
  const rank = layerRanks([["reset"], ["base"], ["base", "type"], ["base", "links"], ["components"]]);
  assert.deepEqual(rank([]), [Infinity]);
  assert.deepEqual(rank(["reset"]), [0, Infinity]);
  assert.deepEqual(rank(["base"]), [1, Infinity]);
  assert.deepEqual(rank(["base", "links"]), [1, 1, Infinity]);
  assert.deepEqual(rank(["components"]), [2, Infinity]);
});

// One declaration per rule, for the cascade tests below.
function rule(property: string, value: string, extra: Partial<CascadeRule> & { important?: boolean; computed?: string } = {}): CascadeRule {
  const { important = false, computed, ...rest } = extra;
  return {
    context: 0,
    specificity: [0, 0, 1],
    order: 0,
    ...rest,
    declarations: [{ property, value, important, computed: computed ?? value }],
  };
}
const winner = (rules: CascadeRule[], input: { layers?: Record<number, string[][]>; computed?: Record<string, string> } = {}) => {
  const result = resolveCascade({ rules, ...input });
  const found = Object.values(result.winners)[0];
  return { index: found?.rule, result };
};

test("without layers: specificity, then order of appearance", () => {
  const rules = [
    rule("color", "red", { specificity: [0, 1, 0], order: 0 }),
    rule("color", "blue", { specificity: [0, 0, 2], order: 1 }),
    rule("color", "green", { specificity: [0, 1, 0], order: 2 }),
  ];
  const { index, result } = winner(rules, { computed: { color: "green" } });
  assert.equal(index, 2);
  assert.deepEqual(result.rules, ["overridden", "overridden", "wins"]);
  assert.deepEqual(result.order, [2, 0, 1]);
});

test("unlayered beats every layer; a later layer beats an earlier one whatever the specificity", () => {
  const layers = { 0: [["elements"], ["components"]] };
  const rules = [
    rule("color", "red", { layer: ["components"], specificity: [1, 0, 0], order: 0 }),
    rule("color", "blue", { layer: ["elements"], specificity: [1, 1, 0], order: 1 }),
  ];
  assert.equal(winner(rules, { layers, computed: { color: "red" } }).index, 0);
  // The starter case: layered `p a` loses to a plain unlayered `a`.
  const starter = [
    rule("color", "green", { layer: ["elements"], specificity: [0, 0, 2], order: 0 }),
    rule("color", "gray", { specificity: [0, 0, 1], order: 1 }),
  ];
  const { index, result } = winner(starter, { layers: { 0: [["elements"]] }, computed: { color: "gray" } });
  assert.equal(index, 1);
  assert.deepEqual(result.declarations, [["overridden"], ["wins"]]);
});

test("rules directly in a layer beat its nested layers", () => {
  const layers = { 0: [["outer"], ["outer", "inner"]] };
  const rules = [
    rule("color", "red", { layer: ["outer"], order: 0 }),
    rule("color", "blue", { layer: ["outer", "inner"], order: 1, specificity: [0, 5, 0] }),
  ];
  assert.equal(winner(rules, { layers, computed: { color: "red" } }).index, 0);
});

test("anonymous layers are ordered like named ones", () => {
  const layers = { 0: [["#1"], ["named"], ["#2"]] };
  const rules = [
    rule("color", "a", { layer: ["#2"], order: 2 }),
    rule("color", "b", { layer: ["named"], order: 1, specificity: [3, 0, 0] }),
    rule("color", "c", { layer: ["#1"], order: 0, specificity: [3, 0, 0] }),
  ];
  assert.equal(winner(rules, { layers, computed: { color: "a" } }).index, 0);
});

test("!important reverses layers: earlier layers win, and layered beats unlayered", () => {
  const layers = { 0: [["reset"], ["theme"]] };
  const rules = [
    rule("color", "unlayered", { important: true, order: 3, specificity: [1, 0, 0] }),
    rule("color", "theme", { layer: ["theme"], important: true, order: 2 }),
    rule("color", "reset", { layer: ["reset"], important: true, order: 1 }),
    rule("color", "normal", { order: 4, specificity: [9, 9, 9] }),
  ];
  const { index, result } = winner(rules, { layers, computed: { color: "reset" } });
  assert.equal(index, 2);
  assert.deepEqual(result.rules, ["overridden", "overridden", "wins", "overridden"]);
  // Nested: under !important, a nested layer beats its parent's own rules.
  const nested = [
    rule("color", "outer", { layer: ["a"], important: true, order: 1 }),
    rule("color", "inner", { layer: ["a", "b"], important: true, order: 0 }),
  ];
  assert.equal(winner(nested, { layers: { 0: [["a"], ["a", "b"]] }, computed: { color: "inner" } }).index, 1);
});

test("context: the outer tree wins normal declarations, the inner tree wins !important ones", () => {
  // A slotted element: the page's rule (context 0) beats `::slotted()` (context 1) whatever the specificity.
  const slotted = [
    rule("color", "page", { context: 0, specificity: [0, 0, 1] }),
    rule("color", "slotted", { context: 1, specificity: [0, 1, 2] }),
  ];
  assert.equal(winner(slotted, { computed: { color: "page" } }).index, 0);
  const important = [
    rule("color", "page", { context: 0, important: true }),
    rule("color", "slotted", { context: 1, important: true }),
  ];
  assert.equal(winner(important, { computed: { color: "slotted" } }).index, 1);
  // A host: the page's rule beats `:host` in its own shadow root.
  const host = [
    rule("display", "block", { context: 2, specificity: [0, 1, 0], order: 5 }),
    rule("display", "grid", { context: 0, specificity: [0, 0, 1], order: 0 }),
  ];
  assert.equal(winner(host, { computed: { display: "grid" } }).index, 1);
});

test("the style attribute beats rules of its tree, even unlayered ones, but not outer-context importance", () => {
  const rules = [
    rule("color", "rule", { specificity: [5, 0, 0] }),
    rule("color", "inline", { inline: true }),
  ];
  assert.equal(winner(rules, { computed: { color: "inline" } }).index, 1);
  const important = [
    rule("color", "rule", { important: true }),
    rule("color", "inline", { inline: true }),
  ];
  assert.equal(winner(important, { computed: { color: "rule" } }).index, 0);
});

test("a disagreeing or missing computed value leaves the property unverified", () => {
  const rules = [
    rule("color", "red", { order: 0 }),
    rule("color", "blue", { order: 1 }),
  ];
  const { index, result } = winner(rules, { computed: { color: "purple" } });
  assert.equal(index, undefined);
  assert.deepEqual(result.declarations, [["unverified"], ["unverified"]]);
  assert.deepEqual(result.rules, ["neutral", "neutral"]);
  const missing = resolveCascade({ rules, computed: {} });
  assert.deepEqual(missing.declarations, [["unverified"], ["unverified"]]);
  // With no computed data at all, the model's answer stands.
  assert.deepEqual(resolveCascade({ rules }).declarations, [["overridden"], ["wins"]]);
});

test("a @container declaration the computed value rules out is inactive, and the next one wins", () => {
  const rules = [
    rule("color", "base", { order: 0 }),
    rule("color", "wide", { order: 1, possible: true }),
  ];
  const off = resolveCascade({ rules, computed: { color: "base" } });
  assert.deepEqual(off.declarations, [["wins"], ["inactive"]]);
  const on = resolveCascade({ rules, computed: { color: "wide" } });
  assert.deepEqual(on.declarations, [["overridden"], ["wins"]]);
});

test("state rules stay out of the resting cascade but settle the check while their state holds", () => {
  const rules = [
    rule("color", "gray", { order: 0 }),
    rule("color", "green", { order: 1, specificity: [0, 1, 1], state: true, current: true }),
    rule("color", "blue", { order: 2, layer: ["elements"] }),
  ];
  const layers = { 0: [["elements"]] };
  const hovered = resolveCascade({ rules, layers, computed: { color: "green" } });
  assert.deepEqual(hovered.declarations, [["wins"], ["state"], ["overridden"]]);
  assert.deepEqual(hovered.order, [0, 1, 2]);
  const resting = resolveCascade({ rules: [rules[0], { ...rules[1], current: false }, rules[2]], layers, computed: { color: "gray" } });
  assert.deepEqual(resting.declarations, [["wins"], ["state"], ["overridden"]]);
});

test("a rule is overridden only when every declaration is; display order puts deciding rules first", () => {
  const rules: CascadeRule[] = [
    { context: 0, specificity: [0, 1, 0], order: 0, declarations: [
      { property: "color", value: "a", important: false, computed: "a" },
      { property: "margin-top", value: "0px", important: false, computed: "0px" },
    ] },
    { context: 0, specificity: [0, 1, 0], order: 1, declarations: [
      { property: "margin-top", value: "4px", important: false, computed: "4px" },
    ] },
    { context: 0, specificity: [0, 0, 1], order: 2, declarations: [
      { property: "color", value: "b", important: false, computed: "b" },
    ] },
    { context: 0, specificity: [0, 0, 0], order: 3, declarations: [] },
  ];
  const result = resolveCascade({ rules, computed: { color: "a", "margin-top": "4px" } });
  assert.deepEqual(result.rules, ["wins", "wins", "overridden", "neutral"]);
  assert.deepEqual(result.order, [1, 0, 3, 2]);
  assert.deepEqual(result.winners, { color: { rule: 0, declaration: 0 }, "margin-top": { rule: 1, declaration: 0 } });
});
