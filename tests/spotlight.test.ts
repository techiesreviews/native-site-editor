import { test } from "node:test";
import assert from "node:assert/strict";
import { spotlightLayout, targetIsVisible } from "../src/components/spotlight-layout.ts";

const viewport = { width: 1280, height: 800 };
const callout = { width: 340, height: 200 };

test("the callout goes to the right of a target in the top left, with the arrow pointing at its middle", () => {
  const layout = spotlightLayout({ left: 16, top: 8, width: 180, height: 40 }, callout, viewport);
  assert.equal(layout.mode, "target");
  if (layout.mode !== "target") return;
  assert.equal(layout.side, "right");
  assert.ok(layout.left >= layout.hole.left + layout.hole.width, "beside the highlight, not over it");
  assert.equal(layout.top, 12, "kept inside the margin at the top");
  assert.equal(layout.hole.left, 10);
  assert.equal(layout.hole.width, 192);
  assert.ok(layout.arrow >= 18 && layout.arrow <= callout.height - 18);
});

test("with no room on the right it goes below, then left, then above", () => {
  const nearRight = spotlightLayout({ left: 1150, top: 300, width: 100, height: 40 }, callout, viewport);
  assert.equal(nearRight.mode === "target" && nearRight.side, "below");
  const tall = spotlightLayout({ left: 900, top: 100, width: 360, height: 600 }, callout, viewport);
  assert.equal(tall.mode === "target" && tall.side, "left");
  const below = spotlightLayout({ left: 10, top: 100, width: 300, height: 40 }, callout, { width: 400, height: 400 });
  assert.equal(below.mode === "target" && below.side, "below");
  const above = spotlightLayout({ left: 20, top: 360, width: 320, height: 40 }, callout, { width: 400, height: 420 });
  assert.equal(above.mode === "target" && above.side, "above");
});

test("the callout always stays inside the viewport", () => {
  for (const target of [
    { left: 0, top: 0, width: 50, height: 20 },
    { left: 1230, top: 780, width: 50, height: 20 },
    { left: 600, top: 790, width: 40, height: 40 },
    { left: -20, top: 400, width: 100, height: 30 },
  ]) {
    const layout = spotlightLayout(target, callout, viewport);
    assert.ok(layout.left >= 12 && layout.left + callout.width <= viewport.width - 12, JSON.stringify(layout));
    assert.ok(layout.top >= 12 && layout.top + callout.height <= viewport.height - 12, JSON.stringify(layout));
  }
});

test("a missing, empty or off-screen target gets a centred callout", () => {
  for (const target of [null, undefined, { left: 10, top: 10, width: 0, height: 20 }, { left: 3000, top: 10, width: 50, height: 20 }, { left: 10, top: -500, width: 50, height: 20 }]) {
    const layout = spotlightLayout(target, callout, viewport);
    assert.equal(layout.mode, "centered");
    assert.equal(layout.left, 470);
    assert.equal(layout.top, 300);
  }
  assert.equal(targetIsVisible({ left: -40, top: 0, width: 50, height: 20 }, viewport), false, "mostly outside");
  assert.equal(targetIsVisible({ left: -10, top: 0, width: 50, height: 20 }, viewport), true);
});

test("a callout that cannot fit beside the target is centred rather than pushed off an edge", () => {
  const layout = spotlightLayout({ left: 10, top: 10, width: 50, height: 20 }, callout, { width: 300, height: 150 });
  assert.equal(layout.mode, "centered");
  assert.equal(layout.left, 12);
});
