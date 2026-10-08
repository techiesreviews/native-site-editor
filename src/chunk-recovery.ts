/** A stale tab may request a hashed chunk removed by a deployment. */
export const CHUNK_RELOAD_KEY = "native-site-editor:chunk-reload";
const recoveryGuards = new Set<() => boolean>();

/** Register memory-only edits that must survive a failed lazy import. */
export function guardChunkReload(unsafe: () => boolean): () => void {
  recoveryGuards.add(unsafe);
  return () => recoveryGuards.delete(unsafe);
}

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS|Loading (?:CSS )?chunk [\w-]+ failed/i.test(message);
}

export interface ChunkRecoveryOptions {
  storage: () => Pick<Storage, "getItem" | "setItem">;
  unsafe: () => boolean;
  flush: () => Promise<void>;
  persistenceError: () => boolean;
  reload: () => void;
  notice: (message: string) => void;
}

export function createChunkRecovery(options: ChunkRecoveryOptions) {
  let pending: Promise<void> | undefined;
  const blocked = () => options.notice("An editor update could not load. Finish your edits, then reload the page manually to try again.");
  async function recover() {
    try {
      if (options.unsafe() || [...recoveryGuards].some((unsafe) => unsafe())) return blocked();
      const storage = options.storage();
      if (storage.getItem(CHUNK_RELOAD_KEY)) return blocked();
      await options.flush();
      // Edits can start while IndexedDB commits. Flush resolves on failure too.
      if (options.persistenceError() || options.unsafe() || [...recoveryGuards].some((unsafe) => unsafe())) return blocked();
      storage.setItem(CHUNK_RELOAD_KEY, "1");
      options.reload();
    } catch {
      // Without a durable session guard, automatic reload could loop.
      blocked();
    }
  }
  return (error: unknown): Promise<void> | undefined => {
    if (!isChunkLoadError(error)) return;
    return pending ??= recover().finally(() => { pending = undefined; });
  };
}

let handler: ReturnType<typeof createChunkRecovery> | undefined;
export function handleChunkLoadFailure(error: unknown) {
  return handler?.(error);
}

export function installChunkRecovery(options: ChunkRecoveryOptions) {
  handler = createChunkRecovery(options);
  window.addEventListener("vite:preloadError", (event) => {
    const error = (event as Event & { payload: unknown }).payload;
    if (!isChunkLoadError(error)) return;
    // Preserve Vite's rejection so callers clear failed import promises.
    void handleChunkLoadFailure(error);
  });
}

/** Open forms and inline editors can hold edits outside DraftStore. */
export function hasEditableRecoveryState(document: Document): boolean {
  if (document.querySelector('dialog[open], [role="dialog"]:not([hidden]), form, [contenteditable]:not([contenteditable="false"])')) return true;
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
    if (field.disabled || field.readOnly || field.type === "hidden" || field.type === "search") continue;
    if (document.activeElement === field || field.value && field.getClientRects().length > 0) return true;
  }
  for (const frame of document.querySelectorAll("iframe")) {
    // A parked preview frame (inert, not yet showing a page) holds no edits.
    if (frame.closest?.("[inert]")) continue;
    try {
      if (!frame.contentDocument || hasEditableRecoveryState(frame.contentDocument)) return true;
    } catch {
      // A cross-origin preview cannot be inspected safely.
      return true;
    }
  }
  return false;
}
