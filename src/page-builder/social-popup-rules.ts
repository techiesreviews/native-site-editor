// The Social image popup's rules (media build slice 44; ticket 09 "Components, sharing and
// backgrounds"): the image popup fixed to the 1200 × 630 sharing shape. The focus square moves the
// sharing copy's frame and Zoom trims it closer; there are no other shapes, no Free, Turn or large
// editor (the sharing copy is one plain rectangle of the picture). No DOM here.
import type { MediaTrim } from "../../shared/media-records";
import type { PlaceFocus } from "./place-frame";
import type { PopupShape } from "./image-popup-rules";
import { MAX_ZOOM, cutArea, cutTrim, restoreCut, uncut, type PictureSize, type PopupCut } from "./image-popup-trim";
import { SOCIAL_IMAGE_SIZE } from "./social-geometry";

export const SOCIAL_SHAPE: PopupShape = { kind: "other", value: `${SOCIAL_IMAGE_SIZE.width} / ${SOCIAL_IMAGE_SIZE.height}` };
export const SOCIAL_SHAPE_LABEL = `Sharing ${SOCIAL_IMAGE_SIZE.width} × ${SOCIAL_IMAGE_SIZE.height}`;
export const SOCIAL_MESSAGE = { tone: "new" as const, text: "Saves a sharing copy of this frame",
  tip: "Applying the settings saves a 1200 × 630 copy of this frame for sharing services. The picture itself stays as it is." };

/** The sharing copy's frame: always a trim, the whole shape centred when nothing moved. */
export function socialTrim(size: PictureSize, focus: PlaceFocus, zoom: number): MediaTrim {
  return cutTrim(size, SOCIAL_SHAPE, focus, { ...uncut(), zoom: clamp(zoom, 1, MAX_ZOOM) });
}

/**
 * A sharing copy re-opens on its picture with its frame put back. A frame the popup cannot make
 * (another shape, a turn, a straighten or flip made elsewhere) starts again in the middle.
 */
export function socialRestore(trim: MediaTrim | undefined, size: PictureSize): { focus: PlaceFocus; cut: PopupCut } {
  const centred = { focus: { x: 50, y: 50 }, cut: uncut() };
  if (!trim || trim.turn || trim.straighten || trim.flipX || trim.flipY) return centred;
  const restored = restoreCut(trim, SOCIAL_SHAPE, size);
  if (restored.shape !== "free") return { focus: restored.focus, cut: { ...uncut(), zoom: restored.cut.zoom } };
  // restoreCut keeps a frame that is only the shape's own crop as Free: here it is that crop, placed by the focus.
  const rect = restored.cut.rect, whole = cutArea(size, SOCIAL_SHAPE, centred.focus, centred.cut);
  if (Math.abs(rect.w - whole.w) > 0.01 || Math.abs(rect.h - whole.h) > 0.01) return centred;
  const at = (offset: number, room: number) => room > 1e-6 ? Math.round(clamp(offset / room) * 1000) / 10 : 50;
  return { focus: { x: at(rect.x, 1 - whole.w), y: at(rect.y, 1 - whole.h) }, cut: uncut() };
}

/** What Replace says: the new picture starts centred in the sharing frame. */
export function socialReplaceNotice(file: string) {
  return `${file.split("/").pop() || file} is in, centred in the sharing frame.`;
}

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
