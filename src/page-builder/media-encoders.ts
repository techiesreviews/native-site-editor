import { mediaImageRecipe } from "./media-optimise";

/** Canvas WebP can silently become PNG; canvas AVIF is never relied on. */
export function mediaEncoderFor(requestedType: string, nativeResultType?: string) {
  if (requestedType === "image/avif") return "avif-wasm";
  if (requestedType === "image/webp" && nativeResultType !== "image/webp") return "webp-wasm";
  return "native";
}

type Encoder = (pixels: ImageData, options: { quality: number; speed?: number }) => Promise<ArrayBuffer>;
export interface MediaEncoderLoaders {
  webp(): Promise<Encoder>;
  avif(): Promise<Encoder>;
}
type Canvas = Pick<OffscreenCanvas, "width" | "height" | "getContext" | "convertToBlob">;

/** One instance per worker: copies reuse imports and the failed native WebP check. */
export function createMediaEncoder(loaders: MediaEncoderLoaders = {
  webp: async () => (await import("@jsquash/webp/encode.js")).default,
  // Without cross-origin isolation jSquash selects its single-threaded codec.
  avif: async () => (await import("@jsquash/avif/encode.js")).default,
}) {
  let nativeWebp = true, webp: Promise<Encoder> | undefined, avif: Promise<Encoder> | undefined;
  const encode = async (canvas: Canvas, type: string, quality: number, speed?: number,
    note: (text: string) => void = () => {}): Promise<Blob> => {
    let native: Blob | undefined;
    if (type !== "image/avif" && (type !== "image/webp" || nativeWebp)) {
      native = await canvas.convertToBlob({ type, quality: quality / 100 });
      if (mediaEncoderFor(type, native.type) === "native") return native;
      nativeWebp = false;
    }
    const choice = mediaEncoderFor(type, native?.type);
    try {
      const encoder = await (choice === "avif-wasm" ? avif ??= loaders.avif() : webp ??= loaders.webp());
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas image encoding is unavailable.");
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      return new Blob([await encoder(pixels, { quality, ...(speed === undefined ? {} : { speed }) })], { type });
    } catch {
      if (choice === "avif-wasm") {
        note("Smallest files (slower) could not be used in this browser. Used Balanced WebP instead.");
        return encode(canvas, "image/webp", mediaImageRecipe().quality, undefined, note);
      }
      note("WebP could not be used in this browser. Used PNG instead.");
      return native ?? canvas.convertToBlob({ type: "image/png" });
    }
  };
  return encode;
}
