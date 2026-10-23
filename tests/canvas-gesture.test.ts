import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canvasGesture } from "../src/page-builder/rules/canvas-gesture.ts";

// The canvas's click and edit rules; the preview runtime bundles the same module.
test("a click on text starts typing; a click beside it, on an image or a section only selects", () => {
  assert.equal(canvasGesture("click", { text: true, onText: true }), "edit");
  assert.equal(canvasGesture("click", { text: true }), "select");
  assert.equal(canvasGesture("click", { image: true }), "select");
  assert.equal(canvasGesture("click", { onText: true }), "select");
  assert.equal(canvasGesture("click", {}), "select");
  // A click on other text while typing types there (the press stopped the typing).
  assert.equal(canvasGesture("press", { editing: true, text: true }), "stop");
  assert.equal(canvasGesture("click", { editing: true, text: true, onText: true }), "edit");
  // Beside other text while typing: the press stopped the typing, and the click only selects.
  assert.equal(canvasGesture("click", { editing: true, text: true, onText: false }), "select");
  assert.equal(canvasGesture("press", { text: true }), "none");
});

test("a double-click chooses an image and types into text clicked beside", () => {
  assert.equal(canvasGesture("double", { text: true }), "edit");
  assert.equal(canvasGesture("double", { text: true, editing: true }), "edit");
  assert.equal(canvasGesture("double", { image: true }), "image");
  // A section, a fixed part of a component: selected by the click, nothing more.
  assert.equal(canvasGesture("double", {}), "none");
});

test("while typing, presses, clicks and double-clicks in that text are the browser's", () => {
  for (const gesture of ["press", "click", "double"] as const) assert.equal(canvasGesture(gesture, { inside: true, editing: true, text: true, onText: true }), "caret");
});

test("Enter starts typing in selected text; Enter or Escape leaves typing; then Escape climbs", () => {
  assert.equal(canvasGesture("enter", { selected: true, text: true }), "edit");
  assert.equal(canvasGesture("enter", { selected: true }), "none");
  assert.equal(canvasGesture("enter", {}), "none");
  assert.equal(canvasGesture("enter", { editing: true, selected: true, text: true }), "leave");
  assert.equal(canvasGesture("escape", { editing: true, selected: true, text: true }), "leave");
  assert.equal(canvasGesture("escape", { selected: true, text: true }), "parent");
  assert.equal(canvasGesture("escape", {}), "none");
});
