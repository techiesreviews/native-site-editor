import type { AudioQuality, prepareAudio } from "./audio-prepare";
import type { preparePdf } from "./pdf-preview";
import { mediaOriginalCapQuestion, mediaOriginalIsDuplicate, mediaOriginalProblem } from "./media-originals";
import { isHeic } from "./media-heic";
import { uploadProblem } from "../uploads";
import { mediaCopyName, mediaKindFolder, mediaNeedsPreparation, mediaStorageName, mediaVideoNeedsPreparation } from "./media-storage";
import { largeDownloadNote, preparationFailure } from "./media-limits";
import { decodeImage } from "./media-byte-cache";
import { mediaKind } from "./media-library-filter";
import { optimiseMedia, mediaImageRecipe, mediaUntouched, type MediaImageQuality, type MediaOptimiseResult } from "./media-optimise";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./media-workspace";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";

export { mediaNeedsPreparation };
/** Videos and pictures share preparation; animated GIFs use the lazy video encoder. */
export async function mediaFileNeedsPreparation(file: File) {
  if (mediaVideoNeedsPreparation(file.name) || file.type.startsWith("video/") || /\.gif$/i.test(file.name)) return true;
  if (mediaKind(file.name) === "audio" || /\.pdf$/i.test(file.name)) return true;
  if (mediaNeedsPreparation(file.name)) return true;
  // A HEIC's `ftyp` box comes first: sniff its head, never a whole video or PDF.
  return isHeic(file.name, file.type, new Uint8Array(await file.slice(0, 4096).arrayBuffer()));
}
export const mediaPreparationFolder = (folder?: string, path = "image.webp") => folder ?? mediaKindFolder(path);

export interface MediaPrepareDeps {
  audio?: typeof prepareAudio;
  pdf?: typeof preparePdf;
}
/** Audio is prepared in its own module worker, so Mediabunny never joins the page's chunk graph.
 * Cancelling stops the worker; its errors reach the usual failure path. */
const lazyAudio: typeof prepareAudio = (file, quality, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException("Audio preparation cancelled.", "AbortError")); return; }
  const worker = new Worker(new URL("./audio-prepare.worker.ts", import.meta.url), { type: "module" });
  const finish = (error?: Error, result?: MediaOptimiseResult) => {
    signal?.removeEventListener("abort", abort);
    worker.terminate();
    if (error) reject(error); else resolve(result);
  };
  const abort = () => finish(new DOMException("Audio preparation cancelled.", "AbortError"));
  signal?.addEventListener("abort", abort, { once: true });
  worker.onmessage = (event: MessageEvent<{ error?: string; result?: MediaOptimiseResult }>) =>
    finish(event.data.error ? new Error(event.data.error) : undefined, event.data.result);
  worker.onerror = () => finish(new Error("Audio preparation is unavailable in this browser."));
  worker.postMessage({ file, quality });
});
const lazyPdf: typeof preparePdf = async (...args) => (await import("./pdf-preview")).preparePdf(...args);

type Ask = (question: string, kind?: "original") => Promise<boolean>;
type Shown = (file: Blob) => Promise<boolean>;
/** Whether this browser can show `file` as a picture: an unchanged file is only offered then. */
export const browserShowsImage: Shown = async file => {
  if (typeof Image === "undefined") return false;
  const url = URL.createObjectURL(file);
  try { return Boolean((await decodeImage(url)).width); } finally { URL.revokeObjectURL(url); }
};
export const askToAddUnchanged: Ask = async (question, kind) => {
  const dialog = await import("./media-preparation-confirm");
  return kind === "original" ? dialog.askToAddWithoutOriginal(question) : dialog.askToAddUnchanged(question);
};

