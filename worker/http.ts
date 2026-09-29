import { HttpError } from "./github";

/**
 * The request body as bytes, at most `limit` bytes. A gzipped body
 * (`Content-Encoding: gzip`) is unpacked first; the limit holds for what it
 * unpacks to. The body is streamed and measured as it arrives, so the limit
 * holds without trusting the Content-Length header; an over-limit body is
 * cancelled before it is read in full.
 */
async function readBoundedBytes(request: Request, limit: number): Promise<Uint8Array> {
  const encoding = request.headers.get("Content-Encoding");
  if (encoding && encoding !== "gzip" && encoding !== "identity")
    throw new HttpError(415, "Send the request as a plain or gzipped body.");
  const body = encoding === "gzip"
    ? request.body?.pipeThrough(new DecompressionStream("gzip"))
    : request.body;
  const reader = body?.getReader();
  if (!reader) throw new HttpError(400, "Request is empty.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid gzipped request.");
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

/**
 * The request body as text, at most `limit` decoded bytes. Shares the bounded,
 * streaming reader with {@link requestJson}, so a Content-Encoding is honoured
 * and the byte limit holds without trusting Content-Length.
 */
export async function requestText(request: Request, limit: number): Promise<string> {
  return new TextDecoder().decode(await readBoundedBytes(request, limit));
}

/**
 * The request's JSON body, at most `limit` bytes. A gzipped body
 * (`Content-Encoding: gzip`) is unpacked first; the limit holds for what it unpacks to.
 */
export async function requestJson(
  request: Request,
  limit = 512 * 1024,
): Promise<any> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new HttpError(415, "Send a JSON request.");
  const bytes = await readBoundedBytes(request, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON request.");
  }
}
