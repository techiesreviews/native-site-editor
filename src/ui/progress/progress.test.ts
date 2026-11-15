import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROGRESS_LABEL, progressAttributes, progressMax, progressPercent, progressValue } from "./progress-options.ts";

// The Progress bar part's options become markup: one class, the variants as data attributes, a name for assistive
// technology.

test("progress value: a number kept inside 0 and max, or null when not known", () => {
  assert.equal(progressValue(60), 60);
  assert.equal(progressValue("30"), 30);
  assert.equal(progressValue(0), 0, "0 is known, not missing");
  assert.equal(progressValue(-5), 0);
  assert.equal(progressValue(140), 100);
  assert.equal(progressValue(7, 5), 5);
  for (const missing of [undefined, null, "", "  ", "soon", NaN, Infinity]) assert.equal(progressValue(missing), null, String(missing));
});

test("progress max: 100 unless a number above 0 is given", () => {
  assert.equal(progressMax(undefined), 100);
  assert.equal(progressMax(8), 8);
  assert.equal(progressMax("20"), 20);
  for (const bad of [0, -3, "", "many", NaN]) assert.equal(progressMax(bad), 100, String(bad));
});

test("progress mode: known with a value (0 included), unknown without", () => {
  assert.equal(progressAttributes({ value: 0 })["data-mode"], "known");
  assert.equal(progressAttributes({ value: "50" })["data-mode"], "known");
  assert.equal(progressAttributes({})["data-mode"], "unknown");
  assert.equal(progressAttributes({ value: null })["data-mode"], "unknown");
});

test("progress markup, known: the value out of max for assistive technology", () => {
  assert.deepEqual(progressAttributes({ value: 60, label: "Adding" }), {
    class: "progress", "data-mode": "known", role: "progressbar", "aria-label": "Adding",
    "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "60",
  });
  const out = progressAttributes({ value: 3, max: 8 });
  assert.equal(out["aria-valuemax"], "8");
  assert.equal(out["aria-valuenow"], "3");
  assert.ok(!("data-percent" in out), "the fill is the style's, not markup");
});

test("progress percent: how far the bar fills, or null when not known", () => {
  assert.equal(progressPercent({ value: 60 }), 60);
  assert.equal(progressPercent({ value: 3, max: 8 }), 37.5);
  assert.equal(progressPercent({ value: 900 }), 100, "past the end is the end");
  assert.equal(progressPercent({ value: 0 }), 0);
  assert.equal(progressPercent({}), null);
  assert.equal(progressPercent({ value: "soon" }), null);
});

test("progress markup, unknown: no value anywhere, so assistive technology says it is busy without a number", () => {
  assert.deepEqual(progressAttributes(), { class: "progress", "data-mode": "unknown", role: "progressbar", "aria-label": DEFAULT_PROGRESS_LABEL });
  assert.deepEqual(Object.keys(progressAttributes({ label: " " })).sort(), ["aria-label", "class", "data-mode", "role"]);
  assert.equal(progressAttributes({ label: " " })["aria-label"], "Progress");
});
