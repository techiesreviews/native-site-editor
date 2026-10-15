import { mediaStorageName } from "./media-storage";
import { WARN_IMAGE_BYTES, uploadImageType } from "../uploads";
import { createBusyLock } from "./media-busy-lock";
import { createMediaByteCache, decodeImage } from "./media-byte-cache";
import { createMediaLibraryShell } from "./media-library-shell";
import { drawLibraryGrid } from "./media-library-grid";
import { repaintUsageBadges, showUsageDialog } from "./media-library-usage";
import { showMediaDetail } from "./media-library-details";
import { confirmMediaDelete } from "./media-library-delete";
import { showMediaOptimise } from "./media-library-optimise";
import { wireMediaLibraryInput } from "./media-library-input";
import { createMediaAdding } from "./media-library-adding";
import { basename, chosenNoun, filterMediaLibrary, mediaFamilyUsage, mediaKind, onlineServiceName, onlineVideoName, pickerFileWord, type MediaKindChoice, type MediaLibraryFilter } from "./media-library-filter";
import { mediaImageForPlacement, mediaNameAlt, mediaVariantName, mediaVariants, type MediaImage } from "./media-markup";
import { node } from "../ui/dom";
import { markTransparency } from "./media-transparency";
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
import { say } from "../components/toast";
import type { MediaCleanUpMount, MediaHeldFiles, MediaImportRequest, MediaLibrary, MediaPickerHost, MediaPickerOptions } from "./media-picker";
const CANCELLED = "This file was cancelled. Choose another image.";
/** How long a just-added tile wears its ring (the CSS animation's length). */
const FRESH_RING_MS = 2400;

