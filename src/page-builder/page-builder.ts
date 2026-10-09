// The page builder's part of the preview (src/components/native-preview.ts):
// the Add panel, dragging from it or the block rail onto the canvas, the
// empty page's "Start with a section", and the highlight on a section just
// added. The preview
// passes on what the runtime reports (insert points, selections) and the
// sources it renders; every insert is the preview's own `onInsert`, the
// same source edit as a plus between sections.

import type { InsertChoice, InsertControls, InsertPoint } from "../components/insert-controls";
import type { SelectionRect } from "../components/edit-bar";
import { instanceMarkup } from "../native-insert";
import { nativeChoiceMarkup } from "./native-elements";
import type { AddPanelHandlers } from "./add-panel";
import { addCatalog, suggestedItems } from "./add-catalog";
import { createAddPanel, insertPointKey } from "./add-panel";
import { createCanvasLayer, createEmptyCanvas, createInsertFlash } from "./canvas-overlays";
import { defaultInsertPoint } from "./insert-target";
import { thumbnailDocument, type ThumbnailInputs } from "./thumbnail-doc";
import type { BlockDragPorts, createBlockDrag } from "./block-drag";
import type { DraggedBlock } from "./drop-target";

export interface PageBuilderDeps {
  pane: HTMLElement;
  frame: HTMLIFrameElement;
  insertControls: () => InsertControls;
  // What the preview renders: the site, its sources, styles and images, and the route on show.
  inputs(): ThumbnailInputs | undefined;
  choices(): InsertChoice[];
  pointFor?: AddPanelHandlers["pointFor"];
  destinationText?: AddPanelHandlers["destinationText"];
  newComponent?: AddPanelHandlers["newComponent"];
  insert(point: InsertPoint, choice: InsertChoice): void;
  // Component styles to read (the preview's `onComponentStyles`).
  prepare(tags: string[]): void;
  // Scroll the canvas by `dy` (the runtime's `scroll-by`), smoothly unless motion is reduced.
  scroll(dy: number, smooth?: boolean): void;
  // Where the Add panel docks; the preview pane's left edge when not given.
  dock?: () => { left: number; top: number; bottom: number; width: number } | undefined;
}

