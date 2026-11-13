// A synced session's carets (TOOLS-219), passed between the session (src/live-session-carets.ts, loaded with the first
// share) and the open file's carets (src/live-text.ts), neither loading the other. The session offers its guests' carets,
// which the file's carets draw in the code pane and on the page with the room's own; the file's carets offer this tab's
// own caret and everyone else's in the room, which the session sends to its guests' pages.
import type { CaretSelection, LiveCaret } from "./live-text";

/** The open file's carets as the session reads them: its path, this tab's own caret and everyone else's in the room. */
export interface FileCarets { path: string; own: CaretSelection | undefined; others: LiveCaret[] }

type Watchers = Set<() => void>;
const guestWatchers: Watchers = new Set(), fileWatchers: Watchers = new Set();
let guests: ((path: string) => LiveCaret[]) | undefined;
let file: (() => FileCarets | undefined) | undefined;
const tell = (watchers: Watchers) => { for (const watcher of [...watchers]) try { watcher(); } catch { /* A caret must not break the session. */ } };
const watch = (watchers: Watchers, watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; };

export const sessionCarets = {
  /** The session offers its guests' carets in a file, in this tab's text (none: the session ended). */
  offerGuests(next: ((path: string) => LiveCaret[]) | undefined) { guests = next; tell(guestWatchers); },
  /** The guests' carets in `path`. */
  guests: (path: string): LiveCaret[] => guests?.(path) ?? [],
  /** Whether a session runs: the file's carets are drawn then, so this tab's own caret reaches its guests. */
  on: () => guests !== undefined,
  /** A guest's caret moved, or a guest came or left. */
  guestsMoved: () => tell(guestWatchers),
  /** Called when the guests' carets may have moved or the session started or ended; returns its unsubscribe. */
  watchGuests: (watcher: () => void) => watch(guestWatchers, watcher),
  /** The open file's carets offer theirs (none: no file is shared). */
  offerFile(next: (() => FileCarets | undefined) | undefined) { file = next; tell(fileWatchers); },
  file: (): FileCarets | undefined => file?.(),
  /** This tab's caret or someone else's in the room moved. */
  fileMoved: () => tell(fileWatchers),
  /** Called when the file's carets may have moved; returns its unsubscribe. */
  watchFile: (watcher: () => void) => watch(fileWatchers, watcher),
};
