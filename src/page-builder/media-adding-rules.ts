import type { MediaImageQuality } from "./media-optimise";
import { filterMediaLibrary, type MediaLibraryFilter } from "./media-library-filter";
import { mediaKindFolder, mediaNeedsPreparation, mediaStorageName } from "./media-storage";
import type { MediaLibrary } from "./media-picker";

/** One dropped file's way through automatic adding (ticket 06, "Adding by drop"). */
export type MediaAddingState = "waiting" | "preparing" | "ready" | "adding" | "added" | "failed" | "cancelled";

const files = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/** The tray's words and bar: files settled out of the files still being added. */
export function mediaAddingStatus(states: readonly MediaAddingState[]) {
  const active = states.filter(state => state !== "cancelled");
  const added = active.filter(state => state === "added").length, failed = active.filter(state => state === "failed").length;
  const running = active.some(state => state === "waiting" || state === "preparing" || state === "ready" || state === "adding");
  const done = active.filter(state => state === "ready" || state === "added" || state === "failed").length;
  const text = running ? `Adding ${files(active.length)}`
    : added && failed ? `Added ${files(added)} · ${failed} could not be added`
      : failed ? `${files(failed)} could not be added`
        : added ? `Added ${files(added)}` : "";
  return { text, running, done, total: active.length };
}

/** Whether the grid's filter shows a file once added: `path` is its library path, or its
 * expected one while it is being prepared, and it joins `collection` (empty for All). */
export function mediaAddingShown(library: Pick<MediaLibrary, "metadata" | "usage">, filter: MediaLibraryFilter, path: string, collection: string) {
  const known = library.metadata[path];
  const metadata = { [path]: known ?? { alt: "", tags: collection ? [collection] : [] } };
  return filterMediaLibrary({ key: "", collections: [], items: [{ path }], metadata, usage: library.usage }, filter).length > 0;
}

/** Predict the automatic destination before raster preparation finishes. */
export function mediaAddingPath(name: string) {
  const output = mediaStorageName(name, mediaNeedsPreparation(name) ? "webp" : undefined);
  return mediaKindFolder(output) + "/" + output;
}

/** "Show new files": clear the search and kind; from another collection, view the one they joined. */
export function mediaAddingReveal(filter: MediaLibraryFilter, collection: string): Partial<MediaLibraryFilter> {
  return { query: "", kind: "all", ...filter.collection && filter.collection !== collection ? { collection } : {} };
}

/** A file's words while it is being added: on its tile, or on its row where there are no tiles. */
export const MEDIA_ADDING_WORDS: Partial<Record<MediaAddingState, string>> = { waiting: "Waiting", preparing: "Preparing…", ready: "Ready", adding: "Adding…", added: "Adding…" };

/** Smallest files takes longer, including the encoder download and responsive copies. */
export const mediaAddingWords = (state: MediaAddingState, quality?: MediaImageQuality) =>
  state === "preparing" && quality === "smallest" ? "Preparing (slower)…" : MEDIA_ADDING_WORDS[state] ?? "";

/** A file that can still be stopped: it is not being saved yet. */
export const mediaAddingCancellable = (state: MediaAddingState) => state === "waiting" || state === "preparing" || state === "ready";

/** What the progress summary offers (ticket 07): Cancel while a file can still be stopped; Retry
 * once nothing is running and some files failed; Dismiss when finished, except in the picker,
 * whose Use and Cancel end the addition. The picker holds ready files for Use, so there they do
 * not keep Retry away. */
export function mediaAddingOffers(states: readonly MediaAddingState[], hold = false) {
  const { running } = mediaAddingStatus(states);
  return { cancel: states.some(mediaAddingCancellable), retry: !mediaAddingBusy(states, hold) && states.includes("failed"), dismiss: !running && !hold };
}
/** Files are still on their way: Retry waits (in the picker, held ready files do not count). */
export const mediaAddingBusy = (states: readonly MediaAddingState[], hold = false) =>
  states.some(state => state === "waiting" || state === "preparing" || state === "adding" || !hold && state === "ready");

/** The files Review… takes to the Optimise sheet from Files: pictures not saved yet, or that failed.
 * Other kinds keep going (the sheet's before/after is for images). */
export const mediaAddingReviewable = (name: string, state: MediaAddingState) =>
  (mediaAddingCancellable(state) || state === "failed") && mediaNeedsPreparation(name);

/** A failed file's line: its reason and advice, named once. */
export const mediaAddingFailedLine = (name: string, error = "The file could not be added.") =>
  error.includes(name) ? error : `${name}: ${error}`;
