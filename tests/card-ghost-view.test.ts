import assert from "node:assert/strict";
import test from "node:test";
import { ghostInView } from "../src/components/card-ghost-view.ts";

const box = { left: 20, top: 300, width: 600, height: 100 };
const item = { left: 20, top: 200, width: 180, height: 200 };

test("a ghost wholly in view keeps its box", () => {
  assert.deepEqual(ghostInView(box, 460, item, false), { box, clipped: false });
  const edge = { ...box, top: 360 };
  assert.deepEqual(ghostInView(edge, 460, item, false), { box: edge, clipped: false });
});

test("a ghost below the grid running past the frame's bottom is cut at that edge", () => {
  assert.deepEqual(ghostInView({ ...box, top: 400 }, 460, item, false), {
    box: { ...box, top: 400, height: 60 }, clipped: true,
  });
});

test("a ghost with less than a strip in view, or none, becomes a strip at the bottom edge", () => {
  const strip = { box: { ...box, top: 428, height: 32 }, clipped: true };
  assert.deepEqual(ghostInView({ ...box, top: 446 }, 460, item, false), strip);
  assert.deepEqual(ghostInView({ ...box, top: 461 }, 460, item, false), strip);
  assert.deepEqual(ghostInView({ ...box, top: 900 }, 460, { ...item, top: 400 }, false), strip);
});

test("a ghost past the bottom stays as it is when its item is out of view or absent", () => {
  const below = { ...box, top: 461 };
  assert.equal(ghostInView(below, 460, { ...item, top: 460 }, false), null);
  assert.equal(ghostInView(below, 460, { ...item, top: -200 }, false), null);
  assert.equal(ghostInView(below, 460, undefined, false), null);
  const partial = { ...box, top: 400 };
  assert.deepEqual(ghostInView(partial, 460, undefined, false), { box: partial, clipped: false });
});

test("a ghost beside its item is never cut", () => {
  const partial = { ...box, top: 446 };
  assert.deepEqual(ghostInView(partial, 460, item, true), { box: partial, clipped: false });
  assert.equal(ghostInView({ ...box, top: 461 }, 460, item, true), null);
});

test("a ghost wholly above the frame stays hidden", () => {
  assert.equal(ghostInView({ ...box, top: -101 }, 460, item, false), null);
});
