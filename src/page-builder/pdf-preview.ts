import { uploadProblem } from "../uploads";
import type { MediaOptimiseResult, MediaOutput } from "./media-optimise";

/** Never enlarge a page, and fit either orientation inside the preview bounds. */
export function pdfPreviewSize(width: number, height: number) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid PDF page dimensions.");
  const scale = Math.min(1, 960 / width, 1440 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Where the build publishes pdf.js's decoding data (`vite-pdfjs-assets.ts`): Adobe CMaps for CJK text,
 * standard fonts for unembedded text, WASM for JPEG 2000/JBIG2 scans and ICC colour profiles.
 * Without them pdf.js may quietly draw an empty page. */
export function pdfjsAssetOptions(version: string, base = "/") {
  const root = `${base.replace(/\/?$/, "/")}assets/pdfjs-${version}/`;
  return { cMapUrl: root + "cmaps/", cMapPacked: true, standardFontDataUrl: root + "standard_fonts/", wasmUrl: root + "wasm/", iccUrl: root + "iccs/" };
}

type PdfModule = typeof import("pdfjs-dist");
export interface PdfPreviewDeps {
  pdfjs?: () => Promise<Pick<PdfModule, "getDocument"> & Partial<Pick<PdfModule, "version">>>;
  canvas?: () => HTMLCanvasElement;
  encode?: (canvas: HTMLCanvasElement) => Promise<Blob>;
  timeout?: number;
}

async function loadPdf() {
  const [pdf, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdf.GlobalWorkerOptions.workerSrc = worker.default;
  return pdf;
}

async function encodePreview(canvas: HTMLCanvasElement) {
  // Reuse the image encoder's main-thread pixel path when native canvas silently returns PNG.
  const native = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Preview encoding failed.")), "image/webp", 0.8));
  if (native.type === "image/webp") return native;
  const { createMediaEncoder } = await import("./media-encoders");
  const encode = createMediaEncoder();
  return encode({
    width: canvas.width, height: canvas.height,
    getContext: () => canvas.getContext("2d"),
    convertToBlob: options => new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Preview encoding failed.")), options?.type, options?.quality)),
  }, "image/webp", 80);
}

/** Downloads retain the original Blob, including when a PDF cannot yield a preview. */
export async function preparePdf(file: File, signal?: AbortSignal, deps: PdfPreviewDeps = {}): Promise<MediaOptimiseResult | undefined> {
  signal?.throwIfAborted();
  if (!/\.pdf$/i.test(file.name)) return;
  const problem = uploadProblem(file);
  if (problem) throw new Error(problem);
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  signal?.throwIfAborted();
  if (!new TextDecoder("latin1").decode(head).includes("%PDF-")) return;
  const result: MediaOptimiseResult = { outputs: [{ blob: file, extension: "pdf" }], before: file.size, after: file.size };
  let task: ReturnType<PdfModule["getDocument"]> | undefined;
  // Loading, page reads, rendering and encoding all share the same cancellation/deadline.
  const work = new AbortController();
  const abort = () => work.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => work.abort(new Error("PDF preview timed out.")), deps.timeout ?? 30_000);
  let stop: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(work.signal.reason);
    work.signal.addEventListener("abort", stop, { once: true });
  });
  const preview = async (): Promise<MediaOutput> => {
    const pdf = await (deps.pdfjs ?? loadPdf)();
    work.signal.throwIfAborted();
    // pdf.js transfers this copy; the website's original File is never handed to it.
    const data = new Uint8Array(await file.arrayBuffer()).slice();
    work.signal.throwIfAborted();
    const options = { data, isEvalSupported: false, ...pdf.version ? pdfjsAssetOptions(pdf.version, import.meta.env?.BASE_URL) : {} };
    task = pdf.getDocument(options);
    const document = await task.promise;
    work.signal.throwIfAborted();
    const page = await document.getPage(1);
    work.signal.throwIfAborted();
    const source = page.getViewport({ scale: 1 }), size = pdfPreviewSize(source.width, source.height);
    const viewport = page.getViewport({ scale: Math.min(size.width / source.width, size.height / source.height) });
    const canvas = (deps.canvas ?? (() => window.document.createElement("canvas")))();
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Preview canvas is unavailable.");
    const rendering = page.render({ canvas, canvasContext: context, viewport, background: "rgb(255,255,255)" });
    const cancelRender = () => rendering.cancel();
    work.signal.addEventListener("abort", cancelRender, { once: true });
    try { await rendering.promise; } finally { work.signal.removeEventListener("abort", cancelRender); }
    work.signal.throwIfAborted();
    const blob = await (deps.encode ?? encodePreview)(canvas);
    work.signal.throwIfAborted();
    if (blob.type !== "image/webp") throw new Error("WebP preview is unavailable.");
    return { blob, extension: "webp", ...size };
  };
  try {
    result.still = await Promise.race([preview(), cancelled]);
    result.after += result.still.blob.size;
  } catch (error) {
    if (signal?.aborted) throw error;
    result.note = `${file.name} was added without a preview picture.`;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (stop) work.signal.removeEventListener("abort", stop);
    // Start teardown even when loading/rendering never settles; do not let teardown defeat the deadline.
    void task?.destroy().catch(() => {});
  }
  return result;
}
