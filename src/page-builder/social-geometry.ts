import type { MediaTrim } from "../../shared/media-records";

/** The sharing copy's shape (media build slice 36). Apart from the naming and address rules, so the image worker loads only this. */
export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };

export function socialImageTrim(width: number, height: number): MediaTrim {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error("The picture must have positive dimensions.");
  const ratio = SOCIAL_IMAGE_SIZE.width / SOCIAL_IMAGE_SIZE.height;
  const w = Math.min(width, height * ratio) / width, h = Math.min(height, width / ratio) / height;
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

export function socialImageSize(width: number, height: number, trim = socialImageTrim(width, height)) {
  // Small sources retain their own trimmed size, rounded to pixels; sharing never enlarges them.
  const croppedWidth = width * trim.width, croppedHeight = height * trim.height;
  return croppedWidth >= 1200 ? { ...SOCIAL_IMAGE_SIZE } : {
    width: Math.max(1, Math.round(croppedWidth)), height: Math.max(1, Math.round(croppedHeight)),
  };
}
