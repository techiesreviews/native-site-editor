// Code to canvas (page builder, canvas slice): the HTML code pane's cursor
// selects its element on the canvas, and the line under the pointer points
// at its element with a soft dashed box. The editor reports positions as a
// window event (CODE_POINTER_EVENT, see code-editor.ts); the element is
// found from the file's own source (canvas-source.ts), and the preview
// runtime finds it on the page shown, or does nothing when the file is not
// on show.

import { CODE_POINTER_EVENT, type CodePointer } from "./canvas-model";
import { elementPathAtOffset } from "./canvas-source";

export interface CodeLinkTarget {
  /** Whether `path` is one of the site's pages or components. */
  owns(path: string): boolean;
  hint(request: { path: string; node: number[] } | undefined): void;
  select(request: { path: string; node: number[] }): void;
}

const HOVER_DELAY = 40;
const CURSOR_DELAY = 120;

export function linkCodeToCanvas(target: CodeLinkTarget) {
  let hoverTimer = 0;
  let cursorTimer = 0;
  let hinted = "";
  // Nothing for a file edited since (the offset would name another place).
  const find = (pointer: Extract<CodePointer, { offset: number }>) => {
    if (pointer.stale()) return undefined;
    const node = elementPathAtOffset(pointer.source, pointer.offset);
    return node && { path: pointer.path, node };
  };
  const hint = (request: { path: string; node: number[] } | undefined) => {
    const key = request ? `${request.path}:${request.node.join(".")}` : "";
    if (key === hinted) return;
    hinted = key;
    target.hint(request);
  };
  function onPointer(event: Event) {
    const pointer = (event as CustomEvent<CodePointer>).detail;
    if (!pointer || typeof pointer.path !== "string" || !target.owns(pointer.path)) return;
    if (pointer.kind === "range") {
      window.clearTimeout(cursorTimer);
    } else if (pointer.kind === "leave") {
      window.clearTimeout(hoverTimer);
      hint(undefined);
    } else if (pointer.kind === "hover") {
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => hint(find(pointer)), HOVER_DELAY);
    } else {
      window.clearTimeout(cursorTimer);
      cursorTimer = window.setTimeout(() => {
        const request = find(pointer);
        if (request) target.select(request);
      }, CURSOR_DELAY);
    }
  }
  window.addEventListener(CODE_POINTER_EVENT, onPointer);
  return {
    /** A selection made elsewhere (a click on the canvas) wins over a cursor move still waiting. */
    cancel() {
      window.clearTimeout(cursorTimer);
    },
    destroy() {
      window.clearTimeout(hoverTimer);
      window.clearTimeout(cursorTimer);
      window.removeEventListener(CODE_POINTER_EVENT, onPointer);
    },
  };
}
