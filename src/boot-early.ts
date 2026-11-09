// The page's first reads, before the editor's far larger script has loaded
// (src/boot-reads.ts startEarlyReads). index.html loads it first, async, as a
// classic script of its own (vite-preview-runtime.ts); the boot takes what it
// asked for, or, when the boot started first, it asks for nothing.

import { startEarlyReads } from "./boot-reads";

if (globalThis.aseEarlyReads === undefined) {
  let storage: Storage | undefined;
  try { storage = localStorage; } catch { /* storage refused: the listing names the repository */ }
  const runtime = (document.currentScript as HTMLScriptElement | null)?.dataset.runtime;
  globalThis.aseEarlyReads = startEarlyReads({
    fetcher: fetch.bind(globalThis),
    storage,
    preloadRuntime: runtime ? () => document.head.append(Object.assign(document.createElement("link"), { rel: "preload", as: "script", fetchPriority: "high", href: runtime })) : undefined,
  });
}
