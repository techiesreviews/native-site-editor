import { mediaOriginalCapQuestion, mediaOriginalIsDuplicate, mediaOriginalProblem } from "./media-originals";
import { uploadProblem } from "../uploads";
import { mediaCopyName, mediaKindFolder, mediaNeedsPreparation, mediaStorageName } from "./media-storage";
import { largeDownloadNote, preparationFailure } from "./media-limits";
import { decodeImage } from "./media-byte-cache";
import { mediaKind } from "./media-library-filter";
import { optimiseMedia, mediaImageRecipe, mediaUntouched, type MediaImageQuality, type MediaOptimiseResult } from "./media-optimise";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./media-workspace";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";

export { mediaNeedsPreparation };
/** By name, then a GIF's bytes: an animated GIF keeps its bytes until phase 5; a still one is prepared.
 * Animated PNG and WebP go to the worker to lose their personal details. */
export async function mediaFileNeedsPreparation(file: File) {
  if (mediaNeedsPreparation(file.name)) return true;
  return /\.gif$/i.test(file.name) && !mediaUntouched(file.name, new Uint8Array(await file.arrayBuffer()));
}
export const mediaPreparationFolder = (folder?: string, path = "image.webp") => folder ?? mediaKindFolder(path);

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
  quality: MediaImageQuality = "balanced", keepOriginal = false): Promise<{ request: MediaImportRequest; warning?: string }> {
  signal?.throwIfAborted();
  let result;
  const needed = await mediaFileNeedsPreparation(file);
  signal?.throwIfAborted();
  if (needed) {
    try { result = await encode(file, mediaImageRecipe(quality), signal, undefined, keepOriginal === true); }
    catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === "AbortError") throw error;
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
  signal?.throwIfAborted();
  for (const blob of result ? result.outputs.map(output => output.blob) : [file]) {
    const problem = uploadProblem({ name: file.name, size: blob.size });
    if (problem) throw new Error(problem);
  }
  const original = keepOriginal === true && result ? await keptOriginal(file, result, signal, ask) : undefined;
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
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows?: Shown, quality: MediaImageQuality = "balanced", keepOriginal = false) {
  const requests: MediaImportRequest[] = [], errors: string[] = [], warnings: string[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareMediaFile(file, key, folder, signal, encode, ask, shows, quality, keepOriginal);
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
