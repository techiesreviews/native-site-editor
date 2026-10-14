import type { MediaBytes } from "./media-byte-cache";
import type { MediaLibrary, MediaPickerHost } from "./media-picker";

/** The side sheet shared by details, delete and Optimise. Opening one screen
 * bumps `version`, so callbacks from an earlier screen see they are stale. */
export interface LibrarySheet {
  element: HTMLElement;
  version: number;
  /** The image whose details are open. */
  path?: string;
  /** Focus to move into a detail sheet that is still loading. */
  focus?: { path: string; active: Element | null };
  /** The running optimisation preview. */
  work?: AbortController;
}

/** What the sheet screens read from the view and ask it to do; no writes. */
export interface LibrarySheetContext {
  alive: () => boolean;
  library: () => MediaLibrary;
  loading: () => boolean;
  tell: (text: string) => void;
  task: (work: () => Promise<void>, lock?: boolean, canCancel?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  adapter: MediaPickerHost;
  cache: {
    get: (path: string) => Promise<MediaBytes>; drop: (path: string) => void;
    clear: () => void; objectUrl: (blob: Blob) => string;
  };
  sync: () => void;
}

/** Replace the sheet with a new non-detail screen. */
export function takeSheet(sheet: LibrarySheet) {
  sheet.focus = undefined;
  sheet.work?.abort();
  sheet.version++; sheet.path = undefined; sheet.element.hidden = false; sheet.element.replaceChildren();
}
