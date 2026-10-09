// Dragging something new onto the canvas: a section from the Add panel, a
// block from the rail. The editor keeps the pointer (captured on the item,
// so nothing in the page is pressed or selected); the context works out the
// target under it and draws it; near the frame's top and bottom edges the
// frame scrolls on its own; Escape or a release off the canvas cancels; a
// release on a target drops there. Alt and Tab, while dragging, are the
// context's to read (the rail's blocks step up a level with them).

import { icon } from "../icons";
import { node } from "../ui/dom";

/** What the label by the pointer says about the target under it. */
export interface DragAim<T> {
  target: T | undefined;
  /** The ghost's text below the name; empty keeps just the name. */
  where?: string;
  /** Red: the place under the pointer refuses (a release adds nothing). */
  refused?: boolean;
}

export interface InsertDragContext<T> {
  frame: HTMLElement;
  /**
   * The pointer is at `at` (frame-viewport; none: off the canvas), with Alt
   * held or not; or the frame scrolled. The context draws the target and
   * calls `show` with it, at once or after a probe of the page (the last
   * call wins, so a late probe's answer must not follow a newer one).
   */
  aim(at: { x: number; y: number } | undefined, alt: boolean, show: (aim: DragAim<T>) => void): void;
  /** Tab (1) or Shift+Tab (-1) while dragging; false lets the key do what it does. */
  step?(by: 1 | -1): boolean;
  scroll(dy: number): void;
  /** The drag ended: clear what `aim` drew. */
  clear(): void;
  drop(target: T): void;
  announce(text: string): void;
}

const THRESHOLD = 7;
const SCROLL_STEP = 14;

/**
 * Lets `source` be dragged onto the canvas as `label`; a context still
 * loading starts the drag once it arrives. Returns whether a drag just
 * ended, so the click that follows a release is not taken as a click.
 */
