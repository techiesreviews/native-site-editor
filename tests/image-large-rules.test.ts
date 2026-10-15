// The large editor's rules (media build slice 42) and the popup's straightened picture (enlarged to fill its frame).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canZoomOut, chooseShape, editKey, fitView, flipEdit, moveArea, resetEdit, resizeArea, rulerLabelShown, rulerValue, shownFlips, straightenEdit, zoomArea, type PopupEdit,
} from "../src/page-builder/image-large-rules";
import { MAX_ZOOM, coverScale, cutArea, popupTrim, restoreCut, sameTrim, shownTrim, uncut, type PopupCut } from "../src/page-builder/image-popup-trim";
import { trimGeometry } from "../src/page-builder/trim-geometry";
import type { MediaTrim } from "../shared/media-records";

const wide = { width: 400, height: 200 };
const near = (actual: number, expected: number, what = "") => assert.ok(Math.abs(actual - expected) < 1e-6, `${what} ${actual} ≠ ${expected}`);
const nearAll = (actual: Record<string, number>, expected: Record<string, number>) => { for (const key of Object.keys(expected)) near(actual[key], expected[key], key); };
const edit = (over: Partial<PopupEdit> & { cut?: Partial<PopupCut> } = {}): PopupEdit => ({ shape: "original", focus: { x: 50, y: 50 }, ...over, cut: { ...uncut(), ...over.cut } });
/** Where an output pixel of a trim comes from in the source picture. */
function sourceOf(trim: MediaTrim, u: number, v: number, size = wide) {
  const [a, b, c, d, e, f] = trimGeometry(size.width, size.height, trim).matrix, det = a * d - b * c;
  return { x: (d * (u - e) - c * (v - f)) / det, y: (-b * (u - e) + a * (v - f)) / det };
}

test("a straightened picture is enlarged just enough to fill its frame; the trim leaves no empty corner", () => {
  near(coverScale(wide, { turn: 0 }), 1);
  near(coverScale({ width: 100, height: 100 }, { turn: 0, straighten: 45 }), Math.SQRT2);
  near(coverScale(wide, { turn: 90, straighten: -10 }), coverScale(wide, { turn: 90, straighten: 10 }));
  for (const cut of [{ ...uncut(), straighten: 12 }, { ...uncut(), straighten: -45, turn: 90 as const }, { ...uncut(), straighten: 7.5, flipX: true as const }]) {
    // Original, whole: the trim is the part of the frame the turned picture covers.
    const trim = popupTrim(wide, "original", { x: 50, y: 50 }, cut)!;
    const { width, height } = trimGeometry(wide.width, wide.height, trim);
    for (const [u, v] of [[0, 0], [width, 0], [0, height], [width, height]]) {
      const at = sourceOf(trim, u, v);
      assert.ok(at.x > -1 && at.x < wide.width + 1 && at.y > -1 && at.y < wide.height + 1, `corner ${u},${v} of ${JSON.stringify(cut)} is outside: ${at.x},${at.y}`);
    }
    const shown = shownTrim(wide, cut);
    nearAll({ x: shown.x, y: shown.y, w: shown.width, h: shown.height }, { x: trim.x, y: trim.y, w: trim.width, h: trim.height });
  }
  // Unstraightened, nothing changes from slice 41: fractions are the trim's own.
  assert.deepEqual(popupTrim(wide, "square", { x: 0, y: 50 }, { ...uncut(), zoom: 2 }), { x: 0, y: 0.25, width: 0.25, height: 0.5 });
});

test("a straightened, flipped trim re-opens as it was and saves the same trim", () => {
  for (const [shape, focus, cut] of [
    ["free", { x: 50, y: 50 }, { ...uncut(), straighten: -4, flipX: true, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }],
    ["16:9", { x: 30, y: 70 }, { ...uncut(), straighten: 20, turn: 90, flipY: true, zoom: 1.6 }],
  ] as const) {
    const trim = popupTrim(wide, shape, focus, cut)!;
    const back = restoreCut(trim, shape === "free" ? "original" : shape, wide);
    assert.ok(sameTrim(popupTrim(wide, back.shape, back.focus, back.cut), trim), `${shape} round trip`);
    assert.equal(back.cut.straighten, cut.straighten);
  }
  // A trim made elsewhere that reaches into a straightened frame's empty corners re-opens on the
  // picture as shown: the whole of it, straightened, which then saves without empty corners.
  const outside = restoreCut({ x: 0, y: 0, width: 1, height: 1, straighten: 30 }, "original", wide);
  assert.equal(outside.shape, "original");
  assert.equal(outside.cut.zoom, 1);
  assert.deepEqual(popupTrim(wide, outside.shape, outside.focus, outside.cut), popupTrim(wide, "original", { x: 50, y: 50 }, { ...uncut(), straighten: 30 }));
});

