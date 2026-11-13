// The page's side of the carets (ticket am-23): what the editing preview (src/components/native-preview.ts) offers the
// carets drawn over it (src/components/live-carets.ts, loaded with the shared copy, never at boot). The preview only
// relays: this tab's caret as the frame reports it, others' carets to the frame, and where the frame says they are.
// Turning source offsets into elements and back is the carets' own work.

/** A caret typed on the page: the file, its element (index path) and text offsets in that element's text. */
export interface PageTextCaret { path: string; node: number[]; anchor: number; head: number }
/** A point in the page's text: an element (index path) and a text offset in it. */
export interface PageTextPoint { node: number[]; at: number }
/** Someone else's caret as the frame is asked to find it: in the file `path`, `anchor` where its selection began. */
export interface PageCaretPoint { id: string; path: string; head: PageTextPoint; anchor: PageTextPoint | null }
/** Where the frame found a caret, in its viewport: a line's start and height (none: not shown), and its selection's boxes. */
export interface PageCaretRect {
  id: string;
  caret: { left: number; top: number; height: number } | null;
  tints: { left: number; top: number; width: number; height: number }[];
}

export interface PageCarets {
  /** The files whose text the page shows and types in (the page, and the template open in Edit component mode); none
   * while History shows an earlier version or no page shows. */
  files(): readonly string[];
  /** That file's text as the page shows it now. */
  source(path: string): string | undefined;
  /** This tab's caret as the frame reports it while typing; none otherwise. */
  own(): PageTextCaret | undefined;
  /** Called when the caret, the file shown or its text may have changed; returns its unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Asks the frame where `owner`'s carets are (none: no carets of its own). Each drawing over the page (the open file's,
   * and a synced session's for a page file the code pane does not show, src/live-session-carets.ts) is its own owner: the
   * frame finds all of theirs together. */
  show(carets: PageCaretPoint[], owner: object): void;
  /** Called with where the frame found them; returns its unsubscribe. */
  onRects(listener: (rects: PageCaretRect[]) => void): () => void;
  /** Where the carets are drawn (over the frame) and the frame. */
  readonly layer: HTMLElement;
  readonly frame: HTMLIFrameElement;
}

const shown = new Set<PageCarets>(), watchers = new Set<() => void>();
const moved = () => { for (const watcher of [...watchers]) watcher(); };
/** Shows the page to the carets until the returned call. */
export function showPageCarets(page: PageCarets) {
  shown.add(page);
  moved();
  return () => { if (shown.delete(page)) moved(); };
}
export const pageCarets = (): readonly PageCarets[] => [...shown];
/** Called when a page comes or goes; returns its unsubscribe. */
export function watchPageCarets(watcher: () => void) {
  watchers.add(watcher);
  return () => { watchers.delete(watcher); };
}
