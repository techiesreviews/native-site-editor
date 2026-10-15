/** Formats that can hold see-through pixels; a JPEG never can, so it is never sampled. */
export function mediaMayBeTransparent(path: string) {
  return /\.(?:png|webp|gif|avif|svg)$/i.test(path);
}

/** True when any pixel of RGBA bytes is not fully opaque. */
export function hasSeeThroughPixel(rgba: ArrayLike<number>) {
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] !== 255) return true;
  return false;
}

const sampleSize = 32;

/** Mark a picture with see-through parts (`data-transparent`) once it has loaded, so it sits on the
 * light checkerboard in tiles, details and the picker (slice 106). A small copy is sampled; an
 * SVG that cannot be read is taken as see-through, as SVGs usually are. */
export function markTransparency(image: HTMLImageElement, path: string) {
  if (!mediaMayBeTransparent(path)) return;
  const check = () => {
    let transparent: boolean;
    try {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = sampleSize;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, sampleSize, sampleSize);
      transparent = hasSeeThroughPixel(context.getImageData(0, 0, sampleSize, sampleSize).data);
    } catch { transparent = /\.svg$/i.test(path); }
    image.toggleAttribute("data-transparent", transparent);
  };
  if (image.complete && image.naturalWidth) check(); else image.addEventListener("load", check, { once: true });
}
