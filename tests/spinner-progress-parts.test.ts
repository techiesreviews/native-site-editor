import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SPINNER_LABEL, DEFAULT_SPINNER_SIZE, SPINNER_PLACES, SPINNER_SIZES, spinnerAttributes, spinnerPlace, spinnerSize } from "../src/ui/parts/spinner-options.ts";
import { DEFAULT_PROGRESS_LABEL, PROGRESS_STEPS, progressAttributes, progressMax, progressPercent, progressValue } from "../src/ui/parts/progress-options.ts";
import { PARTS } from "../src/catalogue/parts.ts";

// The Spinner and Progress bar parts' options become markup (atomic catalogue ticket 14): one class each, the variants
// as data attributes, a name for assistive technology.

test("spinner size: small, medium or large; anything else is medium", () => {
  assert.deepEqual([...SPINNER_SIZES], ["small", "medium", "large"]);
  for (const size of SPINNER_SIZES) assert.equal(spinnerSize(size), size);
  assert.equal(spinnerSize(undefined), DEFAULT_SPINNER_SIZE);
  assert.equal(spinnerSize("huge"), "medium");
});

test("spinner place: inline or overlay; anything else is inline", () => {
  assert.deepEqual([...SPINNER_PLACES], ["inline", "overlay"]);
  assert.equal(spinnerPlace("overlay"), "overlay");
  assert.equal(spinnerPlace(undefined), "inline");
  assert.equal(spinnerPlace("floating"), "inline");
});

test("spinner markup: one class, size and place as data, a name, no extra classes", () => {
  assert.deepEqual(spinnerAttributes(), { class: "spinner", "data-size": "medium", "data-place": "inline", role: "img", "aria-label": DEFAULT_SPINNER_LABEL });
  assert.deepEqual(spinnerAttributes({ size: "large", place: "overlay", label: "Saving" }), {
    class: "spinner", "data-size": "large", "data-place": "overlay", role: "img", "aria-label": "Saving",
  });
  assert.equal(spinnerAttributes({ label: "   " })["aria-label"], "Loading", "a blank label is the default one");
  assert.deepEqual(spinnerAttributes({ size: "tiny", place: "sideways" }), spinnerAttributes(), "unknown options fall back to the defaults");
});

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

test("the board's Spinner shows every size and place, and its options reach the part", () => {
  const part = PARTS.find((entry) => entry.id === "spinner");
  assert.ok(part && "rows" in part);
  assert.equal(part.area, "atoms");
  assert.deepEqual(part.columns.map((column) => column.values?.size), [...SPINNER_SIZES]);
  assert.deepEqual(part.rows.map((row) => row.values?.place), [...SPINNER_PLACES]);
  const offered = (key: string) => part.controls.flatMap((control) => (control.kind === "choice" && control.key === key ? control.choices.map(([value]) => value) : []));
  assert.deepEqual(offered("size"), [...SPINNER_SIZES]);
  assert.deepEqual(offered("place"), [...SPINNER_PLACES]);
  assert.ok(part.controls.some((control) => control.kind === "text" && control.key === "label"));
});

test("the board's Progress bar shows unknown and each step, and its options reach the part", () => {
  const part = PARTS.find((entry) => entry.id === "progress");
  assert.ok(part && "rows" in part);
  assert.equal(part.area, "atoms");
  const amounts = part.rows.map((row) => row.values?.amount);
  assert.deepEqual(amounts, ["unknown", ...PROGRESS_STEPS.map(String)]);
  const control = part.controls.find((entry) => entry.kind === "choice" && entry.key === "amount");
  assert.ok(control && control.kind === "choice");
  assert.deepEqual(control.choices.map(([value]) => value), amounts);
  assert.ok(amounts.includes(String(part.defaults.amount)), "the default amount is one the board offers");
});
