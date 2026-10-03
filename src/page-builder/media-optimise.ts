export interface MediaOptimiseOptions {
  maxWidth: number; quality: number; format: "webp" | "png" | "jpeg"; responsive: boolean; keepOriginal: boolean;
}
export const DEFAULT_MEDIA_OPTIMISE: MediaOptimiseOptions = { maxWidth: 2400, quality: 80, format: "webp", responsive: true, keepOriginal: false };
export interface MediaOutput { blob: Blob; width?: number; height?: number; extension: string; variantWidth?: number }
export interface MediaOptimiseResult { outputs: MediaOutput[]; before: number; after: number; note?: string }

export function mediaDimensions(width: number, height: number, maxWidth: number) {
  if (![width, height, maxWidth].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Image dimensions and maximum width must be positive finite numbers.");
  const scale = Math.min(1, Math.max(1, maxWidth) / width);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function mediaResponsiveWidths(width: number) { return [480, 960, 1600].filter((size) => size < width); }
export function mediaChooseEncoding(webp: Blob, png: Blob | undefined) { return png && png.size < webp.size ? png : webp; }
export function mediaSavings(before: number, after: number) { return before > 0 ? Math.round((1 - after / before) * 100) : 0; }
export function mediaUntouched(name: string) { return /\.(?:svg|gif)$/i.test(name); }

export function validateMediaOptimiseOptions(options: MediaOptimiseOptions) {
  if (!Number.isInteger(options.maxWidth) || options.maxWidth < 1 || options.maxWidth > 10000 || !Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100 || !["webp", "png", "jpeg"].includes(options.format) || typeof options.responsive !== "boolean" || typeof options.keepOriginal !== "boolean") throw new Error("Choose a width from 1 to 10000, quality from 1 to 100, and a supported image format.");
}

/** Vite emits a same-origin script; never a blob: worker under the editor CSP. */
export function optimiseMedia(file: File, options: MediaOptimiseOptions, signal?: AbortSignal): Promise<MediaOptimiseResult> {
  return new Promise((resolve, reject) => {
    validateMediaOptimiseOptions(options);
    if (signal?.aborted) { reject(new DOMException("Image optimisation cancelled.", "AbortError")); return; }
    const worker = new Worker(new URL("./image-optimise.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => finish(new Error("This image took too long to decode. Try a smaller image or keep the original.")), 60_000);
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
    worker.postMessage({ file, options });
  });
}
