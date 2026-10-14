import type { MediaTrim } from "../../shared/media-records";
import { isTrim } from "./trimmed-copies";
import { mediaImageRecipe, optimiseMedia, type MediaImageQuality } from "./media-optimise";

/** Lazy preparation seam for the popup, large editor and agent trims. */
export async function prepareTrimmedCopy(sourceBlob: Blob, sourceName: string, trim: MediaTrim,
  quality: MediaImageQuality = "balanced", signal?: AbortSignal, encode = optimiseMedia) {
  if (!isTrim(trim)) throw new Error("The picture has not been trimmed.");
  return encode(new File([sourceBlob], sourceName, { type: sourceBlob.type }), mediaImageRecipe(quality), signal, trim);
}
