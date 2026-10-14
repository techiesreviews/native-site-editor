import type { MediaTrim } from "../../shared/media-records";
import { gifIsAnimated, webpIsAnimated, pngIsAnimated, strippedImageSource } from "./media-image-bytes";
import { RESPONSIVE_COPY_WIDTHS } from "./media-families";
export interface MediaOptimiseOptions {
  maxWidth: number | null; quality: number; format: "webp" | "png" | "jpeg" | "avif"; speed?: number; responsive: boolean; keepOriginal: boolean;
}
export const DEFAULT_MEDIA_OPTIMISE: MediaOptimiseOptions = { maxWidth: 2400, quality: 80, format: "webp", responsive: true, keepOriginal: false };
export type MediaImageQuality = "smaller" | "balanced" | "higher" | "smallest";
export function mediaImageRecipe(quality: MediaImageQuality = "balanced"): MediaOptimiseOptions {
  const presets = {
    smaller: { maxWidth: 1600, quality: 70, format: "webp" },
    balanced: { maxWidth: 2400, quality: 80, format: "webp" },
    higher: { maxWidth: null, quality: 90, format: "webp" },
    smallest: { maxWidth: 2400, quality: 50, format: "avif", speed: 8 },
  } as const;
  return { ...presets[quality], responsive: true, keepOriginal: false };
}
export function mediaTransparentOptions(options: MediaOptimiseOptions) {
  return options.format === "avif" ? mediaImageRecipe() : { ...options, format: "webp" as const };
}
/** A main image never grows past a smaller suitable version at the chosen size: the source with personal details
 * removed (`stripped`, only when eligible), a JPEG for opaque pictures, a lossless PNG for lossless sources.
 * The source compared against is the stripped one when eligible; extra encodes run only when the main is larger. */
export async function mediaSmallerMain(main: Blob, source: { size: number; stripped?: Blob; transparent: boolean; lossless: boolean },
  encode: (type: "image/jpeg" | "image/png") => Promise<Blob>): Promise<Blob> {
  if (main.size <= (source.stripped?.size ?? source.size)) return main;
  const candidates = [source.stripped];
  if (!source.transparent) candidates.push(await encode("image/jpeg"));
  if (source.lossless && !source.transparent) candidates.push(await encode("image/png"));
  return candidates.reduce<Blob>((chosen, candidate) => candidate && candidate.size < chosen.size ? candidate : chosen, main);
}
export function mediaCopyIsSmaller(copy: Blob, main: Blob) { return copy.size < main.size; }
export interface MediaOutput { blob: Blob; width?: number; height?: number; extension: string; variantWidth?: number }
export interface MediaOptimiseResult { outputs: MediaOutput[]; before: number; after: number; note?: string }

export function mediaDimensions(width: number, height: number, maxWidth: number | null) {
  if (![width, height, maxWidth ?? width].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Image dimensions and maximum width must be positive finite numbers.");
  const scale = Math.min(1, Math.max(1, maxWidth ?? width) / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function mediaResponsiveWidths(width: number) { return RESPONSIVE_COPY_WIDTHS.filter((size) => size < width); }
export function mediaChooseEncoding(webp: Blob, png: Blob | undefined) { return png && png.size < webp.size ? png : webp; }
export function mediaSavings(before: number, after: number) { return before > 0 ? Math.round((1 - after / before) * 100) : 0; }
/** SVG and animated GIF stay as they are until phase 5. */
export function mediaUntouched(name: string, bytes = new Uint8Array()) { return /\.svg$/i.test(name) || gifIsAnimated(bytes); }
/** Animated PNG and WebP keep their frames with location and camera details removed, or are refused. */
export function mediaAnimatedOutput(name: string, bytes: Uint8Array): MediaOutput | undefined {
  const type = pngIsAnimated(bytes) ? "image/png" : webpIsAnimated(bytes) ? "image/webp" : undefined;
  if (!type) return;
  const stripped = strippedImageSource(bytes, type, true);
  if (!stripped) throw new Error(`${name} is animated, and its hidden location and camera details could not be removed. Save it again without them, then add it.`);
  return { blob: new Blob([new Uint8Array(stripped)], { type }), extension: type.slice(6) };
}

export function validateMediaOptimiseOptions(options: MediaOptimiseOptions) {
  if ((options.maxWidth !== null && (!Number.isInteger(options.maxWidth) || options.maxWidth < 1 || options.maxWidth > 10000)) || !Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100 || !["webp", "png", "jpeg", "avif"].includes(options.format) || (options.speed !== undefined && (!Number.isInteger(options.speed) || options.speed < 0 || options.speed > 10)) || typeof options.responsive !== "boolean" || typeof options.keepOriginal !== "boolean") throw new Error("Choose a width from 1 to 10000, quality from 1 to 100, and a supported image format.");
}

/** Vite emits a same-origin script; never a blob: worker under the editor CSP. */
export function optimiseMedia(file: File, options: MediaOptimiseOptions, signal?: AbortSignal, trim?: MediaTrim): Promise<MediaOptimiseResult> {
  return new Promise((resolve, reject) => {
    validateMediaOptimiseOptions(options);
    if (signal?.aborted) { reject(new DOMException("Image optimisation cancelled.", "AbortError")); return; }
    const worker = new Worker(new URL("./image-optimise.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => finish(new Error("This image took too long to prepare. Try a smaller image or keep the original.")), options.format === "avif" ? 300_000 : 60_000);
    let finished = false;
    const abort = () => finish(new DOMException("Image optimisation cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    function finish(error?: Error, result?: MediaOptimiseResult) {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", abort);
      clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(result!);
    }
    worker.onmessage = (event: MessageEvent<{ error?: string; result?: MediaOptimiseResult }>) => finish(event.data.error ? new Error(event.data.error) : undefined, event.data.result);
    worker.onerror = () => finish(new Error("Image optimisation is unavailable in this browser. Keep the original to upload it."));
    worker.postMessage({ file, options, ...(trim ? { trim } : {}) });
  });
}
