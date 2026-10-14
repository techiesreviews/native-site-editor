// The large editor's rules (media build slice 42; ticket 09 "Large editor"; the large window in
// crop-wordpress-style.html): the frame stays fitted in the middle of the picture area and the
// picture moves under it; corners resize the frame (a shape keeps its ratio, which is a zoom);
// Flip mirrors the picture as it is shown; Straighten turns it by up to 45°. It edits the image
// popup's own state, so the rules work on the popup's edit. No DOM here.
import type { PlaceFocus } from "./place-frame";
import type { PopupShape } from "./image-popup-rules";
import { MAX_ZOOM, cutArea, moveFree, resizeFree, uncut, zoomPercent, zoomTo, type PictureSize, type PopupCut, type TrimRect } from "./image-popup-trim";

/** What the popup and the large editor change: the shape, focus and cut (and a re-opened trim's kept shape). */
export interface PopupEdit { shape: PopupShape; focus: PlaceFocus; cut: PopupCut; around?: PopupShape; aroundFocus?: PlaceFocus }

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** A shape chosen: Free starts from what the place shows now; a shape starts unzoomed and replaces one a re-opened Free trim kept. */
export function chooseShape(size: PictureSize | undefined, edit: PopupEdit, shape: PopupShape): PopupEdit {
  let cut = edit.cut;
  if (shape === "free" && edit.shape !== "free" && size) cut = { ...cut, rect: cutArea(size, edit.shape, edit.focus, cut) };
  else if (shape !== "free") cut = { ...cut, zoom: 1 };
  return shape === edit.shape ? { ...edit, cut } : { ...edit, shape, cut, around: undefined, aroundFocus: undefined };
}

/** The area the frame shows, as a scale and an offset that fit it in the middle of `area` with `pad` around it. */
export function fitView(rect: TrimRect, picture: PictureSize, area: PictureSize, pad: number) {
  const width = rect.w * picture.width, height = rect.h * picture.height;
  const scale = Math.max(1e-6, Math.min((area.width - 2 * pad) / width, (area.height - 2 * pad) / height));
  return { scale, x: (area.width - scale * width) / 2 - scale * rect.x * picture.width, y: (area.height - scale * height) / 2 - scale * rect.y * picture.height };
}

/** A shape (not Free) showing `rect`: the zoom from its size, the focus from where it stands. */
function showArea(size: PictureSize, edit: PopupEdit, rect: TrimRect): PopupEdit {
  const base = cutArea(size, edit.shape, { x: 50, y: 50 }, { ...edit.cut, zoom: 1 });
  const zoom = clamp(base.w / rect.w, 1, MAX_ZOOM), w = base.w / zoom, h = base.h / zoom;
  const at = (offset: number, room: number, was: number) => room > 1e-6 ? clamp(offset / room) * 100 : was;
  return { ...edit, cut: { ...edit.cut, zoom }, focus: { x: at(rect.x, 1 - w, edit.focus.x), y: at(rect.y, 1 - h, edit.focus.y) } };
}

/** What stays in view moved by (dx, dy), fractions of the picture as shown (dragging the picture moves it the other way). */
export function moveArea(size: PictureSize, edit: PopupEdit, from: TrimRect, dx: number, dy: number): PopupEdit {
  if (edit.shape === "free") return { ...edit, cut: { ...edit.cut, rect: moveFree(from, dx, dy) } };
  return showArea(size, edit, { ...from, x: clamp(from.x + dx, 0, 1 - from.w), y: clamp(from.y + dy, 0, 1 - from.h) });
}

