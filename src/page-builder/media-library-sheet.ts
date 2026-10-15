import { button, node } from "../ui/dom";
import { icon } from "../icons";
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
  /** Redraws a list screen (Manage collections) after the library refreshes. */
  redraw?: () => void;
  /** Repaints the open File details' usage with newer check results. */
  repaint?: () => void;
}

/** What the sheet screens read from the view and ask it to do; no writes. */
export interface LibrarySheetContext {
  alive: () => boolean;
  library: () => MediaLibrary;
  loading: () => boolean;
  /** A warning or refusal, inline under the screen. */
  tell: (text: string) => void;
  /** A result: the editor's toast. */
  done: (text: string) => void;
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
  sheet.work?.abort(); sheet.redraw = undefined; sheet.repaint = undefined; delete sheet.element.dataset.mode;
  sheet.version++; sheet.path = undefined; sheet.element.hidden = false; sheet.element.replaceChildren();
}

/** Every sub-screen's header (audit, slice 111): a ← Back icon button and the title, then at most
 * one helper sentence. Appended to the sheet; the title takes focus when the screen opens. */
export function sheetHead(element: HTMLElement, text: string, back: () => void, helper?: string) {
  const head = node("header", "media-detail__head");
  const backButton = button("", back, "media-detail__back");
  backButton.setAttribute("aria-label", "Back"); backButton.dataset.focusKey = "back"; backButton.append(icon("arrow-left", 20));
  const title = node("h3", "", text); title.tabIndex = -1;
  head.append(backButton, title);
  element.append(head);
  if (helper) element.append(node("p", "media-library__muted", helper));
  return { back: backButton, title };
}
