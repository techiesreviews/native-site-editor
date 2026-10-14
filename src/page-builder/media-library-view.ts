import { WARN_IMAGE_BYTES, uploadImageType } from "../uploads";
import { cleanMediaTags, type MediaMetadata } from "./media-metadata";
import { createBusyLock } from "./media-busy-lock";
import { createMediaByteCache } from "./media-byte-cache";
import { createMediaLibraryShell } from "./media-library-shell";
import { drawLibraryGrid } from "./media-library-grid";
import { repaintUsageBadges, showUsageDialog } from "./media-library-usage";
import { showMediaDetail } from "./media-library-details";
import { confirmMediaDelete } from "./media-library-delete";
import { showMediaOptimise } from "./media-library-optimise";
import { wireMediaLibraryInput } from "./media-library-input";
import { mediaFamilyUsage, type MediaKindChoice, type MediaLibraryFilter } from "./media-library-filter";
import { createRowMenu } from "../components/row-menu";
import type { LibrarySheet, LibrarySheetContext } from "./media-library-sheet";
import {
  detailIdentity, metadataIdentity, captureDetailForm, restoreDetailForm,
  dismissRefreshingDelete, pruneLibrarySelection, rebuildLibraryCollections,
} from "./media-library-refresh";
import "./media-picker.css";
import type { MediaLibrary, MediaPickerHost, MediaPickerOptions } from "./media-picker";

export interface MediaLibraryView {
  element: HTMLElement;
  ready: Promise<void>;
  readonly refreshedKey: string | undefined;
  refresh(): Promise<void>;
  dispose(): void;
}
let viewId = 0;

/** The Media pane, or the Choose image modal when `modal` is given. It owns the
 * state; the parts it composes get what they need as arguments. */
