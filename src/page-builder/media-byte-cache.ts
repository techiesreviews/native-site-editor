export interface MediaBytes {
  url: string; blob: Blob; width?: number; height?: number; version?: string;
}
export interface MediaByteCachePorts {
  load(path: string): Promise<Blob>;
  version(path: string): string | undefined;
  alive(): boolean;
  createUrl?(blob: Blob): string;
  revokeUrl?(url: string): void;
  decode?(url: string): Promise<{ width?: number; height?: number }>;
}

export async function decodeImage(url: string) {
  const image = new Image(); image.src = url;
  await image.decode().catch(() => undefined);
  return { width: image.naturalWidth || undefined, height: image.naturalHeight || undefined };
}

export function createMediaByteCache(ports: MediaByteCachePorts) {
  const createUrl = (blob: Blob) => ports.createUrl ? ports.createUrl(blob) : URL.createObjectURL(blob);
  const revokeUrl = (url: string) => ports.revokeUrl ? ports.revokeUrl(url) : URL.revokeObjectURL(url);
  const decode = (url: string) => ports.decode ? ports.decode(url) : decodeImage(url);
  const urls = new Set<string>();
  type Entry = { version?: string; url?: string; pending: Promise<MediaBytes> };
  const assets = new Map<string, Entry>();
  let disposed = false;

  function objectUrl(blob: Blob) { const url = createUrl(blob); urls.add(url); return url; }
  function revoke(url: string) {
    if (urls.delete(url)) revokeUrl(url);
  }
  function drop(path: string) {
    const entry = assets.get(path);
    if (!entry) return;
    assets.delete(path);
    // Pending loads still own their URL until decoding settles. Handle either outcome.
    const release = () => {
      if (entry.url && ![...assets.values()].some(cached => cached.url === entry.url)) revoke(entry.url);
    };
    void entry.pending.then(release, release);
  }
  function get(path: string) {
    const version = ports.version(path);
    let entry = assets.get(path);
    if (entry && entry.version !== version) { drop(path); entry = undefined; }
    if (!entry) {
      const next: Entry = { version, pending: ports.load(path).then(async (blob) => {
        if (disposed || !ports.alive()) throw new Error("Image library closed.");
        const url = objectUrl(blob);
        next.url = url;
        const dimensions = await decode(url);
        return { url, blob, ...dimensions, version };
      }) };
      entry = next;
      assets.set(path, entry);
    }
    return entry.pending;
  }
  function sync(items: readonly { path: string; version?: string }[]) {
    for (const item of items) {
      if (assets.get(item.path)?.version !== item.version) drop(item.path);
    }
  }
  function clear() { for (const path of assets.keys()) drop(path); }
  function dispose() {
    disposed = true;
    urls.forEach(url => revoke(url));
    clear();
  }
  return { get, drop, sync, clear, objectUrl, dispose };
}
