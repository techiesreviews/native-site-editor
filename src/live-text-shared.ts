// What the parts of a live copy share (src/live-text.ts holds the overview). One open file's share
// (src/live-text.ts `shareFile`) hands its copy a ShareContext; the copy (src/live-text-copy.ts `makeCopy`) hands each of
// its parts a CopyContext: the kept copy and the save record (src/live-text-kept.ts), changes from GitHub
// (src/live-text-github.ts), this tab's draft, adopted drafts and carrying words over (src/live-text-drafts.ts), and
// carets and who wrote what (src/live-text-carets.ts). Each part keeps its own state; what more than one of them reads
// or writes is here, read live through the context.

import { applyChanges, type DraftTextStore, type TextChange } from "./draft-store";
import type { DraftScope } from "./drafts";
import type { LiveClock, LivePeer, LiveRoom } from "./live-room";
import type { LiveAuthor } from "./live-author";
import { wordDiff } from "./live-versions";
import type { CaretSelection, LiveTextPorts } from "./live-text";
import type { CopyKeeper, KeptCopy, Notes } from "./live-text-kept";
import type { Github } from "./live-text-github";
import type { Drafts } from "./live-text-drafts";
import type { Carets } from "./live-text-carets";

export type Yjs = typeof import("yjs");
export type Doc = import("yjs").Doc;
export type Room = Pick<LiveRoom, "send" | "close"> & Partial<Pick<LiveRoom, "setPresence">>;
export type Store = Pick<DraftTextStore, "get" | "text" | "edit" | "subscribe" | "subscribeState" | "acceptBase">;
type DeleteSet = ReturnType<Yjs["createDeleteSet"]>;

/** A tab that found others waits this long, after asking, for one of them to catch it up; then it starts from its own draft. */
export const LIVE_TEXT_CATCH_UP_MS = 5_000;
/** The origins of the copy's own transactions: this tab's typing, a catch-up's text, its starting text, the outside
 * participant (GitHub's versions, and words of a way into a version the copy does not keep), and notes. */
export const LOCAL = Symbol("local"), REMOTE = Symbol("remote"), START = Symbol("start"), OUTSIDE = Symbol("outside"), META = Symbol("meta");

/** Changes that turn `from` into `to`: `changes` when they do, else the range between them as whole words (`wordRuns`):
 * a word put in beside a word starting with the same character is not taken for text put in inside that word, which
 * would split this tab's Undo steps around it and cut words apart when they are undone. */
export function changesBetween(from: string, to: string, changes?: readonly TextChange[]) {
  if (changes?.length) {
    try { if (applyChanges(from, changes).text === to) return [...changes]; } catch { /* Not in these offsets. */ }
  }
  return wordDiff(from, to);
}

/** The name-tag Undo (ticket am-24): takes back someone else's latest text change in the open file's shared copy. */
export interface AuthorUndo {
  undo(author: number, history?: string): boolean;
  can(author: number): boolean;
}

/** One open file's share, as its copy reads it: what stays (`ports` to `foldsReady`) and what changes while it runs
 * (`stopped` to `selection`, read live). */
export interface ShareContext {
  readonly ports: LiveTextPorts;
  readonly store: Store;
  readonly clock: LiveClock;
  readonly keeper: CopyKeeper;
  readonly scope: DraftScope;
  readonly path: string;
  /** The file's draft as the share began: its key names the kept copy and the save notes. */
  readonly start: { readonly key: string };
  readonly room: Room;
  /** The copy a room's tabs agreed on when two met (`meet`), by key. */
  readonly preferred: Map<string, Uint8Array>;
  /** This tab's saves made while its copy was not taking part, by blob sha. */
  readonly ownSaves: Map<string, string>;
  /** Agents whose text went into the draft before the copy took part, by connection, with where their latest change ended. */
  readonly unplaced: Map<string, { who: LiveAuthor; index: number }>;
  readonly savesWith: (kept?: readonly string[]) => string[];
  readonly caretsMoved: () => void;
  readonly authorsChanged: () => void;
  readonly ended: (why: "left" | "again") => void;
  readonly foldsReady: () => void;
  readonly stopped: boolean;
  readonly discarded: boolean;
  readonly editors: number;
  readonly apart: boolean;
  readonly peers: ReadonlyMap<string, LivePeer>;
  readonly selection: (() => CaretSelection | undefined) | undefined;
  /** Set when this share stops for another share of the same page to take over (`meet`). */
  restarting: boolean;
}

/** One copy, as its parts read it: what stays (`s` to `plus`), the state more than one part reads (`copyId` to
 * `leaving`, read live), and the parts themselves. */
export interface CopyContext {
  readonly s: ShareContext;
  readonly Y: Yjs;
  readonly doc: Doc;
  readonly text: import("yjs").Text;
  readonly meta: import("yjs").Map<unknown>;
  /** The Yjs client id this copy's own changes carry (`makeCopy`). */
  readonly me: number;
  /** The kept copy it resumed, or the one it carries words over from (the room left it). */
  readonly resume: KeptCopy | undefined;
  readonly carried: KeptCopy | undefined;
  /** Client ids whose words are this browser's own. */
  readonly ownClients: Set<number>;
  /** Someone else's own changes, by their author's client id, for the name-tag Undo. */
  readonly authors: Map<number, { origin: object; undo: import("yjs").UndoManager }>;
  /** The agents whose text this tab wrote into the copy, by the origin of their changes. */
  readonly agentIds: WeakMap<object, number>;
  readonly authorOrigin: (author: number, agent?: boolean) => object;
  readonly applyText: (changes: readonly TextChange[], into?: import("yjs").Text) => void;
  readonly follow: (changes?: TextChange[], own?: { history: string | undefined }) => void;
  readonly plus: (took: DeleteSet, transaction: import("yjs").Transaction) => DeleteSet;
  readonly copyId: Uint8Array | undefined;
  readonly synced: boolean;
  keptBase: string | undefined;
  took: DeleteSet;
  quiet: boolean;
  startClient: number | undefined;
  readonly leaving: boolean;
  readonly notes: Notes;
  readonly github: Github;
  readonly drafts: Drafts;
  readonly carets: Carets;
}
