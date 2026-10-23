import { test } from "node:test";
import assert from "node:assert/strict";
import { pickerClose } from "../src/page-builder/media-picker-close";

// Ticket 27: a picker closed because another workspace was opened cancels no Use under way (it lands
// in the picker's own workspace); Cancel, Escape or the workspace closing (sign-out) cancel it.
test("a Use under way when the picker closes for a switch is not cancelled, and counts as used", () => {
  const state = pickerClose();
  state.leave(true); state.closed();
  assert.equal(state.cancelled(), false);
  assert.equal(state.used(), true);
});

test("a Use under way when the picker closes by Escape, Cancel or the workspace closing is cancelled", () => {
  for (const close of ["escape", "workspace closed"] as const) {
    const state = pickerClose();
    if (close === "workspace closed") state.leave(false);
    state.closed();
    assert.equal(state.cancelled(), true, close);
    assert.equal(state.used(), false, close);
  }
});

test("a Use that finishes with the picker still open is not cancelled", () => {
  const state = pickerClose();
  assert.equal(state.cancelled(), false);
  assert.equal(state.used(), true);
});
