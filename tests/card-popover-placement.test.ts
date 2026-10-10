import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPopoverPlacement } from "../src/components/card-popover-placement.ts";

const card = { top: 200, height: 100 };
const view = { top: 0, height: 600 };

test("bar above the card leaves the popover below the card", () => {
  assert.equal(cardPopoverPlacement(card, view, 120, { top: 140, height: 40 }).top, 294);
});
test("bar below the card puts the popover below the bar", () => {
  assert.deepEqual(cardPopoverPlacement(card, view, 120, { top: 308, height: 40 }), { top: 356, below: 356 });
});
test("no room below flips above the card or above its bar", () => {
  const short = { top: 0, height: 400 };
  assert.equal(cardPopoverPlacement(card, short, 120, { top: 308, height: 40 }).top, 86);
  assert.equal(cardPopoverPlacement(card, short, 120, { top: 140, height: 40 }).top, 12);
});
test("neither side fits clamps to the view, preserving the fallback", () => {
  assert.equal(cardPopoverPlacement({ top: 20, height: 260 }, { top: 0, height: 300 }, 120, { top: 288, height: 40 }).top, 172);
  assert.equal(cardPopoverPlacement(card, view, 120).top, 294);
});
