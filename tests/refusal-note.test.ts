import { strict as assert } from "node:assert";
import { test } from "node:test";
import { refusalNotePlan } from "../src/components/refusal-note";

const base = { viewport: { width: 800, height: 600 }, size: { width: 240, height: 60 } };
const editBar = { left: 120, top: 100, width: 300, height: 32 };
const canvas = { left: 320, top: 50, width: 480, height: 550 };

test("explicit history control wins; hidden control falls back to edit bar, canvas, viewport", () => {
  const anchor = { left: 600, top: 200, width: 24, height: 24 };
  assert.deepEqual(refusalNotePlan({ ...base, anchor, editBar, canvas }), { show: true, left: 552, top: 232, duration: 4000 });
  assert.equal(refusalNotePlan({ ...base, editBar, canvas }).top, 140);
  assert.equal(refusalNotePlan({ ...base, canvas }).top, 58);
  assert.equal(refusalNotePlan(base).top, 8);
});

test("drop follows pointer; note flips above the bottom and clamps every viewport edge", () => {
  assert.equal(refusalNotePlan({ ...base, pointer: { x: 10, y: 10 }, editBar }).left, 24);
  assert.deepEqual(refusalNotePlan({ ...base, pointer: { x: 790, y: 590 } }), { show: true, left: 552, top: 520, duration: 4000 });
  assert.equal(refusalNotePlan({ ...base, pointer: { x: -100, y: -100 } }).top, 8);
  assert.equal(refusalNotePlan({ ...base, pointer: { x: -100, y: -100 } }).left, 8);
  assert.equal(refusalNotePlan({ ...base, size: { width: 900, height: 700 } }).left, 8);
});

test("an existing reason suppresses duplicate note; next action or four seconds dismisses", () => {
  assert.equal(refusalNotePlan({ ...base, visible: true }).show, false);
  assert.equal(refusalNotePlan({ ...base, action: true }).show, false);
  assert.equal(refusalNotePlan({ ...base, age: 3999 }).show, true);
  assert.equal(refusalNotePlan({ ...base, age: 4000 }).show, false);
  assert.equal(refusalNotePlan({ ...base, age: 1000 }).duration, 3000);
  assert.equal(refusalNotePlan({ ...base, age: 5000 }).duration, 0);
  assert.equal(refusalNotePlan(base).show, true);
});
