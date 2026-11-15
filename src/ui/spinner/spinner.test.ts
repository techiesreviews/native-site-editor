import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SPINNER_LABEL, DEFAULT_SPINNER_SIZE, SPINNER_PLACES, SPINNER_SIZES, spinnerAttributes, spinnerPlace, spinnerSize } from "./spinner-options.ts";

// The Spinner part's options become markup: one class, the variants as data attributes, a name for assistive
// technology.

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
