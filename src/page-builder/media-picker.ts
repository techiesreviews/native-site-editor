import type { AddingSettings, MediaRecords } from "../../shared/media-records";
import type { MediaCollectionChange } from "./media-collections";
import { node } from "../ui/dom";
import type { MediaMetadata, MediaMetadataMap } from "./media-metadata";
import type { MediaImage } from "./media-markup";
import type { MediaOptimiseResult } from "./media-optimise";
import type { MediaUsage } from "./media-references";
import type { MediaUsageRecords } from "./media-usage";
import type { MediaToCheckRow } from "./media-descriptions";
import type { MediaAddingChoices } from "./media-settings";
import { createMediaLibraryView, type MediaLibraryView } from "./media-library-view";

export interface MediaLibraryItem { path: string; size?: number; date?: number; draft?: boolean; version?: string }
export interface MediaLibrary {
  key: string; collections: string[]; items: MediaLibraryItem[]; metadata: MediaMetadataMap; usage: Record<string, MediaUsage>;
  /** Files that show the Always keep mark: each kept file and the main of each family with a kept member. */
  keep?: string[];
  /** To check: agent-written words Lex has not checked, in file order. */
  toCheck?: MediaToCheckRow[];
  /** The site's Adding settings: its remembered choices over the defaults (`media-settings.ts`). */
  adding?: AddingSettings;
  /** The repository's size in KiB as GitHub reports it; absent for local folders. */
  repoSize?: number;
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
  /** To check: without `text`, OK (the words stay, the by-agent mark goes); with it, Lex's words
   * replace the agent's, which clears the mark too. One Undo step either way. `row.text` is the
   * words Lex saw: newer agent words refuse, so nothing is approved unseen. */
  check?(row: MediaToCheckRow, text?: string): Promise<void>;
  remove(paths: string[], unusedOnly?: boolean): Promise<void>;
  import(requests: MediaImportRequest[], place?: MediaPlacement): Promise<string[]>;
  /** Adding settings: remember changed choices for this site, or "reset" to the defaults. One Undo step. */
  adding?(change: Partial<MediaAddingChoices> | "reset"): Promise<void>;
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
  path: string; source: string;
  /** The refusal when the page changed before the batch; a generic one otherwise. */
  stale?: string;
  apply(paths: string[], requests: MediaImportRequest[], records: MediaRecords): string | { page: string; records?: MediaRecords };
  /** False once the placement is no longer wanted (Cancel): checked just before the batch commits. */
  live?: () => boolean;
  /** The records text the placement was decided on; the batch refuses newer records. */
  records?: { text: string | undefined };
}
/** A value placed by its address (a component's image slot): `edit` returns the page's text with
 * `url` in it. When new files are saved with it, `placed` turns true: the caller writes nothing more. */
export interface MediaPathPlacement {
  path: string; source: string; stale?: string;
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
}
export interface MediaImportRequest {
  file: File; result?: MediaOptimiseResult; folder: string;
  replaceFrom?: string; metadata?: MediaMetadata; expectedAssetVersion?: string;
  /** A new file joins this collection in the same Undo step (adding while viewing it). */
  collection?: string;
}
/** Clean up in the Media pane: More's item (with the count) and the panel it opens. */
export interface MediaCleanUpEntry { item(): { label: string; disabled?: string }; open(): void }
/** The host draws Clean up into `slot`, above the grid; `closed` returns focus to More. */
export type MediaCleanUpMount = (slot: HTMLElement, closed: () => void) => MediaCleanUpEntry;
export interface MediaPickerOptions {
  /** Use: places the chosen file. The picker closes once it resolves; a thrown error keeps it open.
   * `cancelled` turns true when the picker closes meanwhile (Cancel): nothing may be placed after it. */
  onPick?: (image: MediaImage, cancelled: () => boolean, held?: MediaHeldFiles) => void | Promise<void>;
  /** Ready files saved when the picker closes without Use, and problems after it closed. */
  report?: { announce(message: string): void; error(error: unknown): void };
  /** The picker closed without Use (Cancel, Close or Escape): the existing placement stays. */
  onClose?: () => void;
  /** The place being filled, under the picker's title ("Home · Studio desk"). */
  place?: string;
  /** MIME types, extensions or image/*, like a native file input's accept. */
  accept?: string;
  files?: File[];
}
let host: MediaPickerHost | undefined;
let closeActive: (() => void) | undefined;
const panes = new Set<MediaLibraryView>();

/** Changing repositories invalidates controls bound to the previous adapter. */
export function configureMediaPicker(value: MediaPickerHost) {
  closeActive?.();
  for (const pane of panes) pane.dispose();
  panes.clear();
  host = value;
}
export function closeMediaPicker() { closeActive?.(); }

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
export async function openMediaPicker(options: MediaPickerOptions = {}): Promise<void> {
  closeActive?.();
  if (!host) throw new Error("Open a repository before choosing an image.");
  const dialog = node("dialog", "media-library media-library--picker");
  let used = false, closed = false;
  const view = createMediaLibraryView(document.body, host, { ...options, onPick: options.onPick && (async (image, _cancelled, held) => {
    await options.onPick!(image, () => closed, held); used = !closed;
  }) }, dialog);
  const close = () => { dialog.close(); view.dispose(); };
  closeActive = close;
  dialog.addEventListener("close", () => {
    closed = true;
    if (closeActive === close) closeActive = undefined;
    if (!used) options.onClose?.();
  }, { once: true });
  await view.ready;
}
