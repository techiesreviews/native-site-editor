import { losslessImageTypes, losslessImages } from "../../shared/media-kinds-policies";
import type { MediaTrim } from "../../shared/media-records";
import { socialImageTrim, socialImageSize } from "./social-geometry";
import { trimGeometry, isTrim, validTrim } from "./trim-geometry";
import { mediaChooseEncoding, mediaCopyIsSmaller, mediaSmallerMain, mediaTransparentOptions, mediaImageRecipe, mediaDimensions, mediaResponsiveWidths, mediaUntouched, mediaAnimatedOutput, validateMediaOptimiseOptions, type MediaCopiesOptions, type MediaOptimiseOptions, type MediaOptimiseResult, type MediaOutput } from "./media-optimise";

import { cleanedMediaOriginal } from "./media-originals";
import { loadHeicDecoder, loadPngSqueezer, loadSvgCleaner, type MediaCodecs } from "./media-codecs";
import { decodeMediaBitmap, isHeic } from "./media-heic";
import { gifIsAnimated, pngIsAnimated, webpIsAnimated, strippedImageSource } from "./media-image-bytes";

import { createMediaEncoder } from "./media-encoders";

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
  const encodeImage = createMediaEncoder();
  self.onmessage = async (event: MessageEvent<{ file: File; options: MediaOptimiseOptions; trim?: MediaTrim; original?: boolean; copies?: MediaCopiesOptions }>) => {
    const { file, options, trim, original, copies } = event.data;
    try {
      validateMediaOptimiseOptions(options);
      if (options.sharing && (options.keepOriginal || original || options.responsive || options.format !== "jpeg"))
        throw new Error("A sharing copy must be one JPEG image.");
      if (options.plainJpeg && (options.format !== "jpeg" || options.keepOriginal || original || options.responsive || options.sharing || trim))
        throw new Error("A plain JPEG must be one untrimmed JPEG image.");
      if (trim && options.sharing) validTrim(trim);
      if (trim && !options.sharing && !isTrim(trim)) throw new Error("The picture has not been trimmed.");
      if (trim && options.keepOriginal) throw new Error("A trimmed copy cannot keep the original bytes.");
      if (trim && original) throw new Error("A trimmed copy has no kept original; its source is already in the site.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (copies && (gifIsAnimated(bytes) || pngIsAnimated(bytes) || webpIsAnimated(bytes))) {
        self.postMessage({ result: { outputs: [], before: file.size, after: 0 } satisfies MediaOptimiseResult });
        return;
      }
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
      // A sharing copy deliberately decodes the first frame of an animated GIF.
      if (!options.sharing && mediaUntouched(file.name, bytes)) {
        if (trim) throw new Error("This picture cannot be trimmed. Use a still raster picture.");
        self.postMessage({ result: { outputs: [{ blob: file, extension }], before: file.size, after: file.size, note: "Animated GIFs are kept untouched, including their metadata." } satisfies MediaOptimiseResult });
        return;
      }
      const animated = mediaAnimatedOutput(file.name, bytes);
      if (animated) {
        if (trim || options.sharing) throw new Error("Animated pictures cannot be trimmed. Use a still picture.");
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
        if (options.sharing) {
          const frame = trim ?? socialImageTrim(bitmap.width, bitmap.height);
          const size = socialImageSize(bitmap.width, bitmap.height, frame);
          const canvas = new OffscreenCanvas(size.width, size.height), ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas image encoding is unavailable.");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, size.width, size.height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, frame.x * bitmap.width, frame.y * bitmap.height,
            frame.width * bitmap.width, frame.height * bitmap.height, 0, 0, size.width, size.height);
          const blob = await encodeImage(canvas, "image/jpeg", 85);
          if (blob.type !== "image/jpeg") throw new Error("The sharing image could not be saved as JPEG.");
          self.postMessage({ result: { outputs: [{ blob, ...size, extension: "jpg" }],
            trim: frame, before: file.size, after: blob.size } satisfies MediaOptimiseResult });
          return;
        }
        const picture = imagePixels(bitmap, trim);
        const size = mediaDimensions(picture.width, picture.height, copies ? null : options.maxWidth);
        let settings = copies ? { ...options, format: copies.format } : options;
        const notes = new Set<string>();
        const encode = (canvas: OffscreenCanvas, type: string, quality: number, speed?: number) =>
          encodeImage(canvas, type, quality, speed, text => notes.add(text));
        const canvasAt = (width: number) => {
          const height = Math.max(1, Math.round(picture.height * width / picture.width));
          const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas image encoding is unavailable. Keep the original instead.");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          if (options.plainJpeg) {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(picture, 0, 0, width, height);
          return { canvas, ctx, height };
        };
        const { canvas, ctx, height } = canvasAt(size.width);
        const pixels = ctx.getImageData(0, 0, size.width, height).data;
        let transparent = false;
        for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) { transparent = true; break; }
        if (transparent && !options.plainJpeg) {
          settings = mediaTransparentOptions(options);
          // An ambiguous recipe name may require the main's own format; keep that safe plan.
          if (copies && copies.format !== options.format) settings = { ...settings, format: copies.format };
        }
        if (copies) {
          const outputs: MediaOutput[] = [];
          const widths = copies.widths.filter(width => Number.isInteger(width) && width >= 1 && width < picture.width);
          // Transparent pictures keep the recipe's WebP/lossless PNG choice, judged at the largest copy, for one copy format.
          if (transparent && settings.format === "webp" && copies.format === options.format && widths.length) {
            const largest = canvasAt(Math.max(...widths)).canvas;
            const webp = await encode(largest, "image/webp", settings.quality);
            const png = await squeeze(await encode(largest, "image/png", settings.quality));
            if (png.type === "image/png" && mediaChooseEncoding(webp, png) === png) settings = { ...settings, format: "png" };
          }
          for (const width of widths) {
            const copy = canvasAt(width);
            const encoded = await squeeze(await encode(copy.canvas, `image/${settings.format}`, settings.quality, settings.speed));
            if (settings.format === "avif" && encoded.type === "image/webp") settings = mediaImageRecipe();
            if (encoded.type === `image/${settings.format}` && mediaCopyIsSmaller(encoded, file)) outputs.push({
              blob: encoded, width, height: copy.height, variantWidth: width,
              extension: encoded.type === "image/jpeg" ? "jpg" : encoded.type.slice(6),
            });
          }
          self.postMessage({ result: { outputs, before: file.size, after: outputs.reduce((sum, output) => sum + output.blob.size, 0) } satisfies MediaOptimiseResult });
          return;
        }
        let blob = await encode(canvas, `image/${settings.format}`, settings.quality, settings.speed);
        // A failed AVIF encoder used Balanced; its copies must use that recipe too.
        if (settings.format === "avif" && blob.type !== "image/avif") settings = mediaImageRecipe();
        // Native WebP or its on-demand encoder shares the same comparison and copy path.
        const png = transparent && !options.plainJpeg ? await encode(canvas, "image/png", settings.quality) : undefined;
        if (png) blob = mediaChooseEncoding(blob, png);
        // Transparent pictures already compared WebP with lossless PNG above.
        const type = sourceType(file, bytes);
        // Original bytes never represent trimmed pixels, even for a full-frame turn or flip.
        // A HEIC's own bytes never become the website file.
        const stripped = trim || heic ? undefined : strippedImageSource(bytes, type, bitmap.width === size.width && bitmap.height === height);
        if (!options.plainJpeg) blob = await mediaSmallerMain(blob, { size: file.size, stripped: stripped && new Blob([new Uint8Array(stripped)], { type }),
          transparent, lossless: !heic && (losslessImageTypes.test(type) || losslessImages.test(file.name)) }, type => encode(canvas, type, settings.quality));
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
