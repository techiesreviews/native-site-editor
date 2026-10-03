// Dragging a section from the Add panel onto the canvas. The editor keeps
// the pointer (captured on the item, so nothing in the page is pressed or
// selected) and works out the gap under it from the insert points the
// runtime reports; near the frame's top and bottom edges the frame scrolls
// on its own; Escape or a release off the canvas cancels; a release on a
// gap inserts there, the same edit as a click on that gap's plus.

import type { InsertPoint } from "../components/insert-controls";
import { icon } from "../icons";
import { node } from "../ui/dom";
import { pointAt } from "./insert-target";

export interface InsertDragContext {
  frame: HTMLElement;
  points(): InsertPoint[];
  // The gap the section `name` would go into (none: off the canvas), and what its drop line says.
  target(point: InsertPoint | undefined, label: string, name: string): void;
  scroll(dy: number): void;
  drop(point: InsertPoint): void;
  announce(text: string): void;
}

const THRESHOLD = 5;
const SCROLL_STEP = 14;

/**
 * Lets `source` be dragged onto the canvas as the section `label`. Returns
 * whether a drag just ended, so the click that follows a release is not
 * taken as a click.
 */
export function makeInsertDraggable(source: HTMLElement, label: () => string, context: () => InsertDragContext | undefined) {
  let dragged = false;
  source.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const ctx = context();
    if (!ctx) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const id = event.pointerId;
    let active = false;
    let ghost: HTMLElement | undefined;
    let pointer = { x: startX, y: startY };
    let target: InsertPoint | undefined;
    let frameId = 0;
    dragged = false;

    function overFrame() {
      const rect = ctx!.frame.getBoundingClientRect();
      const x = pointer.x - rect.left;
      const y = pointer.y - rect.top;
      const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      return { rect, x, y, inside };
    }

    function retarget() {
      const { x, y, inside } = overFrame();
      const next = inside ? pointAt(ctx!.points(), x, y) : undefined;
      const same = next && target && next.parent.join(".") === target.parent.join(".") && next.index === target.index;
      if (same || (!next && !target)) return;
      target = next;
      ghost?.classList.toggle("is-over", Boolean(next));
      ctx!.target(next, `Add “${label()}” here`, label());
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
      // The runtime reports the gaps again after a scroll or a render.
      retarget();
      frameId = requestAnimationFrame(tick);
    }

    function begin() {
      active = true;
      dragged = true;
      try {
        source.setPointerCapture(id);
      } catch {
        // The pointer is gone already; the drag ends on the next event.
      }
      source.classList.add("is-dragging");
      document.documentElement.classList.add("pb-is-dragging");
      ghost = node("div", "pb-drag-ghost");
      ghost.append(icon("plus"), node("span", "", label()));
      document.body.append(ghost);
      ctx!.announce(`Dragging ${label()}. Release over the page to add it, Escape to cancel.`);
      frameId = requestAnimationFrame(tick);
    }

    function place() {
      if (ghost) ghost.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 10}px)`;
    }

    function finish(drop: boolean) {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("keydown", onKey, true);
      if (!active) return;
      cancelAnimationFrame(frameId);
      if (source.hasPointerCapture?.(id)) source.releasePointerCapture(id);
      source.classList.remove("is-dragging");
      document.documentElement.classList.remove("pb-is-dragging");
      ghost?.remove();
      const at = target;
      ctx!.target(undefined, "", label());
      if (drop && at) ctx!.drop(at);
      else ctx!.announce(`${label()} was not added`);
      // The click a release makes is not a click on the item.
      window.setTimeout(() => { dragged = false; }, 0);
    }

    function onMove(move: PointerEvent) {
      if (move.pointerId !== id) return;
      pointer = { x: move.clientX, y: move.clientY };
      if (!active) {
        if (Math.hypot(pointer.x - startX, pointer.y - startY) < THRESHOLD) return;
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
      if (key.key !== "Escape" || !active) return;
      key.preventDefault();
      key.stopPropagation();
      target = undefined;
      finish(false);
    }
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
  });
  // A drag starts no text selection or native image drag.
  source.addEventListener("dragstart", (event) => event.preventDefault());
  return { justDragged: () => dragged };
}
