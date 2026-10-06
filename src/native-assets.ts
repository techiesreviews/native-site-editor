export interface NativeAssetRequest {
  path: string;
  type: string;
}

export interface NativeAssetLoaderOptions {
  requests: NativeAssetRequest[];
  concurrency?: number;
  live: () => boolean;
  /** The address the preview shows `request` from (a data URL), or nothing when it is missing. */
  load: (request: NativeAssetRequest) => Promise<string | undefined>;
  onLoaded: (path: string, url: string) => void;
  onMissing: (path: string) => void;
  /**
   * Some assets arrived: at most once per `batchMs` while they arrive, and
   * once more when the last is in, so the preview takes them in a few
   * batches rather than one change per image.
   */
  onProgress: () => void;
  batchMs?: number;
}

export async function loadNativeAssetRequests(options: NativeAssetLoaderOptions) {
  const concurrency = options.concurrency ?? 4;
  const batchMs = options.batchMs ?? 100;
  let index = 0;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!pending || !options.live()) return;
    pending = false;
    options.onProgress();
  };
  const loadOne = async (request: NativeAssetRequest) => {
    const url = await options.load(request);
    if (!options.live()) return;
    if (url) {
      options.onLoaded(request.path, url);
      pending = true;
      timer ??= setTimeout(flush, batchMs);
    } else {
      options.onMissing(request.path);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, options.requests.length) }, async () => {
      while (index < options.requests.length && options.live()) await loadOne(options.requests[index++]);
    }));
  } finally {
    flush();
  }
}

/** `blob` as a data URL of media type `type` (the sandboxed preview can show neither the editor's blob: URLs nor, without the session cookie, `/api/blob`). */
export async function dataUrlOf(blob: Blob, type: string): Promise<string> {
  const typed = blob.type === type ? blob : new Blob([blob], { type });
  if (typeof FileReader !== "undefined")
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(typed);
    });
  const bytes = new Uint8Array(await typed.arrayBuffer());
  let base64 = "";
  for (let start = 0; start < bytes.length; start += 3 * 8192)
    base64 += btoa(String.fromCharCode(...bytes.subarray(start, start + 3 * 8192)));
  return `data:${type};base64,${base64}`;
}
