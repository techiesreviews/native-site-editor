// The canvas's click and edit rules (ticket 79, slice 28), pure: the preview
// runtime (src/components/native-preview-runtime.js) bundles this module and
// acts on its answer; tests/canvas-gesture.test.ts tests it in node.
//
// One rule for the whole page: a click on editable text (a link's and a
// button's too) selects it and starts typing, the caret where it was clicked;
// a click anywhere else (an image, a section, the space beside a line of
// text) selects without typing. A double-click edits what a click did not:
// the image chooser for an image, typing at the point for text clicked
// beside. Enter on selected text edits it; while typing, Enter or Escape
// leaves typing (what was typed kept) with the element still selected, and
// otherwise Escape selects the parent. Clicks inside the text being typed in
// stay the browser's own: they move the caret, a double-click selects a word
// and Shift+click extends. A press and drag moves the block, from text too
// (the runtime's press-drag, not these rules).

export type CanvasGesture = "press" | "click" | "double" | "enter" | "escape";

/** Where a gesture lands. For keys the target is the selection. */
export type GestureAt = {
  /** Inside the text being typed in. */
  inside?: boolean;
  /** Something is being typed in. */
  editing?: boolean;
  /** Something is selected. */
  selected?: boolean;
  /** The target is editable text. */
  text?: boolean;
  /** The pointer is on the target's text itself, not the space around it. */
  onText?: boolean;
  /** The target is an editable image. */
  image?: boolean;
};

export type GestureAction = "none" | "stop" | "select" | "edit" | "image" | "caret" | "leave" | "parent";

export function canvasGesture(gesture: CanvasGesture, at: GestureAt): GestureAction {
  if (gesture === "escape") return at.editing ? "leave" : at.selected ? "parent" : "none";
  if (gesture === "enter") return at.editing ? "leave" : at.selected && at.text ? "edit" : "none";
  if (at.inside) return "caret";
  if (gesture === "press") return at.editing ? "stop" : "none";
  if (gesture === "click") return at.text && at.onText ? "edit" : "select";
  if (gesture === "double") return at.text ? "edit" : at.image ? "image" : "none";
  return "none";
}
