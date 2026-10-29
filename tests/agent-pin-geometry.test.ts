import { strict as assert } from "node:assert";
import { test } from "node:test";
import { NOTE_GAP, PIN_HEIGHT, PIN_ROOM, clearAbove, noteAnchor, noteTop } from "../src/components/agent-pin-geometry.ts";

const frame = { width: 400, height: 800 };
const heading = { top: 300, left: 24, width: 280, height: 60, bottom: 360, right: 304 };

test("the notes on an element stand above it, or hang under its top edge with no room at the frame's top", () => {
  assert.equal(noteTop(noteAnchor(heading, frame), PIN_HEIGHT), heading.top - NOTE_GAP - PIN_HEIGHT);
  const high = noteAnchor({ ...heading, top: 10 }, frame);
  assert.equal(high.below, true);
  assert.equal(noteTop(high, PIN_HEIGHT), 10 + NOTE_GAP);
});

test("the notes stand clear of what stands just above their element (am-45: an eyebrow line), while there is room above that", () => {
  // The eyebrow line's top 30 px above the heading: the pins stand above it.
  assert.equal(noteTop(noteAnchor({ ...heading, clear: 270 }, frame), PIN_HEIGHT), 270 - NOTE_GAP - PIN_HEIGHT);
  // No room above the eyebrow at the frame's top: on the heading's own edge, as before.
  assert.equal(noteTop(noteAnchor({ ...heading, top: 40, clear: 12 }, frame), PIN_HEIGHT), 40 - NOTE_GAP - PIN_HEIGHT);
  // A clear at or below its own top changes nothing.
  assert.deepEqual(noteAnchor({ ...heading, clear: heading.top }, frame), noteAnchor(heading, frame));
});

const box = (top: number, height: number, left = heading.left, width = heading.width) => ({ top, bottom: top + height, left, right: left + width, width, height });

test("what stands just above an element is its earlier siblings stacked over it closer than a row of pins (am-45)", () => {
  // An eyebrow line 10 px above the heading: its top.
  assert.equal(clearAbove(heading, [box(270, 20)]), 270);
  // Two lines stacked close (a kicker over the eyebrow): the higher one's top, within two rows of pins.
  assert.equal(clearAbove(heading, [box(276, 14), box(256, 14)]), 256);
  // A sibling with room for a row of pins below it: none.
  assert.equal(clearAbove(heading, [box(200, 20)]), undefined);
  // Beside it (not stacked), hidden, or over it (a layer behind the hero, a float): none.
  assert.equal(clearAbove(heading, [box(270, 20, heading.right + 10, 40)]), undefined);
  assert.equal(clearAbove(heading, [box(270, 0)]), undefined);
  assert.equal(clearAbove(heading, [box(0, 600, 0, 400)]), undefined);
  // A tall block ending just above it would lift the pins further than two rows: none, they stay near.
  assert.equal(clearAbove(heading, [box(300 - PIN_ROOM * 3, PIN_ROOM * 3 - 10)]), undefined);
});
