import type { MediaImageQuality } from "./media-optimise";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { basename, type MediaLibraryFilter } from "./media-library-filter";
import { prepareMediaFile, askToAddUnchanged } from "./media-prepare";
import { mediaAddingSettings } from "./media-settings";
import type { MediaImportRequest } from "./media-picker";
import {
  MEDIA_ADDING_WORDS as WORDS, mediaAddingWords, mediaAddingBusy, mediaAddingCancellable, mediaAddingPath, mediaAddingReveal, mediaAddingShown,
  mediaAddingStatus, type MediaAddingState,
} from "./media-adding-rules";
import { createMediaAddingSummary } from "./media-adding-summary";
import type { MediaLibrary, MediaPickerHost } from "./media-picker";

export interface MediaAddingHost {
  hold?: boolean;
  ready?(id: string, request: MediaImportRequest): void;
  select?(id: string, request: MediaImportRequest): void;
  alive(): boolean;
  library(): MediaLibrary;
  /** The grid's search, kind and collection right now. */
  filter(): MediaLibraryFilter;
  import: MediaPickerHost["import"];
  /** The save runs under the busy lock, after `idle` says other changes have finished. */
  task(work: () => Promise<void>): Promise<void>;
  idle(): Promise<void>;
  /** Re-read the library once the new files are saved. */
  refresh(): Promise<void>;
  show(change: Partial<MediaLibraryFilter>): void;
  /** Today's Optimise sheet, with its before/after review, for files not added yet. */
  review(files: File[], collection: string): void;
  /** The files one drop saved, once the library shows them (the picker chooses the first). */
  added?(paths: string[]): void;
  tell(text: string): void;
}
interface Entry {
  quality?: MediaImageQuality; file: File; collection: string; state: MediaAddingState; tile: HTMLElement; words: HTMLElement;
  error?: string; note?: string; request?: MediaImportRequest; id: string; work?: AbortController; path?: string; url?: string;
}
let nextEntry = 0;
const cancellable = (entry: Entry) => mediaAddingCancellable(entry.state);
const problem = (error: unknown) => error instanceof Error ? error.message : "The file could not be added.";

/** Automatic adding (media-manager ticket 06): dropped or chosen files are prepared on today's
 * Optimise path and defaults, one at a time, while the grid stays usable; each shows its
 * progress on a tile of its own and can be cancelled until it is saved. The ready ones are
 * saved together, joining the collection viewed at the drop: one Undo step. The tray is the shared
 * progress summary (slice 31): the total, Cancel, Large download notes, files that could not be
 * added with Retry, and Show new files when the view hides them. */
