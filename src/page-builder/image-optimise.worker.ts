import { mediaChooseEncoding, mediaDimensions, mediaResponsiveWidths, mediaUntouched, validateMediaOptimiseOptions, type MediaOptimiseOptions, type MediaOptimiseResult, type MediaOutput } from "./media-optimise";

self.onmessage = async (event: MessageEvent<{ file: File; options: MediaOptimiseOptions }>) => {
  const { file, options } = event.data;
  try {
    validateMediaOptimiseOptions(options);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
    if (mediaUntouched(file.name) || options.keepOriginal) {
      self.postMessage({ result: { outputs: [{ blob: file, extension }], before: file.size, after: file.size, note: options.keepOriginal ? "Original bytes and metadata are kept." : "SVG and animated GIF are kept untouched, including their metadata." } satisfies MediaOptimiseResult });
      return;
    }
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error(`${file.name} cannot be decoded by this browser. For HEIC, export as JPEG or PNG first. You can also keep the original; unsupported files may not display on the web.`); }
    try {
      const size = mediaDimensions(bitmap.width, bitmap.height, options.maxWidth);
      const encode = async (width: number): Promise<MediaOutput> => {
        const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas image encoding is unavailable. Keep the original instead.");
        ctx.drawImage(bitmap, 0, 0, width, height);
        // Check the resized pixels, so transparent images can keep a smaller PNG.
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let transparent = false;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) { transparent = true; break; }
        const type = options.format === "jpeg" ? "image/jpeg" : `image/${options.format}`;
        const encoded = await canvas.convertToBlob({ type, quality: options.quality / 100 });
        const png = options.format === "webp" && transparent ? await canvas.convertToBlob({ type: "image/png" }) : undefined;
        const blob = mediaChooseEncoding(encoded, png);
        return { blob, width, height, extension: blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] };
      };
      const primary = await encode(size.width);
      const outputs = [primary];
      if (options.responsive) for (const width of mediaResponsiveWidths(size.width)) {
        const variant = await encode(width);
        // All responsive sources share the primary format and a predictable name.
        if (variant.extension !== primary.extension) {
          const canvas = new OffscreenCanvas(width, variant.height!);
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, variant.height!);
          variant.blob = await canvas.convertToBlob({ type: primary.blob.type, quality: options.quality / 100 });
          variant.extension = primary.extension;
        }
        outputs.push({ ...variant, variantWidth: width });
      }
      self.postMessage({ result: { outputs, before: file.size, after: primary.blob.size } satisfies MediaOptimiseResult });
    } finally { bitmap.close(); }
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "This image could not be optimised." }); }
};
