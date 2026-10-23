import type { AddingSettings, MediaRecords, OnlineVideoRecord, RemovedMedia } from "../../shared/media-records";
type OnlineVideoKey = { service: "youtube" | "vimeo"; id: string };
import type { MediaCleanUpSuggestions } from "./media-clean-up";
import type { MediaCollectionChange } from "./media-collections";
import { node } from "../ui/dom";
import type { MediaMetadata, MediaMetadataMap } from "./media-metadata";
import type { MediaImage } from "./media-markup";
import type { MediaOptimiseResult } from "./media-optimise";
import type { MediaUsage } from "./media-references";
import type { MediaUsageRecords } from "./media-usage";
import type { MediaToCheckRow } from "./media-descriptions";
import type { MediaAddingChoices } from "./media-settings";
import type { MediaReplaceRequest } from "./media-workspace";
import { createMediaLibraryView, type MediaLibraryView } from "./media-library-view";
export { isMediaLibraryPath } from "./media-library-filter";

/** A YouTube or Vimeo video recorded in Media (slices 67, 68): `key` is "online:<service>:<id>";
 * `uses` the HTML files that show it; `still` its picture while that is in the site. */
export interface MediaOnlineVideo {
  key: string; service: "youtube" | "vimeo"; id: string; hash?: string; title?: string; still?: string; stillCopied?: boolean; serviceBar?: boolean; uses: string[];
}
export interface MediaLibraryItem {
  path: string; size?: number;
  /** When the file was added, in milliseconds: its record's `added`, else an unsaved upload's time. */
  date?: number;
  draft?: boolean; version?: string;
}
export interface MediaLibrary {
  githubPages?: boolean;
  prefix?: string;
  key: string; collections: string[]; items: MediaLibraryItem[]; metadata: MediaMetadataMap; usage: Record<string, MediaUsage>;
  /** Files that show the Always keep mark: each kept file and the main of each family with a kept member. */
  keep?: string[];
  removed?: RemovedMedia[];
  /** To check: agent-written words Lex has not checked, in file order. */
  toCheck?: MediaToCheckRow[];
  /** The site's Adding settings: its remembered choices over the defaults (`media-settings.ts`). */
  adding?: AddingSettings;
  /** The repository's size in KiB as GitHub reports it; absent for local folders. */
  repoSize?: number;
  /** YouTube and Vimeo videos, listed under Video. */
  onlineVideos?: MediaOnlineVideo[];
}
export interface MediaPickerHost {
  begin?(): void;
  load(): Promise<MediaLibrary>;
  blob(path: string): Promise<Blob>;
  metadata(changes: Record<string, Partial<MediaMetadata> | null>): Promise<void>;
  collections(change: MediaCollectionChange): Promise<void>;
  /** `keepOldAddress` forwards the old addresses (default: when the file is Always keep). */
  rename(path: string, name: string, options?: { keepOldAddress?: boolean }): Promise<void>;
  /** File details' Save as one step: the file's fields and, when `name` is given, its rename. */
  details?(path: string, changes: Partial<MediaMetadata>, name?: string, options?: { keepOldAddress?: boolean }): Promise<void>;
  /** To check: without `text`, Looks right (the words stay, the by-agent mark goes); with it, Lex's words
   * replace the agent's, which clears the mark too. One Undo step either way. `row.text` is the
   * words Lex saw: newer agent words refuse, so nothing is approved unseen. */
  check?(row: MediaToCheckRow, text?: string): Promise<void>;
  /** A video's still picture (slice 66): a moment's WebP saved beside it, or a picture in Media.
   * Every placed copy of the video shows it, and new places use it. One Undo step. */
  still?(video: string, still: { blob: Blob } | { path: string }): Promise<void>;
  /** A video's or audio file's subtitles (slice 66): a .vtt or .srt saved as WebVTT beside it and added
   * to every placed copy (CC on video, Transcript on audio); `null` takes them off. One Undo step. */
  subtitles?(media: string, file: { name: string; text: string } | null): Promise<void>;
  restore?(entries: { path: string; id: string }[]): Promise<void>;
  /** Replace everywhere (ticket 15): the new picture takes over the file's name and address; returns its main path. */
  replace?(request: MediaReplaceRequest): Promise<string>;
  /** A removed file's bytes (`id` as for `restore`), for Recently removed's pictures. */
  removedBlob?(entry: { path: string; id: string }): Promise<Blob>;
  remove(paths: string[], unusedOnly?: boolean): Promise<void>;
  import(requests: MediaImportRequest[], place?: MediaPlacement): Promise<string[]>;
  /** An online video recorded without a copied still, with an optional placement (slice 67). */
  onlineVideo?(record: OnlineVideoRecord, place?: MediaPlacement): Promise<void>;
  /** An online video's still swapped for a picture in Media, everywhere it is placed. One Undo step. */
  onlineVideoStill?(key: OnlineVideoKey, still: { path: string; width?: number; height?: number }): Promise<void>;
  /** "Show Vimeo's own bar" for every placed copy of the video. One Undo step. */
  onlineVideoServiceBar?(key: OnlineVideoKey, enabled: boolean): Promise<void>;
  /** Takes the video out of Media; pages keep it and the service is never contacted. */
  removeOnlineVideo?(key: OnlineVideoKey): Promise<void>;
  /** Adding settings: remember changed choices for this site, or "reset" to the defaults. One Undo step. */
  adding?(change: Partial<MediaAddingChoices> | "reset"): Promise<void>;
  /** Improve images (ticket 11): its plan, row fixes, their Undo and left-as-is pictures. */
  improveImages?(): Promise<import("./improve-images-run").ImproveImagesSession>;
  openPage(path: string): Promise<void>;
  /** The site's usage check (checked on open); without it every file is Not checked yet. */
  usage?: MediaUsageSource;
}
export interface MediaUsageSource {
  records(): MediaUsageRecords | undefined;
  /** Called with each newer result; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** A page's title in the Pages tab; usage lists show it above the page's path. */
  pageLabel?(page: string): string | undefined;
}
/** A captured page source transformed inside the upload transaction. */
export interface MediaPlacement {
  /** The placement and newly added files share this Undo label. */
  label?: string;
  uploads?: { path: string; blob: Blob }[];
  /** Text files created with the placement (the site's player): saved as text, so the preview reads
   * them as stylesheets and scripts; one that exists meanwhile refuses. */
  files?: { path: string; content: string }[];
  expectedAssets?: Map<string, string | undefined>;
  /** Other text files the placement was decided on (a component's template): newer ones refuse. */
  expectedSources?: Map<string, string | undefined>;
  expectedPaths?: string[];
  path: string; source: string;
  /** The refusal when the page changed before the batch; a generic one otherwise. */
  stale?: string;
  apply(paths: string[], requests: MediaImportRequest[], records: MediaRecords): string | { page: string; records?: MediaRecords };
  /** False once the placement is no longer wanted (Cancel): checked just before the batch commits. */
  live?: () => boolean;
  /** The records text the placement was decided on; the batch refuses newer records. */
  records?: { text: string | undefined };
  /** Files the placement leaves unused (a replaced place's trimmed copy): removed in the same batch,
   * onto Recently removed. Their revisions are in `expectedAssets`. */
  deletes?: string[];
}
/** A value placed by its address (a component's image slot): `edit` returns the page's text with
 * `url` in it. When new files are saved with it, `placed` turns true: the caller writes nothing more. */
