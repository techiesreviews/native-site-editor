import { node, button } from "../ui/dom";
import { icon } from "../icons";
import "./insert-controls.css";

// Plus buttons between page sections. The preview runtime reports each
// place a section can go (the gaps between the children of a page element
// that holds sections); the buttons sit over the frame on those gaps, shown
// only just above and below the item under the pointer (or while focused or
// open). A plus opens the Add panel (src/page-builder/add-panel.ts) for its
// gap. While a section is dragged in the preview, or one is dragged from
// the Add panel, every gap of the target's parent shows instead, the one
// under the pointer expanded and labelled "Drop here".

export interface InsertPoint {
  // Page file the point belongs to.
  path: string;
  // Element-child indexes of the containing element from the page root.
  parent: number[];
  // Position among that element's element children.
  index: number;
  // Frame-viewport geometry of the gap.
  top: number;
  left: number;
  width: number;
  // Label of the item the insertion goes before; empty at the end.
  before: string;
  // The containing element's tag ("" for the page root).
  tag?: string;
  // The point is a <main> with no element and no text: the canvas shows its empty
  // state there (src/page-builder/canvas-overlays.ts), `height` tall.
  empty?: boolean;
  height?: number;
}

export interface InsertChoice {
  tag: string;
  label: string;
}

interface InsertHandlers {
  // A plus was pressed: open the Add panel for its point.
  onOpen(point: InsertPoint, plus: HTMLElement): void;
  // The plus of the point the panel is open for was pressed again.
  onClose?(): void;
}

const keyOf = (point: InsertPoint) => `${point.path}|${point.parent.join(".")}|${point.index}`;

