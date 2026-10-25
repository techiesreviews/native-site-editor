import { test } from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_SHAPE, SOCIAL_SHAPE_LABEL, socialReplaceNotice, socialRestore, socialTrim } from "../src/page-builder/social-popup-rules";
import { socialImageSize, socialImageTrim } from "../src/page-builder/social-geometry";
import { shapeRatio } from "../src/page-builder/image-popup-rules";
import { SOCIAL_IMAGE_ACCEPT } from "../src/page-builder/social-image";
import { accepts } from "../src/page-builder/media-library-filter";
import { validTrim } from "../src/page-builder/trim-geometry";

const near = (actual: Record<string, unknown>, expected: Record<string, number>, within = 1e-5) => {
  for (const [key, value] of Object.entries(expected)) assert.ok(Math.abs(Number(actual[key]) - value) < within, `${key}: ${String(actual[key])} ≠ ${value}`);
};
const wide = { width: 2400, height: 1600 }, tall = { width: 1000, height: 2000 };

test("the popup's shape is the sharing copy's 1200 × 630", () => {
  assert.equal(shapeRatio(SOCIAL_SHAPE), 1200 / 630);
  assert.equal(SOCIAL_SHAPE_LABEL, "Sharing 1200 × 630");
});

test("the frame left in the middle is slice 36's centre trim", () => {
  for (const size of [wide, tall, { width: 1200, height: 630 }]) {
    const trim = socialTrim(size, { x: 50, y: 50 }, 1);
    near({ ...trim }, { ...socialImageTrim(size.width, size.height) });
    assert.doesNotThrow(() => validTrim(trim));
  }
});

test("the focus moves the frame along the picture's spare length and Zoom trims it closer", () => {
  const top = socialTrim(wide, { x: 50, y: 0 }, 1), bottom = socialTrim(wide, { x: 80, y: 100 }, 1);
  const height = (2400 / (1200 / 630)) / 1600;
  near({ ...top }, { x: 0, y: 0, width: 1, height });
  near({ ...bottom }, { x: 0, y: 1 - height, width: 1, height });
  const zoomed = socialTrim(wide, { x: 100, y: 0 }, 2);
  near({ ...zoomed }, { x: 0.5, y: 0, width: 0.5, height: height / 2 });
  // Zoomed in to a 1200 px wide part, the copy is still 1200 × 630; closer, it is never enlarged.
  assert.deepEqual(socialImageSize(wide.width, wide.height, zoomed), { width: 1200, height: 630 });
  assert.deepEqual(socialImageSize(wide.width, wide.height, socialTrim(wide, { x: 50, y: 50 }, 4)), { width: 600, height: 315 });
  // The zoom stays between 100 % and 500 %.
  near({ ...socialTrim(wide, { x: 50, y: 50 }, 0.2) }, { ...socialTrim(wide, { x: 50, y: 50 }, 1) });
  near({ ...socialTrim(wide, { x: 50, y: 50 }, 9) }, { ...socialTrim(wide, { x: 50, y: 50 }, 5) });
  assert.equal(Object.keys(zoomed).some(key => ["turn", "straighten", "flipX", "flipY"].includes(key)), false);
});

test("a sharing copy re-opens with its frame put back", () => {
  for (const [size, focus, zoom] of [[wide, { x: 50, y: 50 }, 1], [wide, { x: 30, y: 10 }, 1], [wide, { x: 70, y: 90 }, 2.5], [tall, { x: 50, y: 20 }, 1], [tall, { x: 0, y: 100 }, 3]] as const) {
    // The focus only counts along the picture's spare length: the same frame comes back.
    const trim = socialTrim(size, focus, zoom), restored = socialRestore(trim, size);
    near({ ...socialTrim(size, restored.focus, restored.cut.zoom) }, { ...trim }, 1e-4);
    near({ ...restored.cut }, { zoom, turn: 0 }, 1e-4);
  }
});

test("a frame the popup cannot make starts again in the middle", () => {
  const centred = { focus: { x: 50, y: 50 }, cut: { turn: 0, zoom: 1, rect: { x: 0, y: 0, w: 1, h: 1 } } };
  assert.deepEqual(socialRestore(undefined, wide), centred);
  assert.deepEqual(socialRestore({ x: 0, y: 0, width: 0.5, height: 0.5 }, wide), centred);
  assert.deepEqual(socialRestore({ ...socialTrim(wide, { x: 50, y: 50 }, 1), turn: 90 }, wide), centred);
  assert.deepEqual(socialRestore({ ...socialTrim(wide, { x: 50, y: 50 }, 1), flipX: true }, wide), centred);
});

test("Replace's note names the new picture", () => {
  assert.equal(socialReplaceNotice("images/team.webp"), "team.webp is in, centred in the sharing frame.");
});

test("the picker offers still raster pictures only", () => {
  for (const path of ["a.jpg", "a.jpeg", "a.png", "a.webp", "a.avif", "a.gif", "a.bmp"]) assert.equal(accepts(path, SOCIAL_IMAGE_ACCEPT), true, path);
  for (const path of ["a.svg", "a.ico", "a.mp4", "a.pdf"]) assert.equal(accepts(path, SOCIAL_IMAGE_ACCEPT), false, path);
});

