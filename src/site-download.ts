// Download site: the static export (shared/native-export.ts, the same module
// the deploy workflow runs as native-export.mjs) of the site as the editor
// has it, unsaved drafts included, as a .zip. Also reads the site's own
// address from its settings for "View live site".
import { exportNativeSite, SITE_PATHS, type FileContent } from "../shared/native-export";
import { zipFiles } from "./zip";

/** Files the exporter reads as text; everything else goes as bytes (as the CLI reads them). */
const TEXT = /\.(html|css|json)$/i;

export interface SiteFiles {
  /** The repository's full name, for the download's file name. */
  repository: string;
  /** Every path in the site as drafted: the branch's files under `src/`, new drafts, the manifest and site settings that exist. */
  paths: string[];
  /** The text the editor holds for a path (an open model, a draft, a loaded file), if any. */
  held(path: string): string | undefined;
  /** The blob to read for a path whose text is not held (the branch's, or a moved file's source). */
  blob(path: string): Promise<string | undefined>;
  /** Text blobs by SHA. */
  readTexts(shas: string[]): Promise<Record<string, string>>;
  /** A blob's bytes as base64. */
  readBase64(sha: string): Promise<string>;
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Collects every file of the site as the exporter wants it: text for HTML, CSS and JSON, bytes otherwise. */
export async function collectSiteFiles(site: SiteFiles): Promise<Record<string, FileContent>> {
  const files: Record<string, FileContent> = {};
  const texts: { path: string; sha: string }[] = [];
  const binaries: { path: string; sha: string }[] = [];
  for (const path of new Set(site.paths)) {
    const held = site.held(path);
    if (held !== undefined) { files[path] = held; continue; }
    const sha = await site.blob(path);
    if (!sha) continue;
    (TEXT.test(path) ? texts : binaries).push({ path, sha });
  }
  if (texts.length) {
    const read = await site.readTexts(texts.map((item) => item.sha));
    for (const { path, sha } of texts) if (typeof read[sha] === "string") files[path] = read[sha];
  }
  for (let start = 0; start < binaries.length; start += 6) {
    await Promise.all(binaries.slice(start, start + 6).map(async ({ path, sha }) => {
      files[path] = fromBase64(await site.readBase64(sha));
    }));
  }
  return files;
}

/** The exported site as a store-only .zip, and the exporter's log. */
export async function buildSiteZip(site: SiteFiles): Promise<{ zip: Uint8Array; log: string[]; count: number }> {
  const result = exportNativeSite({ files: await collectSiteFiles(site) });
  return { zip: zipFiles(result.files), log: result.log, count: Object.keys(result.files).length };
}

/** A file name for the download: `<repository>-site.zip`. */
export function siteZipName(repository: string) {
  const name = repository.split("/").pop()?.replace(/[^A-Za-z0-9._-]+/g, "-") || "site";
  return `${name}-site.zip`;
}

/** Saves bytes as a file through a temporary object URL. */
export function saveBytes(bytes: Uint8Array, name: string, type = "application/zip") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * The site's address from its settings' `url` (`.astro-editor/site.json`
 * wins over `src/site.json`, as in the exporter), when it is an http(s) URL.
 * No address is guessed.
 */
export function siteUrlFromSettings(settings: Record<string, string | undefined>): string | undefined {
  for (const path of SITE_PATHS) {
    const text = settings[path];
    if (text === undefined) continue;
    let value: unknown;
    try { value = JSON.parse(text); } catch { return undefined; }
    const url = value && typeof value === "object" ? (value as { url?: unknown }).url : undefined;
    if (typeof url !== "string" || !url.trim()) return undefined;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