export interface MediaLibraryView {
  element: HTMLElement;
  ready: Promise<void>;
  /** The Optimise sheet for files added elsewhere, bound for `folder`. */
  review(files: File[], folder: string): void;
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
      done(`Took ${filesLabel(paths.length)} out of "${name}". ${paths.length === 1 ? "It stays" : "They stay"} in Media under All.`);
    }),
    // Back from the confirm: to Remove files, or to ⋯ where a phone keeps it.
    remove: () => remove([...selected], () => { if (!shell.removeFiles.hidden) (shell.removeFiles.checkVisibility() ? shell.removeFiles : shell.bulkMore).focus(); }),
    more: opener => openMenu(opener, "More for selected files", [
      { label: "Select all shown", run: () => {
        for (const card of grid.querySelectorAll<HTMLElement>(".media-library__card[data-path]")) selected.add(card.dataset.path!);
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
      // Phones keep one row (slice 107): Take out and Remove files move here, removal last.
      ...[shell.takeOut, shell.removeFiles].filter(control => !control.hidden && !control.checkVisibility())
        .map(control => ({ label: control === shell.removeFiles ? `${control.textContent}…` : control.textContent ?? "", run: () => control.click() })),
    ]),
    clear: () => { selected.clear(); draw(); },
    details: () => { if (chosen) void (onlineVideo(chosen) ? onlineDetails(chosen) : details(chosen)); },
    use,
    ...modal && options.onlineVideo ? { address: (text: string) => useAddress(text) } : {},
  }, modal);
  const { dialog, grid, collections, summary, message } = shell;
  let alive = true, kind: MediaKindChoice = "all", layout: "grid" | "list" = "grid", refreshVersion = 0, loadingLibrary = false;
  let usageDialog: ReturnType<typeof showUsageDialog> | undefined;
  /** The collection the grid shows; a rename it follows; empty for All collections. */
  let viewing = "", followed: string | undefined;
  /** The picker's chosen file, placed by Use. */
  let chosen: string | undefined;
  let library: MediaLibrary, refreshedKey: string | undefined;
  // Each new screen bumps the version; it also clears the last screen's inline line (slice 105).
  let screen = 0;
  const sheet: LibrarySheet = { element: shell.sheet, get version() { return screen; }, set version(next) { screen = next; message.textContent = ""; } };
  // More's menu sits outside the pane, whose size containment would place the fixed menu against it.
  const more = createRowMenu(modal ?? container);
  // Clean up (slices 49, 50): More's item after Add new file opens the review; it redraws with each check.
  const cleanUp = modal ? undefined : options.cleanUp?.(), cleanUpMemory: { undo?: string[] } = {};
  // Improve images (slice 74) sits beside it; its Undo list outlives leaving the screen.
  let improveMemory: import("./media-library-improve").ImproveMemory | undefined;
  const listeners = new AbortController(), selected = new Set<string>(), observers = new Set<IntersectionObserver>();
  const busyLock = createBusyLock({ root: dialog, signal: listeners.signal, tell,
    alive: () => alive, loading: () => loadingLibrary });
  const cache = createMediaByteCache({ load: path => adapter.blob(path),
    version: path => library.items.find(item => item.path === path)?.version, alive: () => alive });
  const context: LibrarySheetContext = {
    alive: () => alive, library: () => library, loading: () => loadingLibrary,
    tell, done, task, refresh, adapter, cache, sync: () => busyLock.sync(),
  };
  // From File details, Cancel and Back return to them.
  const detailHost = { ...context, dialog, grid, modal: Boolean(modal), close: shell.close, optimise,
    remove: (paths: string[]) => remove(paths, () => void details(paths[0])),
    menu: (opener: HTMLButtonElement, items: MenuItem[]) => openMenu(opener, "More for this file", items) };
  // Each newer usage result repaints the badges and an open usage dialog.
  const stopCleanUp = cleanUp?.onChange(() => {
    if (!alive) return;
    if (shell.sheet.dataset.mode === "clean-up") sheet.redraw?.();
    // The width check finishes after Clean up: an already-open More must show its new count too.
    if (more.isOpen() && more.opener === shell.more && cleanUp.improve) {
      const item = [...more.element.querySelectorAll("[role=menuitem]")].find(item => item.firstElementChild?.textContent?.startsWith("Improve images"));
      if (item?.firstElementChild) item.firstElementChild.textContent = cleanUp.improve.item().label;
    }
  });
  const stopUsage = adapter.usage?.onChange(() => {
    if (!alive) return;
    repaintUsageBadges(grid, adapter.usage?.records()); usageDialog?.refresh(); sheet.repaint?.();
  });
  // Dropped and chosen files are added at once (slice 17). The pane saves them; the picker holds the
  // ready ones and chooses the first of each addition, so Use saves and places them in one Undo step.
  let chooseNext = false;
  /** Files just saved (slice 103): newest first puts them on top; once the grid shows them (at
   * once, or after Show new files) they come into view and wear a brief ring, kept through redraws. */
  let fresh: { paths: string[]; at?: number } | undefined;
  function showFresh() {
    if (!fresh) return;
    const cards = [...grid.querySelectorAll<HTMLElement>(".media-library__card")].filter(card => fresh!.paths.includes(card.dataset.path ?? ""));
    // Hidden by the search, kind or collection: the tray's Show new files brings them back.
    if (!cards.length) return;
    if (fresh.at === undefined) { fresh.at = performance.now(); cards[0].scrollIntoView({ block: "nearest" }); }
    const age = performance.now() - fresh.at;
    if (age > FRESH_RING_MS) { fresh = undefined; return; }
    for (const card of cards) { card.classList.add("is-new"); card.style.setProperty("--new-delay", `-${Math.round(age)}ms`); }
  }
  const adding = createMediaAdding(grid, shell.adding, {
    hold: Boolean(modal),
    select: (id, request) => { if (!fitsRequest(request)) { tell("This file does not fit this spot. Close to save it without placing."); return; } chosen = id; paintChoice(); },
    ready: (id, request) => {
      if (!chooseNext || !fitsRequest(request)) return;
      chooseNext = false; chosen = id; paintChoice();
    },
    alive: () => alive, library: () => library, filter: () => ({ query: shell.search.value, collection: collections.value, kind }),
    import: requests => adapter.import(requests), task: work => task(work), idle: () => busyLock.idle(),
    refresh: async () => { cache.clear(); await refresh(); }, show: recover, tell,
    // The picker's reviewed files are held like the others.
    review: (files, collection) => showMediaOptimise(sheet, modal ? { ...context, adapter: { ...adapter,
      import: async requests => { adding.reviewed(requests); return []; } } } : context, "", files, false, new Map(), collection),
    // In the picker a new file is chosen, never placed: Use still confirms it.
    added: paths => {
      const fits = paths.find(path => library.items.some(item => item.path === path) && filterMediaLibrary(
        { ...library, items: [{ path }] }, { query: "", collection: "", kind: "all", accept: options.accept }).length);
      fresh = { paths };
      if (modal && fits) { chosen = fits; draw(); } else showFresh();
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
      done(`Added ${filesLabel(paths.length)} to "${name}".`);
    });
  }
  /** Closing the picker (Cancel, Close, Escape) saves its ready files without placing them: one Undo
   * step. A picker closed by a repository switch (`dispose()` from outside) drops them. */
  function dispose(saveHeld = false) {
    if (!alive) return;
    const rest = modal && saveHeld ? adding.take() : [], unfinished = modal && saveHeld ? adding.cancelPending() : 0;
    const notAdded = unfinished ? ` ${filesLabel(unfinished)} still being prepared ${unfinished === 1 ? "was" : "were"} not added.` : "";
    if (rest.length) void adapter.import(rest.map(entry => entry.request)).then(
      paths => options.report?.announce(`Added ${paths.join(", ")}.${notAdded}`), error => options.report?.error(error));
    else if (notAdded) options.report?.announce(notAdded.trim());
    alive = false; sheet.version++; sheet.work?.abort(); listeners.abort(); stopUsage?.(); stopCleanUp?.(); usageDialog?.close(); adding.dispose();
    observers.forEach((observer) => observer.disconnect()); observers.clear(); cache.dispose();
    more.close(false); more.element.remove();
    modal?.removeEventListener("close", closed); dialog.replaceChildren(); dialog.remove();
  }
  const closed = () => dispose(true);
  modal?.addEventListener("close", closed, { once: true });
  /** A warning or refusal, inline under the screen it is about. */
  function tell(text: string) { if (alive) message.textContent = text; }
  /** A result: said and shown as the editor's toast, which outlasts the screen. */
  function done(text: string) { message.textContent = ""; say(text); }
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
    // Collections, To check and Adding settings redraw from the refreshed library.
    if (!shell.sheet.hidden) sheet.redraw?.();
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
    // A chosen file that is gone (removed, renamed, a held file cancelled) is no longer chosen.
    if (chosen && !heldFile(chosen) && !onlineVideo(chosen) && !library.items.some(item => item.path === chosen)) chosen = undefined;
    drawLibraryGrid(shell, library, { kind, selected, observers, accept: options.accept, modal: Boolean(modal), layout, chosen, online: !modal || Boolean(options.onlineVideo) }, {
      alive: () => alive, bytes: path => cache.get(path), objectUrl: blob => cache.objectUrl(blob), sync: () => busyLock.sync(),
      details: path => void details(path), records: () => adapter.usage?.records(), usage,
      recover, restoreFocus: !sheet.focus,
      choose: path => { chosen = path; paintChoice(); },
      online: key => void onlineDetails(key),
    });
    adding.paint();
    paintChoice();
    showFresh();
  }
  /** The picker's status: the chosen file's picture and name, or what to do. Use waits for a choice. */
  function paintChoice() {
    if (!modal) return;
    if (chosen?.startsWith("pending:") && !heldFile(chosen)) chosen = undefined;
    const { thumb, name, details, use } = shell.choice;
    for (const card of grid.querySelectorAll<HTMLElement>(".media-library__card, .media-library__pending[data-id]")) {
      const on = (card.dataset.path ?? card.dataset.id) === chosen;
      card.classList.toggle("is-chosen", on);
      card.querySelector(".media-library__thumbnail, .media-library__pending-select")?.setAttribute("aria-pressed", String(on));
    }
    const held = chosen ? heldFile(chosen) : undefined, online = chosen ? onlineVideo(chosen) : undefined;
    if (online) {
      // A YouTube or Vimeo video from Media: placed again without contacting the service.
      name.textContent = `${onlineVideoName(online)} · ${onlineServiceName(online.service)}`;
      use.textContent = "Use video"; use.disabled = false; details.hidden = false; thumb.replaceChildren();
      const still = online.still, key = online.key;
      if (still) void cache.get(still).then(data => {
        if (!alive || chosen !== key) return;
        const image = node("img"); image.alt = ""; image.src = data.url; thumb.replaceChildren(image);
      }).catch(() => undefined);
      return;
    }
    const file = held ? held.request.file.name : chosen, note = file && options.chosenNote?.(file);
    name.textContent = file ? `${basename(file)}${note ? ` · ${note}` : ""}` : `Choose one ${pickerFileWord(options.accept)}`;
    // Use says what it places: "Use image", "Use video", "Use audio" or "Use file".
    use.textContent = `Use ${file ? chosenNoun(file) : pickerFileWord(options.accept)}`;
    thumb.replaceChildren(); details.hidden = !chosen || Boolean(held);
    use.disabled = !chosen;
    if (!chosen) return;
    const path = chosen;
    if (held) {
      const url = held.request.file.type.startsWith("image/") && URL.createObjectURL(held.request.file);
      if (url) { const image = node("img"); image.alt = ""; markTransparency(image, held.request.file.name); image.src = url; image.addEventListener("load", () => URL.revokeObjectURL(url), { once: true }); thumb.replaceChildren(image); }
      return;
    }
    void cache.get(path).then(data => {
      if (!alive || chosen !== path || !uploadImageType(path)) return;
      const image = node("img"); image.alt = ""; markTransparency(image, path); image.src = data.url; thumb.replaceChildren(image);
    }).catch(() => undefined);
  }
  /** Use: place the chosen file with today's markup; the picker closes once the place has it. */
  function fitsRequest(request: MediaImportRequest) {
    const path = mediaStorageName(request.file.name, request.result?.outputs[0]?.extension);
    return filterMediaLibrary({ ...library, items: [{ path }] }, { query: "", collection: "", kind: "all", accept: options.accept }).length > 0;
  }
  function heldFile(id: string) { return adding.held().find(entry => entry.id === id); }
  function onlineVideo(key: string) { return key.startsWith("online:") ? library?.onlineVideos?.find(video => video.key === key) : undefined; }
  /** Add → Media's online video: a pasted address, or one chosen from Media. The picker closes once it is placed. */
  function placeOnline(video: { address: string } | { service: "youtube" | "vimeo"; id: string }) {
    const place = options.onlineVideo;
    if (!place) return;
    void task(async () => {
      await place(video, () => !alive, adapter);
      shell.close();
    });
  }
  function useAddress(text: string) {
    const online = shell.online;
    if (!online) return;
    void import("./online-video").then(({ onlineAddressProblem }) => {
      if (!alive) return;
      const problem = onlineAddressProblem(text);
      online.note.textContent = problem ?? "";
      online.field.toggleAttribute("aria-invalid", Boolean(problem));
      if (problem) { online.field.focus(); return; }
      placeOnline({ address: text.trim() });
    }, error => tell(String(error)));
  }
  function onlineDetails(key: string) {
    return task(async () => {
      const { showOnlineVideoDetail } = await import("./media-library-online");
      if (alive && library) showOnlineVideoDetail(sheet, detailHost, key);
    }, false);
  }
  function use() {
    const path = chosen, pick = options.onPick;
    const online = path ? onlineVideo(path) : undefined;
    if (online) { placeOnline({ service: online.service, id: online.id }); return; }
    if (!path || !pick) return;
    void task(async () => {
      const held = heldFile(path);
      if (held && !fitsRequest(held.request)) throw new Error("This file does not fit this spot. Close to save it without placing.");
      let image: MediaImage;
      if (held) {
        // A held file's size is its main output's, or (stored as it is: SVG, GIF) read from its bytes.
        const primary = held.request.result?.outputs[0];
        let size: { width?: number; height?: number } | undefined = primary?.width ? primary : undefined;
        if (!size && mediaKind(held.request.file.name) === "image") { const url = URL.createObjectURL(primary?.blob ?? held.request.file); try { size = await decodeImage(url); } finally { URL.revokeObjectURL(url); } }
        image = { path, width: size?.width, height: size?.height, alt: "", variants: [] };
      } else {
        if (path.startsWith("pending:")) throw new Error(CANCELLED);
        // Videos, audio and downloads are placed by their address: their bytes are never read here.
        const data = mediaKind(path) === "image" ? await cache.get(path) : {};
        image = mediaImageForPlacement(path, data, library.items.map(item => item.path));
        const meta = library.metadata[path];
        // Component and settings pickers have their own Alt field; page placement resolves descriptions.
        image.alt = meta?.decorative ? "" : meta?.alt || mediaNameAlt(path);
      }
      // Cancel or Close while the picture was read: nothing is placed.
      if (!alive) return;
      if (held && !heldFile(path)) throw new Error(CANCELLED);
      await pick(image, () => !alive, heldFiles(image));
      shell.close();
    });
  }
  /** The ready held files, saved with Use's placement in one batch; undefined when there are none. */
  function heldFiles(image: MediaImage): MediaHeldFiles | undefined {
    if (!adding.held().length) return undefined;
    let taken: { id: string; request: MediaImportRequest }[] = [];
    const index = () => taken.findIndex(entry => entry.id === image.path);
    const outputs = (paths: string[]) => paths.flatMap((path, at) =>
      taken[at].request.result?.outputs.map(output => output.variantWidth ? mediaVariantName(path, output.variantWidth) : path) ?? [path]);
    return {
      chosen: () => {
        const entry = adding.held().find(held => held.id === image.path);
        return entry && { request: entry.request, take: () => void adding.take([entry.id]) };
      },
      image: paths => index() < 0 ? image : { ...image, path: paths[index()], alt: mediaNameAlt(paths[index()]), variants: mediaVariants(paths[index()], outputs(paths)) },
      async save(place) {
        // Use takes the whole addition: files still being prepared stop, and every ready one is saved here.
        const unfinished = adding.cancelPending();
        taken = adding.take();
        const ids = taken.map(entry => entry.id), requests = taken.map(entry => entry.request);
        const note = unfinished ? ` ${filesLabel(unfinished)} still being prepared ${unfinished === 1 ? "was" : "were"} not added.` : "";
        try {
          if (image.path.startsWith("pending:") && index() < 0) throw new Error(CANCELLED);
          try {
            const paths = await adapter.import(requests, place);
            adding.settle(ids, paths); return { paths, placed: Boolean(place), note };
          } catch (error) {
            // Cancelled while saving: the files are still added, once, without the placement.
            if (!place?.live || place.live()) throw error;
            const paths = await adapter.import(requests);
            adding.settle(ids, paths); return { paths, placed: false, note };
          }
        } catch (error) { adding.settle(ids); throw error; }
      },
    };
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
  // More: adding and its settings first, then the kinds, then Grid or List, then the viewed collection's Rename and Delete.
  const kinds: [MediaKindChoice, string][] = [["all", "All"], ["image", "Images"], ["video", "Video"], ["audio", "Audio"], ["document", "Documents"]];
  shell.more.addEventListener("click", () => {
    if (more.isOpen() && more.opener === shell.more) { more.close(true); return; }
    const name = viewing;
    more.open(shell.more, [
      { label: "Add new file", run: () => shell.uploadInput.click() },
      // Adding settings (ticket 07): the choices future additions use, loaded when opened.
      ...adapter.adding ? [{ label: "Adding settings", run: () => void task(async () => {
        const { showAddingSettings } = await import("./media-adding-settings");
        if (alive && library) showAddingSettings(sheet, { ...context, close: () => closeSheet(shell.more) });
      }, false) }] : [],
      // Clean up, with the tab's count, is an action like adding; the choices follow.
      // While the files Clean up removed last can be brought back, it opens for their Undo.
      ...cleanUp ? [{ ...cleanUp.item(), ...cleanUpMemory.undo?.every(path => library?.removed?.some(entry => entry.path === path)) ? { disabled: undefined } : {},
        run: () => void task(async () => {
        const { showCleanUp } = await import("./media-library-clean-up");
        if (alive && library) showCleanUp(sheet, { ...context, cleanUp, memory: cleanUpMemory, close: () => closeSheet(shell.more) });
      }, false) }] : [],
      ...cleanUp?.improve && adapter.improveImages ? [{ ...cleanUp.improve.item(), run: () => void task(async () => {
        const module = await import("./media-library-improve");
        improveMemory ??= module.improveMemory();
        if (alive && library) module.showImproveImages(sheet, { ...context, improve: cleanUp.improve!, memory: improveMemory, close: () => closeSheet(shell.more) });
      }, false) }] : [],
      // Recently removed (ticket 10): removed files for 30 days, each with Restore; loaded when opened.
      ...!modal && adapter.restore ? [{ label: "Recently removed", run: () => void task(async () => {
        const { showRecentlyRemoved } = await import("./media-library-recently-removed");
        if (alive && library) showRecentlyRemoved(sheet, { ...context, close: () => closeSheet(shell.more) });
      }, false) }] : [],
      // To check (ticket 13), with its count: agent-written descriptions waiting for OK or Edit.
      ...!modal && adapter.check ? [{ label: toCheckLabel(library?.toCheck), run: () => {
        if (library) showToCheck(sheet, { ...context, close: () => closeSheet(shell.more), pageLabel: page => adapter.usage?.pageLabel?.(page) });
      } }] : [],
      // A picker shows only files that fit the place; Add → Media's (every kind) can narrow to one.
      ...modal && options.accept ? [] : kinds.map(([value, label]) => ({ label, section: "Show", checked: kind === value, run: () => {
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
  function remove(paths: string[], back?: () => void) {
    confirmMediaDelete(sheet, grid, { ...context, pageLabel: page => adapter.usage?.pageLabel?.(page),
      openPage: page => void task(async () => { await adapter.openPage(page); shell.close(); }) }, paths, false, back);
  }
  function optimise(files: File[], existing = false, receipts = new Map<string, string | undefined>()) {
    showMediaOptimise(sheet, context, "", files, existing, receipts);
  }
  wireMediaLibraryInput(shell, {
    draw, loaded: () => Boolean(library), tell,
    add: files => { chooseNext = true; adding.start(files); },
    viewing: () => viewing, manage: () => { if (library) showManageCollections(sheet, collectionHost); },
  }, listeners.signal);
  const ready = task(async () => {
    summary.textContent = "Reading repository images and references…";
    await refresh(); if (options.files?.length && alive) { chooseNext = true; adding.start(options.files); }
  }, false);
  return { element: dialog, ready, get refreshedKey() { return refreshedKey; }, refresh: () => task(refresh, false), dispose,
    review: (files, folder) => { if (alive && library) showMediaOptimise(sheet, context, folder, files); } };
}