/** A handle dragged (n, ne, e, … sw): Free changes its sides; a shape keeps its ratio, anchored at the opposite corner. */
export function resizeArea(size: PictureSize, edit: PopupEdit, from: TrimRect, handle: string, dx: number, dy: number): PopupEdit {
  if (edit.shape === "free") return { ...edit, cut: { ...edit.cut, rect: resizeFree(from, handle, dx, dy) } };
  const base = cutArea(size, edit.shape, { x: 50, y: 50 }, { ...edit.cut, zoom: 1 }), tall = base.h / base.w;
  const sx = handle.includes("e") ? 1 : -1, sy = handle.includes("s") ? 1 : -1;
  // The side dragged further sets the size.
  const across = from.w + sx * dx, down = (from.h + sy * dy) / tall;
  const w = clamp(Math.abs(across - from.w) >= Math.abs(down - from.w) ? across : down, base.w / MAX_ZOOM, base.w), h = w * tall;
  const x = clamp(sx > 0 ? from.x : from.x + from.w - w, 0, 1 - w), y = clamp(sy > 0 ? from.y : from.y + from.h - h, 0, 1 - h);
  return showArea(size, edit, { x, y, w, h });
}

/** Zoom in (factor > 1) or out, about the frame's centre; never below 100 % nor above the popup's limit. */
export function zoomArea(edit: PopupEdit, factor: number): PopupEdit {
  return { ...edit, cut: zoomTo(edit.shape, edit.cut, zoomPercent(edit.shape, edit.cut) * factor) };
}
export const canZoomOut = (edit: PopupEdit) => zoomPercent(edit.shape, edit.cut) > 100;

/**
 * Flip side to side ("x") or upside down ("y") as the picture is shown. A trim flips the picture
 * before turning it, so a turned picture flips the other way; the straighten mirrors too (a level
 * horizon stays level), and so do the frame and the focus, which keep the same part in view.
 */
export function flipEdit(edit: PopupEdit, axis: "x" | "y"): PopupEdit {
  const sideways = edit.cut.turn === 90 || edit.cut.turn === 270, source = (axis === "x") !== sideways ? "flipX" : "flipY";
  const { flipX, flipY, straighten, ...rest } = edit.cut, flips = { flipX, flipY, [source]: edit.cut[source] ? undefined : true as const };
  const r = edit.cut.rect;
  const cut: PopupCut = { ...rest, rect: axis === "x" ? { ...r, x: 1 - r.x - r.w } : { ...r, y: 1 - r.y - r.h },
    ...(flips.flipX ? { flipX: true as const } : {}), ...(flips.flipY ? { flipY: true as const } : {}), ...(straighten ? { straighten: -straighten } : {}) };
  const focus = axis === "x" ? { ...edit.focus, x: 100 - edit.focus.x } : { ...edit.focus, y: 100 - edit.focus.y };
  return { ...edit, cut, focus };
}

/** Straighten by `degrees` (−45 to 45, half degrees); the frame keeps its place on the enlarged picture. */
export function straightenEdit(edit: PopupEdit, degrees: number): PopupEdit {
  const value = Math.round(clamp(degrees, -45, 45) * 2) / 2;
  const { straighten: _was, ...cut } = edit.cut;
  return { ...edit, cut: value ? { ...cut, straighten: value } : cut };
}

/** The straighten ruler dragged by `dx` pixels from `start` degrees: 6 px a degree, the picture's way, catching at 0. */
export function rulerValue(start: number, dx: number) {
  const value = clamp(Math.round((start - dx / 6) * 2) / 2, -45, 45);
  return Math.abs(value) < 0.75 ? 0 : value;
}

/** Reset: the original picture, unturned and whole, in the place's own shape, centred. */
export function resetEdit(shape: PopupShape): PopupEdit {
  return { shape: shape === "free" ? "original" : shape, focus: { x: 50, y: 50 }, cut: uncut() };
}

/** One step of the large editor's own Undo and Redo: an edit as text, compared and restored whole. */
export function editKey({ shape, focus, cut, around, aroundFocus }: PopupEdit) {
  const { rect } = cut, round = (value: number) => Math.round(value * 1e6) / 1e6;
  return JSON.stringify([shape, ...[focus.x, focus.y, cut.turn, cut.zoom, rect.x, rect.y, rect.w, rect.h, cut.straighten ?? 0].map(round),
    Boolean(cut.flipX), Boolean(cut.flipY), around ?? null, aroundFocus ? [aroundFocus.x, aroundFocus.y] : null]);
}
