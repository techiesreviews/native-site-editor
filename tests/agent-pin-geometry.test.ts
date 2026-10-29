import { strict as assert } from "node:assert";
import { test } from "node:test";
import { NOTE_GAP, PIN_HEIGHT, noteAnchor, noteTop } from "../src/components/agent-pin-geometry.ts";

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
});
