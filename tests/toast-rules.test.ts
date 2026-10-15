import { strict as assert } from "node:assert";
import { test } from "node:test";
import { TOAST_AFTER_HOLD_MS, toastLift, toastResume, type ToastBox } from "../src/components/toast-rules";

// A 1280 × 800 window: the toast sits bottom-centre, 16 px above the edge.
const toast: ToastBox = { left: 440, top: 740, width: 400, height: 44 };

test("nothing under the toast leaves it where it is", () => {
  assert.equal(toastLift(toast, [], 800), 0);
  // Beside it, above it, or with no size (hidden): not in the way.
  assert.equal(toastLift(toast, [{ left: 900, top: 740, width: 120, height: 36 }], 800), 0);
  assert.equal(toastLift(toast, [{ left: 500, top: 600, width: 120, height: 36 }], 800), 0);
  assert.equal(toastLift(toast, [{ left: 500, top: 750, width: 0, height: 0 }], 800), 0);
});

test("a pinned action row under it lifts the toast 8 px above the row", () => {
  // A row from 736 to 800 covering the whole width: the toast's bottom goes to 728.
  assert.equal(toastLift(toast, [{ left: 0, top: 736, width: 1280, height: 64 }], 800), 784 - 728);
  // A primary button just below the toast, within the gap, also lifts it.
  assert.equal(toastLift(toast, [{ left: 760, top: 788, width: 100, height: 32 }], 800), 784 - 780);
});

test("rising past one button onto another keeps rising, never above the window's middle", () => {
  const row = { left: 0, top: 740, width: 1280, height: 60 };
  const second = { left: 600, top: 700, width: 100, height: 36 };
  assert.equal(toastLift(toast, [row, second], 800), 784 - 692);
  // A tall sheet of buttons: the toast stops with its bottom at the middle (400).
  const tall = { left: 0, top: 380, width: 1280, height: 420 };
  assert.equal(toastLift(toast, [tall], 800), 784 - 400);
});

test("leaving a held toast keeps what was left of its time, at least two seconds", () => {
  assert.equal(toastResume(5000), 5000);
  assert.equal(toastResume(300), TOAST_AFTER_HOLD_MS);
  assert.equal(toastResume(-20), TOAST_AFTER_HOLD_MS);
});
