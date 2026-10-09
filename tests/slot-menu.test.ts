import assert from "node:assert/strict";
import test from "node:test";
import { slotChipState } from "../src/page-builder/component-model.ts";
import { slotMenuItems } from "../src/page-builder/slot-menu.ts";

test("fixed parts offer only Make slot; named and items slots offer rename and removal", () => {
  assert.deepEqual(slotMenuItems({ state: "fixed", name: "text", part: [0, 1] }), ["Make slot"]);
  assert.deepEqual(slotMenuItems({ state: "slot", name: "title", slot: [0, 0] }), ["Rename slot", "Remove slot"]);
  for (const name of ["", "projects"]) {
    assert.deepEqual(slotMenuItems({ state: "items", name, slot: [0, 2], count: 1 }), ["Rename slot", "Remove slot"]);
  }
  assert.deepEqual(slotMenuItems(undefined), []);
});

test("nested component contents cannot inherit the enclosing items slot's menu", () => {
  const source = '<section><slot><card-project><p slot="body">Nested fill</p></card-project></slot></section>';
  assert.deepEqual(slotMenuItems(slotChipState(source, [0, 0, 0, 0])), []);
  assert.deepEqual(slotMenuItems(slotChipState(source, [0, 0, 0])), ["Rename slot", "Remove slot"]);
  assert.deepEqual(slotMenuItems(slotChipState(source, [0])), []);
});
