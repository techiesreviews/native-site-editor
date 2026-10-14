// The image popup's rules (media-manager ticket 09 "Entry point and popup", build slice 39):
// its shapes and badge, the part of the picture a place shows, the focus dot's keys,
// the one-line message, where the popup stands and what Done writes. No DOM here.
import type { ComponentPicture } from "./component-shapes";
import type { MediaRecords } from "../../shared/media-records";
import { readPlaceFrame, type PlaceFocus, type PlaceFrameChange, type PlaceShape } from "./place-frame";

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

/** The badge of an image tag on `page`; records name a trimmed copy. */
export function placeBadge(tag: string, records: MediaRecords | undefined, page: string) {
  return frameBadge(readPlaceFrame(tag, records, page));
}

/** Whether the focus dot means anything: a shape that crops (Original shows the whole picture). */
export const focusApplies = (shape: PopupShape) => shapeRatio(shape) !== undefined;

/**
 * The part of the picture a place shows (fractions of the picture), as `object-fit: cover` with
 * `object-position: x% y%` crops it: the picture fills the place's box and the overflow is shared
 * by the focus percentages. No box ratio, or no picture size, shows the whole picture.
 */
export function visibleArea(picture: { width?: number; height?: number }, boxRatio: number | undefined, focus: PlaceFocus) {
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  if (!boxRatio || !picture.width || !picture.height) return whole;
  const ratio = picture.width / picture.height, fx = clamp(focus.x / 100), fy = clamp(focus.y / 100);
  if (Math.abs(ratio - boxRatio) < 1e-6) return whole;
  if (ratio > boxRatio) { const w = boxRatio / ratio; return { x: (1 - w) * fx, y: 0, w, h: 1 }; }
  const h = ratio / boxRatio;
  return { x: 0, y: (1 - h) * fy, w: 1, h };
}
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** Arrow keys move the dot 2 % (Shift: 10 %), kept on the picture; other keys do nothing. */
export function nudgeFocus(focus: PlaceFocus, key: string, shift = false): PlaceFocus | undefined {
  const step = shift ? 10 : 2;
  const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const by = move[key];
  return by && { x: Math.round(clamp(focus.x + by[0], 0, 100)), y: Math.round(clamp(focus.y + by[1], 0, 100)) };
}

/** The dot placed where the pointer is over the picture, in whole percentages. */
export function focusAt(point: { x: number; y: number }, box: { left: number; top: number; width: number; height: number }): PlaceFocus {
  const at = (value: number, size: number) => size > 0 ? Math.round(clamp(value / size) * 100) : 50;
  return { x: at(point.x - box.left, box.width), y: at(point.y - box.top, box.height) };
}

/** The one-line message: blue when only this spot changes, yellow when a new picture is saved. */
export function popupMessage(state: { newPicture: boolean; recrop?: boolean }) {
  if (state.newPicture) return { tone: "new" as const, text: state.recrop ? "Updates this spot's trimmed picture" : "Saves a new picture for this spot",
    tip: "Zooming in, turning or trimming saves a new picture in Media, used only here. Other places keep the original." };
  return { tone: "info" as const, text: "Only changes this spot", tip: "The shape and the dot only change how the picture fits this spot. Nothing new is saved." };
}

/** The hint under the picture. */
export function pictureHint(shape: PopupShape, zoomed = false) {
  if (shape === "free") return "Drag the corners to trim.";
  return focusApplies(shape) || zoomed ? "Drag the dot to what matters most." : "The whole picture shows.";
}

/** What Replace says at the top of the popup: the shape stays, the picture is centred, a trim is dropped. */
export function replaceNotice(file: string, shape: PopupShape, trimmed: boolean) {
  const name = file.split("/").pop() || file;
  const kept = focusApplies(shape) ? `The ${shapeLabel(shape)} shape stays and the picture is centred.` : "The shape stays Original.";
  return `${name} is in. ${kept}${trimmed ? " Trimming made for the old picture was dropped." : ""}`;
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
  // the popup cannot read (lengths) started the dot in the middle and is kept unless it moved.
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
