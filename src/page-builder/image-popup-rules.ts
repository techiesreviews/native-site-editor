// The image popup's rules (media-manager ticket 09 "Entry point and popup", build slice 39):
// its shapes and badge, the part of the picture a place shows, the focus square's keys,
// the one-line message, where the popup stands and what Done writes. No DOM here.
import type { ComponentPicture } from "./component-shapes";
import type { PlaceFocus, PlaceFrameChange, PlaceShape } from "./place-frame";

/** A place's shape as read back (one of the popup's, a hand-written ratio it keeps, or its component's), or Free trimming. */
export type PopupShape = PlaceShape | "free" | { kind: "other"; value: string } | { kind: "component"; value: string; label: string; badge: string };

/** The shape menu, in the prototype's order; Free follows when the picture can be trimmed (slice 41). */
export const POPUP_SHAPES: readonly { id: PlaceShape; label: string; ratio?: number }[] = [
  { id: "original", label: "Original" },
  { id: "square", label: "Square", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:5", label: "Tall 4:5", ratio: 4 / 5 },
];

export function shapeLabel(shape: PopupShape) {
  if (shape === "free") return "Free";
  return typeof shape === "string" ? POPUP_SHAPES.find(item => item.id === shape)?.label ?? shape : shape.kind === "component" ? shape.label : `Custom (${shape.value.trim()})`;
}

/** A shape's width over height; undefined for Original or a ratio that cannot be read. */
export function shapeRatio(shape: PopupShape): number | undefined {
  if (typeof shape === "string") return POPUP_SHAPES.find(item => item.id === shape)?.ratio;
  const match = shape.value.match(/^\s*(\d+(?:\.\d*)?|\.\d+)\s*(?:\/\s*(\d+(?:\.\d*)?|\.\d+))?\s*$/);
  const ratio = match ? Number(match[1]) / Number(match[2] ?? 1) : NaN;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
}

/** The edit bar's badge: "Trimmed" for a trimmed copy, else the shape's short name. */
export function frameBadge(frame: { shape: PopupShape; trimmed: boolean }) {
  return frame.trimmed ? "Trimmed" : typeof frame.shape === "string" ? shapeLabel(frame.shape) : frame.shape.kind === "component" ? frame.shape.badge : "Custom";
}

/** Whether the focus square means anything: a shape that crops (Original shows the whole picture). */
export const focusApplies = (shape: PopupShape) => shapeRatio(shape) !== undefined;
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Arrow keys move the focus 2 % (Shift: 10 %), kept on the picture; other keys do nothing. */
export function nudgeFocus(focus: PlaceFocus, key: string, shift = false): PlaceFocus | undefined {
  const step = shift ? 10 : 2;
  const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const by = move[key];
  return by && { x: Math.round(clamp(focus.x + by[0], 0, 100)), y: Math.round(clamp(focus.y + by[1], 0, 100)) };
}

/**
 * The focus that puts the square (`area`, the part the place shows, in shares of the picture) with its
 * centre at `centre` (shares of the picture), kept on the picture, in whole percentages: the
 * `object-position` that shows just that part. An axis the square fills keeps `was`.
 */
export function squareFocus(area: { w: number; h: number }, centre: { x: number; y: number }, was: PlaceFocus): PlaceFocus {
  const at = (middle: number, size: number, keep: number) => size < 1 - 1e-6 ? Math.round(clamp((middle - size / 2) / (1 - size)) * 100) : keep;
  return { x: at(centre.x, area.w, was.x), y: at(centre.y, area.h, was.y) };
}

/** The one-line message: blue when only this spot changes, yellow when a new picture is saved. */
export function popupMessage(state: { newPicture: boolean; recrop?: boolean }) {
  if (state.newPicture) return { tone: "new" as const, text: state.recrop ? "Updates this spot's trimmed picture" : "Saves a new picture for this spot",
    tip: "Zooming in, turning or trimming saves a new picture in Media, used only here. Other places keep the original." };
  return { tone: "info" as const, text: "Only changes this spot", tip: "The shape and the square only change how the picture fits this spot. Nothing new is saved." };
}

/** The hints already shown in this browser (stored as a JSON list): each shows under the picture only the first time it applies (slice 109). */
export function seenHints(stored: string | null) {
  try {
    const list: unknown = JSON.parse(stored ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
  } catch { return new Set<string>(); }
}

/** The focus square's hint: its description for screen readers, never shown under the picture. */
export const SQUARE_HINT = "Drag the square to what matters most.";

/** The hint under the picture. */
export function pictureHint(shape: PopupShape, zoomed = false) {
  if (shape === "free") return "Drag the corners to trim.";
  return focusApplies(shape) || zoomed ? SQUARE_HINT : "The whole picture shows.";
}

/** The shape a place keeps: Free trimming leaves the trimmed copy its own shape, as Original. */
export const placeShapeOf = (shape: PopupShape): PopupShape => shape === "free" ? "original" : shape;

/** What Done writes to the place: only what changed; nothing when nothing did. */
export function frameChange(start: { shape: PopupShape; focus: PlaceFocus | undefined }, now: { shape: PopupShape; focus: PlaceFocus; component?: ComponentPicture }, replaced = false): PlaceFrameChange | undefined {
  const change: PlaceFrameChange = {};
  now = { ...now, shape: placeShapeOf(now.shape) };
  const sameShape = typeof start.shape === "string" || typeof now.shape === "string" ? start.shape === now.shape : start.shape.kind === now.shape.kind && start.shape.value === now.shape.value;
  if (!sameShape && typeof now.shape === "string" && now.shape !== "free") change.shape = now.shape;
  if (!sameShape && typeof now.shape !== "string" && now.shape.kind === "component") change.shape = "component";
  if (change.shape === "original" && now.component) change.originalUnderComponent = true;
  // A replacement always writes the focus: it starts in the middle for the new picture. A focus
  // the popup cannot read (lengths) started the square in the middle and is kept unless it moved.
  const from = start.focus ?? { x: 50, y: 50 };
  const moved = from.x !== now.focus.x || from.y !== now.focus.y;
  if (focusApplies(now.shape) && (replaced || moved)) change.focus = { ...now.focus };
  return change.shape !== undefined || change.focus ? change : undefined;
}

export interface PopupRect { left: number; top: number; right: number; bottom: number }
/**
 * Where the popup stands on a wide screen: beside the picture, level with the edit bar, on its
 * left when there is room, else on its right, else below the bar; always inside the window.
 */
export function placePopup(image: PopupRect, bar: PopupRect, size: { width: number; height: number }, view: { width: number; height: number }, gap = 14) {
  let side: "left" | "right" | "below", left: number, top: number;
  if (image.left - gap - size.width >= 8) { side = "left"; left = image.left - gap - size.width; top = bar.top; }
  else if (Math.max(image.right, bar.right) + gap + size.width <= view.width - 8) { side = "right"; left = Math.max(image.right, bar.right) + gap; top = bar.top; }
  else { side = "below"; left = bar.left; top = bar.bottom + 8; }
  left = Math.round(clamp(left, 8, Math.max(8, view.width - size.width - 8)));
  top = Math.round(clamp(top, 8, Math.max(8, view.height - size.height - 8)));
  return { side, left, top };
}

/** How far the page scrolls on a phone so the picture sits just above the bottom sheet (0: it already does). */
export function sheetScroll(image: PopupRect, sheetTop: number, frameTop: number) {
  const room = sheetTop - 8;
  if (image.bottom <= room && image.top >= frameTop) return 0;
  const height = image.bottom - image.top;
  // A picture taller than the room shows its top.
  return Math.round(height + 8 <= room - frameTop ? image.bottom - room : image.top - frameTop - 8);
}

/**
 * Whether ✕, Escape or a press elsewhere keeps the popup's changes (writes them) or only closes it.
 * Its page's bytes must be as it opened, and no earlier version shown. Without a pin, the editor must
 * still be on the load it opened on, and its press still own the popup. With one (ticket 27), a
 * switch is no reason to drop them: away, or left and shown again (a new load), the bytes prove them;
 * on the same load, a later press owning the bar still only closes it.
 */
export function keepsPopupChanges(at: { pinned: boolean; here: boolean; sameLoad: boolean; owned: boolean; sameBytes: boolean; viewingVersion: boolean }) {
  if (!at.sameBytes || at.viewingVersion) return false;
  return at.pinned ? !at.here || !at.sameLoad || at.owned : at.sameLoad && at.owned;
}