export function createMediaLibraryView(
  container: HTMLElement, adapter: MediaPickerHost,
  options: MediaPickerOptions & { refreshKey?: () => string } = {}, modal?: HTMLDialogElement,
): MediaLibraryView {
  adapter.begin?.();
  const shell = createMediaLibraryShell(container, options, ++viewId, {
    tagSelected: () => void task(async () => {
      const changes: Record<string, Partial<MediaMetadata>> = {};
      for (const path of selected) changes[path] = {
        tags: cleanMediaTags([...(library.metadata[path]?.tags ?? []), ...shell.bulkTags.value.split(",")]),
      };
      await adapter.metadata(changes); await refresh();
    }),
    optimiseHeavy: () => void task(async () => {
      const files: File[] = [], receipts = new Map<string, string | undefined>();
      for (const item of library.items.filter((item) => selected.has(item.path))) {
        const version = item.version, blob = await adapter.blob(item.path);
        if (!alive) return;
        if (blob.size >= WARN_IMAGE_BYTES) {
          files.push(new File([blob], item.path, { type: blob.type || uploadImageType(item.path) }));
          receipts.set(item.path, version);
        }
      }
      if (!files.length) { tell("No selected images are above 2 MB."); return; }
      optimise(files, true, receipts);
    }),
    deleteUnused: () => remove([...selected].filter((path) => !library.usage[path]?.files.length), true),
    clear: () => { selected.clear(); draw(); },
  }, modal);
  const { dialog, grid, collections, summary, message } = shell;
  let alive = true, kind: MediaKindChoice = "all", layout: "grid" | "list" = "grid", refreshVersion = 0, loadingLibrary = false;
  let usageDialog: ReturnType<typeof showUsageDialog> | undefined;
  let library: MediaLibrary, refreshedKey: string | undefined;
  const sheet: LibrarySheet = { element: shell.sheet, version: 0 };
  // More's menu sits outside the pane, whose size containment would place the fixed menu against it.
  const more = createRowMenu(modal ?? container);
  const listeners = new AbortController(), selected = new Set<string>(), observers = new Set<IntersectionObserver>();
  const busyLock = createBusyLock({ root: dialog, signal: listeners.signal, tell,
    alive: () => alive, loading: () => loadingLibrary });
  const cache = createMediaByteCache({ load: path => adapter.blob(path),
    version: path => library.items.find(item => item.path === path)?.version, alive: () => alive });
  const context: LibrarySheetContext = {
    alive: () => alive, library: () => library, loading: () => loadingLibrary,
    tell, task, refresh, adapter, cache, sync: () => busyLock.sync(),
  };
  const detailHost = { ...context, dialog, grid, modal: Boolean(modal), pick: options, close: shell.close, optimise, remove };
  // Each newer usage result repaints the badges and an open usage dialog.
  const stopUsage = adapter.usage?.onChange(() => {
    if (!alive) return;
    repaintUsageBadges(grid, adapter.usage?.records()); usageDialog?.refresh();
  });
  function dispose() {
    if (!alive) return;
    alive = false; sheet.version++; sheet.work?.abort(); listeners.abort(); stopUsage?.(); usageDialog?.close();
    observers.forEach((observer) => observer.disconnect()); observers.clear(); cache.dispose();
    more.close(false); more.element.remove();
    modal?.removeEventListener("close", dispose); dialog.replaceChildren(); dialog.remove();
  }
  modal?.addEventListener("close", dispose, { once: true });
  function tell(text: string) { if (alive) message.textContent = text; }
  function task(work: () => Promise<void>, lock = true, canCancel = false) {
    return busyLock.task(work, lock, canCancel);
  }
  async function refresh() {
    if (!alive) return;
    const request = ++refreshVersion;
    const inputKey = options.refreshKey?.();
    // Refreshing repository sources must not erase an unfinished metadata form.
    const previous = library;
    const previousPath = sheet.path;
    loadingLibrary = true;
    dismissRefreshingDelete(shell.sheet, grid, () => { sheet.version++; }, tell);
    let next: MediaLibrary;
    try { next = await adapter.load(); }
    catch (error) { if (request === refreshVersion) sheet.focus = undefined; throw error; }
    finally { if (request === refreshVersion) loadingLibrary = false; }
    if (!alive || request !== refreshVersion) return;
    cache.sync(next.items);
    // One tile per Image family, so its main counts the pages of all its members.
    library = { ...next, usage: mediaFamilyUsage(next) };
    refreshedKey = inputKey;
    pruneLibrarySelection(library.items, selected);
    rebuildLibraryCollections(collections, library.collections);
    draw();
    if (sheet.path) {
      if (library.items.some((item) => item.path === sheet.path)) {
        const path = sheet.path;
        const rendered = shell.sheet.querySelector<HTMLInputElement>('input[aria-label="Default alt text"]');
        if (path !== previousPath || !rendered || detailIdentity(previous, path) !== detailIdentity(library, path)) {
          const preserve = path === previousPath && rendered && metadataIdentity(previous, path) === metadataIdentity(library, path);
          const savedForm = captureDetailForm(shell.sheet, Boolean(preserve));
          await details(path, true);
          if (alive && sheet.path === path) restoreDetailForm(shell.sheet, savedForm);
        }
      }
      else { sheet.path = undefined; shell.sheet.hidden = true; shell.sheet.replaceChildren(); }
    }
  }
  function draw() {
    if (!alive || !library) return;
    drawLibraryGrid(shell, library, { kind, selected, observers, accept: options.accept, modal: Boolean(modal), layout }, {
      alive: () => alive, bytes: path => cache.get(path), sync: () => busyLock.sync(),
      details: path => void details(path), records: () => adapter.usage?.records(), usage,
      recover, restoreFocus: !sheet.focus,
    });
  }
  function usage(path: string) {
    usageDialog?.close();
    const opened = usageDialog = showUsageDialog({
      root: modal ?? container, records: () => adapter.usage?.records(),
      openPage: page => void task(async () => { await adapter.openPage(page); shell.close(); }),
      details: path => void details(path),
      returnFocus: path => {
        if (usageDialog === opened) usageDialog = undefined;
        // Details or a page may have taken focus; otherwise the badge (or its redraw) gets it back.
        if (alive && (document.activeElement === document.body || !document.activeElement?.isConnected))
          grid.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] .media-library__usage`)?.focus();
      },
    }, path);
  }
  function recover(change: Partial<MediaLibraryFilter>) {
    if (change.kind) kind = change.kind;
    if (change.collection !== undefined) collections.value = change.collection;
    if (change.query !== undefined) shell.search.value = change.query;
    draw(); shell.search.focus();
  }
  // More: adding first, then the kinds, then Grid or List.
  const kinds: [MediaKindChoice, string][] = [["all", "All"], ["image", "Images"], ["video", "Video"], ["audio", "Audio"], ["document", "Documents"]];
  shell.more.addEventListener("click", () => {
    if (more.isOpen() && more.opener === shell.more) { more.close(true); return; }
    more.open(shell.more, [
      { label: "Add new file", run: () => shell.uploadInput.click() },
      ...kinds.map(([value, label]) => ({ label, section: "Show", checked: kind === value, run: () => {
        kind = value; draw(); shell.more.focus();
      } })),
      ...([["grid", "Grid"], ["list", "List"]] as const).map(([value, label]) => ({ label, section: "View", checked: layout === value, run: () => {
        layout = value; draw(); shell.more.focus();
      } })),
    ], undefined, "More");
  }, { signal: listeners.signal });
  function details(path: string, background = false) {
    return showMediaDetail(sheet, detailHost, path, background);
  }
  function remove(paths: string[], unusedOnly = false) { confirmMediaDelete(sheet, grid, context, paths, unusedOnly); }
  function optimise(files: File[], existing = false, receipts = new Map<string, string | undefined>()) {
    showMediaOptimise(sheet, context, "", files, existing, receipts);
  }
  wireMediaLibraryInput(shell, {
    draw, busy: () => busyLock.busy, loaded: () => Boolean(library), optimise: files => optimise(files), tell,
  }, listeners.signal);
  const ready = task(async () => {
    summary.textContent = "Reading repository images and references…";
    await refresh(); if (options.files?.length && alive) optimise(options.files);
  }, false);
  return { element: dialog, ready, get refreshedKey() { return refreshedKey; }, refresh: () => task(refresh, false), dispose };
}
