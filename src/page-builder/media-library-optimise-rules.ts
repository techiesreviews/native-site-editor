import { parent } from "./media-library-filter";
import type { MediaMetadataMap } from "./media-metadata";
import type { MediaImportRequest } from "./media-picker";

/** One import request per prepared file, refusing folders with . or .. segments;
 * new files join `collection` when one is viewed. */
export function buildMediaImportRequests(
  prepared: readonly Pick<MediaImportRequest, "file" | "result">[], existing: boolean,
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
