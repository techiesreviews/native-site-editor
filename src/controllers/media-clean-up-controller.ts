import { sitePathPrefix } from "../../shared/site-path-prefix";
import { MEDIA_RECORDS_PATH, parseMediaRecords, type MediaRecords } from "../../shared/media-records";
import { mediaCleanUpSuggestions, type MediaCleanUpSuggestions } from "../page-builder/media-clean-up";
import { badgeKeys, cleanUpMenuItem, improveMenuItem, mediaBadge, readDismissed, type MediaBadge } from "../page-builder/media-badge";
import type { MediaUsageRecords } from "../page-builder/media-usage";

/** `suggestions`: the newest check, which Clean up's screen reads. `counted` and `improve`: the last
 * check whose Clean up suggestions and Improve images rows (the pages and components it would
 * change) were both known. The badge and More's two counts come only from that pair, so they
 * always add up (ticket 11: badge = Clean up + Improve images) and never show half a check. */
export interface MediaCleanUpState { place: string; suggestions: MediaCleanUpSuggestions; badge: MediaBadge; counted?: MediaCleanUpSuggestions; improve?: string[] }
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
  blob?(path: string): Promise<Blob>;
  /** The Git blob SHA of a path's present bytes, when known: a width read is reused while it holds. */
  version?(path: string): string | undefined;
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
  /** One settled check: the badge and More's counts move together, once. */
  function publish(place: string, counted: MediaCleanUpSuggestions, improve: string[] | undefined) {
    // With nothing left, a later suggestion is new even if it was dismissed before.
    if (place && counted.state === "ready" && !counted.count && !improve?.length && dismissed(place)) remember(place, undefined);
    current = { place, suggestions: current.suggestions, counted, badge: mediaBadge(counted, dismissed(place), improve), ...improve ? { improve } : {} };
    ports.changed(current);
  }
  /** Picture widths Improve images read from the bytes, so the count matches its screen. */
  const known = new Map<string, { width?: number; height?: number }>();
  /** Widths this controller read, by the bytes they were read from: each check reads only new bytes. */
  const readSizes = new Map<string, { version: string; size: { width?: number; height?: number } }>();
  /** Read the same missing facts as the screen, after Clean up has published. */
  async function improveRows(records: MediaRecords | null, holds: () => boolean): Promise<string[] | undefined> {
    const pages = ports.pages?.(), components = ports.components?.();
    if (!pages || !components || !records) return undefined;
    const [{ improveImagesPlan }, { isMediaFile, isMediaTextFile }, { mediaOwnOrigins }, { planWithPictureSizes }, { decodeImage }] = await Promise.all([
      import("../page-builder/improve-images"), import("../page-builder/media-mentions"), import("../page-builder/media-origins"), import("../page-builder/improve-images-facts"), import("../page-builder/media-byte-cache")]);
    const files = ports.files(), sources: Record<string, string | undefined> = {};
    for (const path of files) if (isMediaTextFile(path)) sources[path] = ports.source(path);
    // Each check owns its facts: replacing bytes at the same path or switching sites cannot
    // leave a cached width behind. The screen's sizes remain a fallback for older ports.
    const sizes: Record<string, { width?: number; height?: number }> = ports.blob ? Object.fromEntries(files.flatMap(path => {
      const version = ports.version?.(path), hit = readSizes.get(path);
      return version && hit?.version === version ? [[path, hit.size]] : [];
    })) : Object.fromEntries(known);
    const plan = await planWithPictureSizes({ plan: async widths => {
      const facts = Object.fromEntries(files.filter(isMediaFile).map(path => [path, { size: ports.size?.(path), ...ports.blob ? {} : { width: 0 }, ...widths[path] }]));
      return improveImagesPlan({ sources, pages, components, files: facts, records, site: { prefix: sitePathPrefix(ports.url?.()), origins: mediaOwnOrigins(ports.url?.()) } });
    } }, sizes, async path => {
      if (!ports.blob) return {};
      const version = ports.version?.(path), blob = await ports.blob(path), url = URL.createObjectURL(blob);
      try {
        const size = await decodeImage(url);
        // Bytes replaced (or another check begun) while reading: the width is used once, never kept.
        if (version && size.width && holds() && ports.version?.(path) === version) readSizes.set(path, { version, size });
        return size;
      } finally { URL.revokeObjectURL(url); }
    });
    return plan.rows.filter(row => row.count).map(row => row.file);
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
    if (place !== current.place) { known.clear(); readSizes.clear(); }
    const read = usage && await records();
    const suggestions = usage ? mediaCleanUpSuggestions({ usage, records: read ?? null }) : notChecked();
    if (disposed || request !== epoch || place !== ports.place()) return;
    // While the same site is checked again, the badge and More keep their last counts (no flicker),
    // but nothing unchecked is offered: Clean up waits until the check is done.
    if (suggestions.state === "not-checked" && place === current.place) {
      current = { ...current, suggestions };
      ports.changed(current);
      return;
    }
    // Clean up's screen opens on these at once; the counts wait for Improve images' rows below,
    // so the badge never shows Clean up's count alone (slice 121: 10, then 15 a moment later).
    current = place === current.place ? { ...current, suggestions } : { place, suggestions, badge: { count: 0, show: false } };
    ports.changed(current);
    const improve = await improveRows(read ?? null, () => !disposed && request === epoch && place === ports.place()).catch(() => undefined);
    if (disposed || request !== epoch || place !== ports.place()) return;
    // Rows that could not be read keep the last ones: a failed read is not "nothing to improve".
    publish(place, suggestions, improve ?? current.improve);
  }
  /** Hides the count until a file not suggested now is suggested. */
  function dismiss() {
    const { place, counted, improve } = current;
    if (disposed || !place || current.suggestions.state !== "ready" || counted?.state !== "ready" || !current.badge.show) return;
    remember(place, badgeKeys(counted, improve));
    publish(place, counted, improve);
  }
  return {
    update, dismiss, state: () => current, item: () => cleanUpMenuItem(current.suggestions, current.counted ?? null),
    improveItem: () => improveMenuItem(current.improve?.length),
    /** Widths read by the Improve images screen; the next check counts with them. */
    known(sizes: Readonly<Record<string, { width?: number; height?: number }>>) { for (const [path, size] of Object.entries(sizes)) known.set(path, size); },
    /** A draft changed: an update still reading must not publish what it read before. */
    invalidate() { epoch++; },
    dispose() { disposed = true; epoch++; },
  };
}
