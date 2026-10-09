// Dragging onto the canvas: a section from the Add panel, a block from the
// rail, or a page block moved (by its name in the edit bar, or pressed in
// the page itself). The editor keeps the pointer (captured, so nothing in
// the page is pressed or selected; a press that began in the page stays
// with the frame, which relays it); the context works out the target under
// it and draws it; near the frame's top and bottom edges the frame scrolls
// on its own; Escape or a release off the canvas cancels; a release on a
// target drops there. Alt and Tab, while dragging, are the context's to read
// (blocks step up a level with them).

import { refuse } from "../components/refusal-note";
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
  /**
   * Released over `target` as last shown (none, or `refused`: no place
   * shown there); false when nothing is added (the drag announces it), true
   * when the context drops or settles the release itself.
   */
  drop(target: T | undefined, refused: boolean): boolean;
  announce(text: string): void;
}

const THRESHOLD = 7;
const SCROLL_STEP = 14;

/** A press that may become a drag: where (editor viewport), which pointer, with Alt or not. */
export interface DragPress {
  pointerId: number;
  x: number;
  y: number;
  alt: boolean;
  /** The pressed control, which wears `is-dragging`. */
  source?: HTMLElement;
  /** The source holds the pointer from the press on: a handle over the frame would lose it within 7 px. */
  hold?: boolean;
  /** A press in the page, past the threshold already: the frame keeps its pointer and relays it through the feed. */
  relayed?: boolean;
}

/** A relayed pointer's steps, in editor viewport coordinates. */
export interface DragFeed {
  move(x: number, y: number, alt: boolean): void;
  up(x: number, y: number): void;
  cancel(): void;
}

/**
 * Follows `press` until it ends: past the threshold it drags `label` with
 * the context's targets (a context still loading starts the drag once it
 * arrives). `move`: the label says moved, not added. `justDragged` tells
 * the click a release makes from a click.
 */
export function trackDrag<T>(press: DragPress, label: () => string,
  context: () => InsertDragContext<T> | Promise<InsertDragContext<T> | undefined> | undefined, move = false): DragFeed & { justDragged(): boolean } {
  const id = press.pointerId;
  const source = press.source;
  let dragged = false;
  const made = context();
  let ctx = made instanceof Promise ? undefined : made;
  // Moved past the threshold, perhaps before the context arrived.
  let crossed = Boolean(press.relayed);
  let ended = !made;
  let active = false;
  let ghost: HTMLElement | undefined;
  let where: HTMLElement | undefined;
  // Holds the pointer (or, for a relayed press, the keys) while dragging.
  let holder: HTMLElement | undefined;
  let before: HTMLElement | null = null;
  let pointer = { x: press.x, y: press.y };
  let alt = press.alt;
  let target: T | undefined;
  let refused = false;
  let frameId = 0;
  const done = move ? "moved" : "added";

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

  // The pointer stays with the editor even over the frame.
  function capture(on: HTMLElement) {
    try {
      on.setPointerCapture(id);
    } catch {
      // The pointer is gone already; the drag ends on the next event.
    }
  }

  function begin() {
    active = true;
    dragged = true;
    // An element of its own holds the pointer, so a control re-rendered meanwhile never loses it.
    holder = node("div", "pb-drag-holder");
    holder.tabIndex = -1;
    document.body.append(holder);
    if (press.relayed) {
      // Escape, Alt and Tab come to the editor, not the page that had focus.
      before = document.activeElement as HTMLElement | null;
      holder.focus({ preventScroll: true });
    } else capture(holder);
    source?.classList.add("is-dragging");
    document.documentElement.classList.add("pb-is-dragging");
    ghost = node("div", "pb-drag-ghost");
    const text = node("span", "pb-drag-ghost__text");
    where = node("span", "pb-drag-ghost__where");
    where.hidden = true;
    text.append(node("span", "pb-drag-ghost__name", label()), where);
    if (!move) ghost.append(icon("plus"));
    ghost.append(text);
    document.body.append(ghost);
    ctx!.announce(`Dragging ${label()}. Release over the page to ${move ? "move" : "add"} it, Escape to cancel.`);
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
    if (ended) return;
    ended = true;
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    if (source?.hasPointerCapture?.(id)) source.releasePointerCapture(id);
    if (!active) {
      if (crossed) window.setTimeout(() => { dragged = false; }, 0);
      return;
    }
    active = false;
    cancelAnimationFrame(frameId);
    const refocus = holder === document.activeElement;
    holder?.remove();
    if (refocus) before?.focus({ preventScroll: true });
    source?.classList.remove("is-dragging");
    document.documentElement.classList.remove("pb-is-dragging");
    ghost?.remove();
    const at = target;
    ctx!.clear();
    if (!drop) ctx!.announce(`${label()} was not ${done}`);
    // A refused release keeps its reason on screen by the pointer once the label goes.
    else if (!ctx!.drop(at, refused)) refuse((refused && where?.textContent) || `${label()} was not ${done}`, { pointer });
    // The click a release makes is not a click on the item.
    window.setTimeout(() => { dragged = false; }, 0);
  }

  function step(x: number, y: number, altKey: boolean) {
    if (ended) return;
    pointer = { x, y };
    // A relayed press has the keys (the holder's focus): the page's own idea of Alt can lag.
    if (!press.relayed) alt = altKey;
    if (!active) {
      if (Math.hypot(x - press.x, y - press.y) < THRESHOLD) return;
      crossed = dragged = true;
      if (!ctx) { if (source) capture(source); return; }
      begin();
    }
    place();
    retarget();
  }
  function release(x: number, y: number) {
    if (ended) return;
    pointer = { x, y };
    if (active) retarget();
    finish(true);
  }
  function onMove(event: PointerEvent) {
    if (event.pointerId !== id) return;
    step(event.clientX, event.clientY, event.altKey);
    if (active) event.preventDefault();
  }
  function onUp(event: PointerEvent) {
    if (event.pointerId === id) release(event.clientX, event.clientY);
  }
  function onCancel(event: PointerEvent) {
    if (event.pointerId === id) finish(false);
  }
  function onKey(key: KeyboardEvent) {
    // Escape also cancels a drag whose context is still loading.
    if (key.key === "Escape" && key.type === "keydown" && (active || crossed)) {
      key.preventDefault();
      key.stopPropagation();
      target = undefined;
      finish(false);
      return;
    }
    if (!active) return;
    if (key.key === "Alt") {
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
  if (!ended) {
    if (!press.relayed) {
      if (press.hold && source) capture(source);
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
    } else if (ctx) {
      begin();
      place();
      retarget();
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
  }
  return {
    move: step,
    up: release,
    cancel: () => finish(false),
    justDragged: () => dragged,
  };
}

/**
 * Lets `source` be dragged onto the canvas as `label`; a context still
 * loading starts the drag once it arrives. Returns whether a drag just
 * ended, so the click that follows a release is not taken as a click.
 */
export function makeInsertDraggable<T>(source: HTMLElement, label: () => string,
  context: () => InsertDragContext<T> | Promise<InsertDragContext<T> | undefined> | undefined) {
  let last: { justDragged(): boolean } | undefined;
  source.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    last = trackDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, alt: event.altKey, source }, label, context);
  });
  // A drag starts no text selection or native image drag.
  source.addEventListener("dragstart", (event) => event.preventDefault());
  return { justDragged: () => Boolean(last?.justDragged()) };
}
