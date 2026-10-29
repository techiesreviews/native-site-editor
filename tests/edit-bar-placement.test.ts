import { test } from "node:test";
import assert from "node:assert/strict";
import { dockLift, dockScroll, editBarPlacement, type EditBarPlacementOptions } from "../src/components/edit-bar-placement.ts";

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

test("with no room clear of a sticky header on either side, the bar stays under the header, at the edge covering less", () => {
  assert.deepEqual(place({ selectionTop: 104, selectionBottom: 560, inset: 100 }), { top: 532, side: "pinned" });
  assert.deepEqual(place({ selectionTop: 60, selectionBottom: 560, inset: 50 }), { top: 532, side: "pinned" });
});

// Phones: the bar docked at the canvas foot, 760-808 in an 844 px window.
const docked = { barTop: 760, barBottom: 808 };

test("docked: no lift with the keyboard closed", () => {
  assert.equal(dockLift({ ...docked, viewportTop: 0, viewportHeight: 844 }), 0);
});

test("docked: lifted right on top of the open keyboard", () => {
  // The keyboard takes 344 px: the visual viewport ends at 500.
  assert.equal(dockLift({ ...docked, viewportTop: 0, viewportHeight: 500 }), 308);
});

test("docked: a zoomed, scrolled visual viewport lifts the bar to its foot, never past its top", () => {
  assert.equal(dockLift({ ...docked, viewportTop: 300, viewportHeight: 422 }), 86);
  // Scrolled down past the bar's place: nothing to lift.
  assert.equal(dockLift({ ...docked, viewportTop: 422, viewportHeight: 422 }), 0);
  // A visual viewport shorter than the bar keeps the bar's top at its top.
  assert.equal(dockLift({ ...docked, viewportTop: 700, viewportHeight: 30 }), 60);
});

const room = { selectionTop: 200, selectionBottom: 240, visibleBottom: 600 };

test("docked: a selection in view above the bar needs no scroll", () => {
  assert.equal(dockScroll(room), 0);
  assert.equal(dockScroll({ ...room, selectionTop: 500, selectionBottom: 592 }), 0);
});

test("docked: a selection wholly above the view needs no scroll", () => {
  assert.equal(dockScroll({ ...room, selectionTop: -120, selectionBottom: -40 }), 0);
});

test("docked: a selection behind the bar or keyboard scrolls just into view 8 px above it", () => {
  assert.equal(dockScroll({ ...room, selectionTop: 560, selectionBottom: 620 }), 28);
  // Wholly under the keyboard.
  assert.equal(dockScroll({ ...room, selectionTop: 700, selectionBottom: 740, visibleBottom: 400 }), 348);
});

test("docked: a selection taller than the room shows its top, under the sticky header", () => {
  assert.equal(dockScroll({ ...room, selectionTop: 300, selectionBottom: 1000 }), 292);
  assert.equal(dockScroll({ ...room, selectionTop: 300, selectionBottom: 1000, inset: 60 }), 232);
  // Its top already at the ceiling: no scroll would show more of it.
  assert.equal(dockScroll({ ...room, selectionTop: 4, selectionBottom: 1000 }), 0);
});
