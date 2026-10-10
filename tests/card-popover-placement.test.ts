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
const clearOf = (top: number, height: number, bar: { top: number; height: number }) => top + height <= bar.top || top >= bar.top + bar.height;

test("neither side fits: over the card, still clear of the bar", () => {
  const under = { top: 278, height: 40 };
  const placed = cardPopoverPlacement({ top: 20, height: 250 }, { top: 0, height: 400 }, 120, under);
  assert.equal(placed.top, 150);
  assert.ok(clearOf(placed.top, 120, under));
  const over = { top: 30, height: 40 };
  const tall = { top: 80, height: 300 };
  const short = { top: 0, height: 400 };
  assert.equal(cardPopoverPlacement(tall, short, 120, over).top, 78);
  assert.ok(clearOf(78, 120, over));
});
test("no room anywhere beside the bar clamps to the view from the card's foot", () => {
  assert.equal(cardPopoverPlacement({ top: 20, height: 260 }, { top: 0, height: 300 }, 200, { top: 150, height: 40 }).top, 92);
  assert.equal(cardPopoverPlacement({ top: 20, height: 400 }, { top: 0, height: 300 }, 120).top, 172);
  assert.equal(cardPopoverPlacement(card, view, 120).top, 294);
});
