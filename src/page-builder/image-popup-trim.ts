import { trimmableImages } from "../../shared/media-kinds-policies";
// Trim, zoom and turn in the image popup (media build slice 41; ticket 09 "Shapes and what gets
// saved" and "Replacing and re-cropping"): the part of the turned picture a shape and zoom keep,
// Free trimming's four corners, when the result saves a Trimmed copy, and a re-crop starting from
// the full original with the earlier trim put back. Fractions are of the picture as the popup
// shows it: turned, flipped and straightened, a straightened picture enlarged until it fills its
// frame (no empty corners). A trim's fractions (trim-geometry.ts) are of the frame before that
// enlargement: `popupTrim` and `restoreCut` convert. No DOM here.
import type { MediaTrim } from "../../shared/media-records";
import { shapeRatio, type PopupShape } from "./image-popup-rules";
import type { PlaceFocus } from "./place-frame";

export type Turn = 0 | 90 | 180 | 270;
export interface TrimRect { x: number; y: number; w: number; h: number }
/** What the popup cuts: its turn and zoom, Free's rectangle, and a straighten or flip made
 * elsewhere (the large editor, an agent), which the popup keeps as it is. */
export interface PopupCut { turn: Turn; zoom: number; rect: TrimRect; straighten?: number; flipX?: true; flipY?: true }
export interface PictureSize { width: number; height: number }

export const MAX_ZOOM = 5;
const MIN_FREE = 0.06;
const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const uncut = (): PopupCut => ({ turn: 0, zoom: 1, rect: { x: 0, y: 0, w: 1, h: 1 } });