export interface MediaPathPlacement {
  path: string; source: string; stale?: string;
  /** Keeps the instance selected after a page image is replaced. */
  node?: number[];
  edit(url: string): string;
  placed?: boolean;
}
/** Files added inside the picker and not saved yet (adding starts at once; nothing is placed
 * without Use). Use saves them with the placement in one batch: one Undo step. */
export interface MediaHeldFiles {
  /** The chosen image once saved: a held file's final path, copies and size, or the chosen existing file. */
  image(paths: string[]): MediaImage;
  /** Saves every ready file (files still preparing stop: `note` says so), with `place` unless it was
   * cancelled meanwhile: then the files are still saved, once, and `placed` is false. */
  save(place?: MediaPlacement): Promise<{ paths: string[]; placed: boolean; note: string }>;
  /** The chosen file when it is a held one: its prepared request. `take()` keeps it out of every
   * later save, for a caller that uses the prepared picture itself (Replace everywhere). */
  chosen?(): { request: MediaImportRequest; take(): void } | undefined;
}
export interface MediaImportRequest {
  onlineVideo?: import("../../shared/media-records").OnlineVideoRecord;
  file: File; result?: MediaOptimiseResult; folder: string;
  original?: { blob: Blob; extension: string };
  replaceFrom?: string; metadata?: MediaMetadata; expectedAssetVersion?: string;
  /** A new file joins this collection in the same Undo step (adding while viewing it). */
  collection?: string;
}
/** Clean up in the Media pane: More's item (with the count), and for the review it opens the
 * suggestions, whether the badge shows, and Dismiss. */
