import test from "node:test";
import assert from "node:assert/strict";
import { createMediaHistoryHome } from "../src/page-builder/media-history-home";

test("held steps adopt oldest first, once, with their undo and redo", async () => {
  const home = createMediaHistoryHome(), calls: string[] = [];
  for (const name of ["first", "second"]) {
    assert.equal(home.hold("site", () => { calls.push(`undo ${name}`); return true; }, async () => { calls.push(`redo ${name}`); return true; }), true);
  }
  const steps: { undo: () => boolean | Promise<boolean>; redo: () => boolean | Promise<boolean> }[] = [];
  home.adopt("site", (undo, redo) => { steps.push({ undo, redo }); return true; });
  home.adopt("site", () => { assert.fail("already adopted"); });
  assert.equal(steps.length, 2);
  for (const step of steps) { assert.equal(await step.undo(), true); assert.equal(await step.redo(), true); }
  assert.deepEqual(calls, ["undo first", "redo first", "undo second", "redo second"]);
});

test("identity mismatches are dropped permanently", () => {
  const home = createMediaHistoryHome();
  home.hold("old", () => true, () => true);
  home.adopt("new", () => { assert.fail("wrong identity"); });
  home.adopt("old", () => { assert.fail("discarded step"); });
});

test("failed registration keeps the step for another adoption", () => {
  const home = createMediaHistoryHome(), undo = () => true, redo = () => true;
  home.hold("site", undo, redo);
  home.adopt("site", () => false);
  let recorded = 0;
  home.adopt("site", (u, r) => { assert.equal(u, undo); assert.equal(r, redo); recorded++; return true; });
  assert.equal(recorded, 1);
});

test("a refused step stays held with every later one, in order", () => {
  const home = createMediaHistoryHome(), actions = [() => true, () => true, () => true];
  for (const action of actions) home.hold("site", action, action);
  const first: unknown[] = [];
  home.adopt("site", undo => { if (undo === actions[1]) return false; first.push(undo); return true; });
  assert.deepEqual(first, [actions[0]]);
  const second: unknown[] = [];
  home.adopt("site", undo => { second.push(undo); return true; });
  assert.deepEqual(second, [actions[1], actions[2]]);
});
