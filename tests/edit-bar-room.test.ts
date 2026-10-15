import test from "node:test";
import assert from "node:assert/strict";
import { editBarPlacement, roomScroll } from "../src/components/edit-bar-placement.ts";

// After scrolling by roomScroll's answer, where the bar goes.
const after = (input: { selectionTop: number; selectionBottom: number; frameHeight: number; barHeight: number; inset?: number }) => {
  const dy = roomScroll(input);
  const moved = { ...input, selectionTop: input.selectionTop - dy, selectionBottom: input.selectionBottom - dy, visible: true };
  return { dy, side: editBarPlacement(moved).side };
};

test("a selection with room above or below does not scroll", () => {
  assert.equal(roomScroll({ selectionTop: 10, selectionBottom: 230, frameHeight: 560, barHeight: 90 }), 0);
  assert.equal(roomScroll({ selectionTop: 300, selectionBottom: 520, frameHeight: 560, barHeight: 90 }), 0);
});

test("a covered picture scrolls the shorter way to clear room for the bar", () => {
  // 300 px picture in a 400 px canvas, the bar 60 px: 12 px down puts the bar under it.
  assert.deepEqual(after({ selectionTop: 40, selectionBottom: 340, frameHeight: 400, barHeight: 60 }), { dy: 12, side: "below" });
  // Just short of room above: 12 px up beats 52 px down.
  assert.deepEqual(after({ selectionTop: 60, selectionBottom: 380, frameHeight: 400, barHeight: 60 }), { dy: -12, side: "above" });
});

test("room above respects the site's sticky header", () => {
  const at = after({ selectionTop: 100, selectionBottom: 380, frameHeight: 420, barHeight: 60, inset: 57 });
  assert.equal(at.side, "above");
  assert.equal(100 - at.dy - 68, 57 + 4);
});

test("a selection too tall for itself and the bar does not scroll", () => {
  assert.equal(roomScroll({ selectionTop: -50, selectionBottom: 330, frameHeight: 400, barHeight: 60 }), 0);
  assert.equal(roomScroll({ selectionTop: 0, selectionBottom: 400, frameHeight: 400, barHeight: 60 }), 0);
});
