import assert from "node:assert/strict";
import { test } from "node:test";
import { sections, matchesStyleSearch } from "../src/components/style-fields";
test("catalogue uses pixel defaults only for individual length values", () => {
  const fields = sections.flatMap(section => section.fields);
  for (const property of ["line-height", "flex-grow", "flex-shrink", "order", "z-index", "aspect-ratio", "grid-template-rows", "object-position"]) assert.equal(fields.find(field => field.property === property)?.unit, undefined, property);
  for (const property of ["top", "min-height", "row-gap", "word-spacing"]) assert.equal(fields.find(field => field.property === property)?.unit, true, property);
  assert.equal(new Set(fields.map(field => field.property)).size, fields.length);
});
test("style search matches native properties, section terms and familiar aliases", () => {
  assert.ok(matchesStyleSearch("round corners", "Top left radius", "border-top-left-radius", "Border"));
  assert.ok(matchesStyleSearch("grid rows", "Rows", "grid-template-rows", "Layout"));
  assert.ok(matchesStyleSearch("position", "Top", "top", "Position"));
  assert.ok(!matchesStyleSearch("unknown", "Top", "top", "Position"));
});
