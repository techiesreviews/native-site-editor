// A block's drag over the canvas, new from the rail or a page block moved
// (ticket 12 §5, §8 and §10): the drag (insert-drag.ts) asks where the
// pointer is; this probes the page there (the containers under it, leaving
// out the moved block's own, drop-report.ts), picks the target
// (drop-target.ts; a Section snaps between page bands, section-snap.ts) and
// has it drawn
// (drop-indicator.ts; block-drag.ts draws). One probe at a time: while one is
// out, the latest pointer waits for its answer; a page still rendering is
// asked again on the next aim. A release the last probe did not see is
// probed once more, and that answer decides the drop. No DOM.

import type { DropReport } from "./drop-report";
import { dropLabel, dropStays, isBand, type DraggedBlock, type DropTarget } from "./drop-target";
import { blockDropTarget, dropIndicator, stepLevel, type DragLevel, type DropIndicator } from "./drop-indicator";
import type { InsertDragContext, DragAim } from "./insert-drag";

export interface BlockDragSessionPorts {
  frame: HTMLElement;
  /** Shows the line, area or outline (none: nothing). */
  draw(indicator: DropIndicator | undefined): void;
  /** The containers under a frame-viewport point (none inside `moving`); with `bands`, <main> with all its bands. */
  probe(at: { x: number; y: number }, moving: readonly number[] | undefined, bands: boolean): Promise<DropReport | undefined>;
  scroll(dy: number): void;
  drop(target: DropTarget, where: string, pointer?: { x: number; y: number }): void;
  announce(text: string, pointer?: { x: number; y: number }): void;
}

export function createBlockDragSession(block: DraggedBlock, ports: BlockDragSessionPorts): InsertDragContext<DropTarget> {
  const band = isBand(block);
  const moving = block.kind === "move" ? block.path : undefined;
  const probe = (at: { x: number; y: number }) => ports.probe(at, moving, band);
  let level: DragLevel = { alt: false, tabs: 0 };
  let want: { x: number; y: number } | undefined;
  // The last answer: where it was asked and after how many scrolls.
  let answered: { at: { x: number; y: number }; scrolls: number; report: DropReport } | undefined;
  let scrolls = 0;
  let probing = false;
  let restep = false;
  let ended = false;
  let show: (aim: DragAim<DropTarget>) => void = () => {};
  let drawn = "";

  // The last answer still holds for the pointer: same point, no scroll since.
  const fresh = (at: { x: number; y: number }) => Boolean(answered && answered.scrolls === scrolls && answered.at.x === at.x && answered.at.y === at.y);

  function draw(target: DropTarget | undefined) {
    const indicator = target && dropIndicator(target, dropStays(block, target));
    const key = JSON.stringify(indicator ?? null);
    if (key === drawn) return;
    drawn = key;
    ports.draw(indicator);
  }

  function render() {
    if (!want || !answered) return;
    const found = blockDropTarget(answered.report, answered.at, block, level);
    level = found.level;
    draw(found.target);
    const target = found.target;
    show(target ? { target, where: dropLabel(target, block), refused: !target.ok } : { target: undefined, where: "No place here" });
  }

  function run() {
    const at = want!, seen = scrolls;
    probing = true;
    void probe(at).then((report) => {
      probing = false;
      if (ended) return;
      // Not answered (the page was rendering): asked again on the next aim, a frame later.
      if (!report) return;
      answered = { at, scrolls: seen, report };
      if (want) render();
      if (want && !fresh(want)) run();
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
        // Back on the canvas, even at the same point, the page is asked again.
        answered = undefined;
        draw(undefined);
        show({ target: undefined, where: "Release to cancel" });
        return;
      }
      if (probing) return;
      if (!fresh(at)) run();
      else if (altChanged || restep) { restep = false; render(); }
    },
    step(by) {
      // A Section only snaps between bands: Tab does nothing else meanwhile.
      if (!band) { level = stepLevel(level, by); restep = true; }
      return true;
    },
    scroll(dy) {
      scrolls++;
      ports.scroll(dy);
    },
    clear() {
      ended = true;
      ports.draw(undefined);
    },
    drop(shown) {
      const at = want;
      // Off the canvas: cancelled.
      if (!at) return false;
      if (fresh(at) && !probing) {
        if (!shown?.ok) return false;
        ports.drop(shown, dropLabel(shown, block), at);
        return true;
      }
      // Released before the page was probed where it was released: that probe decides.
      void probe(at).then((report) => {
        const target = report && blockDropTarget(report, at, block, level).target;
        if (target?.ok) ports.drop(target, dropLabel(target, block), at);
        else ports.announce(`Nothing was ${block.kind === "move" ? "moved" : "added"}: ${target?.reason ?? "there is no place for it there."}`, at);
      });
      return true;
    },
    announce: (text) => ports.announce(text),
  };
}
