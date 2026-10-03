// The canvas's pure rules (page builder, canvas slice): the device widths
// the preview frame can take, how a dragged or typed width settles, what
// the session remembers, and how the selection's ancestors read in the
// breadcrumb. No DOM here, so the unit tests run in Node
// (tests/canvas-model.test.ts). docs/page-builder/canvas.md has the tour.

/** Desktop fills the canvas; the others are fixed frame widths, centred. */
export type CanvasDevice = "desktop" | "tablet" | "mobile";

export const CANVAS_DEVICES: { id: CanvasDevice; label: string; width?: number }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 390 },
];

/** The narrowest frame a drag or a typed width can make. */
export const CANVAS_MIN_WIDTH = 240;

/**
 * The frame's width: `"fill"` (Desktop, the whole canvas) or a width in
 * CSS pixels, centred on the canvas.
 */
export type CanvasWidth = "fill" | number;

/**
 * A requested width on a canvas `available` px wide: whole pixels, at
 * least the minimum, and the whole canvas (fill) once it reaches the
 * canvas's width, so dragging a handle to the edge goes back to Desktop.
 */
export function settleWidth(requested: number, available: number): CanvasWidth {
  if (!Number.isFinite(requested)) return "fill";
  const width = Math.round(Math.max(CANVAS_MIN_WIDTH, requested));
  return available > 0 && width >= available ? "fill" : width;
}

/** The device a width matches exactly, if any: its button shows pressed. */
export function deviceFor(width: CanvasWidth): CanvasDevice | undefined {
  if (width === "fill") return "desktop";
  return CANVAS_DEVICES.find((device) => device.width === width)?.id;
}

/** The width a device asks for. */
export function widthFor(device: CanvasDevice): CanvasWidth {
  return CANVAS_DEVICES.find((item) => item.id === device)?.width ?? "fill";
}

/** What the session remembers ("fill" or a number), read back safely. */
export function readStoredWidth(stored: string | null | undefined): CanvasWidth {
  if (!stored || stored === "fill") return "fill";
  const width = Number(stored);
  return Number.isInteger(width) && width >= CANVAS_MIN_WIDTH && width <= 10_000 ? width : "fill";
}

/** One element of the selection's ancestor path, outermost first. */
export interface CanvasCrumb {
  /** `tag`, `tag.first-class` or `tag#id` (a component instance: its tag alone). */
  label: string;
  /** A page's own element, a component instance, or an element of a component's template. */
  kind: "element" | "component" | "template";
}

/** The crumbs a runtime report carries, checked: at most 64, labels capped. */
export function readCrumbs(raw: unknown): CanvasCrumb[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-64).flatMap((item): CanvasCrumb[] => {
    if (!item || typeof item !== "object") return [];
    const { label, kind } = item as Record<string, unknown>;
    if (typeof label !== "string" || !label) return [];
    return [{
      label: label.slice(0, 80),
      kind: kind === "component" || kind === "template" ? kind : "element",
    }];
  });
}

/** An element's extent in a source: its start tag's offset and where it ends. */
export interface SourceExtent {
  start: number;
  end: number;
}

/**
 * Of nested extents (an element and its ancestors, innermost first), the
 * innermost that holds `offset`: from its start tag's `<` up to, not
 * including, the end of its end tag.
 */
export function innermostAt(extents: SourceExtent[], offset: number) {
  return extents.findIndex((extent) => extent.start <= offset && offset < extent.end);
}

/**
 * What a mounted HTML code editor tells the canvas (a window event, so the
 * lazily loaded editor and the preview need not know each other): the
 * cursor moved there by a click or a key, the pointer is over a line, or it
 * left the editor. `offset` is into `source`, the file as it was then;
 * `stale` tells whether the file has changed since.
 */
export const CODE_POINTER_EVENT = "native-code-pointer";
export type CodePointer =
  | { path: string; kind: "cursor" | "hover"; offset: number; source: string; stale: () => boolean }
  | { path: string; kind: "leave" }
  /** A press or a range of text began: a cursor move still waiting is dropped. */
  | { path: string; kind: "range" };
