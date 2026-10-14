import { MAX_UPLOAD_BYTES } from "../uploads";
import { mediaKind } from "./media-library-filter";

export const MEDIA_FILE_CAP_BYTES = MAX_UPLOAD_BYTES;
export const LARGE_IMAGE_BYTES = 1_000_000;
export const LARGE_DOWNLOAD_BYTES = 10_000_000;
export const REPO_SIZE_LARGE_BYTES = 500_000_000;
export const REPO_SIZE_NEAR_LIMIT_BYTES = 900_000_000;

const decimalMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export function largeDownloadNote(file: { name: string; size: number }): string | undefined {
  const threshold = mediaKind(file.name) === "image" ? LARGE_IMAGE_BYTES : LARGE_DOWNLOAD_BYTES;
  if (file.size > threshold) return `Large download: ${file.name} is ${decimalMB(file.size)}, which can be slow to load on phones.`;
}

const text = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));
const uint32 = (bytes: Uint8Array, offset: number, littleEndian = false) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, littleEndian);

// Blocks known to hold only picture data, colour or layout; any other block may hold personal details.
const JPEG_MARKERS = new Set([...Array.from({ length: 16 }, (_, index) => 0xc0 + index), 0xda, 0xdb, 0xdc, 0xdd, 0xe0, 0xe2, 0xee]);
const PNG_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "cICP", "bKGD", "hIST", "pHYs", "sPLT", "acTL", "fcTL", "fdAT"]);
const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);

/** Unknown or broken image data may contain personal details we cannot safely inspect. */
export function mayHoldHiddenDetails(bytes: Uint8Array, name: string): boolean {
  if (/\.(?:gif|svg|ico)$/i.test(name)) return false;
  if (/\.jpe?g$/i.test(name)) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return true;
    let offset = 2, scanning = false;
    while (offset < bytes.length) {
      if (scanning && bytes[offset] !== 0xff) { offset++; continue; }
      if (bytes[offset++] !== 0xff) return true;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9) return offset !== bytes.length;
      if (scanning && marker === 0) continue;
      if (marker === 0x01 || marker !== undefined && marker >= 0xd0 && marker <= 0xd7) continue;
      if (marker === undefined || marker < 0xc0 || offset + 2 > bytes.length) return true;
      const length = bytes[offset] * 256 + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return true;
      if (!JPEG_MARKERS.has(marker)) return true;
      // APP2 also carries multi-picture data; only a colour profile is known to be harmless.
      if (marker === 0xe2 && text(bytes, offset + 2, 12) !== "ICC_PROFILE\0") return true;
      // Skip compressed picture bytes, but still inspect segments between scans.
      scanning = marker === 0xda;
      offset += length;
    }
    return true;
  }
  if (/\.png$/i.test(name)) {
    if (text(bytes, 0, 8) !== "\x89PNG\r\n\x1a\n") return true;
    let offset = 8, header = false;
    while (offset + 12 <= bytes.length) {
      const length = uint32(bytes, offset), kind = text(bytes, offset + 4, 4);
      if (offset + 12 + length > bytes.length) return true;
      if (!header && (kind !== "IHDR" || length !== 13)) return true;
      header = true;
      if (!PNG_CHUNKS.has(kind)) return true;
      offset += length + 12;
      if (kind === "IEND") return length !== 0 || offset !== bytes.length;
    }
    return true;
  }
  if (/\.webp$/i.test(name)) {
    if (bytes.length < 12 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WEBP"
      || uint32(bytes, 4, true) + 8 !== bytes.length) return true;
    let offset = 12, picture = false;
    while (offset + 8 <= bytes.length) {
      const kind = text(bytes, offset, 4), length = uint32(bytes, offset + 4, true);
      if (offset + 8 + length + length % 2 > bytes.length) return true;
      if (!WEBP_CHUNKS.has(kind)) return true;
      if (kind === "VP8 " || kind === "VP8L" || kind === "ANMF") picture = true;
      offset += 8 + length + length % 2;
    }
    return !picture || offset !== bytes.length;
  }
  return true;
}

export function svgHasExecutableContent(bytes: Uint8Array): boolean {
  const source = new TextDecoder().decode(bytes);
  return /<\s*(?:script|foreignObject|iframe|embed|object)\b|\bon[^\s=<>]*\s*=|javascript\s*:/i.test(source);
}

export type PreparationFailure = { kind: "ask"; question: string } | { kind: "advice"; message: string };
/** `shown`: whether this browser can show the file as a picture (ignored for other kinds). */
export function preparationFailure(file: { name: string; size: number }, bytes: Uint8Array, shown: boolean): PreparationFailure {
  const advice = (message: string): PreparationFailure => ({ kind: "advice", message: `${file.name} could not be prepared. ${message}` });
  if (file.size > MEDIA_FILE_CAP_BYTES) return advice(`It is ${decimalMB(file.size)} and the limit is 20 MB. Try a smaller export.`);
  if (/\.(?:heic|heif|tiff?|bmp)$/i.test(file.name)) return advice("Save it as JPEG or PNG and add it again.");
  if (/\.(?:mov|mkv|avi|ogv)$/i.test(file.name)) return advice("Export it as MP4 (H.264) and add it again.");
  if (/\.(?:flac|aiff?|ogg|oga|opus|wma)$/i.test(file.name)) return advice("Export it as MP3 or M4A and add it again.");
  const kind = mediaKind(file.name);
  if (kind === "image") {
    if (/\.svg$/i.test(file.name) && svgHasExecutableContent(bytes))
      return advice("It contains scripts that cannot be removed. Save a picture without scripts and add it again.");
    if (mayHoldHiddenDetails(bytes, file.name))
      return advice("Hidden personal details could not be removed because the picture could not be prepared. Save it as a new JPEG or PNG and add it again.");
    if (!shown) return advice("This browser cannot show it as a picture. Save it as JPEG or PNG and add it again.");
  }
  const suitable = kind === "document" || /\.(?:jpe?g|png|webp|avif|gif|svg|ico|mp4|m4v|webm|mp3|m4a|aac|wav)$/i.test(file.name);
  if (!suitable) return advice("Save it in a format that a web browser can show or play and add it again.");
  return { kind: "ask", question: `${file.name} could not be prepared. Add the unchanged file instead?` };
}

export function repoSizeStatus(sizeKiB: number | undefined): {
  bytes: number; label: string; level: "ok" | "large" | "near-limit"; message?: string;
} | undefined {
  if (sizeKiB === undefined) return undefined;
  const bytes = sizeKiB * 1024;
  const label = bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
  const level = bytes >= REPO_SIZE_NEAR_LIMIT_BYTES ? "near-limit" : bytes >= REPO_SIZE_LARGE_BYTES ? "large" : "ok";
  return { bytes, label, level, ...level === "ok" ? {} : {
    message: "GitHub Pages stops publishing sites over 1 GB. Git history keeps every removed or replaced file, so deleting files does not shrink the repository.",
  } };
}
