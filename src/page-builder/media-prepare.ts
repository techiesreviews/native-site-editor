import { uploadProblem } from "../uploads";
import { mediaCopyName, mediaKindFolder, mediaNeedsPreparation, mediaStorageName } from "./media-storage";
import { largeDownloadNote, preparationFailure } from "./media-limits";
import { decodeImage } from "./media-byte-cache";
import { mediaKind } from "./media-library-filter";
import { optimiseMedia, mediaImageRecipe, mediaUntouched, type MediaImageQuality } from "./media-optimise";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./media-workspace";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";

export { mediaNeedsPreparation };
/** By name, then a GIF's bytes: an animated GIF keeps its bytes until phase 5; a still one is prepared. */
export async function mediaFileNeedsPreparation(file: File) {
  if (mediaNeedsPreparation(file.name)) return true;
  return /\.gif$/i.test(file.name) && !mediaUntouched(file.name, new Uint8Array(await file.arrayBuffer()));
}
export const mediaPreparationFolder = (folder?: string, path = "image.webp") => folder ?? mediaKindFolder(path);

type Ask = (question: string) => Promise<boolean>;
type Shown = (file: Blob) => Promise<boolean>;
/** Whether this browser can show `file` as a picture: an unchanged file is only offered then. */
export const browserShowsImage: Shown = async file => {
  if (typeof Image === "undefined") return false;
  const url = URL.createObjectURL(file);
  try { return Boolean((await decodeImage(url)).width); } finally { URL.revokeObjectURL(url); }
};
export const askToAddUnchanged: Ask = async question =>
  (await import("./media-preparation-confirm")).askToAddUnchanged(question);

export async function prepareMediaFile(file: File, _key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows: Shown = browserShowsImage,
  quality: MediaImageQuality = "balanced"): Promise<{ request: MediaImportRequest; warning?: string }> {
  signal?.throwIfAborted();
  let result;
  const needed = await mediaFileNeedsPreparation(file);
  signal?.throwIfAborted();
  if (needed) {
    try { result = await encode(file, mediaImageRecipe(quality), signal); }
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
  const name = mediaStorageName(file.name, result?.outputs[0]?.extension);
  const outputs = result ? result.outputs.map(output =>
    ({ name: output.variantWidth ? mediaCopyName(name, output.variantWidth) : name, size: output.blob.size })) : [{ name, size: file.size }];
  const largest = outputs.reduce((a, b) => a.size >= b.size ? a : b);
  return { request: { file, result, folder: mediaPreparationFolder(folder, name) }, warning: largeDownloadNote(largest) };
}

/** One failed preparation leaves the other files available. */
export async function prepareMedia(files: File[], key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows?: Shown, quality: MediaImageQuality = "balanced") {
  const requests: MediaImportRequest[] = [], errors: string[] = [], warnings: string[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareMediaFile(file, key, folder, signal, encode, ask, shows, quality);
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
