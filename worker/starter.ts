// The Starter site: the public template repository's files, read in one
// request as GitHub's tarball of its branch (codeload, no API call and no
// token, so neither the GitHub App's access nor the account's API budget
// matters), then prepared for the user's site (shared/starting-point.ts).
// The browser writes them as drafts.
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
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
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