export function createInsertControls(pane: HTMLElement, frame: HTMLElement, handlers: InsertHandlers) {
  const layer = node("div", "insert-layer");
  pane.append(layer);

  let points: InsertPoint[] = [];
  const plusByKey = new Map<string, HTMLElement>();
  let openKey: string | undefined;
  // The hovered item in the preview: its container's path and its index there.
  let near: { parent: string; index: number } | undefined;
  let pointerOnPlus = false;
  let leaveTimer = 0;
  // A section being dragged in the preview, or one from the Add panel: its
  // parent's gaps are the targets.
  let drag: { parent: string; index: number | undefined } | undefined;
  let dropLabel = "Drop here";
  let collisionFrame = 0;

  // Card controls report layout changes; measure only actual painted controls,
  // rather than guessing where a ghost's button will land.
  function scheduleCollisions() {
    if (collisionFrame) return;
    collisionFrame = requestAnimationFrame(() => {
      collisionFrame = 0;
      const bounds = layer.getBoundingClientRect();
      const blockers = [...pane.querySelectorAll<HTMLElement>(".card-ghost__add, .card-add:not([hidden])")]
        .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
      const overlaps = (rect: DOMRect, left = rect.left) => blockers.some(other =>
        left < other.right + 4 && left + rect.width > other.left - 4 && rect.top < other.bottom + 4 && rect.bottom > other.top - 4);
      for (const row of plusByKey.values()) {
        const plus = row.querySelector<HTMLElement>(".insert-point__plus")!;
        plus.style.left = "50%";
        row.classList.remove("is-occluded");
        if (drag || row.hidden) continue;
        const rect = plus.getBoundingClientRect();
        if (!overlaps(rect)) continue;
        const candidates = blockers.flatMap(other => [other.right + 8, other.left - rect.width - 8])
          .sort((a, b) => Math.abs(a - rect.left) - Math.abs(b - rect.left));
        const left = candidates.find(value => value >= bounds.left + 4 && value + rect.width <= bounds.right - 4 && !overlaps(rect, value));
        if (left === undefined) row.classList.add("is-occluded");
        else {
          const rowRect = row.getBoundingClientRect();
          const scale = row.offsetWidth ? rowRect.width / row.offsetWidth : 0;
          if (scale <= 0) row.classList.add("is-occluded");
          else plus.style.left = `${(left + rect.width / 2 - rowRect.left) / scale}px`;
        }
      }
      layer.classList.toggle("has-occluded-focus", Boolean(layer.querySelector(".is-occluded:focus-within, .is-occluded.is-open")));
    });
  }
  pane.addEventListener("card-controls-layout", scheduleCollisions);
  layer.addEventListener("focusin", scheduleCollisions);
  layer.addEventListener("focusout", scheduleCollisions);

  function geometry() {
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    return { frameRect, left: frameRect.left - paneRect.left, top: frameRect.top - paneRect.top };
  }

  function layout() {
    const { frameRect, left, top } = geometry();
    Object.assign(layer.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${frameRect.width}px`,
      height: `${frameRect.height}px`,
    });
    layer.classList.toggle("is-dragging", Boolean(drag));
    const seen = new Set<string>();
    for (const point of points) {
      const key = keyOf(point);
      seen.add(key);
      let row = plusByKey.get(key);
      if (!row) {
        row = node("div", "insert-point");
        row.append(node("span", "insert-point__line"));
        const plus = button("", () => toggle(key), "insert-point__plus");
        plus.append(icon("plus"));
        // Moving from the preview onto a plus keeps the pair shown.
        plus.addEventListener("pointerenter", () => {
          pointerOnPlus = true;
          clearTimeout(leaveTimer);
        });
        plus.addEventListener("pointerleave", () => {
          pointerOnPlus = false;
          scheduleLeave();
        });
        plus.setAttribute("aria-haspopup", "dialog");
        plus.setAttribute("aria-expanded", "false");
        row.append(plus, node("span", "insert-point__drop", "Drop here"));
        plusByKey.set(key, row);
        layer.append(row);
      }
      const plus = row.querySelector<HTMLButtonElement>(".insert-point__plus")!;
      const where = point.before ? `before “${point.before}”` : "at the end";
      plus.setAttribute("aria-label", `Add a section ${where}`);
      plus.title = `Add a section ${where}`;
      // An empty <main> shows the canvas's empty state in its place.
      row.hidden = point.top < 0 || point.top > frameRect.height || Boolean(point.empty);
      row.querySelector(".insert-point__drop")!.textContent = dropLabel;
      row.classList.toggle("is-near", Boolean(near && near.parent === point.parent.join(".") &&
        (point.index === near.index || point.index === near.index + 1)));
      const inDrag = Boolean(drag && drag.parent === point.parent.join("."));
      row.classList.toggle("is-drag", inDrag);
      row.classList.toggle("is-target", inDrag && point.index === drag!.index);
      Object.assign(row.style, { left: `${point.left}px`, top: `${point.top}px`, width: `${point.width}px` });
    }
    for (const [key, row] of plusByKey) {
      if (seen.has(key)) continue;
      row.remove();
      plusByKey.delete(key);
    }
    if (openKey && !plusByKey.has(openKey)) openKey = undefined;
    scheduleCollisions();
  }
  const resize = new ResizeObserver(() => layout());
  resize.observe(frame);
  resize.observe(pane);

  function scheduleLeave() {
    clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (pointerOnPlus) return;
      near = undefined;
      layout();
    }, 300);
  }

  function toggle(key: string) {
    if (openKey === key) {
      handlers.onClose?.();
      return;
    }
    const at = points.find((item) => keyOf(item) === key);
    const plus = plusByKey.get(key)?.querySelector<HTMLElement>(".insert-point__plus");
    if (at && plus) handlers.onOpen(at, plus);
  }

  /** Marks the plus whose point the Add panel is open for (none: closed), and gives it focus back on close. */
  function markOpen(key: string | undefined, restoreFocus = false) {
    const previous = openKey ? plusByKey.get(openKey) : undefined;
    openKey = key;
    if (previous && previous !== (key ? plusByKey.get(key) : undefined)) {
      previous.classList.remove("is-open");
      const plus = previous.querySelector<HTMLElement>(".insert-point__plus");
      plus?.setAttribute("aria-expanded", "false");
      if (restoreFocus) plus?.focus();
    }
    const row = key ? plusByKey.get(key) : undefined;
    row?.classList.add("is-open");
    row?.querySelector(".insert-point__plus")?.setAttribute("aria-expanded", "true");
    scheduleCollisions();
  }

  return {
    /** The runtime reported where sections can go on the current page. */
    update(next: InsertPoint[]) {
      points = next;
      layout();
    },
    /** The item under the pointer in the preview, or none. */
    hover(item: { parent: number[]; index: number } | undefined) {
      if (!item) {
        scheduleLeave();
        return;
      }
      clearTimeout(leaveTimer);
      near = { parent: item.parent.join("."), index: item.index };
      layout();
    },
    /** A section drag began in the preview: show its parent's gaps, no plus buttons. */
    dragStart(gap: { parent: number[]; index: number }) {
      if (openKey) handlers.onClose?.();
      clearTimeout(leaveTimer);
      near = undefined;
      drag = { parent: gap.parent.join("."), index: undefined };
      layout();
    },
    /** The gap under the dragged section changed. */
    dragTarget(gap: { parent: number[]; index: number }) {
      if (!drag) return;
      drag = { parent: gap.parent.join("."), index: gap.index };
      layout();
    },
    /** The drag ended (dropped or cancelled): back to plus buttons. */
    dragEnd() {
      if (!drag) return;
      drag = undefined;
      dropLabel = "Drop here";
      layout();
    },
    /**
     * A section dragged from the Add panel is over `gap` (none: off the
     * canvas): its parent's gaps show, that one labelled `label`.
     */
    showDrop(gap: { parent: number[]; index: number } | undefined, label = "Drop here") {
      clearTimeout(leaveTimer);
      near = undefined;
      dropLabel = label;
      drag = gap ? { parent: gap.parent.join("."), index: gap.index } : undefined;
      layout();
    },
    markOpen,
    clear() {
      if (openKey) handlers.onClose?.();
      openKey = undefined;
      near = undefined;
      drag = undefined;
      points = [];
      layout();
    },
    destroy() {
      clearTimeout(leaveTimer);
      resize.disconnect();
      cancelAnimationFrame(collisionFrame);
      pane.removeEventListener("card-controls-layout", scheduleCollisions);
      layer.remove();
    },
  };
}

export type InsertControls = ReturnType<typeof createInsertControls>;
