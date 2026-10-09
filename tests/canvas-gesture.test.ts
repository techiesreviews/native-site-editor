import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The preview runtime is a classic script with no imports: its click and
// edit rules sit in one marked block with no DOM in it, read from the file.
const runtime = readFileSync(new URL("../src/components/native-preview-runtime.js", import.meta.url), "utf8");
const block = /\/\/ ---- Click and edit rules[^\n]*\n([\s\S]*?)\/\/ ---- End of click and edit rules ----/.exec(runtime)?.[1];
assert.ok(block, "the runtime's click and edit rules block");
type Gesture = "press" | "click" | "double" | "enter" | "escape";
type At = { inside?: boolean; editing?: boolean; selected?: boolean; text?: boolean; image?: boolean };
const canvasGesture = new Function(`${block}\nreturn canvasGesture;`)() as (gesture: Gesture, at: At) => string;

test("a click selects text, images and buttons alike, and never starts typing", () => {
  assert.equal(canvasGesture("click", { text: true }), "select");
  assert.equal(canvasGesture("click", { image: true }), "select");
  assert.equal(canvasGesture("click", {}), "select");
  // A click on other text while typing selects it (the press stopped the typing).
  assert.equal(canvasGesture("press", { editing: true, text: true }), "stop");
  assert.equal(canvasGesture("click", { editing: true, text: true }), "select");
  assert.equal(canvasGesture("press", { text: true }), "none");
});

test("a double-click types into text at the point and chooses an image", () => {
  assert.equal(canvasGesture("double", { text: true }), "edit");
  assert.equal(canvasGesture("double", { text: true, editing: true }), "edit");
  assert.equal(canvasGesture("double", { image: true }), "image");
  // A section, a fixed part of a component: selected by the click, nothing more.
  assert.equal(canvasGesture("double", {}), "none");
});

test("while typing, presses, clicks and double-clicks in that text are the browser's", () => {
  for (const gesture of ["press", "click", "double"] as const) assert.equal(canvasGesture(gesture, { inside: true, editing: true, text: true }), "caret");
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
