import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords } from "../../shared/media-records";
import { mediaCleanUpSuggestions, type MediaCleanUpSuggestions } from "../page-builder/media-clean-up";
import { badgeKeys, cleanUpMenuItem, improveMenuItem, mediaBadge, readDismissed, type MediaBadge } from "../page-builder/media-badge";
import type { MediaUsageRecords } from "../page-builder/media-usage";

/** `improve`: the pages and components Improve images would change (ticket 11: the badge counts them). */
export interface MediaCleanUpState { place: string; suggestions: MediaCleanUpSuggestions; badge: MediaBadge; improve?: string[] }
export interface MediaCleanUpPorts {
  /** The repository and branch, "" when none is open; a dismiss is remembered per place. */
  place(): string;
  files(): string[];
  source(path: string): string | undefined;
  read(path: string): Promise<string | undefined>;
  /** Where a dismiss is kept between visits; the browser may refuse it. */
  storage?(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  changed(state: MediaCleanUpState): void;
  /** For Improve images' count: the site's pages, components, address and file sizes. */
  pages?(): string[];
  components?(): Record<string, string>;
  url?(): string | undefined;
  size?(path: string): number | undefined;
}

const notChecked = (): MediaCleanUpSuggestions => ({ state: "not-checked", blockedBy: [], groups: [], count: 0, size: 0 });
const storageKey = (place: string) => `ase.media-clean-up.dismissed:${place}`;

/** Turns each wide use check into Clean up's suggestions and the Media tab's count. Lives in
 * the lazy usage chunk; the host draws `changed` states. */
export function createMediaCleanUpController(ports: MediaCleanUpPorts) {
  let epoch = 0, disposed = false;
  let current: MediaCleanUpState = { place: "", suggestions: notChecked(), badge: { count: 0, show: false } };
  // The browser may refuse storage; a dismiss still holds for this visit.
  const memory = new Map<string, string[] | undefined>();
  const storage = <T>(use: (store: Pick<Storage, "getItem" | "setItem" | "removeItem">) => T) => {
    try { const store = ports.storage?.(); return store ? use(store) : undefined; } catch { return undefined; }
  };
  function dismissed(place: string) {
    return memory.has(place) ? memory.get(place) : readDismissed(storage(store => store.getItem(storageKey(place))));
  }
  function remember(place: string, files: string[] | undefined) {
    memory.set(place, files);
    storage(store => files ? store.setItem(storageKey(place), JSON.stringify(files)) : store.removeItem(storageKey(place)));
  }
  function publish(place: string, suggestions: MediaCleanUpSuggestions, improve = current.place === place ? current.improve : undefined) {
    // With nothing left, a later suggestion is new even if it was dismissed before.
    if (place && suggestions.state === "ready" && !suggestions.count && !improve?.length && dismissed(place)) remember(place, undefined);
    current = { place, suggestions, badge: mediaBadge(suggestions, dismissed(place), improve), ...improve ? { improve } : {} };
    ports.changed(current);
  }
  /** Picture widths Improve images read from the bytes, so the count matches its screen. */
  const known = new Map<string, { width?: number; height?: number }>();
  /** The rows Improve images would list. Without read widths a picture is judged by its bytes alone. */
  async function improveRows(records: MediaRecords | null): Promise<string[] | undefined> {
    const pages = ports.pages?.(), components = ports.components?.();
    if (!pages || !components || !records) return undefined;
    const [{ improveImagesPlan }, { isMediaFile, isMediaTextFile }, { mediaOwnOrigins }] = await Promise.all([
      import("../page-builder/improve-images"), import("../page-builder/media-mentions"), import("../page-builder/media-origins")]);
    const files = ports.files(), sources: Record<string, string | undefined> = {};
    for (const path of files) if (isMediaTextFile(path)) sources[path] = ports.source(path);
    const facts = Object.fromEntries(files.filter(isMediaFile).map(path => [path, { size: ports.size?.(path), width: 0, ...known.get(path) }]));
    return improveImagesPlan({ sources, pages, components, files: facts, records, site: { origins: mediaOwnOrigins(ports.url?.()) } })
      .rows.filter(row => row.count).map(row => row.file);
  }
  async function records(): Promise<MediaRecords | null> {
    let text = ports.source(MEDIA_RECORDS_PATH);
    if (text === undefined && ports.files().includes(MEDIA_RECORDS_PATH)) {
      try { text = await ports.read(MEDIA_RECORDS_PATH); } catch { return null; }
      if (text === undefined) return null;
    }
    try { return parseMediaRecords(text); } catch { return null; }
  }
  async function update(usage: MediaUsageRecords | undefined) {
    if (disposed) return;
    const request = ++epoch, place = ports.place();
    if (place !== current.place) known.clear();
    const read = usage && await records();
    const suggestions = usage ? mediaCleanUpSuggestions({ usage, records: read ?? null }) : notChecked();
    const improve = usage ? await improveRows(read ?? null).catch(() => undefined) : undefined;
    if (disposed || request !== epoch || place !== ports.place()) return;
    // While the same site is checked again, the badge keeps its last count (no flicker), but
    // nothing unchecked is offered: Clean up waits until the check is done.
    if (suggestions.state === "not-checked" && place === current.place) {
      current = { ...current, suggestions };
      ports.changed(current);
      return;
    }
    publish(place, suggestions, improve);
  }
  /** Hides the count until a file not suggested now is suggested. */
  function dismiss() {
    if (disposed || !current.place || current.suggestions.state !== "ready" || !current.badge.show) return;
    remember(current.place, badgeKeys(current.suggestions, current.improve));
    publish(current.place, current.suggestions);
  }
  return {
    update, dismiss, state: () => current, item: () => cleanUpMenuItem(current.suggestions),
    improveItem: () => improveMenuItem(current.improve?.length),
    /** Widths read by the Improve images screen; the next check counts with them. */
    known(sizes: Readonly<Record<string, { width?: number; height?: number }>>) { for (const [path, size] of Object.entries(sizes)) known.set(path, size); },
    /** A draft changed: an update still reading must not publish what it read before. */
    invalidate() { epoch++; },
    dispose() { disposed = true; epoch++; },
  };
}
