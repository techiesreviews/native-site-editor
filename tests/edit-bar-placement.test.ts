import { test } from "node:test";
import assert from "node:assert/strict";
import { editBarPlacement, type EditBarPlacementOptions } from "../src/components/edit-bar-placement.ts";

const defaults = { selectionTop: 200, selectionBottom: 240, frameHeight: 600, barHeight: 64, visible: true } satisfies EditBarPlacementOptions;
const place = (options: Partial<EditBarPlacementOptions> = {}) => editBarPlacement({ ...defaults, ...options });

test("above with an 8px gap, including exactly at the ceiling", () => {
  assert.deepEqual(place(), { top: 128, side: "above" });
  assert.deepEqual(place({ selectionTop: 76 }), { top: 4, side: "above" });
});

test("below when the frame top leaves no room above", () => {
  assert.deepEqual(place({ selectionTop: 0, selectionBottom: 40 }), { top: 48, side: "below" });
});

test("below under a sticky header, respecting both the selection and the ceiling", () => {
  assert.deepEqual(place({ selectionTop: 100, selectionBottom: 140, inset: 150 }), { top: 154, side: "below" });
  assert.deepEqual(place({ selectionTop: 100, selectionBottom: 180, inset: 100 }), { top: 188, side: "below" });
});

test("a tall selection pins at the ceiling when it covers less, or on a tie", () => {
  assert.deepEqual(place({ selectionTop: 50, selectionBottom: 590 }), { top: 4, side: "pinned" });
  assert.deepEqual(place({ selectionTop: -200, selectionBottom: 800 }), { top: 4, side: "pinned" });
});

test("a tall selection pins at the bottom when it covers less of the visible selection", () => {
  assert.deepEqual(place({ selectionTop: -100, selectionBottom: 550 }), { top: 532, side: "pinned" });
});

test("a tiny frame clamps the bar inside the canvas", () => {
  const result = place({ selectionTop: 10, selectionBottom: 70, frameHeight: 80 });
  assert.deepEqual(result, { top: 4, side: "pinned" });
  assert.ok(result.top >= 0 && result.top + defaults.barHeight <= 80);
});

test("a huge inset is capped so the bar stays in the frame", () => {
  const result = place({ selectionTop: 100, selectionBottom: 140, inset: 100_000 });
  assert.deepEqual(result, { top: 532, side: "below" });
  assert.ok(result.top >= 0 && result.top + defaults.barHeight <= defaults.frameHeight);
});

test("off-screen selections retain focused controls clamped into the frame", () => {
  assert.deepEqual(place({ selectionTop: -200, selectionBottom: -160, inset: 100, visible: false }), { top: 104, side: "pinned" });
  assert.deepEqual(place({ selectionTop: 800, selectionBottom: 840, visible: false }), { top: 532, side: "pinned" });
});
