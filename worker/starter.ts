// The Starter site: the public template repository's files, read in one
// request as GitHub's tarball of its branch (codeload, no API call and no
// token, so neither the GitHub App's access nor the account's API budget
// matters), then prepared for the user's site (shared/starting-point.ts).
// The browser writes them as drafts.
import { NATIVE_STARTER_VERSION } from "../shared/native-starter-version";
export { NATIVE_STARTER_VERSION } from "../shared/native-starter-version";
import { STARTER_TEMPLATE, prepareStarterFiles } from "../shared/starting-point";
import type { StarterFile } from "../shared/types";
import { HttpError } from "./github";
import { base64Bytes } from "./blobs";

/** The template's tarball, at most this large packed and unpacked. */
const MAX_TARBALL_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 500;

export function starterTarballUrl(template = STARTER_TEMPLATE) {
  return `https://codeload.github.com/${template.owner}/${template.name}/tar.gz/refs/heads/${template.branch}`;
}

async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "The starter site is larger than the editor reads.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const decoder = new TextDecoder();
const field = (block: Uint8Array, start: number, length: number) => {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return decoder.decode(end >= 0 ? slice.subarray(0, end) : slice);
};

/**
 * The regular files of a tar archive (ustar, with pax headers for long
 * names), by path, without the single top folder GitHub puts everything in
 * (`<repo>-<sha>/`).
 */
export function untar(archive: Uint8Array): { path: string; bytes: Uint8Array }[] {
  const files: { path: string; bytes: Uint8Array }[] = [];
  let offset = 0;
  let longName: string | undefined;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const sizeField = field(header, 124, 12).trim() || "0";
    const size = /^[0-7]+$/.test(sizeField) ? parseInt(sizeField, 8) : NaN;
    // Every entry must fit in the archive, so a bad header cannot loop or truncate.
    if (!Number.isSafeInteger(size) || offset + 512 + size > archive.length)
      throw new HttpError(502, "The starter site could not be unpacked. Try again.");
    const type = String.fromCharCode(header[156] || 48);
    const prefix = field(header, 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    longName = undefined;
    const body = archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      // A pax header for the next entry: its path, when longer than ustar holds.
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(decoder.decode(body))?.[1];
      if (path) longName = path;
      continue;
    }
    if (type === "L") {
      longName = field(body, 0, body.length);
      continue;
    }
    if (type !== "0" && type !== "\0") continue;
    const path = name.split("/").slice(1).join("/");
    if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) continue;
    files.push({ path, bytes: body.slice() });
    if (files.length > MAX_FILES) throw new HttpError(413, "The starter site has more files than the editor reads.");
  }
  return files;
}

