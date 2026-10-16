import { transparentImages } from "../../shared/media-kinds";
/** Formats that can hold see-through pixels; a JPEG never can, so it is never sampled. */
export function mediaMayBeTransparent(path: string) {
  return transparentImages.test(path);
}

/** True when any pixel of RGBA bytes is not fully opaque. */
export function hasSeeThroughPixel(rgba: ArrayLike<number>) {
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] !== 255) return true;
  return false;
}

const sampleSize = 32;

/** True when a loaded picture has see-through parts. A small copy is sampled; an SVG that cannot be
 * read is taken as see-through, as SVGs usually are; a format that cannot hold them never is. */
export function isSeeThrough(image: HTMLImageElement, path: string) {
  if (!mediaMayBeTransparent(path)) return false;
  try {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = sampleSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    return hasSeeThroughPixel(context.getImageData(0, 0, sampleSize, sampleSize).data);
  } catch { return /\.svg$/i.test(path); }
}

/** Mark a picture with see-through parts (`data-transparent`) once it has loaded, so it sits on the
 * light checkerboard in tiles, details and the picker (slice 106). */
export function markTransparency(image: HTMLImageElement, path: string) {
  if (!mediaMayBeTransparent(path)) return;
  const check = () => image.toggleAttribute("data-transparent", isSeeThrough(image, path));
  if (image.complete && image.naturalWidth) check(); else image.addEventListener("load", check, { once: true });
}
