import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_MIN_WIDTH,
  deviceFor,
  innermostAt,
  readCrumbs,
  readStoredWidth,
  settleWidth,
  widthFor,
} from "../src/page-builder/canvas-model.ts";

test("a dragged or typed width is whole pixels, at least the minimum, and fills the canvas at its edge", () => {
  assert.equal(settleWidth(500.4, 1000), 500);
  assert.equal(settleWidth(12, 1000), CANVAS_MIN_WIDTH);
  assert.equal(settleWidth(1000, 1000), "fill");
  assert.equal(settleWidth(1400, 1000), "fill");
  assert.equal(settleWidth(Number.NaN, 1000), "fill");
  // A canvas not laid out yet does not swallow the width.
  assert.equal(settleWidth(768, 0), 768);
});

test("devices name their widths, and a width names its device", () => {
  assert.equal(widthFor("desktop"), "fill");
  assert.equal(widthFor("tablet"), 768);
  assert.equal(widthFor("mobile"), 390);
  assert.equal(deviceFor("fill"), "desktop");
  assert.equal(deviceFor(768), "tablet");
  assert.equal(deviceFor(390), "mobile");
  assert.equal(deviceFor(500), undefined);
});

test("the session's width reads back safely", () => {
  assert.equal(readStoredWidth(null), "fill");
  assert.equal(readStoredWidth("fill"), "fill");
  assert.equal(readStoredWidth("768"), 768);
  assert.equal(readStoredWidth("12"), "fill");
  assert.equal(readStoredWidth("abc"), "fill");
  assert.equal(readStoredWidth("500.5"), "fill");
});

test("crumbs from the runtime are checked", () => {
  assert.deepEqual(readCrumbs(undefined), []);
  assert.deepEqual(
    readCrumbs([{ label: "main.page", kind: "element" }, { label: "project-card", kind: "component" }, { label: "", kind: "element" }, "x", { label: "h3", kind: "odd" }]),
    [{ label: "main.page", kind: "element" }, { label: "project-card", kind: "component" }, { label: "h3", kind: "element" }],
  );
  assert.equal(readCrumbs(Array.from({ length: 100 }, () => ({ label: "div" }))).length, 64);
  assert.equal(readCrumbs([{ label: "x".repeat(200) }])[0].label.length, 80);
});

test("the innermost extent holding an offset wins; an end tag's end belongs to the parent", () => {
  // <section><h1>Hi</h1></section>: h1 is 9..20, section 0..30.
  const extents = [{ start: 9, end: 20 }, { start: 0, end: 30 }];
  assert.equal(innermostAt(extents, 9), 0);
  assert.equal(innermostAt(extents, 19), 0);
  assert.equal(innermostAt(extents, 20), 1);
  assert.equal(innermostAt(extents, 30), -1);
});
