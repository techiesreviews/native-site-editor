import type { MediaTrim } from "../../shared/media-records";
import { trimGeometry, isTrim } from "./trim-geometry";
import { mediaChooseEncoding, mediaCopyIsSmaller, mediaSmallerMain, mediaTransparentOptions, mediaImageRecipe, mediaDimensions, mediaResponsiveWidths, mediaUntouched, mediaAnimatedOutput, validateMediaOptimiseOptions, type MediaOptimiseOptions, type MediaOptimiseResult, type MediaOutput } from "./media-optimise";

import { cleanedMediaOriginal } from "./media-originals";
import { loadHeicDecoder, loadPngSqueezer, loadSvgCleaner, type MediaCodecs } from "./media-codecs";
import { decodeMediaBitmap, isHeic } from "./media-heic";
import { strippedImageSource } from "./media-image-bytes";

import { createMediaEncoder } from "./media-encoders";

const encodeImage = createMediaEncoder();
function sourceType(file: File, bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
  if (bytes[0] === 137 && bytes[1] === 80) return "image/png";
  if (String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return file.type;
}

/** Decode once, then feed the same trimmed pixels to the main and every responsive encode. */
function imagePixels(bitmap: ImageBitmap, trim?: MediaTrim): ImageBitmap | OffscreenCanvas {
  if (!trim) return bitmap;
  const { width, height, matrix } = trimGeometry(bitmap.width, bitmap.height, trim);
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas image encoding is unavailable.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(...matrix);
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

/** Codecs are injectable so worker tests can run without WASM. */
export function installMediaOptimiser(codecs: MediaCodecs = { loadHeicDecoder, loadPngSqueezer, loadSvgCleaner }) {
  self.onmessage = async (event: MessageEvent<{ file: File; options: MediaOptimiseOptions; trim?: MediaTrim; original?: boolean }>) => {
    const { file, options, trim, original } = event.data;
    try {
      validateMediaOptimiseOptions(options);
      if (trim && !isTrim(trim)) throw new Error("The picture has not been trimmed.");
      if (trim && options.keepOriginal) throw new Error("A trimmed copy cannot keep the original bytes.");
      if (trim && original) throw new Error("A trimmed copy has no kept original; its source is already in the site.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const heic = isHeic(file.name, file.type, bytes), svg = /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
      // Keep original never skips SVG clean-up, nor makes a HEIC the website image.
      if (options.keepOriginal && !svg && !heic) {
        self.postMessage({ result: { outputs: [{ blob: file, extension: file.name.split(".").pop()?.toLowerCase() ?? "bin" }], before: file.size, after: file.size, note: "Original bytes and metadata are kept. Unsupported formats may not display on the web." } satisfies MediaOptimiseResult });
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
      if (svg) {
        if (trim) throw new Error("This picture cannot be trimmed. Use a still raster picture.");
        const { cleanSvg, svgDimensions } = await codecs.loadSvgCleaner();
        const cleaned = cleanSvg(bytes), blob = new Blob([new Uint8Array(cleaned)], { type: "image/svg+xml" });
        self.postMessage({ result: { outputs: [{ blob, extension: "svg", ...svgDimensions(cleaned) }], before: file.size, after: blob.size } satisfies MediaOptimiseResult });
        return;
      }
      if (mediaUntouched(file.name, bytes)) {
        if (trim) throw new Error("This picture cannot be trimmed. Use a still raster picture.");
        self.postMessage({ result: { outputs: [{ blob: file, extension }], before: file.size, after: file.size, note: "Animated GIFs are kept untouched, including their metadata." } satisfies MediaOptimiseResult });
        return;
      }
      const animated = mediaAnimatedOutput(file.name, bytes);
      if (animated) {
        if (trim) throw new Error("Animated pictures cannot be trimmed. Use a still picture.");
        self.postMessage({ result: { outputs: [animated], before: file.size, after: animated.blob.size, note: "Animated images keep their frames; location and camera details are removed." } satisfies MediaOptimiseResult });
        return;
      }
      const bitmap = await decodeMediaBitmap(file, bytes, source => createImageBitmap(source), codecs.loadHeicDecoder);
      /** A PNG that stays PNG gets a lossless squeeze when it helps; a failure keeps the PNG. */
      const squeeze = async (blob: Blob) => {
        if (blob.type !== "image/png") return blob;
        try {
          const squeezed = await (await codecs.loadPngSqueezer())(new Uint8Array(await blob.arrayBuffer()));
          return squeezed.byteLength < blob.size ? new Blob([new Uint8Array(squeezed)], { type: blob.type }) : blob;
        } catch { return blob; }
      };
      try {
        const picture = imagePixels(bitmap, trim);
        const size = mediaDimensions(picture.width, picture.height, options.maxWidth);
        let settings = options;
        const notes = new Set<string>();
        const encode = (canvas: OffscreenCanvas, type: string, quality: number, speed?: number) =>
          encodeImage(canvas, type, quality, speed, text => notes.add(text));
        const canvasAt = (width: number) => {
          const height = Math.max(1, Math.round(picture.height * width / picture.width));
          const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas image encoding is unavailable. Keep the original instead.");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(picture, 0, 0, width, height);
          return { canvas, ctx, height };
        };
        const { canvas, ctx, height } = canvasAt(size.width);
        const pixels = ctx.getImageData(0, 0, size.width, height).data;
        let transparent = false;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) { transparent = true; break; }
        if (transparent) settings = mediaTransparentOptions(settings);
        let blob = await encode(canvas, `image/${settings.format}`, settings.quality, settings.speed);
        // A failed AVIF encoder used Balanced; its copies must use that recipe too.
        if (settings.format === "avif" && blob.type !== "image/avif") settings = mediaImageRecipe();
        // Native WebP or its on-demand encoder shares the same comparison and copy path.
        const png = transparent ? await encode(canvas, "image/png", settings.quality) : undefined;
        if (png) blob = mediaChooseEncoding(blob, png);
        // Transparent pictures already compared WebP with lossless PNG above.
        const type = sourceType(file, bytes);
        // Original bytes never represent trimmed pixels, even for a full-frame turn or flip.
        // A HEIC's own bytes never become the website file.
        const stripped = trim || heic ? undefined : strippedImageSource(bytes, type, bitmap.width === size.width && bitmap.height === height);
        blob = await mediaSmallerMain(blob, { size: file.size, stripped: stripped && new Blob([new Uint8Array(stripped)], { type }),
          transparent, lossless: !heic && (/^image\/(?:png|gif|bmp)$/.test(type) || /\.(?:png|gif|bmp)$/i.test(file.name)) }, type => encode(canvas, type, settings.quality));
        blob = await squeeze(blob);
        const output = (blob: Blob, width: number, height: number): MediaOutput => ({ blob, width, height,
          extension: blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] });
        const primary = output(blob, size.width, height), outputs = [primary];
        if (options.responsive) for (const width of mediaResponsiveWidths(size.width)) {
          const copy = canvasAt(width), encoded = await squeeze(await encode(copy.canvas, blob.type, settings.quality, settings.speed));
          // A family requires one actual format; unsupported encoders cannot supply a copy.
          if (encoded.type === blob.type && mediaCopyIsSmaller(encoded, blob)) outputs.push({ ...output(encoded, width, copy.height), variantWidth: width });
        }
        let retained: MediaOutput | undefined;
        if (original) {
          // The full-size source picture (Keep original): never trimmed, so `picture` is the bitmap itself.
          const full = canvasAt(bitmap.width);
          const pixels = full.ctx.getImageData(0, 0, bitmap.width, full.height).data;
          let fullTransparent = false;
          for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) { fullTransparent = true; break; }
          retained = await cleanedMediaOriginal(bytes, type, fullTransparent, (type, quality) => encode(full.canvas, type, quality));
        }
        self.postMessage({ result: { outputs, ...retained ? { original: retained } : {}, before: file.size, after: primary.blob.size, ...(notes.size ? { note: [...notes].join(" ") } : {}) } satisfies MediaOptimiseResult });
      } finally { bitmap.close(); }
    } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "This image could not be optimised." }); }
  };
}
installMediaOptimiser();
