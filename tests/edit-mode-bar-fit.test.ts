import { test } from "node:test";
import assert from "node:assert/strict";
import { editModeBarFit } from "../src/page-builder/edit-mode-bar-fit.ts";

const needed = { full: 1000, note: 800, used: 700 };
test("shrinks the note, then usage, then wraps at exact boundaries", () => {
  for (const [width, stage] of [[1000, "full"], [999, "note"], [800, "note"], [799, "used"], [700, "used"], [699, "wrap"], [0, "wrap"]] as const)
    assert.equal(editModeBarFit(width, needed), stage);
});
test("uses measured content, skipping stages that save no room", () => {
  assert.equal(editModeBarFit(900, { ...needed, full: 1500, note: 1500 }), "used");
  assert.equal(editModeBarFit(1000, { full: 800, note: 800, used: 750 }), "full");
});

test("wraps when no stage fits and returns to full when space returns", () => {
  assert.equal(editModeBarFit(699, needed), "wrap");
  assert.equal(editModeBarFit(1000, needed), "full");
  assert.equal(editModeBarFit(500, { full: 700, note: 700, used: 700 }), "wrap");
});
