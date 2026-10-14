import type { MediaTrim } from "./media-records";

const TOLERANCE = 1e-9;
export function validTrim(trim: Pick<MediaTrim, "x" | "y" | "width" | "height" | "turn" | "straighten"> & { flipX?: boolean; flipY?: boolean }): boolean {
  if (!trim || ![trim.x, trim.y, trim.width, trim.height, trim.straighten ?? 0].every(Number.isFinite))
    throw new Error("The trim must contain finite numbers.");
  if (trim.width <= 0 || trim.height <= 0) throw new Error("The trim must have a positive width and height.");
  if (trim.x < -TOLERANCE || trim.y < -TOLERANCE || trim.x + trim.width > 1 + TOLERANCE || trim.y + trim.height > 1 + TOLERANCE)
    throw new Error("The trim must stay inside the picture, between 0 and 1.");
  if (![0, 90, 180, 270].includes(trim.turn ?? 0)) throw new Error("Turn the picture by 0, 90, 180 or 270 degrees.");
  if (Math.abs(trim.straighten ?? 0) > 45) throw new Error("Straighten must be between -45 and 45 degrees.");
  if ([trim.flipX, trim.flipY].some(value => value !== undefined && typeof value !== "boolean"))
    throw new Error("Picture flips must be booleans.");
  return true;
}
export function isTrim(trim: MediaTrim): boolean {
  validTrim(trim);
  return Math.abs(trim.x) > TOLERANCE || Math.abs(trim.y) > TOLERANCE ||
    Math.abs(trim.width - 1) > TOLERANCE || Math.abs(trim.height - 1) > TOLERANCE ||
    Boolean(trim.turn || trim.straighten || trim.flipX || trim.flipY);
}
