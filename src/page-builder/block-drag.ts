// Draws a rail block's drag over the canvas (block-drag-session.ts decides):
// a line, an empty container's area or a refusing container's outline, in
// the page builder's canvas layer. Loaded with the first press on a block.

import type { DropIndicator } from "./drop-indicator";
import type { DropTarget } from "./drop-target";
import type { InsertDragContext } from "./insert-drag";
import type { NativeElementKind } from "./native-elements";
import { createBlockDragSession, type BlockDragSessionPorts } from "./block-drag-session";
import { node } from "../ui/dom";
import "./block-drag.css";

export interface BlockDragPorts extends Omit<BlockDragSessionPorts, "draw"> {
  /** Covers the frame exactly, in frame-viewport coordinates. */
  layer: HTMLElement;
}

export function createBlockDrag(kind: NativeElementKind, ports: BlockDragPorts): InsertDragContext<DropTarget> {
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
  return createBlockDragSession(kind, { ...ports, draw });
}