export interface MediaCleanUpEntry {
  item(): { label: string; disabled?: string | true };
  state(): { suggestions: MediaCleanUpSuggestions } | undefined;
  /** Improve images in More (ticket 11), with its own count beside Clean up's. */
  improve?: MediaImproveEntry;
  /** Called after each newer state; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}
export type MediaCleanUpMount = () => MediaCleanUpEntry;
export interface MediaImproveEntry {
  item(): { label: string };
  /** Widths the screen read from the bytes, so the tab's count matches the screen. */
  known(sizes: Record<string, { width?: number; height?: number }>): void;
  /** Measures a picture's place on the shown page (slice 33); undefined when that page is not shown. */
  measure(path: string, node: number[], size: { width?: number; height?: number }): Promise<import("./media-markup").MediaMeasured | undefined>;
  /** Shows a page in the canvas so its pictures can be measured. */
  show(path: string): Promise<void> | undefined;
  /** The site's full address (sharing pictures). */
  url(): string | undefined;
}
export interface MediaPickerOptions {
  /** Use: places the chosen file. The picker closes once it resolves; a thrown error keeps it open.
   * `cancelled` turns true when the picker closes meanwhile (Cancel): nothing may be placed after it. */
  onPick?: (image: MediaImage, cancelled: () => boolean, held?: MediaHeldFiles) => void | Promise<void>;
  /** Add → Media (slice 68): places a pasted YouTube or Vimeo address, or an online video from Media
   * (placed again without contacting the service). With it the picker shows the address field and lists
   * online videos under Video. The picker closes once it resolves; a thrown error keeps it open. */
  onlineVideo?: (video: { address: string } | OnlineVideoKey, cancelled: () => boolean, host: MediaPickerHost) => Promise<void>;
  /** Ready files saved when the picker closes without Use, and problems after it closed. */
  report?: { announce(message: string): void; error(error: unknown): void };
  /** The picker closed without Use (Cancel, Close or Escape): the existing placement stays. */
  onClose?: () => void;
  /** The place being filled, under the picker's title ("Home · Studio desk"). */
  place?: string;
  /** A few words after the chosen file's name ("Loops silently here"), when choosing it means more. */
  chosenNote?: (name: string) => string | undefined;
  /** MIME types, extensions or image/*, like a native file input's accept; none: every kind (Add → Media). */
  accept?: string;
  files?: File[];
  /** Where the picker's window is placed; inside an open popover (the explorer) it keeps that open. */
  within?: HTMLElement;
}
let host: MediaPickerHost | undefined;
let closeActive: ((switched?: boolean) => void) | undefined;
const panes = new Set<MediaLibraryView>();

/** Changing repositories invalidates controls bound to the previous adapter. */
export function configureMediaPicker(value: MediaPickerHost) {
  closeActive?.(true);
  for (const pane of panes) pane.dispose();
  panes.clear();
  host = value;
}
/** The editor left the picker's workspace: it closes, and a Use already under way still lands there (ticket 27). */
export function closeMediaPicker() { closeActive?.(true); }

/** Mount a persistent manager directly into the explorer's host. Hiding is safe. */
export function mountMediaLibrary(container: HTMLElement, options: MediaPickerOptions & { adapter?: MediaPickerHost; refreshKey?: () => string; cleanUp?: MediaCleanUpMount } = {}): MediaLibraryView {
  const adapter = options.adapter ?? host;
  if (!adapter) throw new Error("Open a repository before choosing an image.");
  const view = createMediaLibraryView(container, adapter, options);
  const dispose = view.dispose.bind(view);
  view.dispose = () => { dispose(); panes.delete(view); };
  panes.add(view);
  return view;
}

/** The Media picker (media-manager ticket 06): the Media pane's view in a smaller window, with only
 * compatible files; Use confirms, Cancel keeps the existing placement. Files dropped onto a place
 * (`files`) are added inside it and chosen, never placed without Use. */
export async function openMediaPicker(options: MediaPickerOptions & { adapter?: MediaPickerHost } = {}): Promise<void> {
  closeActive?.();
  // A picker for other kinds (background videos) brings its own listing; the Media screen stays as it is.
  const adapter = options.adapter ?? host;
  if (!adapter) throw new Error("Open a repository before choosing an image.");
  const dialog = node("dialog", "media-library media-library--picker");
  // Escape closes only the picker, not a popover it was placed in.
  if (options.within) dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
  // `switched`: closed because another workspace was opened, which cancels no Use under way.
  let used = false, closed = false, switched = false;
  const view = createMediaLibraryView(options.within ?? document.body, adapter, { ...options, onPick: options.onPick && (async (image, _cancelled, held) => {
    await options.onPick!(image, () => closed && !switched, held); used = !closed || switched;
  }) }, dialog);
  const close = (away = false) => { switched = away; dialog.close(); view.dispose(); };
  closeActive = close;
  dialog.addEventListener("close", () => {
    closed = true;
    if (closeActive === close) closeActive = undefined;
    if (!used) options.onClose?.();
  }, { once: true });
  await view.ready;
}