export function turnedSize(size: PictureSize, turn: Turn): PictureSize {
  return turn === 90 || turn === 270 ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

/** How much a straightened picture is enlarged to fill its frame: 1 when it is not straightened. */
export function coverScale(size: PictureSize, cut: Pick<PopupCut, "turn" | "straighten">) {
  const { width, height } = turnedSize(size, cut.turn), angle = Math.abs(cut.straighten ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
}

/** The part of a trim's frame the enlarged picture shows: the whole frame unless straightened. */
function shownBox(size: PictureSize, cut: PopupCut): TrimRect {
  const side = 1 / coverScale(size, cut), at = (1 - side) / 2;
  return { x: at, y: at, w: side, h: side };
}

/** The whole picture as the popup shows it, as a trim (to draw it). */
export function shownTrim(size: PictureSize, cut: PopupCut): MediaTrim {
  const box = shownBox(size, cut);
  return { x: box.x, y: box.y, width: box.w, height: box.h, ...transform(cut) };
}
const transform = (cut: PopupCut) => ({
  ...(cut.turn ? { turn: cut.turn } : {}), ...(cut.straighten ? { straighten: cut.straighten } : {}),
  ...(cut.flipX ? { flipX: true as const } : {}), ...(cut.flipY ? { flipY: true as const } : {}),
});

/**
 * The part of the turned picture the place shows: Free's rectangle; otherwise the shape's ratio
 * (the picture's own for Original), as large as fits, smaller by the zoom, placed by the focus as
 * `object-position` places a cover picture.
 */
export function cutArea(size: PictureSize, shape: PopupShape, focus: PlaceFocus, cut: PopupCut): TrimRect {
  if (shape === "free") return { ...cut.rect };
  const { width, height } = turnedSize(size, cut.turn), own = width / height, ratio = shapeRatio(shape) ?? own;
  let w = 1, h = 1;
  if (ratio > own) h = own / ratio; else w = ratio / own;
  w /= cut.zoom; h /= cut.zoom;
  return { x: (1 - w) * clamp(focus.x / 100), y: (1 - h) * clamp(focus.y / 100), w, h };
}

/** Zooming in, turning, a straighten or flip, or a Free trim smaller than the picture saves a new picture. */
export function makesNewPicture(shape: PopupShape, cut: PopupCut) {
  if (cut.turn || cut.straighten || cut.flipX || cut.flipY) return true;
  if (shape === "free") return cut.rect.w < 0.995 || cut.rect.h < 0.995;
  return cut.zoom > 1.001;
}

/** Whether the focus square means anything: a shape that crops the picture, or Original zoomed in. Free has corners instead. */
export const squareApplies = (shape: PopupShape, cut: PopupCut) => shape !== "free" && (shapeRatio(shape) !== undefined || cut.zoom > 1.001);

/** The trim Done saves, in the records' form; nothing when only the place's shape or focus changes. */
export function popupTrim(size: PictureSize, shape: PopupShape, focus: PlaceFocus, cut: PopupCut): MediaTrim | undefined {
  return makesNewPicture(shape, cut) ? cutTrim(size, shape, focus, cut) : undefined;
}

/** The part a shape, focus and cut keep, as a trim, even when it is only the shape's own crop (the Social image's frame). */
export function cutTrim(size: PictureSize, shape: PopupShape, focus: PlaceFocus, cut: PopupCut): MediaTrim {
  const area = cutArea(size, shape, focus, cut), box = shownBox(size, cut), round = (value: number) => Math.round(value * 1e6) / 1e6;
  const x = clamp(round(box.x + area.x * box.w)), y = clamp(round(box.y + area.y * box.h));
  return { x, y, width: Math.min(round(area.w * box.w), 1 - x), height: Math.min(round(area.h * box.h), 1 - y), ...transform(cut) };
}

/** Two trims cut the same picture (a re-opened trim left as it was saves nothing). */
export function sameTrim(a: MediaTrim | undefined, b: MediaTrim | undefined) {
  if (!a || !b) return a === b;
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-4;
  return near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height) && (a.turn ?? 0) === (b.turn ?? 0)
    && near(a.straighten ?? 0, b.straighten ?? 0) && Boolean(a.flipX) === Boolean(b.flipX) && Boolean(a.flipY) === Boolean(b.flipY);
}

/** A trimmed copy and the shape the place keeps differ in proportions (the popup's 1 % tolerance). */
export const trimRatiosDiffer = (aspect: number, ratio: number) => Math.abs(aspect / ratio - 1) > 0.01;

/** The focus after a trim (popup Done): a copy cut to the place's shape is centred; a shape kept
 * around a copy of other proportions keeps the place's focus (centred when it has none readable). */
export function trimmedFocus(size: { width: number; height: number }, ratio: number | undefined, focus?: PlaceFocus): PlaceFocus {
  return ratio !== undefined && trimRatiosDiffer(size.width / size.height, ratio) && focus ? focus : { x: 50, y: 50 };
}

/**
 * A re-crop starts from the full original with the earlier trim put back: the place's shape with
 * its zoom and focus when the trim has that shape and is more than its crop, else Free with the
 * trim's rectangle and the place's own shape kept `around` it (a square copy in a 16:9 place stays 16:9).
 */
export function restoreCut(trim: MediaTrim, shape: PopupShape, size: PictureSize): { shape: PopupShape; focus: PlaceFocus; cut: PopupCut; around?: PopupShape } {
  const turn = ([0, 90, 180, 270] as const).find(value => value === (trim.turn ?? 0)) ?? 0;
  const cut: PopupCut = { turn, zoom: 1, rect: { x: 0, y: 0, w: 1, h: 1 },
    ...(trim.straighten ? { straighten: trim.straighten } : {}), ...(trim.flipX ? { flipX: true as const } : {}), ...(trim.flipY ? { flipY: true as const } : {}) };
  // The trim's rectangle on the picture as shown (a part of a straightened frame's empty corners is left out).
  const box = shownBox(size, cut), w0 = clamp(trim.width / box.w, MIN_FREE), h0 = clamp(trim.height / box.h, MIN_FREE);
  const rect = cut.rect = { x: clamp((trim.x - box.x) / box.w, 0, 1 - w0), y: clamp((trim.y - box.y) / box.h, 0, 1 - h0), w: w0, h: h0 };
  const { width, height } = turnedSize(size, turn), aspect = (rect.w * width) / (rect.h * height);
  const kept = shape === "free" ? "original" : shape, ratio = shapeRatio(kept) ?? width / height;
  const base = cutArea(size, kept, { x: 50, y: 50 }, { ...cut, zoom: 1 }), zoom = base.w / rect.w;
  const free = { shape: "free" as const, focus: { x: 50, y: 50 }, cut, ...kept === "original" ? {} : { around: kept } };
  if (trimRatiosDiffer(aspect, ratio) || zoom < 0.99 || zoom > MAX_ZOOM + 0.01) return free;
  const z = clamp(zoom, 1, MAX_ZOOM), w = base.w / z, h = base.h / z;
  const at = (offset: number, room: number) => room > 1e-6 ? clamp(offset / room) * 100 : 50;
  const shaped = { shape: kept, focus: { x: at(rect.x, 1 - w), y: at(rect.y, 1 - h) }, cut: { ...cut, zoom: z, rect: { x: 0, y: 0, w: 1, h: 1 } } };
  // A trim that is only the shape's own crop would read as no trim: it stays a trim, as Free.
  return makesNewPicture(shaped.shape, shaped.cut) ? shaped : free;
}

/** The shape the place keeps: Free trimming gives the copy its own shape (Original) unless a re-opened trim kept the place's. */
export const placeShape = (shape: PopupShape, around?: PopupShape): PopupShape => shape === "free" ? around ?? "original" : shape;

/** The zoom shown on the slider, in percent (Free: how much smaller its longer side is than the picture). */
export function zoomPercent(shape: PopupShape, cut: PopupCut) {
  return Math.round(shape === "free" ? 100 / Math.max(cut.rect.w, cut.rect.h) : cut.zoom * 100);
}

/** The slider's zoom; Free's rectangle grows or shrinks about its centre and stays on the picture. */
export function zoomTo(shape: PopupShape, cut: PopupCut, percent: number): PopupCut {
  const zoom = clamp(percent / 100, 1, MAX_ZOOM);
  if (shape !== "free") return { ...cut, zoom };
  const r = cut.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const k = Math.min(1 / zoom / Math.max(r.w, r.h), 1 / r.w, 1 / r.h);
  const w = clamp(r.w * k, MIN_FREE, 1), h = clamp(r.h * k, MIN_FREE, 1);
  return { ...cut, rect: { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h } };
}

/** Turn left (-1) or right (1): the zoom, focus and Free's rectangle start again on the turned picture. */
export function turnBy(cut: PopupCut, direction: 1 | -1): PopupCut {
  return { ...cut, turn: ((cut.turn + 90 * direction + 360) % 360) as Turn, zoom: 1, rect: { x: 0, y: 0, w: 1, h: 1 } };
}

/** A corner dragged (nw, ne, se, sw) or an edge (e, s for the keys), never smaller than a sliver nor off the picture. */
export function resizeFree(start: TrimRect, handle: string, dx: number, dy: number): TrimRect {
  let x = start.x, y = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
  if (handle.includes("w")) x = clamp(x + dx, 0, x2 - MIN_FREE);
  if (handle.includes("e")) x2 = clamp(x2 + dx, x + MIN_FREE, 1);
  if (handle.includes("n")) y = clamp(y + dy, 0, y2 - MIN_FREE);
  if (handle.includes("s")) y2 = clamp(y2 + dy, y + MIN_FREE, 1);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Free's rectangle moved, kept on the picture. */
export function moveFree(start: TrimRect, dx: number, dy: number): TrimRect {
  return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
}

/** Arrow keys move Free's rectangle 2 % (Shift: 10 %); with Alt they move its right or bottom edge. */
export function nudgeFree(rect: TrimRect, key: string, shift = false, alt = false): TrimRect | undefined {
  const step = shift ? 0.1 : 0.02;
  const by = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[key];
  if (!by) return undefined;
  return alt ? resizeFree(rect, by[0] ? "e" : "s", by[0], by[1]) : moveFree(rect, by[0], by[1]);
}

/** The Turn row's reading: "90°", with a straighten or flip made elsewhere. */
export function turnText(cut: PopupCut) {
  return [`${cut.turn}°`, ...cut.straighten ? [`straightened ${cut.straighten}°`] : [], ...cut.flipX || cut.flipY ? ["flipped"] : []].join(" · ");
}

/** A picture the popup can trim: a raster file in the site (a trimmed copy is made with the image recipe). */
export const trimmable = (path: string) => !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path) && trimmableImages.test(path);
