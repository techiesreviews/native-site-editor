import { node } from "../ui/dom";
import type { MediaMetadata, MediaMetadataMap } from "./media-metadata";
import type { MediaImage } from "./media-markup";
import type { MediaOptimiseResult } from "./media-optimise";
import type { MediaUsage } from "./media-references";
import { createMediaLibraryView, type MediaLibraryView } from "./media-library-view";

export interface MediaLibraryItem { path: string; size?: number; date?: number; draft?: boolean; version?: string }
export interface MediaLibrary {
  key: string; items: MediaLibraryItem[]; metadata: MediaMetadataMap; usage: Record<string, MediaUsage>;
}
export interface MediaPickerHost {
  begin?(): void;
  load(): Promise<MediaLibrary>;
  blob(path: string): Promise<Blob>;
  metadata(changes: Record<string, Partial<MediaMetadata> | null>): Promise<void>;
  upload(file: File, result: MediaOptimiseResult, folder: string): Promise<string>;
  rename(path: string, name: string): Promise<void>;
  remove(paths: string[], unusedOnly?: boolean): Promise<void>;
  import?(requests: MediaImportRequest[]): Promise<string[]>;
  rewrite(from: string, to: string): Promise<void>;
  openPage(path: string): Promise<void>;
}
export interface MediaImportRequest {
  file: File; result: MediaOptimiseResult; folder: string;
  replaceFrom?: string; metadata?: MediaMetadata; expectedAssetVersion?: string;
}
export interface MediaPickerOptions {
  onPick?: (image: MediaImage) => void | Promise<void>;
  /** The alt offered for the picked image, before the image's own default: the replaced image's alt. */
  initialAlt?: string;
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
export function mountMediaLibrary(container: HTMLElement, options: MediaPickerOptions & { adapter?: MediaPickerHost; refreshKey?: () => string } = {}): MediaLibraryView {
  const adapter = options.adapter ?? host;
  if (!adapter) throw new Error("Open a repository before choosing an image.");
  const view = createMediaLibraryView(container, adapter, options);
  const dispose = view.dispose;
  view.dispose = () => { dispose(); panes.delete(view); };
  panes.add(view);
  return view;
}

/** Image slots retain modal selection; manager panes share the same view. */
export async function openMediaPicker(options: MediaPickerOptions = {}): Promise<void> {
  closeActive?.();
  if (!host) throw new Error("Open a repository before choosing an image.");
  const dialog = node("dialog", "media-library");
  const view = createMediaLibraryView(document.body, host, options, dialog);
  const close = () => { dialog.close(); view.dispose(); };
  closeActive = close;
  dialog.addEventListener("close", () => { if (closeActive === close) closeActive = undefined; }, { once: true });
  await view.ready;
}
