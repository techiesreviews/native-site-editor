import { WARN_IMAGE_BYTES, uploadImageType } from "../uploads";
import { createBusyLock } from "./media-busy-lock";
import { createMediaByteCache } from "./media-byte-cache";
import { createMediaLibraryShell } from "./media-library-shell";
import { drawLibraryGrid } from "./media-library-grid";
import { repaintUsageBadges, showUsageDialog } from "./media-library-usage";
import { showMediaDetail } from "./media-library-details";
import { confirmMediaDelete } from "./media-library-delete";
import { showMediaOptimise } from "./media-library-optimise";
import { wireMediaLibraryInput } from "./media-library-input";
import { createMediaAdding } from "./media-library-adding";
import { basename, filterMediaLibrary, mediaFamilyUsage, type MediaKindChoice, type MediaLibraryFilter } from "./media-library-filter";
import { mediaNameAlt, mediaVariants, type MediaImage } from "./media-markup";
import { node } from "../ui/dom";
import { createRowMenu, type MenuItem } from "../components/row-menu";
import { showCollectionDelete, showCollectionName, showManageCollections, type CollectionScreensHost } from "./media-library-collections";
import { filesLabel } from "./media-collection-choices";
import { showToCheck, toCheckLabel } from "./media-library-to-check";
import type { LibrarySheet, LibrarySheetContext } from "./media-library-sheet";
import {
  detailIdentity, metadataIdentity, captureDetailForm, restoreDetailForm,
  dismissRefreshingDelete, pruneLibrarySelection, rebuildLibraryCollections,
} from "./media-library-refresh";
import "./media-picker.css";
import type { MediaCleanUpMount, MediaLibrary, MediaPickerHost, MediaPickerOptions } from "./media-picker";

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
  options: MediaPickerOptions & { refreshKey?: () => string; cleanUp?: MediaCleanUpMount } = {}, modal?: HTMLDialogElement,
): MediaLibraryView {
  adapter.begin?.();
  const shell = createMediaLibraryShell(container, options, ++viewId, {
    addTo: opener => openMenu(opener, "Add to collection", [
      ...library.collections.filter(name => name !== viewing).map(name => {
        const all = [...selected].every(path => library.metadata[path]?.tags.includes(name));
        return { label: name, section: "Add to", ...(all ? { disabled: "Already in it" } : {}), run: () => addTo(name) };
      }),
      { label: "New collection…", run: () => showCollectionName(sheet, collectionHost, {
        paths: [...selected], done: saved => { if (saved) { selected.clear(); draw(); } closeSheet(opener); },
      }) },
    ]),
    takeOut: () => void task(async () => {
      const name = viewing, paths = [...selected].filter(path => library.metadata[path]?.tags.includes(name));
      if (!name || !paths.length) return;
      await adapter.collections({ kind: "take-out", name, paths });
      selected.clear(); await refresh(); keepFocus();
      tell(`Took ${filesLabel(paths.length)} out of "${name}". ${paths.length === 1 ? "It stays" : "They stay"} in Media under All.`);
    }),
    remove: () => remove([...selected]),
    more: opener => openMenu(opener, "More for selected files", [
      { label: "Select all shown", run: () => {
        for (const card of grid.querySelectorAll<HTMLElement>(".media-library__card")) selected.add(card.dataset.path!);
        draw();
      } },
      { label: "Optimise heavy images", run: () => void task(async () => {
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
      }) },
    ]),
    clear: () => { selected.clear(); draw(); },
    details: () => { if (chosen) void details(chosen); },
    use,
  }, modal);
  const { dialog, grid, collections, summary, message } = shell;
  let alive = true, kind: MediaKindChoice = "all", layout: "grid" | "list" = "grid", refreshVersion = 0, loadingLibrary = false;
  let usageDialog: ReturnType<typeof showUsageDialog> | undefined;
  /** The collection the grid shows; a rename it follows; empty for All collections. */
  let viewing = "", followed: string | undefined;
  /** The picker's chosen file, placed by Use. */
  let chosen: string | undefined;
  let library: MediaLibrary, refreshedKey: string | undefined;
  const sheet: LibrarySheet = { element: shell.sheet, version: 0 };
  // More's menu sits outside the pane, whose size containment would place the fixed menu against it.
  const more = createRowMenu(modal ?? container);
  // Clean up (slice 49): More's item after Add new file opens the host's panel above the grid.
  const cleanUpSlot = options.cleanUp && !modal ? document.createElement("div") : undefined;
  if (cleanUpSlot) { cleanUpSlot.className = "media-clean-up"; cleanUpSlot.hidden = true; shell.browse.prepend(cleanUpSlot); }
  const cleanUp = cleanUpSlot && options.cleanUp?.(cleanUpSlot, () => shell.more.focus());
  const listeners = new AbortController(), selected = new Set<string>(), observers = new Set<IntersectionObserver>();
  const busyLock = createBusyLock({ root: dialog, signal: listeners.signal, tell,
    alive: () => alive, loading: () => loadingLibrary });
  const cache = createMediaByteCache({ load: path => adapter.blob(path),
    version: path => library.items.find(item => item.path === path)?.version, alive: () => alive });
  const context: LibrarySheetContext = {
    alive: () => alive, library: () => library, loading: () => loadingLibrary,
    tell, task, refresh, adapter, cache, sync: () => busyLock.sync(),
  };
  const detailHost = { ...context, dialog, grid, modal: Boolean(modal), close: shell.close, optimise, remove };
  // Each newer usage result repaints the badges and an open usage dialog.
  const stopUsage = adapter.usage?.onChange(() => {
    if (!alive) return;
    repaintUsageBadges(grid, adapter.usage?.records()); usageDialog?.refresh(); sheet.repaint?.();
  });
  // Dropped and chosen files are added at once, in the pane and in the picker (slice 17).
  const adding = createMediaAdding(grid, shell.adding, {
    alive: () => alive, library: () => library, filter: () => ({ query: shell.search.value, collection: collections.value, kind }),
    import: requests => adapter.import(requests), task: work => task(work), idle: () => busyLock.idle(),
    refresh: async () => { cache.clear(); await refresh(); }, show: recover, tell,
    review: (files, collection) => showMediaOptimise(sheet, context, "", files, false, new Map(), collection),
    // In the picker a new file is chosen, never placed: Use still confirms it.
    added: paths => {
      const fits = paths.find(path => library.items.some(item => item.path === path) && filterMediaLibrary(
        { ...library, items: [{ path }] }, { query: "", collection: "", kind: "all", accept: options.accept }).length);
      if (modal && fits) { chosen = fits; draw(); }
    },
  });
  const collectionHost: CollectionScreensHost = {
    ...context, close: () => closeSheet(collections),
    follow: (from, to) => { if (viewing === from) followed = to; adding.renamed(from, to); },
  };
  /** Close a collection screen and return focus to what opened it (or to Collections). */
  function closeSheet(opener: HTMLElement) {
    sheet.version++; sheet.redraw = undefined; shell.sheet.hidden = true; shell.sheet.replaceChildren();
    delete shell.sheet.dataset.mode;
    (opener.isConnected && opener.getClientRects().length ? opener : collections).focus();
  }
  /** The selection bar closes with the selection; focus moves to Collections rather than being lost. */
  function keepFocus() {
    if (alive && (document.activeElement === document.body || !document.activeElement?.isConnected || shell.bulk.contains(document.activeElement))) collections.focus();
  }
  function openMenu(opener: HTMLButtonElement, label: string, items: MenuItem[]) {
    if (more.isOpen() && more.opener === opener) { more.close(true); return; }
    more.open(opener, items, undefined, label);
  }
  function addTo(name: string) {
    void task(async () => {
      const paths = [...selected];
      await adapter.collections({ kind: "add", name, paths });
      selected.clear(); await refresh(); keepFocus();
      tell(`Added ${filesLabel(paths.length)} to "${name}".`);
    });
  }
  function dispose() {
    if (!alive) return;
    alive = false; sheet.version++; sheet.work?.abort(); listeners.abort(); stopUsage?.(); usageDialog?.close(); adding.dispose();
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
    rebuildLibraryCollections(collections, library.collections, true, followed ?? collections.value);
    followed = undefined;
    draw();
    if (!shell.sheet.hidden && (shell.sheet.dataset.mode === "collections" || shell.sheet.dataset.mode === "to-check")) sheet.redraw?.();
    if (sheet.path) {
      if (library.items.some((item) => item.path === sheet.path)) {
        const path = sheet.path;
        const rendered = shell.sheet.querySelector("[data-detail-form]");
        if (path !== previousPath || !rendered || detailIdentity(previous, path) !== detailIdentity(library, path)) {
          const preserve = path === previousPath && rendered && metadataIdentity(previous, path) === metadataIdentity(library, path);
          const savedForm = captureDetailForm(shell.sheet, Boolean(preserve));
          await details(path, true);
          if (alive && sheet.path === path) restoreDetailForm(shell.sheet, savedForm);
        }
      }
      else { sheet.path = undefined; sheet.repaint = undefined; delete shell.sheet.dataset.mode; shell.sheet.hidden = true; shell.sheet.replaceChildren(); }
    }
  }
  function draw() {
    if (!alive || !library) return;
    viewing = collections.value;
    // A chosen file that is gone (removed, renamed) is no longer chosen.
    if (chosen && !library.items.some(item => item.path === chosen)) chosen = undefined;
    drawLibraryGrid(shell, library, { kind, selected, observers, accept: options.accept, modal: Boolean(modal), layout, chosen }, {
      alive: () => alive, bytes: path => cache.get(path), sync: () => busyLock.sync(),
      details: path => void details(path), records: () => adapter.usage?.records(), usage,
      recover, restoreFocus: !sheet.focus,
      choose: path => { chosen = path; paintChoice(); },
    });
    adding.paint();
    paintChoice();
  }
  /** The picker's status: the chosen file's picture and name, or what to do. Use waits for a choice. */
  function paintChoice() {
    if (!modal) return;
    const { thumb, name, details, use } = shell.choice;
    for (const card of grid.querySelectorAll<HTMLElement>(".media-library__card")) {
      const on = card.dataset.path === chosen;
      card.classList.toggle("is-chosen", on);
      card.querySelector(".media-library__thumbnail")?.setAttribute("aria-pressed", String(on));
    }
    name.textContent = chosen ? basename(chosen) : "Choose one image";
    thumb.replaceChildren(); details.hidden = !chosen;
    use.disabled = !chosen;
    if (!chosen) return;
    const path = chosen;
    void cache.get(path).then(data => {
      if (!alive || chosen !== path || !uploadImageType(path)) return;
      const image = node("img"); image.alt = ""; image.src = data.url; thumb.replaceChildren(image);
    }).catch(() => undefined);
  }
  /** Use: place the chosen file with today's markup; the picker closes once the place has it. */
  function use() {
    const path = chosen, pick = options.onPick;
    if (!path || !pick) return;
    void task(async () => {
      const data = await cache.get(path);
      const meta = library.metadata[path];
      const image: MediaImage = { path, width: data.width, height: data.height, variants: mediaVariants(path, library.items.map(item => item.path)),
        alt: meta?.decorative ? "" : meta?.alt || mediaNameAlt(path) };
      await pick(image);
      shell.close();
    });
  }
  function usage(path: string) {
    usageDialog?.close();
    const opened = usageDialog = showUsageDialog({
      root: modal ?? container, records: () => adapter.usage?.records(), pageLabel: page => adapter.usage?.pageLabel?.(page),
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
  // More: adding first, then the kinds, then Grid or List, then the viewed collection's Rename and Delete.
  const kinds: [MediaKindChoice, string][] = [["all", "All"], ["image", "Images"], ["video", "Video"], ["audio", "Audio"], ["document", "Documents"]];
  shell.more.addEventListener("click", () => {
    if (more.isOpen() && more.opener === shell.more) { more.close(true); return; }
    const name = viewing;
    more.open(shell.more, [
      { label: "Add new file", run: () => shell.uploadInput.click() },
      // Clean up, with the tab's count, is an action like adding; the choices follow.
      ...cleanUp ? [{ ...cleanUp.item(), run: () => cleanUp.open() }] : [],
      // To check (ticket 13), with its count: agent-written descriptions waiting for OK or Edit.
      ...!modal && adapter.check ? [{ label: toCheckLabel(library?.toCheck), run: () => {
        if (library) showToCheck(sheet, { ...context, close: () => closeSheet(shell.more), pageLabel: page => adapter.usage?.pageLabel?.(page) });
      } }] : [],
      // The picker shows only files that fit the place, so it has no kinds to choose.
      ...modal ? [] : kinds.map(([value, label]) => ({ label, section: "Show", checked: kind === value, run: () => {
        kind = value; draw(); shell.more.focus();
      } })),
      ...([["grid", "Grid"], ["list", "List"]] as const).map(([value, label]) => ({ label, section: "View", checked: layout === value, run: () => {
        layout = value; draw(); shell.more.focus();
      } })),
      // While viewing a collection (ticket 15).
      ...name ? [
        { label: "Rename collection", section: "This collection", run: () => showCollectionName(sheet, collectionHost, { renaming: name, done: () => closeSheet(shell.more) }) },
        { label: "Delete collection", section: "This collection", run: () => showCollectionDelete(sheet, collectionHost, name, () => closeSheet(shell.more)) },
      ] : [],
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
    draw, loaded: () => Boolean(library), tell,
    add: files => adding.start(files),
    viewing: () => viewing, manage: () => { if (library) showManageCollections(sheet, collectionHost); },
  }, listeners.signal);
  const ready = task(async () => {
    summary.textContent = "Reading repository images and references…";
    await refresh(); if (options.files?.length && alive) adding.start(options.files);
  }, false);
  return { element: dialog, ready, get refreshedKey() { return refreshedKey; }, refresh: () => task(refresh, false), dispose };
}
