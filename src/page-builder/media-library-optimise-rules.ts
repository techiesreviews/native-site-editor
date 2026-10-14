import type { AddingSettings } from "../../shared/media-records";
import { parent } from "./media-library-filter";
import { mediaImageRecipe, type MediaOptimiseOptions } from "./media-optimise";
import { mediaAddingSettings } from "./media-settings";
import type { MediaMetadataMap } from "./media-metadata";
import type { MediaImportRequest } from "./media-picker";

/** The Optimise sheet starts from the site's image choice; changes in the sheet are for its files
 * only and are not remembered. Its "Keep original bytes" box (store the file as it is, metadata
 * included) starts off: the site's Keep original keeps a cleaned original beside the website
 * version instead (slice 27), so it never stores location data. */
export function mediaOptimiseStart(adding: AddingSettings | undefined): MediaOptimiseOptions {
  return mediaImageRecipe(mediaAddingSettings(adding).image);
}

/** One import request per prepared file, refusing folders with . or .. segments;
 * new files join `collection` when one is viewed. */
export function buildMediaImportRequests(
  prepared: readonly Pick<MediaImportRequest, "file" | "result" | "original">[], existing: boolean,
  destination: string, metadata: MediaMetadataMap, update: boolean,
  receipts: ReadonlyMap<string, string | undefined>, collection = "",
): MediaImportRequest[] {
  const requests: MediaImportRequest[] = [];
  for (const item of prepared) {
    const folder = existing ? parent(item.file.name) : destination.trim().replace(/^\/+|\/+$/g, "");
    if (folder.split("/").some((part) => part === "." || part === "..") || folder.includes("\\"))
      throw new Error("Choose a repository folder without . or .. segments.");
    requests.push({ ...item, folder, metadata: existing ? metadata[item.file.name] : undefined,
      replaceFrom: existing && update ? item.file.name : undefined,
      expectedAssetVersion: receipts.get(item.file.name), ...!existing && collection ? { collection } : {} });
  }
  return requests;
}
