import { siteAddress, sitePathPrefix, sitePathOf } from "../../shared/site-path-prefix";
import type { MediaRecords } from "../../shared/media-records";
export { SOCIAL_IMAGE_SIZE, socialImageTrim, socialImageSize } from "./social-geometry";
import { mediaResolvePath } from "./media-references";
import type { MediaOptimiseOptions } from "./media-optimise";
import { trimmedCopyPath } from "./trimmed-copies";
import { gifIsAnimated, pngIsAnimated, webpIsAnimated } from "./media-image-bytes";

export const SOCIAL_IMAGE_NOTE = "Your site has no web address yet, so sharing services may not show this image. Add it in Site settings, General, Site address, then choose the image again.";
/** The picker offers still raster pictures only: an SVG cannot be drawn into the sharing copy (slice 36's follow-up). */
export const SOCIAL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp";
export const SOCIAL_IMAGE_OPTIONS: MediaOptimiseOptions = { maxWidth: 1200, quality: 85, format: "jpeg", responsive: false, keepOriginal: false };

export function socialCopyPath(options: { source: string; paths: Iterable<string>; records: MediaRecords; previous?: string }) {
  return trimmedCopyPath({ ...options, suffix: "social", extension: "jpg", copies: [],
    paths: [...options.paths, ...options.records.removed?.flatMap(item => [item.path, ...item.family?.map(member => member.path) ?? []]) ?? []] });
}

function webAddress(value?: string): URL | undefined {
  try { const url = new URL(value ?? ""); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : undefined; }
  catch { return undefined; }
}

export function socialImageAddress(siteUrl: string | undefined, path: string) {
  const url = webAddress(siteUrl), root = siteAddress(path, sitePathPrefix(siteUrl));
  return url ? { address: url.origin + root, missingAddress: false } :
    { address: root, missingAddress: true, note: SOCIAL_IMAGE_NOTE };
}

/** Only own-site links resolve to repository bytes; outside links keep their authored spelling. */
export function socialImagePath(value: string, page: string, siteUrl?: string, canonical?: string): string | undefined {
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) {
    const url = webAddress(input), own = [webAddress(siteUrl), webAddress(canonical)].filter(url => url !== undefined);
    if (!url || !own.some(address => address.origin === url.origin)) return undefined;
    return sitePathOf(input, { url: siteUrl, origins: canonical ? [canonical] : [] });
  }
  if (!input || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(input)) return undefined;
  return mediaResolvePath(input, page, undefined, sitePathPrefix(siteUrl));
}

export function socialImageSource(options: { value: string; page: string; siteUrl?: string; canonical?: string; paths: Iterable<string>; records: MediaRecords; bytes?: Uint8Array }) {
  const path = socialImagePath(options.value, options.page, options.siteUrl, options.canonical);
  if (!path || !/\.(?:jpe?g|png|webp|avif|bmp|gif)$/i.test(path) || !new Set(options.paths).has(path) || options.records.files[path]?.sharing) return undefined;
  if (options.bytes && (gifIsAnimated(options.bytes) || pngIsAnimated(options.bytes) || webpIsAnimated(options.bytes))) return undefined;
  return path;
}
