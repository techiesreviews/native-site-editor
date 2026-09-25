// Uploaded binary files (images and the like): the browser sends a file's
// bytes, which become a GitHub blob (base64 over the git/blobs API) before
// the publish that commits it names the blob by its SHA. The blob is the
// git blob of the bytes, so the browser knows the SHA before sending.
import type { Repository } from "../shared/types";
import { GitHub, HttpError } from "./github";
import { blobSha } from "./publish";

/** The largest file one upload may carry (GitHub's blob API takes up to 100 MB; the editor keeps well under). */
export const MAX_BLOB_BYTES = 20 * 1024 * 1024;

const tooLarge = () => new HttpError(413, `Uploads are limited to ${MAX_BLOB_BYTES / 1024 / 1024} MB per file.`);

/** The request body as bytes, refusing more than `limit`. */
export async function requestBytes(request: Request, limit = MAX_BLOB_BYTES): Promise<Uint8Array> {
  if (Number(request.headers.get("Content-Length") ?? "0") > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Base64 of `bytes`, in slices (a multiple of 3 bytes, so they join) that never build one huge argument list. */
export function base64Bytes(bytes: Uint8Array): string {
  let out = "";
  const step = 3 * 8192;
  for (let index = 0; index < bytes.length; index += step)
    out += btoa(String.fromCharCode(...bytes.subarray(index, index + step)));
  return out;
}

/**
 * Makes `bytes` a blob of `repo` (nothing is committed; the publish that
 * follows names it by its SHA). `expected` is the SHA the browser computed:
 * a mismatch means the bytes changed on the way, and nothing is stored.
 */
export async function uploadBlob(github: GitHub, repo: Repository, bytes: Uint8Array, expected?: string): Promise<{ sha: string; size: number }> {
  if (bytes.length > MAX_BLOB_BYTES) throw tooLarge();
  const sha = await blobSha(bytes);
  if (expected && expected !== sha)
    throw new HttpError(400, "The uploaded file arrived changed. Try saving again.");
  const created = await github.write<{ sha: string }>(`${github.base(repo)}/git/blobs`, "POST", {
    content: base64Bytes(bytes),
    encoding: "base64",
  });
  if (created.sha !== sha)
    throw new HttpError(502, "GitHub stored the upload differently. Try saving again.");
  return { sha, size: bytes.length };
}
