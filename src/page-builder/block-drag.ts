// Draws a block's drag over the canvas (new from the rail, or moved) (block-drag-session.ts decides):
// a line, an empty container's area or a refusing container's outline, in
// the page builder's canvas layer. Loaded with the first press on a block.

import { refuse } from "../components/refusal-note";
import type { DropIndicator } from "./drop-indicator";
import type { DraggedBlock, DropTarget } from "./drop-target";
import type { InsertDragContext } from "./insert-drag";
import { createBlockDragSession, type BlockDragSessionPorts } from "./block-drag-session";
import { node } from "../ui/dom";
import "./block-drag.css";

export { dropBlockName, dropStays } from "./drop-target";

export interface BlockDragPorts extends Omit<BlockDragSessionPorts, "draw"> {
  /** Covers the frame exactly, in frame-viewport coordinates. */
  layer: HTMLElement;
}

export function createBlockDrag(block: DraggedBlock, ports: BlockDragPorts): InsertDragContext<DropTarget> {
  const marks = node("div", "pb-drop");
  marks.setAttribute("aria-hidden", "true");
  // In the layer only while there is a mark: a press that never becomes a drag leaves nothing behind.
  const draw = (indicator: DropIndicator | undefined) => {
    marks.replaceChildren();
    if (!indicator) { marks.remove(); return; }
    if (!marks.isConnected) ports.layer.append(marks);
    const mark = node("div", indicator.kind === "line" ? `pb-drop__line${indicator.vertical ? " pb-drop__line--v" : ""}` :
      indicator.kind === "area" ? "pb-drop__area" : "pb-drop__refused", indicator.kind === "area" ? indicator.text : "");
    const { left, top, width, height } = indicator.rect;
    Object.assign(mark.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(width, 0)}px`, height: `${Math.max(height, 0)}px` });
    marks.append(mark);
  };
  const pointerOnScreen = (at: { x: number; y: number }) => {
    const rect = ports.frame.getBoundingClientRect();
    return { x: rect.left + at.x, y: rect.top + at.y };
  };
  return createBlockDragSession(block, {
    ...ports, draw,
    drop: (target, where, pointer) => ports.drop(target, where, pointer && pointerOnScreen(pointer)),
    announce: (text, pointer) => {
      if (pointer) refuse(text, { pointer: pointerOnScreen(pointer) });
      else ports.announce(text);
    },
  });
}