export function createPageBuilder(deps: PageBuilderDeps) {
  const { pane, frame } = deps;
  let points: InsertPoint[] = [];
  let selection: { path: string; node?: number[] } | undefined;
  let selectedRect: SelectionRect | undefined;
  let addButton: HTMLButtonElement | undefined;
  // History shows an earlier version: nothing is added until it is left.
  let viewing = false;
  let refreshTimer = 0;
  const canvas = createCanvasLayer(pane, frame);
  // The flash goes above the card and insert controls, below the edit bar.
  const flashLayer = createCanvasLayer(pane, frame);
  flashLayer.layer.classList.add("pb-canvas-layer--flash");
  const flash = createInsertFlash(flashLayer.layer);
  const canvasWidth = () => frame.clientWidth || 1200;

  function preview(tag: string) {
    const inputs = deps.inputs();
    if (!inputs) return undefined;
    const native = nativeChoiceMarkup(tag);
    if (native) return { markup: native, doc: thumbnailDocument(inputs, native) };
    if (!Object.hasOwn(inputs.site.components, tag)) return undefined;
    const page = inputs.site.routes[inputs.route];
    const markup = instanceMarkup(page ? inputs.sources[page] ?? "" : "", tag, inputs.sources[inputs.site.components[tag]] ?? "");
    return { markup, doc: thumbnailDocument(inputs, markup) };
  }

  const allChoices = (): InsertChoice[] => deps.choices();

  function insert(point: InsertPoint, choice: InsertChoice) {
    if (viewing) return;
    flash.arm(point.path, [...point.parent, point.index]);
    deps.insert(point, choice);
  }

  const empty = createEmptyCanvas(canvas.layer, {
    suggestions: () => suggestedItems(addCatalog(allChoices())).flatMap((item) => {
      const shown = preview(item.tag);
      return shown ? [{ item, ...shown }] : [];
    }),
    canvasWidth,
    insert: (point, tag) => {
      const choice = allChoices().find((candidate) => candidate.tag === tag);
      if (choice) insert(point, choice);
    },
    browse: () => panel.openDocked(),
  });

  const panel = createAddPanel({
    choices: () => deps.choices(),
    pointFor: deps.pointFor,
    destinationText: deps.destinationText,
    newComponent: deps.newComponent,
    takenTags: () => Object.keys(deps.inputs()?.site.components ?? {}),
    preview,
    canvasWidth,
    points: () => points,
    defaultPoint: () => defaultInsertPoint(points, selection),
    prepare: (tags) => deps.prepare(tags),
    insert,
    drag: () => ({
      frame,
      points: () => points,
      target: (point, label, name) => {
        empty.dropping(point?.empty ? name : undefined);
        deps.insertControls().showDrop(point && !point.empty ? point : undefined, label);
      },
      scroll: (dy) => deps.scroll(dy),
    }),
    dock: () => {
      const area = deps.dock?.();
      if (area) return area;
      const rect = pane.getBoundingClientRect();
      return { left: rect.left, top: rect.top, bottom: rect.bottom, width: 320 };
    },
    onState: ({ open, gap, restoreFocus }) => {
      deps.insertControls().markOpen(open ? gap : undefined, !open && Boolean(gap) && restoreFocus);
      if (addButton) {
        const docked = open && !gap;
        addButton.setAttribute("aria-expanded", String(docked));
        addButton.classList.toggle("is-open", docked);
        if (!open && !gap && restoreFocus) addButton.focus();
      }
    },
  });

  return {
    /** The runtime reported the page's insert points. */
    points(next: InsertPoint[]) {
      points = next;
      canvas.layout();
      empty.update(next);
      panel.retarget();
    },
    /**
     * The runtime selected an element (or nothing); for one inside a
     * component's template, `instance` is the page element it renders in,
     * which a click in the Add panel inserts after.
     */
    selected(path: string, node: number[] | undefined, rect: SelectionRect | undefined, instance?: { path: string; node: number[] }) {
      selection = instance ?? (path ? { path, node } : undefined);
      selectedRect = path ? rect : undefined;
      // A section just added is highlighted and shown whole (as much as fits).
      if (flash.selected(path, node, rect) && rect) {
        const height = frame.clientHeight;
        // Room under it for the label naming where it went.
        const below = rect.bottom - (height - 48);
        const dy = below > 0 ? Math.min(below, rect.top - 24) : rect.top < 0 ? rect.top - 24 : 0;
        if (dy) deps.scroll(dy, true);
      }
      panel.retarget();
    },
    selectionRect(rect: SelectionRect) {
      selectedRect = rect;
      flash.move(rect);
    },
    /** A block is being inserted or moved: its selection after the render flashes (a first Image waits for its file reads). */
    flash(request: { path: string; node: number[] }) {
      if (!viewing) flash.arm(request.path, request.node, 30_000);
    },
    /** An insert was refused: the reason flashes in red at the selection. */
    refuse(reason: string) {
      flash.refuse(selectedRect, reason);
    },
    /** The preview's sources changed: thumbnails follow, a moment later. */
    sourcesChanged() {
      clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        panel.refresh();
        empty.refresh();
      }, 250);
    },
    /** The page on show changed or went away. */
    clear() {
      points = [];
      selection = selectedRect = undefined;
      empty.clear();
      flash.clear();
      panel.retarget();
    },
    /** A plus between sections: the Add panel for its gap (again: closed). */
    openFor(point: InsertPoint) {
      panel.openFor(point);
    },
    closeGap() {
      if (panel.isOpen() && !panel.isDocked()) panel.close(true);
    },
    /** The top bar's "+ Add": toggles the docked panel; shown while the preview is. */
    attachAddButton(next: HTMLButtonElement) {
      addButton = next;
      next.setAttribute("aria-haspopup", "dialog");
      next.setAttribute("aria-expanded", "false");
      next.addEventListener("click", () => {
        if (panel.isDocked()) panel.close(false);
        else panel.openDocked();
      });
    },
    /** History shows an earlier version (or no longer): "+ Add" is unavailable and the panel closes meanwhile. */
    setViewing(on: boolean) {
      viewing = on;
      if (on) {
        panel.close(false);
        points = [];
        empty.clear();
        flash.clear();
      }
      if (addButton) {
        addButton.disabled = on;
        addButton.title = on ? "Go back to the latest version to add sections" : "Add a section to the page";
      }
    },
    /** The preview is shown or hidden: so is "+ Add", and the panel closes with it. */
    setActive(active: boolean) {
      if (addButton) addButton.hidden = !active;
      if (!active) panel.close(false);
    },
    /**
     * A block dragged over the canvas (new from the rail, or moved): its
     * line, label and target (none while History shows an earlier
     * version). `create` is block-drag.ts's, loaded with the first drag.
     */
    blockDrag(block: DraggedBlock, ports: Pick<BlockDragPorts, "probe" | "drop" | "announce" | "tree">, create: typeof createBlockDrag) {
      if (viewing) return undefined;
      return create(block, { ...ports, frame, layer: canvas.layer, scroll: (dy) => deps.scroll(dy) });
    },
    insertPointKey,
    destroy() {
      clearTimeout(refreshTimer);
      panel.destroy();
      canvas.destroy();
      flashLayer.destroy();
    },
  };
}

export type PageBuilder = ReturnType<typeof createPageBuilder>;
