import { DEFAULT_IMAGE_FOLDER, uploadProblem, uploadWarning } from "../uploads";
import { optimiseMedia } from "./media-optimise";
import { readMediaOptimiseDefaults } from "./media-library-optimise-rules";
import { createMediaWorkspace, type MediaWorkspaceContext } from "./media-workspace";
import type { MediaImportRequest, MediaPlacement } from "./media-picker";

/** Raster pictures use stored Optimise settings; other files retain their bytes. */
export const mediaNeedsPreparation = (name: string) => /\.(?:jpe?g|png|webp|avif|bmp)$/i.test(name);
export const mediaPreparationFolder = (folder?: string) => folder ?? DEFAULT_IMAGE_FOLDER;

export async function prepareMediaFile(file: File, key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia): Promise<{ request: MediaImportRequest; warning?: string }> {
  signal?.throwIfAborted();
  const result = mediaNeedsPreparation(file.name) ? await encode(file, readMediaOptimiseDefaults(key), signal) : undefined;
  signal?.throwIfAborted();
  for (const blob of result ? result.outputs.map(output => output.blob) : [file]) {
    const problem = uploadProblem({ name: file.name, size: blob.size });
    if (problem) throw new Error(problem);
  }
  return { request: { file, result, folder: mediaPreparationFolder(folder) }, warning: result ? undefined : uploadWarning(file) };
}

/** One failed preparation leaves the other files available. */
export async function prepareMedia(files: File[], key: string, folder?: string, signal?: AbortSignal,
  encode: typeof optimiseMedia = optimiseMedia) {
  const requests: MediaImportRequest[] = [], errors: string[] = [], warnings: string[] = [];
  for (const file of files) {
    try {
      const prepared = await prepareMediaFile(file, key, folder, signal, encode);
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
  place: MediaPlacement | undefined, report: { error(error: unknown): void; announce(message: string): void }) {
  const ctx = await context();
  const prepared = await prepareMedia(files, ctx.key, folder);
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