export async function prepareMediaFile(file: File, _key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows: Shown = browserShowsImage,
  quality: MediaImageQuality = "balanced", keepOriginal = false, videoQuality: import("./video-prepare").VideoQuality = "balanced",
  video: typeof import("./video-prepare").prepareVideo = async (...args) => (await import("./video-prepare")).prepareVideo(...args),
  audio: AudioQuality = "balanced", deps: MediaPrepareDeps = {}): Promise<{ request: MediaImportRequest; warning?: string }> {
  signal?.throwIfAborted();
  let result: MediaOptimiseResult | undefined;
  const gif = /\.gif$/i.test(file.name) && mediaUntouched(file.name, new Uint8Array(await file.arrayBuffer()));
  const isVideo = gif || mediaVideoNeedsPreparation(file.name) || file.type.startsWith("video/");
  const needed = await mediaFileNeedsPreparation(file);
  signal?.throwIfAborted();
  if (/\.pdf$/i.test(file.name)) {
    const problem = uploadProblem(file);
    if (problem) throw new Error(problem);
  }
  if (needed) {
    try {
      if (isVideo) result = await video(file, videoQuality, signal, gif);
      else if (mediaKind(file.name) === "audio") result = await (deps.audio ?? lazyAudio)(file, audio, signal);
      else if (/\.pdf$/i.test(file.name)) result = await (deps.pdf ?? lazyPdf)(file, signal);
      else result = await encode(file, mediaImageRecipe(quality), signal, undefined, keepOriginal === true);
    }
    catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === "AbortError") throw error;
      if (/\.pdf$/i.test(file.name)) {
        // Even failure to load the lazy preview module must leave the document available.
        result = { outputs: [{ blob: file, extension: "pdf" }], before: file.size, after: file.size,
          note: `${file.name} was added without a preview picture.` };
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let failure = preparationFailure(file, bytes, true);
        // Decode only a picture that would otherwise be offered.
        if (failure.kind === "ask" && mediaKind(file.name) === "image" && !await shows(file)) failure = preparationFailure(file, bytes, false);
        signal?.throwIfAborted();
        if (failure.kind === "advice") throw new Error(failure.message);
        if (!ask) throw new Error(`${file.name} could not be prepared. Try saving it as a new file and add it again.`);
        const accepted = await ask(failure.question);
        signal?.throwIfAborted();
        if (!accepted) throw new Error(`${file.name} was not added.`);
      }
    }
  }
  signal?.throwIfAborted();
  for (const blob of result ? [...result.outputs, ...result.still ? [result.still] : []].map(output => output.blob) : [file]) {
    const problem = uploadProblem({ name: file.name, size: blob.size });
    if (problem) throw new Error(problem);
  }
  // Keep original applies to pictures for now: video (slice 57) and audio (slice 58) skip it.
  const original = keepOriginal === true && !isVideo && mediaKind(file.name) !== "audio" && result ? await keptOriginal(file, result, signal, ask) : undefined;
  signal?.throwIfAborted();
  if (original && /^media\/originals(?:\/|$)/i.test(folder?.replace(/^\/+|\/+$/g, "") ?? "")) {
    throw new Error(`${file.name}: Choose a website folder outside media/originals when keeping an original.`);
  }
  const name = mediaStorageName(file.name, result?.outputs[0]?.extension);
  const outputs = result ? result.outputs.map(output =>
    ({ name: output.variantWidth ? mediaCopyName(name, output.variantWidth) : name, size: output.blob.size })) : [{ name, size: file.size }];
  const largest = outputs.reduce((a, b) => a.size >= b.size ? a : b);
  return { request: { file, result, ...original ? { original } : {}, folder: mediaPreparationFolder(folder, name) }, warning: [result?.note, largeDownloadNote(largest)].filter(Boolean).join(" ") || undefined };
}

/** The cleaned original kept beside a prepared file (Keep original), shared by adding and Review….
 * Undefined when it would duplicate the website main, or when the user accepts adding without an original
 * over the cap; throws when the original stays unsafe or the user declines. */
export async function keptOriginal(file: File, result: MediaOptimiseResult, signal?: AbortSignal, ask?: Ask) {
  const original = result.original;
  if (!original) return;
  // The cap question says the website version fits, so its files are checked first.
  for (const output of result.outputs) {
    const problem = uploadProblem({ name: file.name, size: output.blob.size });
    if (problem) throw new Error(problem);
  }
  const problem = mediaOriginalProblem(new Uint8Array(await original.blob.arrayBuffer()), original.extension);
  if (problem) throw new Error(`${file.name}: ${problem}`);
  if (await mediaOriginalIsDuplicate(original.blob, result.outputs[0].blob)) return;
  const question = mediaOriginalCapQuestion(file.name, original.blob.size);
  if (!question) return original;
  const accepted = ask ? await ask(question, "original") : false;
  signal?.throwIfAborted();
  if (!accepted) throw new Error(`${file.name} was not added.`);
}

/** One failed preparation leaves the other files available. */
export async function prepareMedia(files: File[], key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows?: Shown, quality: MediaImageQuality = "balanced", keepOriginal = false, videoQuality: import("./video-prepare").VideoQuality = "balanced",
  audio: AudioQuality = "balanced", deps: MediaPrepareDeps = {}) {
  const requests: MediaImportRequest[] = [], errors: string[] = [], warnings: string[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareMediaFile(file, key, folder, signal, encode, ask, shows, quality, keepOriginal, videoQuality, undefined, audio, deps);
      requests.push(prepared.request);
      if (prepared.warning) warnings.push(prepared.warning);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(error instanceof Error ? error.message : `${file.name} could not be added.`);
    }
  }
  return { requests, errors, warnings };
}

/** Save prepared files as one batch (one Undo step) in the repository `ctx` was captured from.
 * Files changed while preparing are read again; another repository or branch refuses. */
export async function importPreparedMedia(ctx: MediaWorkspaceContext, context: () => Promise<MediaWorkspaceContext>,
  requests: MediaImportRequest[], place?: MediaPlacement) {
  ctx.assertLive();
  const fresh = async () => {
    const next = await context();
    ctx.assertLive();
    if (next.key !== ctx.key || JSON.stringify(next.scope) !== JSON.stringify(ctx.scope)) throw new Error("The repository changed while adding files. Nothing was added.");
    return next;
  };
  return requests.length ? createMediaWorkspace(fresh).import(requests, place) : [];
}