/** Bytes as a starting-point file: text when they are UTF-8 text, else base64. */
export function starterFile(path: string, bytes: Uint8Array): StarterFile {
  if (!bytes.includes(0)) {
    try {
      return { path, content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
    } catch {
      // Not text.
    }
  }
  return { path, base64: base64Bytes(bytes), size: bytes.length };
}

/** The Starter site's files for a site named `siteName`. */
export async function starterFiles(siteName: string, fetcher: typeof fetch = fetch): Promise<StarterFile[]> {
  const response = await fetcher(starterTarballUrl(), { headers: { "User-Agent": "native-site-editor" } }).catch(() => {
    throw new HttpError(502, "The starter site could not be reached. Try again, or start from a blank page.");
  });
  if (!response.ok || !response.body)
    throw new HttpError(502, "The starter site could not be read. Try again, or start from a blank page.");
  const packed = await readAll(response.body, MAX_TARBALL_BYTES);
  const archive = await readAll(
    new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip")),
    MAX_TARBALL_BYTES * 2,
  ).catch((error) => {
    throw error instanceof HttpError ? error : new HttpError(502, "The starter site could not be unpacked. Try again.");
  });
  const files = untar(archive).map((file) => starterFile(file.path, file.bytes));
  if (!files.some((file) => file.path === "index.html"))
    throw new HttpError(502, "The starter site has no home page. Start from a blank page instead.");
  return prepareStarterFiles(files, siteName).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The native static Starter: plain HTML and CSS pages vendored into the
 * editor's own assets at one fixed version (public/native-static-starter),
 * read through the ASSETS binding only, never from the network. Each file
 * is stored as `files/<path>.asset` so asset HTML handling cannot redirect
 * or rewrite it; the manifest lists every file with its size and SHA-256,
 * and small dot files (`.editor/config.json`) inline, so serving them does
 * not depend on dot paths.
 */
const NATIVE_STARTER_BASE = `/native-static-starter/${NATIVE_STARTER_VERSION}/`;
const NATIVE_MAX_FILES = 100;
const NATIVE_MAX_FILE_BYTES = 2 * 1024 * 1024;
const NATIVE_MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface NativeManifest {
  version: string;
  files: { path: string; size: number; sha256: string }[];
  inline: { path: string; content: string }[];
}

const broken = (detail: string) => new HttpError(500, `The native starter site is damaged (${detail}). Start from a blank page instead.`);

function safeStarterPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 200 &&
    /^[A-Za-z0-9._\-/]+$/.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

/** The manifest checked: a known version, safe unique paths, and sizes within bounds. */
export function parseNativeManifest(value: unknown): NativeManifest {
  const manifest = value as Partial<NativeManifest> | null;
  if (!manifest || typeof manifest !== "object" || `v${manifest.version}` !== NATIVE_STARTER_VERSION) throw broken("unexpected manifest version");
  const files = manifest.files;
  const inline = manifest.inline ?? [];
  if (!Array.isArray(files) || !Array.isArray(inline)) throw broken("manifest lists no files");
  if (files.length + inline.length > NATIVE_MAX_FILES) throw broken("too many files");
  const seen = new Set<string>();
  let total = 0;
  for (const file of [...files, ...inline] as { path: unknown }[]) {
    if (!file || typeof file !== "object" || !safeStarterPath(file.path)) throw broken("unsafe path");
    if (seen.has(file.path)) throw broken(`${file.path} listed twice`);
    seen.add(file.path);
  }
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > NATIVE_MAX_FILE_BYTES) throw broken(`${file.path} has a bad size`);
    if (typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256)) throw broken(`${file.path} has a bad checksum`);
    total += file.size;
  }
  for (const file of inline) if (typeof file.content !== "string") throw broken(`${file.path} has no content`);
  if (total > NATIVE_MAX_TOTAL_BYTES) throw broken("too large");
  if (!seen.has("index.html")) throw broken("no home page");
  return { version: manifest.version!, files, inline };
}

async function readAsset(assets: AssetFetcher, path: string): Promise<Uint8Array> {
  // Fixed internal namespace: the host never comes from input, and paths are checked first.
  const url = new URL(path, `https://assets.invalid${NATIVE_STARTER_BASE}`);
  if (!url.pathname.startsWith(NATIVE_STARTER_BASE)) throw broken("unsafe path");
  const response = await assets.fetch(new Request(url, { redirect: "manual" })).catch(() => {
    throw new HttpError(502, "The native starter site could not be read. Try again, or start from a blank page.");
  });
  if (response.status !== 200 || !response.body) throw broken(`${path} is missing`);
  return readAll(response.body, NATIVE_MAX_FILE_BYTES);
}

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** The native static Starter site's files for a site named `siteName`, read fresh for each caller. */
export async function nativeStarterFiles(siteName: string, assets: AssetFetcher): Promise<StarterFile[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(await readAsset(assets, "manifest.json")));
  } catch (error) {
    throw error instanceof HttpError ? error : broken("manifest is not JSON");
  }
  const manifest = parseNativeManifest(raw);
  const files: StarterFile[] = await Promise.all(
    manifest.files.map(async (entry) => {
      const bytes = await readAsset(assets, `files/${entry.path}.asset`);
      if (bytes.length !== entry.size || hex(await crypto.subtle.digest("SHA-256", bytes)) !== entry.sha256)
        throw broken(`${entry.path} does not match the manifest`);
      return starterFile(entry.path, bytes);
    }),
  );
  for (const entry of manifest.inline) files.push({ path: entry.path, content: entry.content });
  return prepareStarterFiles(files, siteName).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The starter sources an editor can be configured with (`STARTER_SOURCE`). Absent: the template repository. */
export type StarterProvider = (siteName: string) => Promise<StarterFile[]>;

/** The Starter site source for this editor: shared by Create site and Start your site. */
export function starterProvider(env: { STARTER_SOURCE?: string; ASSETS: AssetFetcher }, fetcher: typeof fetch = fetch): StarterProvider {
  const source = env.STARTER_SOURCE;
  if (source === undefined) return (siteName) => starterFiles(siteName, fetcher);
  if (source === "native-static") return (siteName) => nativeStarterFiles(siteName, env.ASSETS);
  return async () => {
    throw new HttpError(500, `The editor's STARTER_SOURCE "${String(source).slice(0, 40)}" is not known. Use "native-static" or leave it unset.`);
  };
}
