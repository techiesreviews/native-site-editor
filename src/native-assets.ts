export interface NativeAssetRequest {
  path: string;
  type: string;
}

export interface NativeAssetLoaderOptions {
  requests: NativeAssetRequest[];
  concurrency?: number;
  live: () => boolean;
  load: (path: string) => Promise<string | undefined>;
  onLoaded: (path: string, dataUrl: string) => void;
  onMissing: (path: string) => void;
  onProgress: () => void;
}

export async function loadNativeAssetRequests(options: NativeAssetLoaderOptions) {
  const concurrency = options.concurrency ?? 4;
  let index = 0;
  const loadOne = async (request: NativeAssetRequest) => {
    const content = await options.load(request.path);
    if (!options.live()) return;
    if (content) {
      options.onLoaded(request.path, `data:${request.type};base64,${content}`);
      options.onProgress();
    } else {
      options.onMissing(request.path);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, options.requests.length) }, async () => {
    while (index < options.requests.length && options.live()) await loadOne(options.requests[index++]);
  }));
}
