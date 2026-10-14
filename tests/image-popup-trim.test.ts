import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ZOOM, cutArea, dotApplies, makesNewPicture, moveFree, nudgeFree, placeShape, popupTrim, resizeFree, restoreCut, sameTrim,
  trimmable, turnBy, turnText, turnedSize, uncut, zoomPercent, zoomTo, type PopupCut,
} from "../src/page-builder/image-popup-trim";
import { isTrim, validTrim } from "../src/page-builder/trim-geometry";
import type { PopupShape } from "../src/page-builder/image-popup-rules";

const wide = { width: 400, height: 200 };
const close = (actual: Record<string, number>, expected: Record<string, number>) => {
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} ≠ ${expected[key]}`);
};

test("a shape's area is as large as fits, smaller by the zoom, placed by the focus", () => {
  close({ ...cutArea(wide, "square", { x: 50, y: 50 }, uncut()) }, { x: 0.25, y: 0, w: 0.5, h: 1 });
  close({ ...cutArea(wide, "square", { x: 50, y: 50 }, { ...uncut(), zoom: 2 }) }, { x: 0.375, y: 0.25, w: 0.25, h: 0.5 });
  // Original keeps the picture's own shape; zoomed in, the focus places it.
  close({ ...cutArea(wide, "original", { x: 0, y: 100 }, { ...uncut(), zoom: 2 }) }, { x: 0, y: 0.5, w: 0.5, h: 0.5 });
  // A turned picture is tall: a square takes its whole width.
  assert.deepEqual(turnedSize(wide, 90), { width: 200, height: 400 });
  close({ ...cutArea(wide, "square", { x: 50, y: 0 }, { ...uncut(), turn: 90 }) }, { x: 0, y: 0, w: 1, h: 0.5 });
  // Free is its own rectangle.
  assert.deepEqual(cutArea(wide, "free", { x: 0, y: 0 }, { ...uncut(), rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
});

test("zooming in, turning, a flip or a smaller Free trim saves a new picture; a shape and focus do not", () => {
  assert.equal(makesNewPicture("original", uncut()), false);
  assert.equal(makesNewPicture("16:9", uncut()), false);
  assert.equal(makesNewPicture("16:9", { ...uncut(), zoom: 1.05 }), true);
  assert.equal(makesNewPicture("original", { ...uncut(), turn: 270 }), true);
  assert.equal(makesNewPicture("original", { ...uncut(), flipX: true }), true);
  assert.equal(makesNewPicture("free", uncut()), false);
  assert.equal(makesNewPicture("free", { ...uncut(), rect: { x: 0, y: 0, w: 1, h: 0.9 } }), true);
  // The dot shows where a shape crops, or Original zoomed in; Free has corners instead.
  assert.equal(dotApplies("original", uncut()), false);
  assert.equal(dotApplies("original", { ...uncut(), zoom: 1.5 }), true);
  assert.equal(dotApplies("4:3", uncut()), true);
  assert.equal(dotApplies("free", uncut()), false);
});

test("the trim Done saves: fractions of the turned picture, the turn and flips, nothing for a shape alone", () => {
  assert.equal(popupTrim(wide, "square", { x: 20, y: 50 }, uncut()), undefined);
  const zoomed = popupTrim(wide, "square", { x: 50, y: 50 }, { ...uncut(), zoom: 2 })!;
  assert.deepEqual(zoomed, { x: 0.375, y: 0.25, width: 0.25, height: 0.5 });
  const turned = popupTrim(wide, "original", { x: 50, y: 50 }, { ...uncut(), turn: 90 })!;
  assert.deepEqual(turned, { x: 0, y: 0, width: 1, height: 1, turn: 90 });
  const kept = popupTrim(wide, "free", { x: 50, y: 50 }, { turn: 180, zoom: 1, rect: { x: 1 / 3, y: 0.1, w: 2 / 3, h: 0.5 }, straighten: 4, flipY: true })!;
  assert.deepEqual(kept, { x: 0.333333, y: 0.1, width: 0.666667, height: 0.5, turn: 180, straighten: 4, flipY: true });
  // Every trim the popup makes is one the worker takes.
  for (const trim of [zoomed, turned, kept]) assert.ok(validTrim(trim) && isTrim(trim));
  assert.ok(kept.x + kept.width <= 1);
});

test("a re-crop starts from the original with the earlier trim put back", () => {
  const cases: [PopupShape, PopupCut, { x: number; y: number }][] = [
    ["square", { ...uncut(), zoom: 2.5 }, { x: 30, y: 70 }],
    ["16:9", { ...uncut(), zoom: 1.5, turn: 90 }, { x: 10, y: 90 }],
    ["original", { ...uncut(), zoom: 3 }, { x: 100, y: 0 }],
    ["4:5", { ...uncut(), turn: 270 }, { x: 25, y: 50 }],
  ];
  for (const [shape, cut, focus] of cases) {
    const trim = popupTrim(wide, shape, focus, cut)!;
    const back = restoreCut(trim, shape, wide);
    assert.equal(back.shape, shape);
    assert.equal(back.cut.turn, cut.turn);
    assert.equal(zoomPercent(back.shape, back.cut), Math.round(cut.zoom * 100), `${shape}: zoom ${back.cut.zoom}`);
    assert.ok(sameTrim(popupTrim(wide, back.shape, back.focus, back.cut), trim), `${shape}: same trim again`);
  }
  // A trim that is not the place's shape (a Free trim) comes back as Free with its rectangle.
  const free = { x: 0.1, y: 0.2, width: 0.3, height: 0.7, turn: 90 as const, flipX: true as const };
  const back = restoreCut(free, "original", wide);
  assert.equal(back.shape, "free");
  assert.deepEqual(back.cut, { turn: 90, zoom: 1, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.7 }, flipX: true });
  assert.ok(sameTrim(popupTrim(wide, back.shape, back.focus, back.cut), free));
  // A square copy in a 16:9 place (shaped after trimming): Free, keeping the place's 16:9 around it.
  const square = popupTrim(wide, "square", { x: 50, y: 50 }, { ...uncut(), zoom: 2 })!;
  const kept = restoreCut(square, "16:9", wide);
  assert.equal(kept.shape, "free");
  assert.equal(kept.around, "16:9");
  assert.equal(placeShape(kept.shape, kept.around), "16:9");
  assert.equal(placeShape("free"), "original");
  assert.equal(placeShape("square", "16:9"), "square");
  assert.equal(restoreCut(free, "original", wide).around, undefined);
  // A trim that is only a shape's own crop (the square middle of a wide picture) stays a trim, as Free.
  const middle = restoreCut({ x: 0.25, y: 0, width: 0.5, height: 1 }, "square", wide);
  assert.equal(middle.shape, "free");
  assert.equal(middle.around, "square");
  assert.ok(makesNewPicture(middle.shape, middle.cut));
  assert.ok(sameTrim(popupTrim(wide, middle.shape, middle.focus, middle.cut), { x: 0.25, y: 0, width: 0.5, height: 1 }));
  // Further in than the slider reaches: Free.
  assert.equal(restoreCut({ x: 0.45, y: 0.45, width: 0.05, height: 0.1 }, "square", wide).shape, "free");
});

test("the slider zooms 100 to 500 %; Free's rectangle zooms about its centre and stays on the picture", () => {
  assert.equal(zoomPercent("square", { ...uncut(), zoom: 2.5 }), 250);
  assert.equal(zoomTo("square", uncut(), 900).zoom, MAX_ZOOM);
  assert.equal(zoomTo("square", uncut(), 50).zoom, 1);
  const free = { ...uncut(), rect: { x: 0.25, y: 0.25, w: 0.5, h: 0.25 } };
  assert.equal(zoomPercent("free", free), 200);
  const zoomed = zoomTo("free", free, 400).rect;
  close({ ...zoomed }, { x: 0.375, y: 0.3125, w: 0.25, h: 0.125 });
  // Out to 100 %: as large as the picture allows, still centred where it can be.
  const out = zoomTo("free", { ...uncut(), rect: { x: 0.7, y: 0.1, w: 0.2, h: 0.4 } }, 100).rect;
  close({ ...out }, { x: 0.5, y: 0, w: 0.5, h: 1 });
});

test("turning starts the zoom, focus and trim again on the turned picture", () => {
  const cut = { ...uncut(), zoom: 3, rect: { x: 0.2, y: 0.2, w: 0.2, h: 0.2 } };
  assert.deepEqual(turnBy(cut, 1), { turn: 90, zoom: 1, rect: { x: 0, y: 0, w: 1, h: 1 } });
  assert.equal(turnBy({ ...uncut(), turn: 270 }, 1).turn, 0);
  assert.equal(turnBy(uncut(), -1).turn, 270);
  assert.equal(turnText({ ...uncut(), turn: 90 }), "90°");
  assert.equal(turnText({ ...uncut(), turn: 180, straighten: -3, flipX: true }), "180° · straightened -3° · flipped");
});

test("Free's corners size the trim, dragging moves it, arrow keys do both; it stays on the picture", () => {
  const rect = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
  close({ ...resizeFree(rect, "nw", -0.1, 0.1) }, { x: 0.1, y: 0.3, w: 0.6, h: 0.4 });
  close({ ...resizeFree(rect, "se", 0.9, 0.9) }, { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
  // Never smaller than a sliver.
  close({ ...resizeFree(rect, "ne", -0.9, 0) }, { x: 0.2, w: 0.06 });
  close({ ...moveFree(rect, 0.9, -0.9) }, { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  close({ ...nudgeFree(rect, "ArrowRight")! }, { x: 0.22, y: 0.2 });
  close({ ...nudgeFree(rect, "ArrowUp", true)! }, { x: 0.2, y: 0.1 });
  close({ ...nudgeFree(rect, "ArrowLeft", false, true)! }, { x: 0.2, w: 0.48 });
  close({ ...nudgeFree(rect, "ArrowDown", true, true)! }, { y: 0.2, h: 0.6 });
  assert.equal(nudgeFree(rect, "Enter"), undefined);
});

test("only raster pictures in the site can be trimmed", () => {
  assert.equal(trimmable("media/images/desk.webp"), true);
  assert.equal(trimmable("images/photo.JPG"), true);
  assert.equal(trimmable("images/placeholder.svg"), false);
  assert.equal(trimmable("https://example.com/a.jpg"), false);
  assert.equal(trimmable("//cdn.example.com/a.png"), false);
});

test("two trims are the same within rounding", () => {
  const trim = { x: 0.1, y: 0.2, width: 0.3, height: 0.4, turn: 90 as const };
  assert.ok(sameTrim(trim, { ...trim, x: 0.10000004 }));
  assert.ok(!sameTrim(trim, { ...trim, x: 0.11 }));
  assert.ok(!sameTrim(trim, { ...trim, turn: 180 }));
  assert.ok(!sameTrim(trim, { ...trim, flipX: true }));
  assert.ok(!sameTrim(trim, undefined));
  assert.ok(sameTrim(undefined, undefined));
});
