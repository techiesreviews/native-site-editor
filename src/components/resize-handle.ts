import { icon } from "../icons";

// Shared behaviour of the three splitters (sidebar width, code height, code
// pane width): each is also its panel's toggle. A press released within
// `clickSlop` px of where it went down is a click and toggles; anything
// further is a drag that resizes and never toggles.
export const clickSlop = 4;

/** The bar shown in the handle, with a chevron pointing the way a click moves the edge. */
export function createGrip(): HTMLSpanElement {
  const grip = document.createElement("span");
  grip.className = "resize-grip";
  grip.setAttribute("aria-hidden", "true");
  grip.append(icon("caret-left", 12));
  return grip;
}

export interface PressHandlers {
  /** Return false to ignore the press. */
  start(event: PointerEvent): boolean;
  /** Called for every move once the pointer has left the click slop. */
  move(event: PointerEvent): void;
  /** `click` is true for a release that never left the click slop. */
  end(click: boolean): void;
}

export function trackPress(handle: HTMLElement, handlers: PressHandlers) {
  let press: { x: number; y: number; moved: boolean } | undefined;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !handlers.start(event)) return;
    event.preventDefault();
    // Focus follows the press, but the keyboard focus ring does not: a click
    // that collapses a panel would otherwise leave a full-height outline.
    handle.focus({ focusVisible: false } as FocusOptions);
    press = { x: event.clientX, y: event.clientY, moved: false };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!press) return;
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < clickSlop) return;
    press.moved = true;
    handlers.move(event);
  });
  const finish = (released: boolean) => {
    if (!press) return;
    const click = released && !press.moved;
    press = undefined;
    handlers.end(click);
  };
  handle.addEventListener("pointerup", () => finish(true));
  handle.addEventListener("pointercancel", () => finish(false));
  handle.addEventListener("lostpointercapture", () => finish(false));
}

/** Enter or Space on a focused handle. */
export const isToggleKey = (event: KeyboardEvent) => event.key === "Enter" || event.key === " ";