test("choosing a shape: Free starts from what the place shows; a shape starts unzoomed and drops a kept shape", () => {
  const zoomed = edit({ shape: "square", focus: { x: 0, y: 50 }, cut: { zoom: 2 } });
  const free = chooseShape(wide, zoomed, "free");
  assert.equal(free.shape, "free");
  assert.deepEqual(free.cut.rect, cutArea(wide, "square", { x: 0, y: 50 }, zoomed.cut));
  assert.equal(chooseShape(wide, zoomed, "16:9").cut.zoom, 1);
  const kept = chooseShape(wide, { ...edit({ shape: "free" }), around: "square", aroundFocus: { x: 10, y: 10 } }, "4:3");
  assert.equal(kept.around, undefined);
  assert.equal(kept.aroundFocus, undefined);
});

test("the frame is fitted in the middle of the area", () => {
  const view = fitView({ x: 0.25, y: 0, w: 0.5, h: 1 }, wide, { width: 600, height: 500 }, 50);
  // The 200 × 200 frame fills 400 px of height; 400 × 400 centred.
  near(view.scale, 2);
  near(view.x + view.scale * 0.25 * 400, 100);
  near(view.y, 50);
});

test("dragging the picture moves what stays in view: a shape's focus, Free's rectangle", () => {
  const square = edit({ shape: "square" });
  const from = cutArea(wide, "square", square.focus, square.cut);
  const moved = moveArea(wide, square, from, -0.1, 0.3);
  assert.deepEqual(moved.focus, { x: 30, y: 50 });
  assert.equal(moved.cut.zoom, 1);
  // Past the edge it stops.
  assert.equal(moveArea(wide, square, from, -1, 0).focus.x, 0);
  const free = edit({ shape: "free", cut: { rect: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } } });
  nearAll({ ...moveArea(wide, free, free.cut.rect, 0.4, -0.1).cut.rect }, { x: 0.5, y: 0.1, w: 0.5, h: 0.5 });
});

test("a handle resizes the frame: a shape keeps its ratio (a zoom) from the opposite corner, Free moves its sides", () => {
  const square = edit({ shape: "square" });
  const from = cutArea(wide, "square", square.focus, square.cut);
  // The south-east corner pulled in by half the square's width: zoom 2, anchored at the north-west corner.
  const half = resizeArea(wide, square, from, "se", -0.25, 0);
  near(half.cut.zoom, 2);
  nearAll({ ...cutArea(wide, "square", half.focus, half.cut) }, { x: 0.25, y: 0, w: 0.25, h: 0.5 });
  // Never past the popup's zoom limit, nor larger than the picture.
  near(resizeArea(wide, square, from, "nw", 10, 10).cut.zoom, MAX_ZOOM);
  near(resizeArea(wide, square, from, "se", 10, 10).cut.zoom, 1);
  const free = edit({ shape: "free" });
  nearAll({ ...resizeArea(wide, free, free.cut.rect, "n", 0, 0.25).cut.rect }, { x: 0, y: 0.25, w: 1, h: 0.75 });
});

test("zoom steps in and out, never below 100 %", () => {
  const start = edit({ shape: "4:3" });
  assert.equal(canZoomOut(start), false);
  const zoomed = zoomArea(start, 1.25);
  near(zoomed.cut.zoom, 1.25);
  assert.equal(canZoomOut(zoomed), true);
  near(zoomArea(zoomed, 0.5).cut.zoom, 1);
  near(zoomArea(edit({ cut: { zoom: 4.5 } }), 2).cut.zoom, MAX_ZOOM);
});

