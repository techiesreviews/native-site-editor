import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSeeThroughPixel, mediaMayBeTransparent } from "../src/page-builder/media-transparency.ts";

test("only formats that can hold see-through pixels are sampled", () => {
  for (const path of ["images/logo.png", "images/LOGO.PNG", "a/b.webp", "x.gif", "x.avif", "images/studio-desk.svg"])
    assert.equal(mediaMayBeTransparent(path), true, path);
  for (const path of ["images/meadow.jpg", "images/meadow.jpeg", "clip.mp4", "price-list.pdf", "png", "images/png.jpg"])
    assert.equal(mediaMayBeTransparent(path), false, path);
});

test("a picture is see-through when any pixel's alpha is below 255", () => {
  assert.equal(hasSeeThroughPixel([]), false);
  assert.equal(hasSeeThroughPixel([0, 0, 0, 255, 10, 20, 30, 255]), false);
  assert.equal(hasSeeThroughPixel([0, 0, 0, 255, 10, 20, 30, 254]), true);
  assert.equal(hasSeeThroughPixel(new Uint8ClampedArray([255, 255, 255, 0])), true);
  // Only every fourth byte is alpha: a colour channel below 255 is not transparency.
  assert.equal(hasSeeThroughPixel([0, 0, 0, 255, 255, 0, 0, 255]), false);
});
