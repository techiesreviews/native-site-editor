import { strict as assert } from "node:assert";
import { test } from "node:test";
import { IMAGE_FACTS, imageBreakpoints, imageViewports, imageWidth, imageSizes, imageFirstScreen, imageResult } from "../src/page-builder/image-sizes";

const measurements = (pairs: number[][]) => pairs.map(([viewport, width]) => ({ viewport, width }));

test("width queries yield upper-side boundaries, ignoring other features and nonsense", () => {
  assert.deepEqual(imageBreakpoints([
    "screen and (min-width: 900px)", "(max-width: 899px)", "(min-width: 48em)",
    "(MAX-width: 47.9375REM)", "(orientation: portrait) and (min-width: 56.25rem)",
    "(min-width: 900.5px)", "(max-width: 900.5px)",
    "(min-height: 700px)", "(min-width: -3px)", "(min-width: foo)", "(min-width: 80vw)",
  ]), [768, 900, 901]);
});

test("range-syntax width queries yield the same upper-side boundaries", () => {
  assert.deepEqual(imageBreakpoints(["(width >= 900px)"]), [900]);
  assert.deepEqual(imageBreakpoints(["(width > 900px)"]), [901]);
  assert.deepEqual(imageBreakpoints(["(width < 900px)"]), [900]);
  assert.deepEqual(imageBreakpoints(["(width <= 900px)"]), [901]);
  assert.deepEqual(imageBreakpoints(["(900px < width)"]), [901]);
  assert.deepEqual(imageBreakpoints(["(48em <= width)"]), [768]);
  assert.deepEqual(imageBreakpoints(["screen and (400px < width <= 899.5px)"]), [401, 900]);
  assert.deepEqual(imageBreakpoints(["(min-width > 900px)", "(height > 900px)", "(width > -3px)", "(width > 80vw)"]), []);
});

test("every breakpoint up to the cap is measured on both sides", () => {
  const points = [600, 700, 800, 900, 1000, 1100, 1200];
  const widths = imageViewports(points);
  for (const point of points) assert.ok(widths.includes(point - 1) && widths.includes(point), `${point}`);
  const capped = imageViewports(Array.from({ length: 40 }, (_, i) => 400 + i * 20));
  assert.ok(capped.length <= IMAGE_FACTS);
});

test("devices plus both breakpoint sides are sorted, deduplicated, sane and bounded", () => {
  assert.deepEqual(imageViewports([900, 768, 900, 0, 320, 2561, NaN]), [390, 767, 768, 899, 900, 1280]);
  const many = imageViewports(Array.from({ length: 200 }, (_, i) => 321 + i * 10));
  assert.ok(many.length <= IMAGE_FACTS);
  for (const baseline of [390, 768, 1280]) assert.ok(many.includes(baseline));
  assert.ok(many.every((width) => width >= 320 && width <= 2560));
  assert.ok(many.includes(320) && many.includes(2311));
});

test("cover uses the content box's aspect ratio and the other modes use its width", () => {
  assert.equal(imageWidth(300, 400, 1200, 600, "cover"), 800);
  assert.equal(imageWidth(400, 100, 1200, 600, "cover"), 400);
  for (const fit of ["contain", "fill", "none", "scale-down"]) assert.equal(imageWidth(300, 400, 1200, 600, fit), 300);
  assert.equal(imageWidth(300, 400, 0, 0, "cover"), 300);
  assert.equal(imageWidth(NaN, 400, 1200, 600, "cover"), 0);
});

test("full-width and proportional images collapse to one rounded-up vw value", () => {
  assert.equal(imageSizes(measurements([[1280, 1280], [390, 390], [768, 768]])), "100vw");
  assert.equal(imageSizes(measurements([[390, 390], [391, 391], [768, 768], [899, 899], [900, 900], [1280, 1280]])), "100vw");
  assert.equal(imageSizes(measurements([[899, 899], [900, 900]])), "100vw");
  assert.equal(imageSizes(measurements([[390, 130.1], [768, 256.2], [1280, 427]])), "34vw");
});

test("fixed widths round up, merge, sort and choose the larger width in each range", () => {
  assert.equal(imageSizes(measurements([[1280, 160.2], [390, 160.2], [768, 160.2]])), "161px");
  assert.equal(imageSizes(measurements([[390, 160], [768, 160], [899, 160], [900, 160], [1280, 160]])), "160px");
  assert.equal(imageSizes(measurements([[390, 342], [768, 720], [1280, 960]])), "(max-width: 768px) 720px, 960px");
});

test("a breakpoint jump uses the lower viewport as inclusive max-width", () => {
  const sizes = imageSizes(measurements([[390, 195], [768, 384], [899, 449.5], [900, 300], [1280, 300]]));
  assert.equal(sizes, "(max-width: 899px) 50vw, 300px");
  // CSS max-width is inclusive at 899; fractional 899.5 belongs to the
  // next range, rather than accidentally extending the lower range to 900.
  const boundary = Number(sizes?.match(/max-width: (\d+)px/)?.[1]);
  assert.ok(899 <= boundary && 899.5 > boundary && 900 > boundary);
  assert.equal(imageSizes(measurements([[899, 160], [900, 320]])), "(max-width: 899px) 160px, 320px");
});

test("invalid or empty measurements keep the caller fallback; duplicate viewports keep the larger width", () => {
  assert.equal(imageSizes([]), undefined);
  assert.equal(imageSizes(measurements([[390, 0], [-1, 10], [768, NaN], [Infinity, 50]])), undefined);
  assert.equal(imageSizes(measurements([[390, 0.2]])), "1px");
  assert.equal(imageSizes(measurements([[390, 120], [390, 140.2]])), "141px");
});

test("first screen checks only phone and desktop, with an exclusive fold boundary", () => {
  assert.equal(imageFirstScreen([{ viewport: 390, viewportHeight: 844, top: 843.5 }]), true);
  assert.equal(imageFirstScreen([{ viewport: 390, viewportHeight: 844, top: 844 }, { viewport: 1280, viewportHeight: 800, top: 799 }]), true);
  assert.equal(imageFirstScreen([{ viewport: 390, viewportHeight: 844, top: 844 }, { viewport: 768, viewportHeight: 800, top: 1 }, { viewport: 1280, viewportHeight: 800, top: -1 }]), false);
  assert.equal(imageFirstScreen([]), false);
});

test("host result uses cover widths for sizes and first-screen facts for loading order", () => {
  assert.deepEqual(imageResult([390, 768, 1280].map((viewport) => ({ viewport, viewportHeight: 800, top: 100, width: 300, height: 400, naturalWidth: 1200, naturalHeight: 600, fit: "cover" }))), {
    sizes: "800px", widths: [390, 768, 1280].map((viewport) => ({ viewport, width: 800 })), firstScreen: true,
  });
});

test("a run of one-pixel steps still yields a sizes list", () => {
  const viewports = imageViewports([391, 392, 393]);
  const widths = viewports.map((viewport) => ({ viewport, width: viewport < 393 ? 100 : 0 }));
  assert.equal(imageSizes(widths), "100px");
  assert.equal(imageSizes(measurements([[390, 100], [391, 100], [392, 100]])), "100px");
});
