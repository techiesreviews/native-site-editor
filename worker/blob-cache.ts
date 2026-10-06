// GitHub objects named by their SHA (blobs, recursive trees) never change, so
// once read they are kept: in this isolate's memory first, then in the
// colo's Cache API, so agents and the editor reading the same files again
// cost GitHub nothing. Entries are keyed by repository id and SHA and are only
// read after the caller has authorized the repository, like any GitHub read.
// Memory entries are scoped to the fetch implementation, so tests and fakes
// with their own fetcher never share state; the Cache API is used only with
// the platform's own fetch. A colo cache write runs after the response when
// the request has a waitUntil (worker/timing.ts).
import { afterResponse, baseFetch } from "./timing";

const maxEntries = 2000;
const maxMemoryBytes = 32 * 1024 * 1024;
/** Values larger than this are read from GitHub every time. */
const maxValueBytes = 4 * 1024 * 1024;
const cacheName = "github-objects";
const cacheHost = "https://github-objects.cache";

interface Memory {
  entries: Map<string, string>;
  bytes: number;
}
const memories = new WeakMap<typeof fetch, Memory>();

function memoryFor(fetcher: typeof fetch): Memory {
  let memory = memories.get(fetcher);
  if (!memory) memories.set(fetcher, (memory = { entries: new Map(), bytes: 0 }));
  return memory;
}

// Opened once per isolate; a failed open is tried again by the next request.
let opened: Promise<Cache | undefined> | undefined;
function platformCache(fetcher: typeof fetch): Promise<Cache | undefined> | undefined {
  if (fetcher !== globalThis.fetch || typeof caches === "undefined") return undefined;
  return (opened ??= caches.open(cacheName).catch(() => {
    opened = undefined;
    return undefined;
  }));
}

const cacheUrl = (key: string) => `${cacheHost}/${key}`;

export class ObjectCache {
  private memory: Memory;
  private base: typeof fetch;
  constructor(private fetcher: typeof fetch) {
    this.base = baseFetch(fetcher);
    this.memory = memoryFor(this.base);
  }

  async get(key: string): Promise<string | undefined> {
    const held = this.memory.entries.get(key);
    if (held !== undefined) {
      // Most recently used last.
      this.memory.entries.delete(key);
      this.memory.entries.set(key, held);
      return held;
    }
    try {
      const cache = await platformCache(this.base);
      const response = await cache?.match(cacheUrl(key));
      if (!response) return undefined;
      const value = await response.text();
      this.remember(key, value);
      return value;
    } catch {
      return undefined;
    }
  }

  /** The value of `key` in this isolate's memory only (no subrequest). */
  held(key: string): string | undefined {
    return this.memory.entries.get(key);
  }

  /** Keeps `value` in this isolate's memory only (no subrequest). */
  hold(key: string, value: string) {
    if (value.length <= maxValueBytes) this.remember(key, value);
  }

  /** Keeps `value` in memory at once; the colo cache write finishes after the response when it can. */
  async put(key: string, value: string): Promise<void> {
    if (value.length > maxValueBytes) return;
    this.remember(key, value);
    const pending = platformCache(this.base);
    if (!pending) return;
    const write = pending
      .then((cache) =>
        cache?.put(
          cacheUrl(key),
          new Response(value, {
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=31536000, immutable" },
          }),
        ),
      )
      // The memory copy still serves this isolate.
      .catch(() => undefined);
    await afterResponse(this.fetcher, write);
  }

  /** The cached value of `key`, or `load()`'s, which is then kept. */
  async through<T>(key: string, load: () => Promise<T>): Promise<T> {
    const held = await this.get(key);
    if (held !== undefined) {
      try {
        return JSON.parse(held) as T;
      } catch {
        // Unreadable entry: read again.
      }
    }
    const value = await load();
    await this.put(key, JSON.stringify(value));
    return value;
  }

  private remember(key: string, value: string) {
    const memory = this.memory;
    const previous = memory.entries.get(key);
    if (previous !== undefined) {
      memory.entries.delete(key);
      memory.bytes -= previous.length;
    }
    memory.entries.set(key, value);
    memory.bytes += value.length;
    while (memory.entries.size > maxEntries || memory.bytes > maxMemoryBytes) {
      const [oldest, dropped] = memory.entries.entries().next().value!;
      memory.entries.delete(oldest);
      memory.bytes -= dropped.length;
    }
  }
}