export function createMediaAdding(grid: HTMLElement, tray: HTMLElement, h: MediaAddingHost) {
  /** The latest drop: its files and the collection they join. An older drop's late steps see
   * their own run, never a newer one, so each drop saves as one batch. */
  let run: { entries: Entry[]; collection: string } = { entries: [], collection: "" }, focused: Entry | undefined;
  const live = (entries: Entry[]) => entries.some(entry => cancellable(entry) || entry.state === "adding");
  const summary = createMediaAddingSummary(tray, {
    showNew: () => h.show(mediaAddingReveal(h.filter(), run.collection)),
    review: () => {
      const rest = run.entries.filter(entry => cancellable(entry) || entry.state === "failed");
      rest.forEach(stop);
      h.review(rest.map(entry => entry.file), run.collection);
      paint();
    },
    cancel: () => { run.entries.filter(cancellable).forEach(stop); paint(); summary.focus(); },
    dismiss: () => { clear(); paint(); h.show({}); },
    retry,
  });

  /** Files that could not be added go round again, in the same addition and collection. */
  function retry() {
    const again = run.entries.filter(entry => entry.state === "failed");
    if (!again.length || mediaAddingBusy(run.entries.map(entry => entry.state), h.hold)) return;
    for (const entry of again) {
      entry.error = entry.note = entry.request = undefined;
      entry.tile = node("article", "media-library__pending"); entry.words = node("span", "media-library__pending-state");
      tile(entry); set(entry, "waiting");
    }
    summary.focus(); void prepare(run);
  }
  function tile(entry: Entry) {
    if (h.hold) {
      // In the picker a ready file is chosen like any tile; Use saves and places it.
      const choose = button("", () => { if (entry.state === "ready" && entry.request) h.select?.(entry.id, entry.request); }, "media-library__pending-select");
      choose.setAttribute("aria-label", `Choose ${entry.file.name}`); choose.setAttribute("aria-pressed", "false"); choose.disabled = true;
      entry.tile.dataset.id = entry.id; entry.tile.append(choose);
    }
    const name = basename(entry.file.name), preview = node("span", "media-library__pending-preview");
    if (entry.file.type.startsWith("image/")) {
      const image = node("img"); image.alt = ""; image.src = entry.url = URL.createObjectURL(entry.file);
      image.addEventListener("error", () => image.replaceWith(icon("file", 28)), { once: true });
      preview.append(image);
    } else preview.append(icon("file", 28));
    const cancel = button("", () => {
      const next = run.entries.filter(other => other === entry || cancellable(other) && visible(other));
      stop(entry); paint();
      // Focus moves to the next tile being added, or to the tray.
      const after = next[next.indexOf(entry) + 1] ?? next[next.indexOf(entry) - 1];
      (after?.tile.querySelector<HTMLElement>(".media-library__pending-cancel") ?? tray.querySelector<HTMLElement>("button:not([hidden])"))?.focus();
    }, "media-library__pending-cancel");
    cancel.dataset.mediaCancel = "adding"; cancel.setAttribute("aria-label", `Cancel adding ${name}`); cancel.append(icon("x", 20));
    entry.tile.append(preview, entry.words, node("span", "media-library__pending-bar"), node("span", "media-library__pending-name", name), cancel);
    entry.tile.addEventListener("focusin", () => { focused = entry; });
    entry.tile.addEventListener("focusout", event => { if (event.relatedTarget) focused = undefined; });
  }
  function set(entry: Entry, state: MediaAddingState) {
    entry.state = state; entry.tile.dataset.state = state;
    const choose = entry.tile.querySelector<HTMLButtonElement>(".media-library__pending-select");
    if (choose) choose.disabled = state !== "ready"; entry.words.textContent = mediaAddingWords(state, entry.quality);
    paint();
  }
  function stop(entry: Entry) {
    entry.work?.abort(); entry.state = "cancelled"; entry.tile.remove();
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = undefined;
  }
  function clear() { run.entries.forEach(stop); run = { entries: [], collection: "" }; }
  /** A tile shows until the redrawn grid has the saved file, and only where the view would show the file. */
  function onGrid(entry: Entry) {
    return cancellable(entry) || entry.state === "adding"
      || entry.state === "added" && !h.library().items.some(item => item.path === entry.path);
  }
  function visible(entry: Entry) {
    const library = h.library();
    return entry.path && library.items.some(item => item.path === entry.path)
      ? mediaAddingShown(library, h.filter(), entry.path, run.collection)
      : mediaAddingShown({ metadata: {}, usage: {} }, h.filter(), entry.path ?? mediaAddingPath(entry.file.name), run.collection);
  }
  /** Tiles first in the grid, then the tray; the view calls it after each draw. */
  function paint() {
    if (!h.alive()) return;
    const { entries } = run;
    const shown = entries.filter(entry => onGrid(entry) && visible(entry));
    for (const entry of entries) {
      if (shown.includes(entry)) continue;
      entry.tile.remove();
      // Saved (its own tile shows now) or failed: the preview is done with.
      if (!onGrid(entry) && entry.url) { URL.revokeObjectURL(entry.url); entry.url = undefined; }
    }
    if (shown.length) {
      grid.querySelector(".media-library__empty")?.remove();
      if (shown.some((entry, index) => grid.children[index] !== entry.tile)) grid.prepend(...shown.map(entry => entry.tile));
      // A redraw replaced the grid's contents; a cancel button that had focus gets it back.
      if (focused && shown.includes(focused) && (document.activeElement === document.body || !document.activeElement?.isConnected))
        focused.tile.querySelector<HTMLElement>(".media-library__pending-cancel")?.focus();
    }
    const { text, running } = mediaAddingStatus(entries.map(entry => entry.state));
    summary.paint({
      entries: entries.map(entry => ({ quality: entry.quality, name: entry.file.name, state: entry.state, error: entry.error, note: entry.note })),
      hold: h.hold,
      text: h.hold && !entries.some(entry => entry.state === "waiting" || entry.state === "preparing")
        ? `${entries.filter(entry => entry.state === "ready").length} ready · Use saves and places; Close saves without placing.` : text,
      showNew: entries.some(entry => entry.state !== "cancelled" && entry.state !== "failed" && !visible(entry)),
      review: entries.some(entry => entry.state === "failed" || running && cancellable(entry)),
    });
  }
  async function prepare(mine: typeof run) {
    // The site's remembered image quality and Keep original when this addition starts preparing.
    const { key, adding } = h.library(), { image: quality, video: videoQuality, keepOriginal } = mediaAddingSettings(adding);
    for (const entry of mine.entries) {
      if (!h.alive()) return;
      if (entry.state !== "waiting") continue;
      const work = entry.work = new AbortController();
      entry.quality = quality;
      set(entry, "preparing");
      try {
        const prepared = await prepareMediaFile(entry.file, key, undefined, work.signal, undefined, askToAddUnchanged, undefined, quality, keepOriginal, videoQuality);
        // Cancelling (or Review…) aborts the work and leaves the file alone.
        if (!work.signal.aborted) {
          entry.request = { ...prepared.request, ...entry.collection ? { collection: entry.collection } : {} };
          // A Large download note stays in the summary with its file.
          entry.note = prepared.warning;
          set(entry, "ready");
          h.ready?.(entry.id, entry.request);
        }
      } catch (error) {
        if (!work.signal.aborted) { entry.error = problem(error); set(entry, "failed"); }
      }
    }
    if (!h.hold) await save(mine);
  }
  async function save(mine: typeof run) {
    while (h.alive()) {
      await h.idle();
      const ready = mine.entries.filter(entry => entry.state === "ready");
      if (!ready.length || !h.alive()) break;
      let ran = false;
      await h.task(async () => {
        ran = true;
        const library = h.library(), { collection } = mine, join = collection && library.collections.includes(collection) ? collection : "";
        ready.forEach(entry => set(entry, "adding"));
        let paths: string[];
        try {
          paths = await h.import(ready.map(entry => ({ ...entry.request!, collection: join || undefined })));
        } catch (error) {
          ready.forEach(entry => { entry.error = problem(error); set(entry, "failed"); });
          return;
        }
        if (collection !== join) h.tell(`The collection "${collection}" no longer exists, so the new files are under All collections.`);
        mine.collection = join;
        ready.forEach((entry, index) => { entry.path = paths[index]; set(entry, "added"); });
        await h.refresh();
        h.added?.(paths);
      });
      if (ran) break;
      // A refresh began before the lock was free; try again once it has finished.
      await new Promise(resume => setTimeout(resume, 100));
    }
    paint();
  }
  return {
    start(files: File[]) {
      if (run.entries.some(entry => h.hold ? ["waiting", "preparing", "adding"].includes(entry.state) : live([entry]))) { h.tell("Files are still being added. Try again when they finish."); return; }
      const previous = h.hold ? run.entries : [];
      if (!h.hold) clear();
      const mine = { entries: [] as Entry[], collection: h.filter().collection };
      mine.entries = files.map(file => {
        const entry: Entry = { file, collection: mine.collection, id: `pending:${++nextEntry}`, state: "waiting", tile: node("article", "media-library__pending"), words: node("span", "media-library__pending-state") };
        tile(entry); entry.tile.dataset.state = "waiting"; entry.words.textContent = WORDS.waiting!;
        return entry;
      });
      run = h.hold ? { entries: [...previous, ...mine.entries], collection: mine.collection } : mine;
      paint(); void prepare(mine);
    },
    reviewed(requests: MediaImportRequest[]) {
      const entries = requests.map(request => {
        const entry: Entry = { file: request.file, collection: request.collection ?? "", request, id: `pending:${++nextEntry}`, state: "ready", tile: node("article", "media-library__pending"), words: node("span", "media-library__pending-state") };
        tile(entry); set(entry, "ready"); return entry;
      });
      run.entries.push(...entries); paint();
      return entries.map(entry => entry.id);
    },
    /** The picker's ready files, not saved yet. */
    held() { return run.entries.filter(entry => entry.state === "ready" && entry.request).map(entry => ({ id: entry.id, request: entry.request! })); },
    /** Hold the ready files (or those of `ids`) for one save: they show Adding… and no other save takes them. */
    take(ids?: string[]) {
      const ready = run.entries.filter(entry => entry.state === "ready" && entry.request && (!ids || ids.includes(entry.id)));
      ready.forEach(entry => set(entry, "adding"));
      return ready.map(entry => ({ id: entry.id, request: entry.request! }));
    },
    /** A save ended: saved with `paths`, or (without) back to ready. */
    settle(ids: string[], paths?: string[]) {
      for (const entry of run.entries) {
        const at = ids.indexOf(entry.id);
        if (at < 0 || entry.state !== "adding") continue;
        if (paths) { entry.path = paths[at]; set(entry, "added"); } else set(entry, "ready");
      }
    },
    /** Files still waiting or preparing, stopped; how many. */
    cancelPending() {
      const pending = run.entries.filter(entry => entry.state === "waiting" || entry.state === "preparing");
      pending.forEach(stop); paint(); return pending.length;
    },
    /** The collection the files join follows its rename. */
    renamed(from: string, to: string) {
      if (run.collection === from) run.collection = to;
      for (const entry of run.entries) if (entry.collection === from) {
        entry.collection = to;
        if (entry.request) entry.request.collection = to;
      }
    },
    paint,
    dispose: clear,
  };
}
