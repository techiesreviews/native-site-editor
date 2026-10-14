import { parent } from "./media-library-filter";
import { DEFAULT_MEDIA_OPTIMISE, type MediaOptimiseOptions } from "./media-optimise";
import type { MediaMetadataMap } from "./media-metadata";
import type { MediaImportRequest } from "./media-picker";

/** The Optimise settings last used in this repository, over the defaults. */
export function readMediaOptimiseDefaults(
  libraryKey: string, storage: () => Pick<Storage, "getItem"> = () => localStorage,
): MediaOptimiseOptions {
  let defaults = { ...DEFAULT_MEDIA_OPTIMISE };
  try {
    defaults = { ...defaults, ...JSON.parse(storage().getItem(`native-site-editor:media-optimise:${libraryKey}`) ?? "{}") };
  } catch { /* Defaults work without storage. */ }
  return defaults;
}

/** Remember the settings for this repository; storage is optional. */
export function writeMediaOptimiseDefaults(
  libraryKey: string, settings: MediaOptimiseOptions,
  storage: () => Pick<Storage, "setItem"> = () => localStorage,
) {
  try { storage().setItem(`native-site-editor:media-optimise:${libraryKey}`, JSON.stringify(settings)); }
  catch { /* Encoding still works without storage. */ }
}

/** One import request per prepared file, refusing folders with . or .. segments. */
export function buildMediaImportRequests(
  prepared: readonly Pick<MediaImportRequest, "file" | "result">[], existing: boolean,
  destination: string, metadata: MediaMetadataMap, update: boolean,
  receipts: ReadonlyMap<string, string | undefined>,
): MediaImportRequest[] {
  const requests: MediaImportRequest[] = [];
  for (const item of prepared) {
    const folder = existing ? parent(item.file.name) : destination.trim().replace(/^\/+|\/+$/g, "");
    if (folder.split("/").some((part) => part === "." || part === "..") || folder.includes("\\"))
      throw new Error("Choose a repository folder without . or .. segments.");
    requests.push({ ...item, folder, metadata: existing ? metadata[item.file.name] : undefined,
      replaceFrom: existing && update ? item.file.name : undefined,
      expectedAssetVersion: receipts.get(item.file.name) });
  }
  return requests;
}