export function makeInsertDraggable<T>(source: HTMLElement, label: () => string,
  context: () => InsertDragContext<T> | Promise<InsertDragContext<T> | undefined> | undefined) {
  let dragged = false;
  source.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const made = context();
    if (!made) return;
    let ctx = made instanceof Promise ? undefined : made;
    // Moved past the threshold, perhaps before the context arrived.
    let crossed = false;
    let ended = false;
    const startX = event.clientX;
    const startY = event.clientY;
    const id = event.pointerId;
    let active = false;
    let ghost: HTMLElement | undefined;
    let where: HTMLElement | undefined;
    let pointer = { x: startX, y: startY };
    let alt = event.altKey;
    let target: T | undefined;
    let refused = false;
    let frameId = 0;
    dragged = false;

    function overFrame() {
      const rect = ctx!.frame.getBoundingClientRect();
      const x = pointer.x - rect.left;
      const y = pointer.y - rect.top;
      const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      return { rect, x, y, inside };
    }

    // The context shows the target it found (in order; one probed late is its to drop).
    function show(aim: DragAim<T>) {
      if (!active) return;
      target = aim.target;
      refused = Boolean(aim.refused);
      ghost?.classList.toggle("is-over", Boolean(aim.target) && !refused);
      ghost?.classList.toggle("is-refused", refused);
      if (where) {
        where.textContent = aim.where ?? "";
        where.hidden = !aim.where;
      }
      place();
    }
    function retarget() {
      const { x, y, inside } = overFrame();
      ctx!.aim(inside ? { x, y } : undefined, alt, show);
    }

    function tick() {
      const { rect, x, y } = overFrame();
      const band = Math.min(72, rect.height / 4);
      let speed = 0;
      if (x >= 0 && x <= rect.width) {
        if (y < band) speed = -Math.min(SCROLL_STEP, Math.ceil(SCROLL_STEP * (band - y) / band));
        else if (y > rect.height - band) speed = Math.min(SCROLL_STEP, Math.ceil(SCROLL_STEP * (y - rect.height + band) / band));
      }
      if (speed) ctx!.scroll(speed);
      // The page under the pointer moves with a scroll or a render.
      retarget();
      frameId = requestAnimationFrame(tick);
    }

    // From the threshold on, the pointer stays with the editor even over the frame.
    function capture() {
      try {
        source.setPointerCapture(id);
      } catch {
        // The pointer is gone already; the drag ends on the next event.
      }
    }

    function begin() {
      active = true;
      dragged = true;
      capture();
      source.classList.add("is-dragging");
      document.documentElement.classList.add("pb-is-dragging");
      ghost = node("div", "pb-drag-ghost");
      const text = node("span", "pb-drag-ghost__text");
      where = node("span", "pb-drag-ghost__where");
      where.hidden = true;
      text.append(node("span", "pb-drag-ghost__name", label()), where);
      ghost.append(icon("plus"), text);
      document.body.append(ghost);
      ctx!.announce(`Dragging ${label()}. Release over the page to add it, Escape to cancel.`);
      frameId = requestAnimationFrame(tick);
    }

    // Beside the pointer, kept inside the window.
    function place() {
      if (!ghost) return;
      const width = ghost.offsetWidth, height = ghost.offsetHeight;
      const x = Math.max(8, Math.min(pointer.x + 14, innerWidth - width - 8));
      const y = pointer.y + 10 + height > innerHeight - 8 ? pointer.y - height - 10 : pointer.y + 10;
      ghost.style.transform = `translate(${x}px, ${y}px)`;
    }

    function finish(drop: boolean) {
      ended = true;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      if (!active) {
        if (crossed) window.setTimeout(() => { dragged = false; }, 0);
        return;
      }
      active = false;
      cancelAnimationFrame(frameId);
      if (source.hasPointerCapture?.(id)) source.releasePointerCapture(id);
      source.classList.remove("is-dragging");
      document.documentElement.classList.remove("pb-is-dragging");
      ghost?.remove();
      const at = target;
      ctx!.clear();
      if (drop && at && !refused) ctx!.drop(at);
      else ctx!.announce(`${label()} was not added`);
      // The click a release makes is not a click on the item.
      window.setTimeout(() => { dragged = false; }, 0);
    }

    function onMove(move: PointerEvent) {
      if (move.pointerId !== id) return;
      pointer = { x: move.clientX, y: move.clientY };
      alt = move.altKey;
      if (!active) {
        if (Math.hypot(pointer.x - startX, pointer.y - startY) < THRESHOLD) return;
        crossed = dragged = true;
        if (!ctx) { capture(); return; }
        begin();
      }
      move.preventDefault();
      place();
      retarget();
    }
    function onUp(up: PointerEvent) {
      if (up.pointerId !== id) return;
      pointer = { x: up.clientX, y: up.clientY };
      if (active) retarget();
      finish(true);
    }
    function onCancel(cancel: PointerEvent) {
      if (cancel.pointerId === id) finish(false);
    }
    function onKey(key: KeyboardEvent) {
      if (!active) return;
      if (key.key === "Escape" && key.type === "keydown") {
        key.preventDefault();
        key.stopPropagation();
        target = undefined;
        finish(false);
      } else if (key.key === "Alt") {
        key.preventDefault();
        alt = key.type === "keydown";
        retarget();
      } else if (key.key === "Tab" && key.type === "keydown" && ctx!.step?.(key.shiftKey ? -1 : 1)) {
        key.preventDefault();
        key.stopPropagation();
        retarget();
      }
    }
    if (made instanceof Promise) {
      made.then((loaded) => {
        if (ended) return;
        if (!loaded) { finish(false); return; }
        ctx = loaded;
        if (!crossed) return;
        begin();
        place();
        retarget();
      }, () => finish(false));
    }
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
  });
  // A drag starts no text selection or native image drag.
  source.addEventListener("dragstart", (event) => event.preventDefault());
  return { justDragged: () => dragged };
}