test("Flip mirrors the picture as it is shown, turned or straightened, and keeps the same part in view", () => {
  const base = edit({ shape: "free", cut: { straighten: 6, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } } });
  const flipped = flipEdit(base, "x");
  assert.equal(flipped.cut.flipX, true);
  assert.equal(flipped.cut.straighten, -6);
  nearAll({ ...flipped.cut.rect }, { x: 0.6, y: 0.2, w: 0.3, h: 0.4 });
  assert.equal(editKey(flipEdit(flipped, "x")), editKey(base));
  // A turned picture flips side to side about its other axis.
  assert.equal(flipEdit(edit({ cut: { turn: 90 } }), "x").cut.flipY, true);
  assert.equal(flipEdit(edit({ cut: { turn: 270 } }), "y").cut.flipX, true);
  assert.deepEqual(flipEdit(edit({ shape: "square", focus: { x: 20, y: 30 } }), "y").focus, { x: 20, y: 70 });
  // Pixel for pixel: the flipped trim is the mirror of the trim before, for every turn and both directions.
  for (const turn of [0, 90, 180, 270] as const) for (const axis of ["x", "y"] as const) {
    const before = edit({ shape: "free", cut: { turn, straighten: -9, flipY: true, rect: { x: 0.15, y: 0.1, w: 0.5, h: 0.7 } } });
    const a = popupTrim(wide, before.shape, before.focus, before.cut)!, after = flipEdit(before, axis);
    const b = popupTrim(wide, after.shape, after.focus, after.cut)!;
    const { width, height } = trimGeometry(wide.width, wide.height, a);
    for (const [u, v] of [[3, 5], [width - 7, 11], [width / 2, height - 2]]) {
      const p = sourceOf(a, u, v), q = sourceOf(b, axis === "x" ? width - u : u, axis === "y" ? height - v : v);
      assert.ok(Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5, `turn ${turn}, flip ${axis}: ${JSON.stringify(p)} ≠ ${JSON.stringify(q)}`);
    }
  }
});

test("straighten in half degrees between −45° and 45°; the ruler catches at 0", () => {
  assert.equal(straightenEdit(edit(), 4.3).cut.straighten, 4.5);
  assert.equal(straightenEdit(edit(), -60).cut.straighten, -45);
  assert.equal("straighten" in straightenEdit(edit({ cut: { straighten: 5 } }), 0).cut, false);
  assert.equal(rulerValue(0, -24), 4);
  assert.equal(rulerValue(4, 18), 1);
  assert.equal(rulerValue(0.5, 3), 0);
  assert.equal(rulerValue(40, -100), 45);
});

test("Reset is the whole original in the place's own shape; an edit's key ignores property order", () => {
  assert.deepEqual(resetEdit("16:9"), { shape: "16:9", focus: { x: 50, y: 50 }, cut: uncut() });
  assert.equal(resetEdit("free").shape, "original");
  const a = edit({ cut: { flipX: true, straighten: 3 } }), b = { ...a, cut: { straighten: 3, flipX: true as const, rect: a.cut.rect, zoom: 1, turn: 0 as const } };
  assert.equal(editKey(a), editKey(b));
  assert.notEqual(editKey(a), editKey(flipEdit(a, "y")));
});

// Slice 110: a degree label shows whole inside the ruler (6 px a degree), and not under the current value's reading.
test("ruler labels show whole inside the ruler and clear of the reading", () => {
  assert.equal(rulerLabelShown(15, 0, 360), true);
  assert.equal(rulerLabelShown(-15, -4, 360), true);
  // −30° at 0° stands 180 px left of the middle: half of it would be past the edge of a 360 px ruler.
  assert.equal(rulerLabelShown(-30, 0, 360), false);
  assert.equal(rulerLabelShown(-30, 0, 400), true);
  assert.equal(rulerLabelShown(-30, -4, 360), true);
  assert.equal(rulerLabelShown(0, 4, 360), false);
  assert.equal(rulerLabelShown(0, 6, 360), true);
});

// Slice 121: each Flip button shows whether the picture is flipped its way as shown.
test("Flip's pressed state follows the picture as shown, turned or not, and goes off when pressed again", () => {
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  for (const turn of [0, 90, 180, 270] as const) {
    const base = edit({ shape: "free", cut: { rect, ...turn ? { turn } : {} } as PopupCut });
    assert.deepEqual(shownFlips(base.cut), { x: false, y: false }, `turn ${turn}`);
    const x = flipEdit(base, "x");
    assert.deepEqual(shownFlips(x.cut), { x: true, y: false }, `turn ${turn} x`);
    const both = flipEdit(x, "y");
    assert.deepEqual(shownFlips(both.cut), { x: true, y: true }, `turn ${turn} both`);
    assert.deepEqual(shownFlips(flipEdit(flipEdit(both, "x"), "y").cut), { x: false, y: false }, `turn ${turn} off`);
  }
});
