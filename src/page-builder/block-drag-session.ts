// A rail block's drag over the canvas (ticket 12 §5 and §8): the drag
// (insert-drag.ts) asks where the pointer is; this probes the page there
// (the containers under it, drop-report.ts), picks the target (drop-target.ts;
// a Section snaps between page bands, section-snap.ts) and has it drawn
// (drop-indicator.ts; block-drag.ts draws). One probe at a time: while one is
// out, the latest pointer waits for its answer; a page still rendering is
// asked again on the next aim. A release the last probe did not see is
// probed once more, and that answer decides the drop. No DOM.

import type { DropReport } from "./drop-report";
import { dropLabel, type DraggedBlock, type DropTarget } from "./drop-target";
import { blockDropTarget, dropIndicator, stepLevel, type DragLevel, type DropIndicator } from "./drop-indicator";
import type { InsertDragContext, DragAim } from "./insert-drag";
import type { NativeElementKind } from "./native-elements";

export interface BlockDragSessionPorts {
  frame: HTMLElement;
  /** Shows the line, area or outline (none: nothing). */
  draw(indicator: DropIndicator | undefined): void;
  /** The containers under a frame-viewport point; with `bands`, <main> with all its bands. */
  probe(at: { x: number; y: number }, bands: boolean): Promise<DropReport | undefined>;
  scroll(dy: number): void;
  drop(target: DropTarget, where: string): void;
  announce(text: string): void;
}

export function createBlockDragSession(kind: NativeElementKind, ports: BlockDragSessionPorts): InsertDragContext<DropTarget> {
  const block: DraggedBlock = { kind: "new", block: kind };
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
    ports.draw(indicator);
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
      // Not answered (the page was rendering): asked again on the next aim, a frame later.
      if (!next) return;
      probed = at;
      report = next;
      if (want) render();
      if (want && (want.x !== at.x || want.y !== at.y || moved)) run();
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
      ports.draw(undefined);
    },
    drop(shown) {
      const at = want;
      if (!at || (probed && !probing && !moved && at.x === probed.x && at.y === probed.y)) {
        ports.drop(shown, dropLabel(shown, block));
        return;
      }
      // Released before the page was probed where it was released: that probe decides.
      void ports.probe(at, kind === "section").then((next) => {
        const target = next && blockDropTarget(next, at, kind, level).target;
        if (target?.ok) ports.drop(target, dropLabel(target, block));
        else ports.announce(`Nothing was added: ${target?.reason ?? "there is no place for it there."}`);
      });
    },
    announce: (text) => ports.announce(text),
  };
}
