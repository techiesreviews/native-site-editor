import { mediaChooseEncoding, mediaCopyIsSmaller, mediaSmallerMain, mediaTransparentOptions, mediaImageRecipe, mediaDimensions, mediaResponsiveWidths, mediaUntouched, mediaAnimatedOutput, validateMediaOptimiseOptions, type MediaOptimiseOptions, type MediaOptimiseResult, type MediaOutput } from "./media-optimise";

import { strippedImageSource } from "./media-image-bytes";

/** Slice 28 can supply an AVIF encoder here, including its speed setting. */
async function encode(canvas: OffscreenCanvas, type: string, quality: number, _speed?: number) {
  return canvas.convertToBlob({ type, quality: quality / 100 });
}
function sourceType(file: File, bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
  if (bytes[0] === 137 && bytes[1] === 80) return "image/png";
  if (String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return file.type;
}

self.onmessage = async (event: MessageEvent<{ file: File; options: MediaOptimiseOptions }>) => {
  const { file, options } = event.data;
  try {
    validateMediaOptimiseOptions(options);
    if (options.keepOriginal) {
      self.postMessage({ result: { outputs: [{ blob: file, extension: file.name.split(".").pop()?.toLowerCase() ?? "bin" }], before: file.size, after: file.size, note: "Original bytes and metadata are kept. Unsupported formats may not display on the web." } satisfies MediaOptimiseResult });
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (mediaUntouched(file.name, bytes)) {
      self.postMessage({ result: { outputs: [{ blob: file, extension }], before: file.size, after: file.size, note: "SVG and animated GIF are kept untouched, including their metadata." } satisfies MediaOptimiseResult });
      return;
    }
    const animated = mediaAnimatedOutput(file.name, bytes);
    if (animated) {
      self.postMessage({ result: { outputs: [animated], before: file.size, after: animated.blob.size, note: "Animated images keep their frames; location and camera details are removed." } satisfies MediaOptimiseResult });
      return;
    }
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error(`${file.name} cannot be decoded by this browser. For HEIC, export as JPEG or PNG first. You can also keep the original; unsupported files may not display on the web.`); }
    try {
      const size = mediaDimensions(bitmap.width, bitmap.height, options.maxWidth);
      let settings = options, note: string | undefined;
      const canvasAt = (width: number) => {
        const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
        const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas image encoding is unavailable. Keep the original instead.");
        ctx.drawImage(bitmap, 0, 0, width, height);
        return { canvas, ctx, height };
      };
      const { canvas, ctx, height } = canvasAt(size.width);
      const pixels = ctx.getImageData(0, 0, size.width, height).data;
      let transparent = false;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) { transparent = true; break; }
      if (transparent) settings = mediaTransparentOptions(settings);
      let blob = await encode(canvas, `image/${settings.format}`, settings.quality, settings.speed);
      if (settings.format === "avif" && blob.type !== "image/avif") {
        settings = mediaImageRecipe();
        blob = await encode(canvas, "image/webp", settings.quality);
        note = "AVIF is not available yet. Used Balanced WebP instead.";
      }
      // Slice 28 handles browsers returning PNG when WebP was requested.
      const png = transparent ? await encode(canvas, "image/png", settings.quality) : undefined;
      if (png) blob = mediaChooseEncoding(blob, png);
      // Transparent pictures already compared WebP with lossless PNG above.
      const type = sourceType(file, bytes);
      const stripped = strippedImageSource(bytes, type, bitmap.width === size.width && bitmap.height === height);
      blob = await mediaSmallerMain(blob, { size: file.size, stripped: stripped && new Blob([new Uint8Array(stripped)], { type }),
        transparent, lossless: /^image\/(?:png|gif|bmp)$/.test(type) || /\.(?:png|gif|bmp)$/i.test(file.name) }, type => encode(canvas, type, settings.quality));
      const output = (blob: Blob, width: number, height: number): MediaOutput => ({ blob, width, height,
        extension: blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] });
      const primary = output(blob, size.width, height), outputs = [primary];
      if (options.responsive) for (const width of mediaResponsiveWidths(size.width)) {
        const copy = canvasAt(width), encoded = await encode(copy.canvas, blob.type, settings.quality, settings.speed);
        // A family requires one actual format; unsupported encoders cannot supply a copy.
        if (encoded.type === blob.type && mediaCopyIsSmaller(encoded, blob)) outputs.push({ ...output(encoded, width, copy.height), variantWidth: width });
      }
      self.postMessage({ result: { outputs, before: file.size, after: primary.blob.size, ...(note ? { note } : {}) } satisfies MediaOptimiseResult });
    } finally { bitmap.close(); }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "This image could not be optimised." }); }
};
