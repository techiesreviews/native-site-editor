import { strippedImageSource } from "./media-image-bytes";
import { MEDIA_FILE_CAP_BYTES, mayHoldHiddenDetails, svgHasExecutableContent } from "./media-limits";
import type { MediaOutput } from "./media-optimise";

export function mediaOriginalPath(main: string, extension: string): string {
  return `media/originals/${main.slice(main.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "")}.${extension}`;
}
export function mediaOriginalProblem(bytes: Uint8Array, extension: string): string | undefined {
  if (mayHoldHiddenDetails(bytes, `original.${extension}`) ||
    extension.toLowerCase() === "svg" && svgHasExecutableContent(bytes)) {
    return "The original's hidden personal details or executable content could not be removed. Save it again without them, then add it.";
  }
}
/** Strip only upright, understood sources; otherwise encode the decoded full-size picture. */
export async function cleanedMediaOriginal(bytes: Uint8Array, type: string, transparent: boolean,
  encode: (type: "image/png" | "image/jpeg", quality: number) => Promise<Blob>): Promise<MediaOutput> {
  const extension = type === "image/jpeg" ? "jpg" : type.slice(6);
  const stripped = strippedImageSource(bytes, type, true);
  const blob = stripped && !mediaOriginalProblem(stripped, extension)
    ? new Blob([new Uint8Array(stripped)], { type })
    : await encode(transparent ? "image/png" : "image/jpeg", 92);
  return { blob, extension: blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] };
}
export async function mediaOriginalIsDuplicate(original: Blob, main: Blob): Promise<boolean> {
  if (original.size !== main.size) return false;
  const [a, b] = await Promise.all([original.arrayBuffer(), main.arrayBuffer()]);
  const bytes = new Uint8Array(b);
  return new Uint8Array(a).every((value, index) => value === bytes[index]);
}
export function mediaOriginalCapQuestion(name: string, size: number): string | undefined {
  if (size > MEDIA_FILE_CAP_BYTES) return `The original of ${name} is ${(size / 1_000_000).toFixed(1)} MB, over the 20 MB limit for one file. The website version fits.`;
}
