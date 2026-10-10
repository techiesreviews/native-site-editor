// The canvas's click and edit rules (ticket 79), pure: the preview runtime
// (src/components/native-preview-runtime.js) bundles this module and acts on
// its answer; tests/canvas-gesture.test.ts tests it in node.
//
// One rule for the whole page: a click selects any element and never puts a
// caret in text; a double-click edits (the caret at the point in text, the
// image chooser for an image); Enter on selected text edits it; while typing,
// Enter or Escape leaves typing (what was typed kept) with the element still
// selected, and otherwise Escape selects the parent. Presses and clicks inside
// the text being typed in stay the browser's own: they move the caret.

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
  /** The target is an editable image. */
  image?: boolean;
};

export type GestureAction = "none" | "stop" | "select" | "edit" | "image" | "caret" | "leave" | "parent";

export function canvasGesture(gesture: CanvasGesture, at: GestureAt): GestureAction {
  if (gesture === "escape") return at.editing ? "leave" : at.selected ? "parent" : "none";
  if (gesture === "enter") return at.editing ? "leave" : at.selected && at.text ? "edit" : "none";
  if (at.inside) return "caret";
  if (gesture === "press") return at.editing ? "stop" : "none";
  if (gesture === "click") return "select";
  if (gesture === "double") return at.text ? "edit" : at.image ? "image" : "none";
  return "none";
}
