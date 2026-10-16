import { prepareMediaFile } from "../../src/page-builder/media-prepare";
import type { MediaImportRequest } from "../../src/page-builder/media-picker";

type Preparation = Parameters<typeof prepareMediaFile>;
/** Prepare test inputs through the production single-file path before workspace assertions. */
export async function prepareFiles(files: File[], key: string, folder?: string, signal?: AbortSignal,
  encode?: Preparation[4], ask?: Preparation[5], shows?: Preparation[6], quality?: Preparation[7],
  keepOriginal?: Preparation[8], videoQuality?: Preparation[9], audio?: Preparation[11], deps?: Preparation[12]) {
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
