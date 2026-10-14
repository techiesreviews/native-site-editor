import { DEFAULT_IMAGE_FOLDER, uploadProblem, uploadFileName } from "../uploads";
import { mediaVariantName } from "./media-markup";
import { largeDownloadNote, preparationFailure } from "./media-limits";
import { decodeImage } from "./media-byte-cache";
import { mediaKind } from "./media-library-filter";
import { optimiseMedia } from "./media-optimise";
import { readMediaOptimiseDefaults } from "./media-library-optimise-rules";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./media-workspace";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";

/** Raster pictures use stored Optimise settings; other files retain their bytes. */
export const mediaNeedsPreparation = (name: string) => /\.(?:jpe?g|png|webp|avif|bmp)$/i.test(name);
export const mediaPreparationFolder = (folder?: string) => folder ?? DEFAULT_IMAGE_FOLDER;

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

export async function prepareMediaFile(file: File, key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows: Shown = browserShowsImage): Promise<{ request: MediaImportRequest; warning?: string }> {
  signal?.throwIfAborted();
  let result;
  if (mediaNeedsPreparation(file.name)) {
    try { result = await encode(file, readMediaOptimiseDefaults(key), signal); }
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
  const name = uploadFileName(file.name);
  const outputs = result ? result.outputs.map(output => {
    const primary = `${name.replace(/\.[^.]+$/, "")}.${output.extension}`;
    return { name: output.variantWidth ? mediaVariantName(primary, output.variantWidth) : primary, size: output.blob.size };
  }) : [{ name, size: file.size }];
  const largest = outputs.reduce((a, b) => a.size >= b.size ? a : b);
  return { request: { file, result, folder: mediaPreparationFolder(folder) }, warning: largeDownloadNote(largest) };
}

/** One failed preparation leaves the other files available. */
export async function prepareMedia(files: File[], key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia, ask?: Ask, shows?: Shown) {
  const requests: MediaImportRequest[] = [], errors: string[] = [], warnings: string[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareMediaFile(file, key, folder, signal, encode, ask, shows);
      requests.push(prepared.request);
      if (prepared.warning) warnings.push(prepared.warning);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(error instanceof Error ? error.message : `${file.name} could not be added.`);
    }
  }
  return { requests, errors, warnings };
}

/** Capture the repository before preparation; no library or usage scan is needed. */
export async function addPreparedMedia(context: () => Promise<MediaWorkspaceContext>, folder: string, files: File[],
  place: MediaPlacement | undefined, report: { error(error: unknown): void; announce(message: string): void }, ask?: Ask) {
  const ctx = await context();
  const prepared = await prepareMedia(files, ctx.key, folder, undefined, undefined, ask);
  ctx.assertLive();
  // Files changed while preparing are read again; another repository or branch refuses.
  const fresh = async () => {
    const next = await context();
    ctx.assertLive();
    if (next.key !== ctx.key || JSON.stringify(next.scope) !== JSON.stringify(ctx.scope)) throw new Error("The repository changed while adding files. Nothing was added.");
    return next;
  };
  const paths = prepared.requests.length ? await createMediaWorkspace(fresh).import(prepared.requests, place) : [];
  if (prepared.errors.length) report.error(new Error(prepared.errors.join(" ")));
  if (paths.length) report.announce([`Added ${paths.join(", ")}.`, ...prepared.warnings].join(" "));
  return paths;
}
