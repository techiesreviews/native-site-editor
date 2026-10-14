import { basename, filterMediaLibrary, type MediaLibraryFilter } from "./media-library-filter";
import type { MediaLibrary } from "./media-picker";

/** One dropped file's way through automatic adding (ticket 06, "Adding by drop"). */
export type MediaAddingState = "waiting" | "preparing" | "ready" | "adding" | "added" | "failed" | "cancelled";

/** Today's upload folder until slice 24 decides `media/images/`. */
export const MEDIA_ADDING_FOLDER = "images";

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

/** Where a file being prepared will be found: today's folder and its dropped name. */
export const mediaAddingPath = (name: string) => `${MEDIA_ADDING_FOLDER}/${basename(name)}`;

/** "Show new files": clear the search and kind; from another collection, view the one they joined. */
export function mediaAddingReveal(filter: MediaLibraryFilter, collection: string): Partial<MediaLibraryFilter> {
  return { query: "", kind: "all", ...filter.collection && filter.collection !== collection ? { collection } : {} };
}
