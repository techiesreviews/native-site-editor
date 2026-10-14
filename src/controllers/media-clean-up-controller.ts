import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords } from "../../shared/media-records";
import { mediaCleanUpSuggestions, type MediaCleanUpSuggestions } from "../page-builder/media-clean-up";
import { cleanUpMenuItem, mediaBadge, readDismissed, suggestedFiles, type MediaBadge } from "../page-builder/media-badge";
import type { MediaUsageRecords } from "../page-builder/media-usage";

export interface MediaCleanUpState { place: string; suggestions: MediaCleanUpSuggestions; badge: MediaBadge }
export interface MediaCleanUpPorts {
  /** The repository and branch, "" when none is open; a dismiss is remembered per place. */
  place(): string;
  files(): string[];
  source(path: string): string | undefined;
  read(path: string): Promise<string | undefined>;
  /** Where a dismiss is kept between visits; the browser may refuse it. */
  storage?(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  changed(state: MediaCleanUpState): void;
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
  function publish(place: string, suggestions: MediaCleanUpSuggestions) {
    // With nothing left, a later suggestion is new even if it was dismissed before.
    if (place && suggestions.state === "ready" && !suggestions.count && dismissed(place)) remember(place, undefined);
    current = { place, suggestions, badge: mediaBadge(suggestions, dismissed(place)) };
    ports.changed(current);
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
    const suggestions = usage ? mediaCleanUpSuggestions({ usage, records: await records() }) : notChecked();
    if (disposed || request !== epoch || place !== ports.place()) return;
    // While the same site is checked again, the badge keeps its last count (no flicker), but
    // nothing unchecked is offered: Clean up waits until the check is done.
    if (suggestions.state === "not-checked" && place === current.place) {
      current = { place, suggestions, badge: current.badge };
      ports.changed(current);
      return;
    }
    publish(place, suggestions);
  }
  /** Hides the count until a file not suggested now is suggested. */
  function dismiss() {
    if (disposed || !current.place || current.suggestions.state !== "ready" || !current.badge.show) return;
    remember(current.place, suggestedFiles(current.suggestions));
    publish(current.place, current.suggestions);
  }
  return {
    update, dismiss, state: () => current, item: () => cleanUpMenuItem(current.suggestions),
    /** A draft changed: an update still reading must not publish what it read before. */
    invalidate() { epoch++; },
    dispose() { disposed = true; epoch++; },
  };
}
