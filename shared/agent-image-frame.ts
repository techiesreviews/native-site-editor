import type { MediaTrim } from "./media-records";
import { validTrim, isTrim } from "./media-trim";

export interface AgentImageTrim {
  x?: number; y?: number; width?: number; height?: number; zoom?: number;
  turn?: 0 | 90 | 180 | 270; flipX?: boolean; flipY?: boolean; straighten?: number;
}
export const NOTHING_TO_TRIM = "Nothing to trim; to show the whole original again, place_media the original file.";

/** A whole new rectangle in the flipped, turned original; zoom shrinks around its centre. */
export function agentImageTrim(args: AgentImageTrim): MediaTrim {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Give a trim rectangle.");
  const { x = 0, y = 0, width = 1, height = 1, zoom = 1, turn = 0, straighten = 0, flipX, flipY } = args;
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 8) throw new Error("Zoom must be between 1 and 8.");
  if ([x, y, width, height].some(value => !Number.isFinite(value) || value < 0 || value > 1))
    throw new Error("The trim must stay inside the picture, between 0 and 1.");
  if (![0, 90, 180, 270].includes(turn)) throw new Error("Turn the picture by 0, 90, 180 or 270 degrees.");
  if (!Number.isFinite(straighten)) throw new Error("Straighten must contain a finite number.");
  // Validate before zoom too: zoom cannot hide an outside rectangle.
  validTrim({ x, y, width, height, turn, straighten, flipX, flipY });
  const trim: MediaTrim = {
    x: x + (width - width / zoom) / 2, y: y + (height - height / zoom) / 2,
    width: width / zoom, height: height / zoom,
    ...(turn ? { turn } : {}), ...(straighten ? { straighten } : {}),
    ...(flipX ? { flipX } : {}), ...(flipY ? { flipY } : {}),
  };
  if (!isTrim(trim)) throw new Error(NOTHING_TO_TRIM);
  return trim;
}
