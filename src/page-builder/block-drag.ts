// Dragging a block from the rail onto the canvas (ticket 12 §5 and §8):
// the drag (insert-drag.ts) asks where the pointer is; this probes the page
// there (the containers under it, drop-report.ts), picks the target
// (drop-target.ts; a Section snaps between page bands, section-snap.ts) and
// draws it (drop-indicator.ts) in the page builder's canvas layer. One probe
// at a time: while one is out, the latest pointer waits for its answer.

import type { DropReport } from "./drop-report";
import { dropLabel, type DraggedBlock, type DropTarget } from "./drop-target";
import { blockDropTarget, dropIndicator, stepLevel, type DragLevel } from "./drop-indicator";
import type { InsertDragContext, DragAim } from "./insert-drag";
import type { NativeElementKind } from "./native-elements";
import { node } from "../ui/dom";
import "./block-drag.css";

export interface BlockDragPorts {
  frame: HTMLElement;
  /** Covers the frame exactly, in frame-viewport coordinates. */
  layer: HTMLElement;
  /** The containers under a frame-viewport point; with `bands`, <main> with all its bands. */
  probe(at: { x: number; y: number }, bands: boolean): Promise<DropReport | undefined>;
  scroll(dy: number): void;
  drop(target: DropTarget, where: string): void;
  announce(text: string): void;
}

export function createBlockDrag(kind: NativeElementKind, ports: BlockDragPorts): InsertDragContext<DropTarget> {
  const block: DraggedBlock = { kind: "new", block: kind };
  const marks = node("div", "pb-drop");
  marks.setAttribute("aria-hidden", "true");
  let level: DragLevel = { alt: false, tabs: 0 };
  let want: { x: number; y: number } | undefined;
  let probed: { x: number; y: number } | undefined;
  let report: DropReport | undefined;
  let probing = false;
  // A scroll or a Tab since the last probe or drawing.
  let moved = false;
  let restep = false;
  let ended = false;
  let show: (aim: DragAim<DropTarget>) => void = () => {};
  let drawn = "";

  function draw(target: DropTarget | undefined) {
    const indicator = target && dropIndicator(target);
    const key = JSON.stringify(indicator ?? null);
    if (key === drawn) return;
    drawn = key;
    marks.replaceChildren();
    if (!indicator) return;
    // In the layer from the first mark: a press that never becomes a drag leaves nothing behind.
    if (!marks.isConnected) ports.layer.append(marks);
    const mark = node("div", indicator.kind === "line" ? `pb-drop__line${indicator.vertical ? " pb-drop__line--v" : ""}` :
      indicator.kind === "area" ? "pb-drop__area" : "pb-drop__refused", indicator.kind === "area" ? indicator.text : "");
    const { left, top, width, height } = indicator.rect;
    Object.assign(mark.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(width, 0)}px`, height: `${Math.max(height, 0)}px` });
    marks.append(mark);
  }

  function render() {
    if (!want || !report || !probed) return;
    const found = blockDropTarget(report, probed, kind, level);
    level = found.level;
    draw(found.target);
    const target = found.target;
    show(target ? { target, where: dropLabel(target, block), refused: !target.ok } : { target: undefined, where: "No place here" });
  }

  function run() {
    const at = want!;
    probing = true;
    moved = false;
    void ports.probe(at, kind === "section").then((next) => {
      probing = false;
      if (ended) return;
      // Not answered (the page was rendering): asked again on the next aim.
      probed = next && at;
      report = next;
      if (want && next) render();
      if (want && (!probed || want.x !== probed.x || want.y !== probed.y || moved)) run();
    });
  }

  return {
    frame: ports.frame,
    aim(at, alt, next) {
      show = next;
      const altChanged = level.alt !== alt;
      level = { ...level, alt };
      want = at;
      if (!at) {
        draw(undefined);
        show({ target: undefined, where: "Release to cancel" });
        return;
      }
      if (probing) return;
      if (!probed || at.x !== probed.x || at.y !== probed.y || moved) run();
      else if (altChanged || restep) { restep = false; render(); }
    },
    step(by) {
      // A Section only snaps between bands: Tab does nothing else meanwhile.
      if (kind !== "section") { level = stepLevel(level, by); restep = true; }
      return true;
    },
    scroll(dy) {
      moved = true;
      ports.scroll(dy);
    },
    clear() {
      ended = true;
      marks.remove();
    },
    drop: (target) => ports.drop(target, dropLabel(target, block)),
    announce: (text) => ports.announce(text),
  };
}
