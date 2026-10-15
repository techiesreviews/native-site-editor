import test from "node:test";
import assert from "node:assert/strict";
import { EDIT_BAR_ROOM, revealOffset } from "../src/page-builder/rules/reveal.ts";
import { editBarPlacement } from "../src/components/edit-bar-placement.ts";

// A revealed element lands where the edit bar fits above it (edit-bar-placement's "above").
const placed = (input: { top: number; bottom: number; height: number; inset: number }, barHeight = 60) => {
  const dy = revealOffset(input);
  const top = input.top - dy, bottom = input.bottom - dy;
  return { top, bottom, side: editBarPlacement({ selectionTop: top, selectionBottom: bottom, frameHeight: input.height, barHeight, inset: input.inset, visible: true }).side };
};

test("a tall video in a 1280 canvas shows from its top with the bar above it", () => {
  // The audit's case: a 400 px canvas, a 57 px sticky header and a 359 px video revealed flush under it.
  const at = placed({ top: 900, bottom: 1259, height: 400, inset: 57 });
  assert.equal(at.top, 57 + EDIT_BAR_ROOM);
  assert.equal(at.side, "above");
});

test("a short element is centred in the space under the header and the bar", () => {
  const at = placed({ top: -300, bottom: -260, height: 600, inset: 60 });
  assert.equal(at.top - (60 + EDIT_BAR_ROOM), 600 - at.bottom);
  assert.equal(at.side, "above");
  // Already in place: no scroll.
  assert.equal(revealOffset({ top: at.top, bottom: at.bottom, height: 600, inset: 60 }), 0);
});

test("without room for the bar and a fair part of the element, it goes just under the header", () => {
  // A phone's 150 px canvas under a 57 px header.
  const at = placed({ top: 500, bottom: 700, height: 150, inset: 57 });
  assert.equal(at.top, 57);
  assert.notEqual(at.side, "above");
  // A short element in a slightly taller canvas still gets the bar's room.
  assert.equal(placed({ top: 500, bottom: 540, height: 200, inset: 57 }).side, "above");
});

test("no sticky header", () => {
  assert.equal(placed({ top: 1000, bottom: 2000, height: 500, inset: 0 }).top, EDIT_BAR_ROOM);
});
