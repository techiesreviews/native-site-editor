// Saves through a live room (ticket am-59): the publish menu asks, before it sends, whether a page it saves is typed on
// together, so the room's copy notes the save and the commit names the copy (src/live-text.ts `noteLiveSave`). Live
// text sets these once it loads; this stays tiny, as the publish menu loads at boot. `store`: only that draft store's
// shares answer (tests run several tabs in one page). `ready`: Save waits for it first (a page just opened again catches
// up with its room, at most about 5 s); undefined when nothing has to wait. `note`: the copies (as hex) the save is from.
import type { DraftScope } from "./drafts";

export const liveSaves: {
  note?: (scope: DraftScope, files: readonly { path: string; content: string; delete?: boolean; sha?: string }[], store?: object) => string[];
  ready?: (scope: DraftScope, paths: readonly string[], store?: object) => Promise<unknown> | undefined;
} = {};
