// Download site: the repository's files as the editor has them, unsaved
// drafts included, zipped as they are. The repository is the site, so the
// archive is what any static host serves (docs/hosting.md). Also reads the
// site's own address from `.editor/config.json` for "View live site".
import { nativeSiteSettings } from "../shared/native-project";
import { TEXT_PATH } from "../shared/agent";

export type FileContent = string | Uint8Array;

export interface SiteFiles {
  /** The repository's full name, for the download's file name. */
  repository: string;
  /** Every file of the repository as drafted: the branch's not deleted, and new drafts. */
  paths: string[];
  /** The text the editor holds for a path (an open model, a draft, a loaded file), if any. */
  held(path: string): string | undefined;
  /** The blob to read for a path whose text is not held (the branch's, or a moved file's source). */
  blob(path: string): Promise<string | undefined>;
  /** Text blobs by SHA. */
  readTexts(shas: string[]): Promise<Record<string, string>>;
  /** A blob's bytes. */
  readBytes(sha: string): Promise<Uint8Array>;
}

/** Collects every file of the site: text where the editor holds it or it reads as text, bytes otherwise. */
export async function collectSiteFiles(site: SiteFiles): Promise<Record<string, FileContent>> {
  const files: Record<string, FileContent> = {};
  const texts: { path: string; sha: string }[] = [];
  const binaries: { path: string; sha: string }[] = [];
  for (const path of new Set(site.paths)) {
    const held = site.held(path);
    if (held !== undefined) { files[path] = held; continue; }
    const sha = await site.blob(path);
    if (!sha) continue;
    (TEXT_PATH.test(path) ? texts : binaries).push({ path, sha });
  }
  if (texts.length) {
    const read = await site.readTexts(texts.map((item) => item.sha));
    for (const { path, sha } of texts) if (typeof read[sha] === "string") files[path] = read[sha];
  }
  for (let start = 0; start < binaries.length; start += 6) {
    await Promise.all(binaries.slice(start, start + 6).map(async ({ path, sha }) => {
      files[path] = await site.readBytes(sha);
    }));
  }
  return files;
}

/** The site's files as a store-only .zip, and how many files it holds. */
export async function buildSiteZip(site: SiteFiles): Promise<{ zip: Uint8Array; count: number }> {
  // The zip writer loads with the first download.
  const [files, { zipFiles }] = await Promise.all([collectSiteFiles(site), import("./zip")]);
  return { zip: zipFiles(files), count: Object.keys(files).length };
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
 * The site's address from `.editor/config.json`'s `site.url`, when it is an
 * http(s) URL. No address is guessed.
 */
export function siteUrlFromConfig(text: string | undefined): string | undefined {
  return nativeSiteSettings(text).url;
}
