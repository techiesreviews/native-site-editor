import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { basename, type MediaLibraryFilter } from "./media-library-filter";
import { buildMediaImportRequests, readMediaOptimiseDefaults } from "./media-library-optimise-rules";
import { optimiseMedia, type MediaOptimiseResult } from "./media-optimise";
import {
  MEDIA_ADDING_FOLDER, mediaAddingPath, mediaAddingReveal, mediaAddingShown, mediaAddingStatus, type MediaAddingState,
} from "./media-adding-rules";
import type { MediaLibrary, MediaPickerHost } from "./media-picker";

export interface MediaAddingHost {
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
  tell(text: string): void;
}
interface Entry {
  file: File; state: MediaAddingState; tile: HTMLElement; words: HTMLElement;
  error?: string; result?: MediaOptimiseResult; work?: AbortController; path?: string; url?: string;
}
const WORDS: Partial<Record<MediaAddingState, string>> = { waiting: "Waiting", preparing: "Preparing…", ready: "Ready", adding: "Adding…", added: "Adding…" };
const cancellable = (entry: Entry) => entry.state === "waiting" || entry.state === "preparing" || entry.state === "ready";
const problem = (error: unknown) => error instanceof Error ? error.message : "The file could not be added.";

/** Automatic adding (media-manager ticket 06): dropped or chosen files are prepared on today's
 * Optimise path and defaults, one at a time, while the grid stays usable; each shows its
 * progress on a tile of its own and can be cancelled until it is saved. The ready ones are
 * saved together, joining the collection viewed at the drop: one Undo step. The tray keeps the
 * total, Cancel, files that could not be added, and Show new files when the view hides them. */
export function createMediaAdding(grid: HTMLElement, tray: HTMLElement, h: MediaAddingHost) {
  /** The latest drop: its files and the collection they join. An older drop's late steps see
   * their own run, never a newer one, so each drop saves as one batch. */
  let run: { entries: Entry[]; collection: string } = { entries: [], collection: "" }, focused: Entry | undefined;
  const live = (entries: Entry[]) => entries.some(entry => cancellable(entry) || entry.state === "adding");
  const status = node("p", "media-library__adding-status"); status.setAttribute("role", "status");
  const bar = node("progress", "media-library__adding-bar"); bar.setAttribute("aria-label", "Files added");
  const failed = node("ul", "media-library__adding-failed");
  const showNew = button("Show new files", () => h.show(mediaAddingReveal(h.filter(), run.collection)));
  const review = button("Review…", () => {
    const rest = run.entries.filter(entry => cancellable(entry) || entry.state === "failed");
    rest.forEach(stop);
    h.review(rest.map(entry => entry.file), run.collection);
    paint();
  });
  const cancelAll = button("Cancel", () => { run.entries.filter(cancellable).forEach(stop); paint(); tray.querySelector<HTMLElement>("button:not([hidden])")?.focus(); });
  const dismiss = button("", () => { clear(); paint(); h.show({}); }, "media-library__adding-dismiss");
  dismiss.setAttribute("aria-label", "Dismiss"); dismiss.append(icon("x", 20));
  for (const control of [cancelAll, dismiss, showNew]) control.dataset.mediaCancel = "adding";
  const head = node("div", "media-library__adding-head"), actions = node("div", "media-library__adding-actions");
  actions.append(showNew, review, cancelAll, dismiss);
  head.append(status, actions); tray.append(head, bar, failed);

  function tile(entry: Entry) {
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
    entry.state = state; entry.tile.dataset.state = state; entry.words.textContent = WORDS[state] ?? "";
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
    const { text, running, done, total } = mediaAddingStatus(entries.map(entry => entry.state));
    tray.hidden = !text; status.textContent = text;
    bar.hidden = !running; bar.max = Math.max(1, total); bar.value = done;
    failed.replaceChildren(...entries.filter(entry => entry.state === "failed").map(entry =>
      node("li", "", `${basename(entry.file.name)}: ${entry.error}`)));
    showNew.hidden = !entries.some(entry => entry.state !== "cancelled" && entry.state !== "failed" && !visible(entry));
    review.hidden = !entries.some(entry => entry.state === "failed" || running && cancellable(entry));
    cancelAll.hidden = !entries.some(cancellable); dismiss.hidden = running;
  }
  async function prepare(mine: typeof run) {
    const settings = readMediaOptimiseDefaults(h.library().key);
    for (const entry of mine.entries) {
      if (!h.alive()) return;
      if (entry.state !== "waiting") continue;
      const work = entry.work = new AbortController();
      set(entry, "preparing");
      try {
        const result = await optimiseMedia(entry.file, settings, work.signal);
        // Cancelling (or Review…) aborts the work and leaves the file alone.
        if (!work.signal.aborted) { entry.result = result; set(entry, "ready"); }
      } catch (error) {
        if (!work.signal.aborted) { entry.error = problem(error); set(entry, "failed"); }
      }
    }
    await save(mine);
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
          paths = await h.import(buildMediaImportRequests(ready.map(({ file, result }) => ({ file, result: result! })),
            false, MEDIA_ADDING_FOLDER, library.metadata, true, new Map(), join));
        } catch (error) {
          ready.forEach(entry => { entry.error = problem(error); set(entry, "failed"); });
          return;
        }
        if (collection !== join) h.tell(`The collection "${collection}" no longer exists, so the new files are under All collections.`);
        mine.collection = join;
        ready.forEach((entry, index) => { entry.path = paths[index]; set(entry, "added"); });
        await h.refresh();
      });
      if (ran) break;
      // A refresh began before the lock was free; try again once it has finished.
      await new Promise(resume => setTimeout(resume, 100));
    }
    paint();
  }
  return {
    start(files: File[]) {
      if (live(run.entries)) { h.tell("Files are still being added. Try again when they finish."); return; }
      clear();
      const mine = run = { entries: [] as Entry[], collection: h.filter().collection };
      mine.entries = files.map(file => {
        const entry: Entry = { file, state: "waiting", tile: node("article", "media-library__pending"), words: node("span", "media-library__pending-state") };
        tile(entry); entry.tile.dataset.state = "waiting"; entry.words.textContent = WORDS.waiting!;
        return entry;
      });
      paint(); void prepare(mine);
    },
    /** The collection the files join follows its rename. */
    renamed(from: string, to: string) { if (run.collection === from) run.collection = to; },
    paint,
    dispose: clear,
  };
}
