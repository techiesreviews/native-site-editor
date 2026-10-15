import type { MediaBytes } from "./media-byte-cache";
import { LARGE_IMAGE_BYTES } from "./media-limits";

/** The tile copy's shorter side, in pixels: sharp on a 3× phone tile and a 2× six-across tile. */
export const TILE_COPY_EDGE = 480;

/** A picture wider than 2:1 (a banner, a panorama) shows whole on its tile; others fill the square. */
export const mediaTileWhole = (width?: number, height?: number) => Boolean(width && height && width > 2 * height);

/** The size of a heavy picture's tile copy, its shorter side `edge` px; nothing when it is no larger. */
export function mediaTileCopySize(width: number, height: number, edge = TILE_COPY_EDGE) {
  const scale = edge / Math.min(width, height);
  if (!(scale < 1)) return undefined;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const copies = new WeakMap<MediaBytes, Promise<string>>();

/** The address a tile shows: a heavy picture (over 1 MB) gets a small copy made once, so a grid of
 * large photos never keeps every full-size picture decoded (slice 107). Anything that cannot be
 * copied (an SVG, a format the browser cannot draw) shows as it is. A copy made once its view has
 * closed gets no address. */
export function tilePictureUrl(data: MediaBytes, objectUrl: (blob: Blob) => string, alive: () => boolean): Promise<string> {
  if (data.blob.size <= LARGE_IMAGE_BYTES || /svg/i.test(data.blob.type) || !data.width || !data.height) return Promise.resolve(data.url);
  const size = mediaTileCopySize(data.width, data.height);
  if (!size) return Promise.resolve(data.url);
  let copy = copies.get(data);
  if (!copy) {
    copy = (async () => {
      const bitmap = await createImageBitmap(data.blob);
      try {
        const canvas = new OffscreenCanvas(size.width, size.height), context = canvas.getContext("2d");
        if (!context) return data.url;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const copy = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
        // A view closed meanwhile has released its addresses: make none it would never release.
        return alive() ? objectUrl(copy) : data.url;
      } finally { bitmap.close(); }
    })().catch(() => data.url);
    copies.set(data, copy);
  }
  return copy;
}
