import type { MediaTrim } from "../../shared/media-records";

/**
 * Trim coordinates are fractions of the turned frame, independent of source pixel size.
 * First flip in the decoded source's own orientation (X left-right, Y top-bottom), then
 * turn clockwise by 0/90/180/270. Straighten clockwise about the turned frame's centre,
 * keeping that frame's size. Finally take (x, y, width, height) of that frame. Zoom is a
 * smaller rectangle. Output dimensions round to pixels, with a minimum of one pixel.
 * The matrix uses canvas setTransform order and draws the source bitmap at (0, 0).
 */
const TOLERANCE = 1e-9;
export function validTrim(trim: MediaTrim): boolean {
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
type Matrix = [number, number, number, number, number, number];
const multiply = ([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix =>
  [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];

export function trimGeometry(sourceWidth: number, sourceHeight: number, trim: MediaTrim): { width: number; height: number; matrix: Matrix } {
  validTrim(trim);
  if (![sourceWidth, sourceHeight].every(value => Number.isFinite(value) && value > 0))
    throw new Error("The source picture must have positive finite dimensions.");
  const w = sourceWidth, h = sourceHeight, turn = trim.turn ?? 0;
  const width = turn === 90 || turn === 270 ? h : w, height = turn === 90 || turn === 270 ? w : h;
  const turns: Record<number, Matrix> = { 0: [1, 0, 0, 1, 0, 0], 90: [0, 1, -1, 0, h, 0],
    180: [-1, 0, 0, -1, w, h], 270: [0, -1, 1, 0, 0, w] };
  const flipped: Matrix = [trim.flipX ? -1 : 1, 0, 0, trim.flipY ? -1 : 1, trim.flipX ? w : 0, trim.flipY ? h : 0];
  const angle = (trim.straighten ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const rotated: Matrix = [cos, sin, -sin, cos, width / 2 - cos * width / 2 + sin * height / 2, height / 2 - sin * width / 2 - cos * height / 2];
  const x = Math.max(0, trim.x), y = Math.max(0, trim.y);
  return { width: Math.max(1, Math.round(Math.min(trim.width, 1 - x) * width)),
    height: Math.max(1, Math.round(Math.min(trim.height, 1 - y) * height)),
    matrix: multiply([1, 0, 0, 1, -x * width, -y * height], multiply(rotated, multiply(turns[turn], flipped))) };
}
