// The open file's shared copy (ADR 0003, ticket am-21). While someone else
// has the same file open, both tabs hold it as a Yjs text over the plain
// source and send each other their changes through the file's live room
// (src/live-room.ts); each tab's draft follows the shared copy. Loaded after
// the first paint; Yjs itself loads only once someone else is in the room.
//
// - A tab alone with a file holds the room socket (so others can find it) and
//   no Yjs. It sends only the relay's auto-answered ping, never a frame the
//   relay is woken for.
// - The starting text: GitHub's text enters under a client id derived from its
//   blob sha, and a draft's changes over it under one derived from the sha and
//   the draft's text, so two tabs that start from the same text make the very
//   same Yjs items and their copies merge instead of doubling the page.
// - Who starts it: a tab that has been alone in the room starts from its own
//   draft. A tab that found others there waits for one of them to catch it up
//   (nothing is stored on the server), then keeps the room's copy; its own
//   unsaved changes join it only when they are not the room's already.
// - Coming back: a tab keeps the copy it shared (its Yjs state, in this
//   browser only: memory, and IndexedDB for a reload). Opening the file again
//   it starts from that copy plus what it typed since, so text it already
//   shared is never added a second time.
// - After a new room key or a reconnect, every tab asks again for what it is
//   missing, so frames lost meanwhile are made good.
// - Discard takes this tab out of the shared copy: the others keep their
//   changes, and this tab shows GitHub's text until it opens the file again.
// - Per-person Undo (ticket am-24): someone else's change moves this tab's
//   Undo and Redo past it (src/shared-undo.ts) instead of clearing them. The
//   name-tag Undo (`LiveText.undoAuthor`) takes back one author's latest change
//   for everyone; carets call it from slices 22, 23 and 25.
// - Carets (ticket am-22): each tab tells the room where its caret is, through
//   the room's presence (src/live-room.ts), as Yjs relative positions, so a
//   caret stays by the same words while others type. Others' carets are read
//   in this tab's text and drawn in the code pane (src/components/live-carets.ts,
//   loaded with Yjs, only once someone else is in the room).
// - Agents join the merge (ticket am-25): an agent's change is written into the
//   drafts of the tab that receives its commands (src/live-author.ts says whose
//   it is). That tab puts the text change into the copy as the smallest change,
//   under a Yjs client id of the agent's own, and sends it under that id, so in
//   every tab its words are the agent's: its name tag's Undo takes back only
//   them. The receiving tab says where the agent's caret is (at its latest
//   change) along with its own, and draws it too.
// - Saving names everyone (ticket am-26): who changed a file is noted for its
//   commit (src/save-authors.ts). Others' text in the copy is matched, by the
//   Yjs client ids it carries, to the names the room's presence gives (a tab's
//   own id, the id its draft's changes entered under, the agents it wrote for);
//   an agent writing into this tab's drafts is noted whether sharing is on or not.
//
// Frames (inside the room's encryption): a kind byte, whether the sender is
// caught up, the 20-byte starting-text tag, a 4-byte copy id (the sender's
// Yjs client id; in a REPLY, the copy whose request it answers), then a Yjs state vector or
// update. Copies with another tag (a tab on another version of the file) are
// ignored, and a tab counts as caught up only by a REPLY to its own request:
// one to someone else's holds only what they lacked.
//
// Live sharing is on for every signed-in tab (`liveSharingOn`; Lex, 2026-10-31:
// "Yes, switch it on for everyone"), so GitHub collaborators on the same
// repository and branch meet on the page with no link (slice am-31). A tab
// alone with a file holds one quiet room socket; nothing is stored on the server.

import { effect, untracked, type ReadonlySignal } from "@preact/signals-core";
import { applyChanges, diffRange, type DraftEvent, type DraftTextStore, type TextChange } from "./draft-store";
import { draftKey, type DraftScope } from "./drafts";
import { openLiveRoom, type LiveClock, type LivePeer, type LiveRoom, type LiveRoomOptions } from "./live-room";
import type { JsonValue } from "../shared/agent-command";
import { LIVE_MESSAGE_LIMIT } from "../shared/live-room";
import { rebaseHistory } from "./shared-undo";
import { liveAuthor, type LiveAuthor } from "./live-author";
import { agentKey, NAME_LIMIT } from "./participant";
import { saveAuthors, type SaveAuthors } from "./save-authors";
import type { SaveAuthor } from "../shared/types";
import { mergeText, runChanges } from "./text-merge";
import { liveSaves } from "./live-saves";
import { birthUpdate, clashes, clientOf, copyAt, draftUpdate, edgeClient, edgeTo as edgeFor, edgeUpdate, edges, headOf, metaOf, newestOf, occurrenceAfter, occurrenceOn,
  shaOf, superseded, type Edge, textAt, textWith, tipOf, versionsOf, wordDiff, wordRuns, wordsOf } from "./live-versions";

type Yjs = typeof import("yjs");
type Doc = import("yjs").Doc;
type Room = Pick<LiveRoom, "send" | "close"> & Partial<Pick<LiveRoom, "setPresence">>;
type Store = Pick<DraftTextStore, "get" | "text" | "edit" | "subscribe" | "subscribeState" | "acceptBase">;

/** A version of a file on GitHub: its blob sha and text. */
export interface LiveVersion {
  sha: string; text: string;
  /** The live copies whose save made it, as hex (the commit's `Live-Copy` lines, worker/publish.ts): a tab of such a
   * copy takes it as that save, waiting for its note, and never as an outside change. */
  copies?: readonly string[];
}
/** GitHub's file as a share reads it (`LiveTextPorts.github`). */
export interface LiveGithub extends LiveVersion {
  newest?: () => Promise<LiveVersion | undefined>;
  /** The versions before `sha` on the branch, newest first (from the commit that made its latest occurrence back):
   * nothing after the file's first version; it throws when GitHub's history cannot be read. */
  before?: (sha: string) => AsyncIterable<LiveVersion>;
}

export interface LiveTextPorts {
  store: Store;
  /** The file on show; its draft store entry is the one shared. */
  openFile: ReadonlySignal<string | undefined>;
  /** The drafts' scope on show; none on the overview or while a load runs. */
  scope(): DraftScope | undefined;
  /** Tests: the room (src/live-room.ts `openLiveRoom` by default), Yjs, the kept copies and the clock. */
  openRoom?: (options: LiveRoomOptions) => Room;
  loadYjs?: () => Promise<Yjs>;
  keeper?: CopyKeeper;
  clock?: LiveClock;
  /** Live sharing switched on (`liveSharingOn` by default). */
  on?: boolean;
  /** Draws others' carets once a copy is shared (src/components/live-carets.ts by default, in a browser). */
  loadCarets?: () => Promise<(share: CaretShare) => () => void>;
  /** Who changed each file, for the commit (src/save-authors.ts `saveAuthors` by default). */
  authors?: SaveAuthors;
  /** GitHub's version of the file (its blob sha and text) as the workspace read it, and GitHub's history of it (ticket
   * am-59). `newest`: the branch's newest version, read now. `before`: the versions before one, newest first. Every version enters the room's
   * copy on top of the one before it, so the copy holds GitHub's versions in GitHub's order whichever tab heard which
   * commit first; a history that cannot be read (a rate limit, a rewritten branch) enters nothing, and the caller falls
   * back to loading the branch again. */
  github?: (scope: DraftScope, path: string) => LiveGithub | undefined;
  /** The Undo list a clash's step goes in (the file's own by default): the latest version shows, this tab's words one Undo away. */
  history?: (scope: DraftScope, path: string) => string;
  /** A GitHub push moved the shared file's branch to `commit` (ticket am-32): the open file's room heard it from the relay. */
  onPushed?(scope: DraftScope, commit: string): void;
}

/** Someone else's caret in the open file, in this tab's text (ticket am-22). `author`: the Yjs client id their own changes
 * carry, which the name-tag Undo takes; `agent`: the program an agent works in (`clientInfo.name`; for an agent whose text
 * a tab wrote into the copy, ticket am-25, the name its commands carry), none for a person.
 * Name and author are what each participant says of itself (the relay vouches for neither): `contested` marks an author
 * id another participant here also claims, or this tab's own, whose name tag offers no Undo. `who`: an agent this tab
 * writes for, by its connection, so its caret is drawn as its outline and pin are (src/participant.ts); never sent. */
export interface LiveCaret { peer: string; author: number; name: string; agent?: string; who?: LiveAuthor; anchor: number; head: number; contested?: boolean }
/** A caret as offsets in this tab's text: where the selection began and where the caret is. */
export interface CaretSelection { anchor: number; head: number }
/** The open file's carets as the code pane draws them (src/components/live-carets.ts). */
export interface CaretShare {
  scope: DraftScope;
  path: string;
  /** Everyone else here now with a caret in this file. */
  carets(): LiveCaret[];
  /** Called when a caret may have moved: someone moved theirs, typed, came or left. Returns its unsubscribe. */
  onCarets(listener: () => void): () => void;
  /** Where this tab's own caret is: read (as offsets in its text) each time the room is told, so a caret placed before
   * the copy caught up is told where it is in the shared text; none takes it away. */
  own(selection: (() => CaretSelection | undefined) | undefined): void;
  canUndo(author: number): boolean;
  undo(author: number, history?: string): boolean;
  onAuthorUndo(listener: () => void): () => void;
}
/** A copy this browser shared, kept to start from when the file opens again: its starting-text tag, its Yjs state and
 * the draft's text when it was kept (`draft`; none in copies kept before it was added). The draft and the copy are saved
 * apart and a reload can keep one write and lose the other: `draft` tells what the draft took on after the copy's last write.
 * Only the shapes are checked on reading; a state Yjs cannot apply is dropped then (`load`). */
export interface KeptCopy {
  tag: Uint8Array; update: Uint8Array; draft?: string;
  /** The version of GitHub's text the draft was over when kept (none in copies kept before copies held their versions,
   * which are not resumed), and the client ids this browser's words carry in the copy (ticket am-59). */
  base?: string; mine?: number[];
}
/** Where kept copies live: this browser only (memory, then IndexedDB), never the server. */
export interface CopyKeeper {
  read(key: string): Promise<KeptCopy | undefined>;
  write(key: string, copy: KeptCopy | undefined): void;
}

const HELLO = 1, ASK = 2, REPLY = 3, UPDATE = 4, GITHUB = 5;
const HEAD = 2 + 20 + 4;
/** A tab that found others waits this long, after asking, for one of them to catch it up; then it starts from its own draft. */
export const LIVE_TEXT_CATCH_UP_MS = 5_000;
/** A caret that moves tells the room at most this often (typing moves it with every key). */
const CARET_MS = 50;
/** The most agents' carets one tab's presence is read for (ticket am-25). */
const AGENT_CARETS = 16;
/** A name cut to NAME_LIMIT code points, never inside a surrogate pair (src/participant.ts `shownName` cuts what shows). */
const cut = (name: string) => [...name].slice(0, NAME_LIMIT).join("");
/** The most client ids of others' text one copy holds while waiting for presence to name them (the starting texts' never are). */
const UNNAMED_LIMIT = 256;
/** Frames that arrive while Yjs loads wait, up to this many. */
const INBOX_LIMIT = 500;
/** The room closes a socket over its limit: a larger copy is not sent (the room's own framing needs a little room). */
const FRAME_LIMIT = LIVE_MESSAGE_LIMIT - 1024;
const LOCAL = Symbol("local"), REMOTE = Symbol("remote"), START = Symbol("start"), OUTSIDE = Symbol("outside"), META = Symbol("meta");
/** A copy is kept this long after its last change, as drafts are (src/drafts.ts), and at once when the page hides or the file
 * closes: the copy kept and the draft saved must say the same, or text shared since would go in again on resuming. */
const KEEP_MS = 200;
/** The most versions of GitHub's history one commit brings into a copy with it (the versions before it the copy lacks):
 * one page of the file's history (worker/history.ts). Past it, the branch loads again. */
const HISTORY_LIMIT = 20;

const isKept = (value: unknown): value is KeptCopy => {
  const copy = value as Partial<KeptCopy> | null;
  return !!copy && copy.tag instanceof Uint8Array && copy.tag.length === 20 && copy.update instanceof Uint8Array
    && (copy.draft === undefined || typeof copy.draft === "string") && (copy.base === undefined || typeof copy.base === "string")
    && (copy.mine === undefined || (Array.isArray(copy.mine) && copy.mine.every(id => Number.isSafeInteger(id))));
};
/** Memory first (this page's newest), then IndexedDB (a reload); writes go to both, best effort. The database opens at once,
 * so a write when the page hides starts its transaction then, as the drafts' does. */
export function browserKeeper(): CopyKeeper {
  const memory = new Map<string, KeptCopy | undefined>();
  let opened: Promise<IDBDatabase | undefined> | undefined, ready: IDBDatabase | undefined;
  const open = () => opened ??= new Promise<IDBDatabase | undefined>(resolve => {
    if (typeof indexedDB === "undefined") { resolve(undefined); return; }
    try {
      const request = indexedDB.open("native-site-editor-live", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("copies");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }).then(db => (ready = db));
  void open();
  const put = (db: IDBDatabase | undefined, key: string, copy: KeptCopy | undefined) => {
    try {
      const copies = db?.transaction("copies", "readwrite").objectStore("copies");
      if (copy) copies?.put(copy, key); else copies?.delete(key);
    } catch { /* Kept in memory only: a reload starts as a joiner. */ }
  };
  return {
    async read(key) {
      if (memory.has(key)) return memory.get(key);
      const db = await open();
      return db && new Promise<KeptCopy | undefined>(resolve => {
        try {
          const request = db.transaction("copies").objectStore("copies").get(key);
          request.onsuccess = () => resolve(isKept(request.result) ? request.result : undefined);
          request.onerror = () => resolve(undefined);
        } catch { resolve(undefined); }
      });
    },
    write(key, copy) {
      memory.set(key, copy);
      if (ready) put(ready, key, copy);
      else void open().then(db => put(db, key, copy));
    },
  };
}
let pageKeeper: CopyKeeper | undefined;

const systemClock: LiveClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
const utf8 = new TextEncoder();
async function digest(text: string) { return new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(text))); }
const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
/** A version of GitHub's text, as 40 hex digits: its blob sha, or (a file not on GitHub) a hash of the text. */
async function versionOf(baseSha: string | null | undefined, base: string) {
  return baseSha && /^[a-f\d]{40}$/.test(baseSha) ? baseSha : hex((await digest(`new\n${base}`)).subarray(0, 20));
}
const sameTag = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
const NO_COPY = new Uint8Array(20);
/** A quick hash of a saved text (cyrb53, as hex): a save's note in the copy is found by it, and its text checked. */
function savedKey(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}
/** The key of a save's note: its text saved over the copy's version `from` (a revert's save of an earlier text is
 * over another version, so its note does not take the earlier save's place). */
const noteKey = (from: string, text: string) => savedKey(`${from}\n${text}`);

/** A Yjs text event's delta as changes in the text before it. */
function deltaChanges(delta: { retain?: number; insert?: unknown; delete?: number }[]) {
  const changes: TextChange[] = [];
  let at = 0;
  for (const op of delta) {
    if (op.retain) { at += op.retain; continue; }
    const last = changes.at(-1);
    const open = last && last.end === at ? last : undefined;
    if (typeof op.insert === "string") { if (open) open.text += op.insert; else changes.push({ start: at, end: at, text: op.insert }); }
    if (op.delete) { if (open) open.end += op.delete; else changes.push({ start: at, end: at + op.delete, text: "" }); at += op.delete; }
  }
  return changes;
}

/** Changes that turn `from` into `to`: `changes` when they do, else the range between them as whole words (`wordRuns`):
 * a word put in beside a word starting with the same character is not taken for text put in inside that word, which
 * would split this tab's Undo steps around it and cut words apart when they are undone. */
function changesBetween(from: string, to: string, changes?: readonly TextChange[]) {
  if (changes?.length) {
    try { if (applyChanges(from, changes).text === to) return [...changes]; } catch { /* Not in these offsets. */ }
  }
  return wordDiff(from, to);
}

/**
 * What was typed since a share began (`began` to `own`), as one change on the kept copy's text (`kept`). Where the
 * kept copy and `began` differ (`stale`), that range is left as the copy has it; a change clear of it moves by its
 * length. Found by characters first; where the typing and the stale range touch there, by words (`runChanges`), so a
 * word deleted beside a word the copy lacks is not taken for typing; across them still, the whole difference from the
 * copy.
 */
export function typedSince(kept: string, began: string, own: string): TextChange | undefined {
  if (own === began) return undefined;
  if (kept === began) return diffRange(began, own);
  return moveClear(kept, [diffRange(began, kept)], [diffRange(began, own)])
    ?? moveClear(kept, runChanges(began, kept), runChanges(began, own)) ?? diffRange(kept, own);
}
/** `typed` (changes on a text, in order) moved past `stale` (changes on the same text, in order) onto `kept`, as one
 * change; none when one of them crosses a stale range. */
function moveClear(kept: string, stale: readonly TextChange[], typed: readonly TextChange[]) {
  const moved: TextChange[] = [];
  for (const change of typed) {
    let shift = 0;
    for (const range of stale) {
      if (change.end <= range.start) break;
      if (change.start < range.end) return undefined;
      shift += range.text.length - (range.end - range.start);
    }
    moved.push({ start: change.start + shift, end: change.end + shift, text: change.text });
  }
  return diffRange(kept, applyChanges(kept, moved).text);
}

/** The name-tag Undo (ticket am-24): takes back someone else's latest text change in the open file's shared copy. */
interface AuthorUndo {
  undo(author: number, history?: string): boolean;
  can(author: number): boolean;
}

/** A commit GitHub has now for a shared file: its blob sha, its text, and who made it (for the clash's Undo step). */
export interface LiveCommit extends LiveVersion { author?: string }
/** The open file's share, as src/outside-merge.ts and tests reach it. */
interface Share {
  shared(): boolean;
  fold(next: LiveCommit): Promise<boolean | undefined>;
  copy(): string | undefined;
  versions(): { from: string; to: string; client?: number }[];
}
/** The files each draft store shares with someone else right now, by key. */
const liveFiles = new WeakMap<object, Map<string, Share>>();
/** Whether `store`'s file under `key` is shared in a live room now: another tab is in, its copy is loading, a copy is
 * made (it stays while the file is open, also after the others left), or the room has not said who is here yet (for at
 * most LIVE_TEXT_CATCH_UP_MS after the file opened). An outside change to it folds into the room's copy (`liveFold`). */
const liveShared = (store: object, key: string) => liveFiles.get(store)?.get(key)?.shared() ?? false;
/**
 * A commit GitHub has now (`next`) for `store`'s file under `key`, shared in a live room (ticket am-59): it enters the
 * room's one copy as one more participant, once, whichever tab takes it first; this tab's draft follows the copy, and
 * its base becomes the commit's text. A save from the room enters as text the copy holds already. Undefined when the
 * file is not shared after all (the room said this tab is alone before a copy was made): the caller folds the commit
 * into the draft. False when its copy could not take it (it did not catch up in time): the caller loads the branch again.
 */
export function liveFold(store: object, key: string, next: LiveCommit): Promise<boolean | undefined> {
  return liveFiles.get(store)?.get(key)?.fold(next) ?? Promise.resolve(undefined);
}
/** Tests: `store`'s file under `key` in its live room: whether it is shared now (`liveShared`), the room copy it is on
 * (as hex; none before it has one), and the versions of GitHub's text its copy holds, as edges (src/live-versions.ts). */
export function liveState(store: object, key: string) {
  const share = liveFiles.get(store)?.get(key);
  return { shared: liveShared(store, key), copy: share?.copy(), versions: share?.versions() ?? [] };
}
type SaveNote = { store: object; note(text: string): string | undefined; ready(): Promise<void> | undefined };
const savers = new Map<string, Set<SaveNote>>();
/** The file under draft key `key` is about to be saved as `text` (from `store`, any by default): its live copy, if it
 * has one, notes it (the publish menu asks through src/live-saves.ts). Returns the copies (as hex) the save is from: the
 * commit names them (`Live-Copy`, worker/publish.ts), so the others in the room wait for the note rather than take the
 * commit in as an outside change. */
function noteLiveSave(key: string, text: string, store?: object): string[] {
  const copies: string[] = [];
  for (const saver of savers.get(key) ?? []) {
    if (store && saver.store !== store) continue;
    try { const copy = saver.note(text); if (copy && !copies.includes(copy)) copies.push(copy); } catch { /* Best effort: the others then fold the commit in as an outside change. */ }
  }
  return copies;
}
/** Lex's choice A (2026-11-12): a save of the file under draft key `key` (from `store`, any by default) waits until each
 * page sharing it has caught up with its live room (just opened again, or catching up after a reconnect), so the room's
 * copy can note the save, at most LIVE_TEXT_CATCH_UP_MS. Undefined when no page has to wait. */
function liveSaveReady(key: string, store?: object): Promise<void> | undefined {
  const waits = [...savers.get(key) ?? []].flatMap(saver => (store && saver.store !== store ? [] : [saver.ready()])).filter(wait => wait !== undefined);
  return waits.length ? Promise.all(waits).then(() => undefined) : undefined;
}
liveSaves.note = (scope, files, store) =>
  [...new Set(files.flatMap(file => (file.delete || file.sha ? [] : noteLiveSave(draftKey(scope, file.path), file.content, store))))];
liveSaves.ready = (scope, paths, store) => {
  const waits = paths.map(path => liveSaveReady(draftKey(scope, path), store)).filter(wait => wait !== undefined);
  return waits.length ? Promise.all(waits) : undefined;
};
/** `note` answers saves of the file under `key` in `store` while it is shared, with the copy it noted the save in;
 * `ready` says when a save can be noted (`liveSaveReady`). Returns its removal. */
function onLiveSave(store: object, key: string, note: (text: string) => string | undefined, ready: () => Promise<void> | undefined) {
  const saver = { store, note, ready };
  let notes = savers.get(key);
  if (!notes) savers.set(key, notes = new Set());
  notes.add(saver);
  return () => { notes.delete(saver); if (!notes.size && savers.get(key) === notes) savers.delete(key); };
}
/** This tab's saves made while its copy was not taking part, per draft store and key, by blob sha (their text): kept while
 * the page is open, so the copy notes them when the file opens again (`begin`). */
const keptSaves = new WeakMap<object, Map<string, Map<string, string>>>();
/** The copy a room's tabs agreed on when two met (`meet`), per draft store and key: a tab starting again joins that one. */
const preferredCopies = new WeakMap<object, Map<string, Uint8Array>>();

/** Shares one file while it is open; returns its stop, its name-tag Undo and its carets. `ended`: this tab left the copy
 * (Discard), or must start it again (another copy of the room won, `meet`). `authorsChanged`: what the name-tag Undo can
 * take back changed. `copied`: the copy is made (someone else is here), so carets can be drawn. */
function shareFile(ports: LiveTextPorts, scope: DraftScope, path: string, ended: (why: "left" | "again") => void, authorsChanged: () => void, copied: () => void) {
  const store = ports.store, clock = ports.clock ?? systemClock, keeper = ports.keeper ?? (pageKeeper ??= browserKeeper());
  const start = store.get(scope, path)!;
  let stopped = false, editors = 0, discarded = false, heard = false;
  let copy: ReturnType<typeof makeCopy> | undefined, loading = false;
  const inbox: Uint8Array[] = [];
  // Until the room says who is here, the file may be shared: a tab coming back to a page it typed on with others would
  // otherwise fold an outside change into a draft that holds the room's words, and the room's copy would take them twice.
  // A room that never answers (the relay out of reach) stops counting after the catch-up wait, so outside changes fold again.
  const unheard = clock.setTimeout(() => { heard = true; foldsReady(); }, LIVE_TEXT_CATCH_UP_MS);
  const shared = () => !stopped && (!heard || editors > 0 || loading || copy !== undefined);
  let live = liveFiles.get(store);
  if (!live) liveFiles.set(store, live = new Map());
  const preferred = preferredCopies.get(store) ?? new Map<string, Uint8Array>();
  preferredCopies.set(store, preferred);
  /** Commits heard before the copy could take them: each tries again once it can (true once it settled or started). */
  const waitingFolds: (() => boolean)[] = [];
  const share: Share = {
    shared,
    copy: () => copy?.id(),
    versions: () => copy?.versions() ?? [],
    fold: next => new Promise<boolean | undefined>(resolve => {
      let done = false, timer: unknown;
      const finish = (took: boolean | undefined) => { if (done) return; done = true; clock.clearTimeout(timer); resolve(took); };
      // True once it settled or started: the copy is caught up, or the file turned out not to be shared (the room said
      // this tab is alone before any copy was made, or the file closed): then the commit folds into the draft as for any file.
      const attempt = () => {
        if (done) return true;
        if (stopped || !shared()) { finish(undefined); return true; }
        if (!copy?.ready()) return false;
        copy.fold(next).then(finish, () => finish(false));
        return true;
      };
      if (attempt()) return;
      // The copy is still catching up (a reconnect, or this tab joining): the commit waits for it, as long as a catch-up may take.
      waitingFolds.push(attempt);
      timer = clock.setTimeout(() => { if (!attempt()) finish(false); }, 2 * LIVE_TEXT_CATCH_UP_MS);
    }),
  };
  live.set(start.key, share);
  const foldsReady = () => { for (const attempt of waitingFolds.splice(0)) if (!attempt()) waitingFolds.push(attempt); };
  /** A save waits for this (`liveSaveReady`): the copy caught up, or the file not shared after all, or the wait is over. */
  const caughtUp = () => {
    const now = () => stopped || !shared() || copy?.ready() === true;
    if (now()) return undefined;
    return new Promise<void>(resolve => {
      /** `over`: the wait ran out; `start`: it ran out while the copy was starting, so the save waits for that start. */
      let over = false, start = false, timer: unknown;
      const done = () => over || now() || (start && !copy?.starting());
      timer = clock.setTimeout(() => {
        // No one caught the copy up in time and it is starting on its own this very moment: that takes a moment more.
        if (copy?.starting()) { start = true; timer = clock.setTimeout(() => { over = true; foldsReady(); }, LIVE_TEXT_CATCH_UP_MS); }
        else over = true;
        foldsReady();
      }, LIVE_TEXT_CATCH_UP_MS);
      waitingFolds.push(() => {
        if (!done()) return false;
        clock.clearTimeout(timer);
        resolve();
        return true;
      });
    });
  };
  const stopSaves = onLiveSave(store, start.key, text => (copy?.noteSave(text) ? copy.id() : undefined), caughtUp);
  /** This tab's saves made while its copy was not taking part, by blob sha: their text is the draft's, not GitHub's change. */
  const ownSaves = keptSaves.get(store)?.get(start.key) ?? new Map<string, string>();
  if (!keptSaves.has(store)) keptSaves.set(store, new Map());
  keptSaves.get(store)!.set(start.key, ownSaves);
  /** Others here, as the room's presence says; this tab's own caret (offsets in its text) and whoever draws carets. */
  let peers: ReadonlyMap<string, LivePeer> = new Map(), selection: (() => CaretSelection | undefined) | undefined;
  const caretWatchers = new Set<() => void>();
  const caretsMoved = () => { for (const watcher of [...caretWatchers]) try { watcher(); } catch { /* A caret must not break sharing. */ } };
  // Discard is this tab's own, from the moment it shares the file (alone, loading Yjs, or with a copy): it leaves the
  // shared copy rather than taking everyone's changes away, and drops its kept copy so nothing brings them back.
  const unwatch = store.subscribe(event => {
    if (event.type === "file" && event.key === start.key && event.change === "saved") {
      // Saved before the copy took part (it is starting): the copy notes it once it does.
      const file = store.get(scope, path);
      if (!copy?.ready() && file?.baseSha) ownSaves.set(file.baseSha, file.base);
      copy?.saved();
      return;
    }
    if (event.type !== "text" || event.key !== start.key || event.origin !== "discard" || discarded) return;
    discarded = true;
    keeper.write(start.key, undefined);
    ended("left");
  });

  const room = (ports.openRoom ?? openLiveRoom)({
    repo: scope.repo, branch: scope.branch, file: path, ...(ports.clock ? { clock: ports.clock } : {}),
    onMessage(bytes) {
      if (copy) copy.receive(bytes);
      else if (inbox.length < INBOX_LIMIT) inbox.push(Uint8Array.from(bytes));
    },
    // Only other tabs count here: an agent's text joins the copy through the tab that receives its commands (am-25).
    onMembers(members) {
      heard = true;
      clock.clearTimeout(unheard);
      editors = [...members.values()].filter(access => access === "editor").length;
      // Alone with a copy kept from before, it runs that copy still, so a save or a commit is noted in it as with others.
      if (!editors) { if (copy) void copy.startOwn(); else if (!loading) void load(true); }
      else if (!copy && !loading) void load();
      foldsReady();
    },
    onKey: () => copy?.again(),
    onPeers(next) { peers = next; caretsMoved(); copy?.nameAuthors(); },
    onPushed: commit => ports.onPushed?.(scope, commit),
  });

  /** Loads Yjs and makes the copy; `keptOnly`: only to resume a copy kept from before (alone in the room). */
  async function load(keptOnly = false) {
    loading = true;
    try {
      // Alone, the kept copy is read first: without one, Yjs is not loaded.
      const first = keptOnly ? await keeper.read(start.key) : undefined;
      if (stopped || discarded || (keptOnly && (!first || first.base === undefined || editors))) return;
      const Y = await (ports.loadYjs ?? (() => import("yjs")))();
      const kept = keptOnly ? first : await keeper.read(start.key);
      if (stopped || discarded) return;
      // A copy this tab shared before: kept unless the room agreed on another copy meanwhile.
      const now = store.get(scope, path), wanted = preferred.get(start.key);
      const resume = kept && kept.base !== undefined && now && (!wanted || sameTag(wanted, kept.tag)) ? kept : undefined;
      if (kept && !resume) keeper.write(start.key, undefined);
      try { copy = makeCopy(Y, resume); }
      catch (error) {
        // A kept state Yjs cannot apply (damaged, from another Yjs version, or from before copies held their versions):
        // dropped, and this tab joins as a fresh joiner.
        if (!resume) throw error;
        keeper.write(start.key, undefined);
        copy = makeCopy(Y, undefined);
      }
      for (const bytes of inbox.splice(0)) copy.receive(bytes);
      copied();
      // With others here, it asks first: a copy of the room catches it up, or (none having one yet) one tab starts it (`receive`).
      if (!editors) await copy.startOwn(); else copy.hello();
    } catch { /* Yjs did not load, or starting the copy failed: this tab keeps its own draft, as before, until the room changes again. */ }
    finally {
      loading = false;
      // Others came meanwhile: they are joined now. Commits that waited for this copy fold now (or into the draft).
      if (!copy && editors && !stopped) void load();
      foldsReady();
    }
  }

  function makeCopy(Y: Yjs, resume: KeptCopy | undefined) {
    // Every item stays (no garbage collection): the copy as it was at each of GitHub's versions is made again from a snapshot.
    const doc: Doc = new Y.Doc({ gc: false });
    const text = doc.getText("source"), meta = metaOf(doc);
    /** The room copy this one is: from a kept copy, the first answer to this tab's request, or its own birth. */
    let copyId: Uint8Array | undefined;
    let synced = false, starting = false, waiting: unknown, keeping: unknown, resumed = false;
    /** After a new room key or a reconnect: frames may have been lost, so a commit waits until a catch-up answer came. */
    let catching = false, caught: unknown;
    /** Whether the text changed in the update being applied (`receive`); set by the text's observer. */
    let textChanged = false;
    /** The Yjs client id this tab's draft changes entered the copy under (`begin`), told to the room so they carry its name. */
    let startClient: number | undefined;
    // Someone else's own changes (their UPDATE frames), each under its author's origin, for the name-tag Undo. Catch-up
    // answers carry everyone's text and stay under REMOTE.
    const authors = new Map<number, { origin: object; undo: import("yjs").UndoManager }>();
    const theirs = new WeakSet<object>();
    /** The agents whose text this tab wrote into the copy (ticket am-25), by the origin of their changes: the client id
     * those changes carry and that their frames name. */
    const agentIds = new WeakMap<object, number>();
    const authorOrigin = (author: number, agent = false) => {
      let found = authors.get(author);
      if (!found) {
        const origin = {};
        if (agent) agentIds.set(origin, author); else theirs.add(origin);
        const undo = new Y.UndoManager(text, { trackedOrigins: new Set([origin]) });
        for (const event of ["stack-item-added", "stack-item-popped", "stack-cleared"] as const) undo.on(event, authorsChanged);
        authors.set(author, found = { origin, undo });
      }
      return found.origin;
    };
    /** Client ids whose words are this browser's own (its tabs, their drafts, the agents they wrote for): the clash rule
     * takes only these out in this tab, and keeps them with the copy for when the file opens again. */
    const ownClients = new Set<number>(resume?.mine ?? []);
    // Its own earlier copy. What the draft took on after that copy was kept goes in when this tab starts its part (`begin`).
    if (resume) {
      Y.applyUpdate(doc, resume.update, START);
      if (!edges(Y, doc).some(edge => !edge.from)) throw new Error("A kept copy without its versions");
      copyId = resume.tag;
    }
    /** The characters this tab took out of the copy by typing (its own, or the agents it wrote for): GitHub's
     * words the clash rule may put back. Only this tab's, never kept. */
    let took = Y.createDeleteSet();
    /** The clash rule is putting GitHub's words back (`settle`): the draft takes them with the rule's own step. */
    let quiet = false;
    doc.on("afterTransaction", (transaction: import("yjs").Transaction) => {
      const origin = transaction.origin;
      if (!transaction.deleteSet.clients.size || !(origin === LOCAL || agentIds.has(origin as object))) return;
      // Copied: merging joins ranges in place, and the transaction's own are Yjs' to keep.
      const copy = Y.createDeleteSet();
      for (const [client, ranges] of transaction.deleteSet.clients) copy.clients.set(client, ranges.map(({ clock, len }) => ({ clock, len }) as typeof ranges[number]));
      took = Y.mergeDeleteSets([took, copy]);
    });
    const keptText = text.toString();
    /** The edges whose clash this tab weighed (or that came before it took part): each is weighed once, as it comes in. */
    const weighed = new Set(edges(Y, doc).map(edge => edge.id)), weighedVersions = new Set(edges(Y, doc).map(edge => edge.to));
    let keptBase: string | undefined;
    /** This tab is leaving this copy for another of the room (`meet`): it is not kept. */
    let leaving = false;
    const keep = () => {
      clock.clearTimeout(keeping);
      keeping = undefined;
      const draft = store.text(scope, path);
      if (synced && !discarded && !leaving && copyId && keptBase) keeper.write(start.key, { tag: copyId, update: Y.encodeStateAsUpdate(doc),
        ...(draft === undefined ? {} : { draft }), base: keptBase, mine: [...ownClients] });
    };
    /** Catch-up requests that came before this copy could answer: answered once it can. */
    let asked: { kind: number; theirs: boolean; from: number; vector: Uint8Array }[] = [];
    /** This copy's id in frames: a REPLY naming it answers this tab's own request. It is the Yjs client id its own
     * changes carry, which carets name (slices 22 and 23), so a name tag's Undo finds that author's changes. Read once: should
     * Yjs ever give this doc a new client id (it does on a clash, very rarely), carets must keep naming this one. */
    const me = doc.clientID;
    ownClients.add(me);
    /** Agents whose text this tab wrote, by connection and name: the client id their changes carry, a Yjs id of their own
     * made here (random, as Yjs makes its own, and never one this copy has seen), and where their latest change ended. */
    const agents = new Map<string, { author: number; name: string; who: LiveAuthor; at?: import("yjs").RelativePosition }>();
    const agentAuthor = (who: LiveAuthor) => {
      const key = agentKey(who);
      let found = agents.get(key);
      if (!found) {
        let author: number;
        do author = crypto.getRandomValues(new Uint32Array(1))[0];
        while (author === me || author === doc.clientID || doc.store.clients.has(author) || authors.has(author)
          || [...peers.values()].some(peer => (peer.state as { author?: unknown } | null)?.author === author));
        found = { author, name: cut(who.name), who: { grant: who.grant, name: who.name } };
        ownClients.add(author);
      }
      // Latest writer last: past AGENT_CARETS, the room hears of the agents that wrote most recently.
      agents.delete(key);
      agents.set(key, found);
      return found;
    };
    /** An agent's change, put into the copy under its own client id (its origin, so its frames name it and its name tag
     * takes it back), its caret left at the end of its first changed range. */
    const writeAgent = (who: LiveAuthor, changes: TextChange[]) => {
      const agent = agentAuthor(who), origin = authorOrigin(agent.author, true), own = doc.clientID;
      doc.clientID = agent.author;
      try { doc.transact(() => { applyText(changes); }, origin); }
      finally { doc.clientID = own; }
      const first = changes.at(-1);
      if (first) agent.at = Y.createRelativePositionFromTypeIndex(text, Math.min(first.start + first.text.length, text.length));
      tellCaret();
      caretsMoved();
    };
    /** `changes`, ordered from the end of the text back, applied to the copy's text. */
    const applyText = (changes: TextChange[]) => {
      for (const change of changes) {
        if (change.end > change.start) text.delete(change.start, change.end - change.start);
        if (change.text) text.insert(change.start, change.text);
      }
    };

    const frame = (kind: number, payload: Uint8Array, id: number) => {
      const out = new Uint8Array(HEAD + payload.length), view = new DataView(out.buffer);
      out[0] = kind;
      out[1] = synced ? 1 : 0;
      out.set(copyId ?? NO_COPY, 2);
      view.setUint32(22, id);
      out.set(payload, HEAD);
      return out;
    };
    const send = (kind: number, payload: Uint8Array, id = me) => {
      if (stopped || HEAD + payload.length > FRAME_LIMIT) return Promise.resolve(false);
      return room.send(frame(kind, payload, id)).catch(() => false);
    };
    /** The draft now follows the shared copy (outside history: someone else's change). */
    /** A name-tag Undo running in this tab: this tab's own step, recorded in `history`. */
    let taking: { undo: import("yjs").UndoManager; history: string | undefined } | undefined;
    const follow = (changes?: TextChange[], own?: { history: string | undefined }) => {
      const now = text.toString(), draft = store.text(scope, path);
      if (draft === undefined || draft === now) return;
      const between = changesBetween(draft, now, changes);
      // A name-tag Undo is this tab's own step: its Undo puts their words back (as this tab's), its Redo takes them again.
      if (own && store.edit({ scope, path, history: own.history, label: "Undo their change", changes: between }).ok) return;
      store.edit({ scope, path, changes: between, record: false, origin: "shared", rebase: rebaseHistory });
    };

    // A reload or a closed tab keeps the newest copy too.
    const page = typeof window === "undefined" ? undefined : window;
    const hidden = () => { if (document.visibilityState === "hidden") keep(); };
    page?.addEventListener("pagehide", keep);
    page?.document.addEventListener("visibilitychange", hidden);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      // Alone, nothing goes out: whoever joins next is caught up by HELLO and REPLY.
      // An agent's change goes out under its own client id (ticket am-25), the tab's own under the tab's. The outside
      // participant's words, and the copy taking out words of a way into a version it does not keep, are no one's.
      if (origin === OUTSIDE) { if (editors) void send(GITHUB, update); }
      else if (origin !== REMOTE && !theirs.has(origin as object) && editors)
        void send(UPDATE, update, typeof origin === "object" && origin ? agentIds.get(origin) ?? me : me);
      if (synced && keeping === undefined) keeping = clock.setTimeout(keep, KEEP_MS);
    });
    text.observe((event, transaction) => {
      textChanged = true;
      if (synced && transaction.origin !== LOCAL && !quiet)
        follow(deltaChanges(event.delta as { retain?: number; insert?: unknown; delete?: number }[]), taking && transaction.origin === taking.undo ? taking : undefined);
      // Any change can make someone's change undoable or not (their words removed since): the name tags look again.
      if (authors.size) authorsChanged();
      // Others' carets stay by their words: they are read again in the new text.
      if (synced && (peers.size || agents.size)) caretsMoved();
    });
    /** Whether undoing `item` changes the text: some of the words it added are still there, or it removed words
     * (other than its own) that Yjs can put back. Yjs itself skips items that change nothing. */
    const undoable = (item: import("yjs").UndoManager["undoStack"][number]) => {
      for (const [client, ranges] of item.deletions.clients) for (const { clock, len } of ranges)
        for (let at = clock; at < clock + len; at++) if (!Y.isDeleted(item.insertions, Y.createID(client, at))) return true;
      if (!item.insertions.clients.size) return false;
      const gone = Y.createDeleteSetFromStructStore(doc.store);
      for (const [client, ranges] of item.insertions.clients) for (const { clock, len } of ranges)
        for (let at = clock; at < clock + len; at++) if (!Y.isDeleted(gone, Y.createID(client, at))) return true;
      return false;
    };
    const unsubscribe = store.subscribe((event: DraftEvent) => {
      if (event.type !== "text" || event.key !== start.key || discarded || !synced || event.origin === "shared" || event.origin === "discard") return;
      // Another tab of this browser's saved draft, adopted (`reload`): it may lag behind this copy, so the draft
      // follows the copy again rather than sending that text to everyone as this tab's edit.
      if (event.origin === "external") { follow(); return; }
      const now = text.toString();
      if (event.text === now) return;
      // From the end back; two put in at one place go in the later one first, so they stay in the draft's order
      // (src/draft-store.ts `applyChanges` keeps the given order at one place).
      const changes = changesBetween(now, event.text, event.changes).sort((a, b) => a.start - b.start).reverse();
      // An agent's change written into this tab's drafts (ticket am-25) joins the copy as the agent's.
      const agent = liveAuthor();
      if (agent) writeAgent(agent, changes);
      else doc.transact(() => { applyText(changes); }, LOCAL);
    });

    /** The edges the copy holds now. */
    const versions = () => edges(Y, doc);
    /** Whether the copy holds any occurrence of GitHub's `sha`. */
    const holds = (sha: string) => newestOf(versions(), sha) !== undefined;
    /** The copy's version for GitHub's `sha` that this tab is on: its own when it is that text, else the latest
     * occurrence the copy holds (`sha` when it holds none). */
    const nodeOf = (sha: string) => (keptBase && shaOf(keptBase) === sha && versionsOf(versions()).has(keptBase) ? keptBase : newestOf(versions(), sha) ?? sha);
    /**
     * After any change from outside this tab's typing: words of a way into a version the copy does not keep go (every
     * tab does the same, so it is done once in effect), and each edge that just came in is weighed for a clash with this
     * tab's own words (the latest version shows; one Undo of this tab brings its words back).
     */
    function settle() {
      if (!copyId) return;
      const all = versions(), gone = superseded(all);
      for (const edge of gone) {
        const out = wordsOf(doc, edge.client!);
        if (out.length) doc.transact(() => { applyText(out); }, OUTSIDE);
      }
      if (!synced) return;
      for (const edge of all) {
        if (weighed.has(edge.id)) continue;
        weighed.add(edge.id);
        // A clash is weighed once per version of GitHub's text: a second way into it (`joinVersions`) is the same commit.
        if (weighedVersions.has(edge.to)) continue;
        weighedVersions.add(edge.to);
        if (edge.client === undefined || gone.has(edge)) continue;
        const { out, back, clashed } = clashes(Y, doc, all, edge, client => ownClients.has(client), (client, clock) => Y.isDeleted(took, Y.createID(client, clock)));
        if (!out.length) continue;
        // No clash: what this tab holds twice goes as no one's change (the draft follows it outside history).
        if (!clashed) { doc.transact(() => { if (back) Y.applyUpdate(doc, back); applyText(out); }, OUTSIDE); continue; }
        // GitHub's words coming back go into the copy first, as every tab writes them (the draft does not follow them:
        // they are part of this tab's step below, whose change then writes only what the copy still lacks).
        if (back) { quiet = true; try { Y.applyUpdate(doc, back, OUTSIDE); } finally { quiet = false; } }
        const author = meta.get(`n:${edge.to}`), who = typeof author === "string" && author ? author.split(" · ")[0] : "Someone";
        store.edit({ scope, path, history: ports.history?.(scope, path), label: `${who}'s change`, changes: out });
      }
      moveBase(all);
    }
    /** Another tab brought a newer version of GitHub's text into the copy (its fold, or its workspace read it): this tab's
     * draft, which follows the copy and so holds that version's words, is over that version from now on. */
    function moveBase(all: readonly Edge[]) {
      const file = store.get(scope, path);
      if (!keptBase || !file || file.baseSha !== shaOf(keptBase) || !versionsOf(all).has(keptBase)) return;
      const tip = tipOf(all, keptBase);
      if (tip === keptBase) return;
      const tipText = textAt(Y, doc, all, tip);
      if (tipText === undefined) return;
      store.acceptBase(scope, path, { text: tipText, baseSha: shaOf(tip) });
      keptBase = tip;
    }

    /** Writes the outside participant's edge from `from` to GitHub's `to` (its text `toText`), unless the copy holds `to` already. */
    async function edgeTo(from: string, to: string, toText: string) {
      const at = edgeFor(versions(), from);
      if (!at) return false;
      const client = await edgeClient(from, to, at.snapshot);
      if (stopped) return false;
      if (versionsOf(versions()).has(to)) return true;
      // The snapshot its client id was derived from: another tab deriving the same id writes the very same items.
      const update = edgeUpdate(Y, doc, at, to, toText, client);
      if (!update) return false;
      Y.applyUpdate(doc, update, OUTSIDE);
      return true;
    }

    /** The versions before `sha` on the branch, newest first, until `enough` says so (at most HISTORY_LIMIT); none when
     * GitHub's history could not be read (a rate limit, the network) or is not there. */
    async function history(sha: string, enough: (version: LiveVersion) => boolean) {
      const before = ports.github?.(scope, path)?.before;
      if (!before) return undefined;
      const out: LiveVersion[] = [];
      try {
        for await (const version of before(sha)) {
          if (stopped) return undefined;
          out.push(version);
          if (enough(version) || out.length >= HISTORY_LIMIT) break;
        }
      } catch { return undefined; }
      return stopped ? undefined : out;
    }
    /** The version right before `sha` on the branch. */
    const parentOf = async (sha: string) => (await history(sha, () => true))?.[0];
    /**
     * Brings GitHub's version `version` into the copy along GitHub's history of the file: it enters on top of the version
     * right before it, and that one first, on top of its own, when the copy lacks it, back to a version the copy holds
     * as that very occurrence of its text (`occurrenceAfter`: a revert's text the copy holds only from before is read
     * past). Every tab bringing the same versions writes the same items, so they enter once and in GitHub's order,
     * whichever tab heard which commit first. A page going back and forth (A B A B A) that this tab missed more than
     * one turn of can look like a turn it holds, and so can the copy's first version: it then enters on that one, and
     * the copy, holding two ways into the version, keeps the one that came by more versions (`superseded`). Telling
     * them apart needs GitHub's commit ids. False when the history could not be read or does not reach a version the
     * copy holds within HISTORY_LIMIT versions. `again`: GitHub's newest brings back a text the copy holds (a revert),
     * which enters as its next occurrence.
     */
    async function enter(version: LiveVersion, again = false) {
      if (!again && holds(version.sha)) return true;
      /** The copy's version the chain starts from, and a version read that the copy holds some occurrence of. */
      let from: string | undefined, held: LiveVersion | undefined;
      const older = await history(version.sha, before => {
        // The version before a held one tells which occurrence of its text it is.
        if (held) from = occurrenceAfter(versions(), held.sha, before.sha, holds(before.sha));
        held = from || !holds(before.sha) ? undefined : before;
        return from !== undefined;
      });
      if (!older?.length) return false;
      // Read only to tell the occurrence; or the file's first version (or the history's limit): its latest occurrence.
      if (from) older.pop();
      else if (held && held === older.at(-1)) from = newestOf(versions(), held.sha);
      if (!from) return false;
      const chain = [version, ...older];
      for (let index = chain.length - 2; index >= 0; index--) {
        const entered = await take(from, chain[index]);
        if (!entered) return false;
        from = entered;
      }
      return !stopped;
    }
    /** `version` enters on top of the copy's version `from`: a save from this room as its note says (waiting for the
     * note when the commit says it was this room's), else as the outside participant. The copy's version it is now. */
    async function take(from: string, version: LiveVersion) {
      const at = () => occurrenceOn(versions(), from, version.sha);
      if (versionsOf(versions()).has(at())) return at();
      const ours = copyId !== undefined && version.copies?.includes(hex(copyId));
      const noted = ours ? await noteFor(version, from) : noteOf(version, from);
      if (stopped) return undefined;
      const node = at();
      if (versionsOf(versions()).has(node)) return node;
      if (noted) { doc.transact(() => { meta.set(`g:${node}`, noted); }, META); return node; }
      // This room's save whose note never came (its tab left before it could note it): the branch loads again.
      return !ours && await edgeTo(from, node, version.text) ? node : undefined;
    }
    /** The key of the note of a save of `version`'s text in the copy, once its items have all arrived: the one this
     * room's save from `from` wrote, else one no version took yet (from another version, or written before notes
     * named theirs). A note a version took is that version's: a revert's save of the same text has a note of its own. */
    function noteOf(version: LiveVersion, from?: string) {
      const fits = (key: string) => {
        const snapshot = meta.get(`s:${key}`);
        return snapshot instanceof Uint8Array && typeof meta.get(`t:${key}`) === "string" && savedText(snapshot) === version.text;
      };
      const own = from === undefined ? undefined : noteKey(from, version.text);
      if (own && fits(own)) return own;
      const taken = new Set<unknown>();
      for (const [key, value] of meta.entries()) if (key.startsWith("g:")) taken.add(value);
      for (const [key, over] of meta.entries()) {
        if (!key.startsWith("t:") || typeof over !== "string") continue;
        // Only a note of this very text (its key says so) is made again to be sure.
        const note = key.slice(2);
        if (note !== own && !taken.has(note) && (note === noteKey(over, version.text) || note === savedKey(version.text)) && fits(note)) return note;
      }
      return undefined;
    }
    /** `noteOf`, waiting for the note (as long as a catch-up may take) while it has not come. */
    function noteFor(version: LiveVersion, from?: string) {
      const found = noteOf(version, from);
      if (found || stopped) return Promise.resolve(found);
      return new Promise<string | undefined>(resolve => {
        const done = (key: string | undefined) => { notesWaiting.delete(end); doc.off("update", check); clock.clearTimeout(timer); resolve(key); };
        const end = () => done(undefined);
        const check = () => { const key = stopped ? undefined : noteOf(version, from); if (key || stopped) done(key); };
        const timer = clock.setTimeout(() => done(stopped ? undefined : noteOf(version, from)), LIVE_TEXT_CATCH_UP_MS);
        doc.on("update", check);
        notesWaiting.add(end);
      });
    }
    /** Waits for notes that end when the copy goes. */
    const notesWaiting = new Set<() => void>();

    /**
     * Brings this tab's version of GitHub's text and the copy's together before its draft goes in. GitHub's newest
     * version (or, unread, the one the tab's workspace read), when the copy lacks it, enters along GitHub's history
     * (`enter`). Then the draft moves onto the newest version the copy holds from there (or from its own version; a draft
     * over a version the copy never held moves onto the copy's newest), merged as a fold into a draft merges it
     * (src/outside-merge.ts).
     */
    async function bringBase() {
      /** Versions asked about once: noted as a save, or brought in. */
      const checked = new Set<string>();
      /** GitHub's newest version could not be brought in (its history unread): a version the copy lacks may be newer. */
      let unread = false;
      for (let round = 0; round < 5; round++) {
        const file = store.get(scope, path);
        if (!file) return undefined;
        const base = await versionOf(file.baseSha, file.base), shown = ports.github?.(scope, path);
        if (stopped) return undefined;
        if (store.get(scope, path)?.base !== file.base) continue;
        const all = versions(), head = headOf(all);
        if (!head) return undefined;
        // This tab's version is the copy's text exactly (its own save, noted before it could take part): the copy holds
        // it, on top of the version before it.
        if (!holds(base) && file.baseSha && text.toString() === file.base && !checked.has(base)) {
          checked.add(base);
          // GitHub's history unread: on top of the copy's newest, as its very text says.
          const older = await history(base, () => true);
          if (stopped) return undefined;
          const from = older === undefined ? headOf(versions()) : older[0] && nodeOf(older[0].sha);
          if (from && versionsOf(versions()).has(from) && text.toString() === file.base) noteCopy(from, base);
          continue;
        }
        if (shown && !checked.has(shown.sha)) {
          checked.add(shown.sha);
          const latest = await shown.newest?.().catch(() => undefined) ?? shown;
          if (stopped) return undefined;
          // Not brought in (its history unread): the draft moves onto the copy's newest, and a later fold loads the branch.
          if (!holds(latest.sha) && !await enter(latest)) unread = true;
          if (stopped) return undefined;
          continue;
        }
        const node = nodeOf(base), target = shown && holds(shown.sha) ? tipOf(all, nodeOf(shown.sha)) : holds(base) ? tipOf(all, node) : head;
        if (!holds(base) && unread && ownSaves.get(base) === file.base) {
          // This tab's own save, made while the copy was starting, that GitHub's history could not place: its words are the
          // draft's own, over the copy's version (noted as the save once they went in, `begin`). With the history read,
          // the save enters as GitHub's version (`enter`) and the draft adds nothing over it.
          store.acceptBase(scope, path, { text: textAt(Y, doc, all, target)!, baseSha: shaOf(target) });
          continue;
        }
        // A version the copy lacks that may be newer than its own: moved back, the draft would lose that version's words.
        // The copy is not joined (no doubled page, no lost words); a commit then loads the branch again.
        if (!holds(base) && unread) return undefined;
        if (target !== node) {
          const theirs = textAt(Y, doc, all, target)!, merged = mergeText(file.base, file.text, theirs);
          // A resumed copy holds this tab's words already: only its base moves; the clash rule runs in the copy (`settle`).
          if (resume) { store.acceptBase(scope, path, { text: theirs, baseSha: shaOf(target) }); continue; }
          if (merged.mine !== file.text) store.edit({ scope, path, text: merged.mine, record: false, origin: "shared", rebase: rebaseHistory });
          store.acceptBase(scope, path, { text: theirs, baseSha: shaOf(target) });
          // By whole words, so its Undo puts whole words back into the copy too.
          if (merged.clashed) store.edit({ scope, path, history: ports.history?.(scope, path), label: "GitHub's change", changes: runChanges(merged.mine, merged.text) });
          continue;
        }
        return { base: node, text: file.base };
      }
      return undefined;
    }

    /**
     * Starts this tab's part in the copy: alone (`caught` false), or no one caught it up, its own draft
     * goes in; caught up by a tab that was, it keeps the room's copy and adds its own changes only when
     * they are not the room's text already. Its draft's changes over its version of GitHub's text enter under the id
     * every tab with the same draft uses. Remote changes wait in the copy meanwhile; the draft follows after.
     */
    async function begin(caught: boolean) {
      if (synced || starting) return;
      starting = true;
      clock.clearTimeout(waiting);
      /** A copy of the room caught this tab up while it was starting its own: it joins that one once this start ends. */
      let joined = false;
      try {
        if (!copyId) {
          // No copy of the room came to this tab: it starts one, from its own version of GitHub's text.
          const file = store.get(scope, path);
          if (!file) return;
          const version = await versionOf(file.baseSha, file.base), birth = await birthUpdate(Y, version, file.base);
          const id = (await digest(`copy\n${version}\n${start.key}`)).subarray(0, 20);
          if (stopped) return;
          if (copyId) { joined = true; return; }
          Y.applyUpdate(doc, birth, OUTSIDE);
          copyId = id;
        }
        // The text the draft is over before its base moves to the copy's: a resumed draft's typing since is read against it.
        let draftOver = store.get(scope, path)?.base;
        // Resumed, and saved while the copy was starting: the typing up to the save goes in first (the saved text is the
        // draft's own), then the copy, holding that text, is noted as the save, so its words do not come in again as
        // GitHub's change; then the typing since the save.
        const savedNow = store.get(scope, path);
        if (resume && resume.base && savedNow?.baseSha && ownSaves.get(savedNow.baseSha) === savedNow.base
          && !versionsOf(versions()).has(occurrenceOn(versions(), resume.base, savedNow.baseSha))) {
          const keptOver = textAt(Y, doc, versions(), resume.base);
          if (keptOver !== undefined && versionsOf(versions()).has(resume.base)) {
            resumeDraft(resume, keptOver, savedNow.base);
            resumed = true;
            draftOver = savedNow.base;
            if (text.toString() === savedNow.base) noteCopy(resume.base, occurrenceOn(versions(), resume.base, savedNow.baseSha));
            const own = store.text(scope, path), change = own === undefined ? undefined : typedSince(text.toString(), savedNow.base, own);
            if (change) { const now = text.toString(); doc.transact(() => { applyText(wordRuns(now, change)); }, START); }
          }
        }
        // A save or a commit can move the draft's version while it goes in: the versions are brought together again.
        versions: for (let round = 0; round < 5; round++) {
          const at = await bringBase();
          if (!at || stopped) return;
          keptBase = at.base;
          // Resumed from its own kept copy: what the draft took on after the copy was kept goes in, unless the copy has it now.
          if (resume) { if (!resumed) resumeDraft(resume, draftOver ?? at.text); synced = true; break; }
          for (;;) {
            const own = store.text(scope, path), base = store.get(scope, path)?.base;
            const adds = (now: string | undefined) => now !== undefined && now !== base && (!caught || now !== text.toString());
            const edge = edgeFor(versions(), at.base);
            if (!edge || base !== at.text) continue versions;
            // `runs`: the draft goes in word by word (`wordRuns`) over the copy as it was at its version.
            const client = adds(own) ? await clientOf(`runs\n${at.base}\n${edge.id}\n${own}`) : undefined;
            if (stopped) return;
            // Typed meanwhile, or the room's copy caught up with it: decide again on the text as it is now.
            if (store.text(scope, path) !== own || adds(own) !== (client !== undefined)) continue;
            if (store.get(scope, path)?.base !== at.text) continue versions;
            if (client !== undefined) { Y.applyUpdate(doc, draftUpdate(Y, doc, edge, at.text, own!, client), START); startClient = client; ownClients.add(client); }
            synced = true;
            break versions;
          }
        }
      } finally {
        starting = false;
        // The answer to its request came during the start (`receive` could not begin then): it begins as caught up now.
        if (joined && !stopped) void begin(true);
      }
      // A save waiting for this start goes on (`caughtUp`); a commit tries again (and waits on).
      if (!synced) { foldsReady(); return; }
      // Saved while the copy was starting: the draft went in over the copy's version, and the copy, holding the saved text
      // now, is noted as the save, so its words do not come in again as GitHub's change.
      for (const [sha, saved] of ownSaves) {
        const node = keptBase && occurrenceOn(versions(), keptBase, sha);
        if (!keptBase || !node || versionsOf(versions()).has(node) || text.toString() !== saved || store.get(scope, path)?.text !== saved) continue;
        noteCopy(keptBase, node);
        store.acceptBase(scope, path, { text: saved, baseSha: sha });
        keptBase = node;
        break;
      }
      follow();
      for (const request of asked.splice(0)) answer(request.kind, request.theirs, request.from, request.vector);
      keep();
      // Commits that came in before this tab took part are not weighed for a clash: its own words came after them. A
      // resumed copy's words came before the commits it did not hold yet: those are weighed.
      if (!resume) for (const edge of versions()) { weighed.add(edge.id); weighedVersions.add(edge.to); }
      settle();
      // Changes others sent while this tab was catching up can be taken back from now on.
      if (authors.size) authorsChanged();
      // Its caret and theirs are in the shared text from now on.
      tellCaret();
      caretsMoved();
      // Caught up, it asks the others for what only it has (a resumed copy, its own changes); starting its own
      // copy, it tells the room, in case another did the same meanwhile.
      hello();
      foldsReady();
    }

    /**
     * The draft's changes after the kept copy's last write (`typedSince` from the draft as it was kept; from the share's
     * start for copies kept without it), made word by word on the kept copy and merged as Yjs merges typing, as if typed
     * then: the words it removes are those items, wherever others' changes moved them, so text others changed in that
     * range meanwhile is neither typed again nor lost. Where that lands in the copy as it is now goes in as this tab's own
     * change. The room may have caught this copy up with them already (they were shared before a reload lost the copy's
     * write): if what lies between the change's two ends holds its text, nothing goes in. A draft kept over an older
     * version of GitHub's text than the one it is over now (`over`: a commit folded into it while the file was closed)
     * is taken as merged onto it, as that fold merged it. `own`: the draft to resume up to (the draft now by default).
     */
    function resumeDraft(resume: KeptCopy, over: string, own = store.text(scope, path)) {
      let began = resume.draft ?? start.text;
      const keptOver = resume.base === undefined ? undefined : textAt(Y, doc, versions(), resume.base);
      if (keptOver !== undefined && keptOver !== over) began = mergeText(keptOver, began, over).text;
      const change = own === undefined ? undefined : typedSince(keptText, began, own);
      if (!change) return;
      // The kept copy again, apart: its change names the kept copy's items.
      const kept = new Y.Doc({ gc: false });
      Y.applyUpdate(kept, resume.update);
      const keptType = kept.getText("source");
      const from = Y.createRelativePositionFromTypeIndex(keptType, change.start, -1), to = Y.createRelativePositionFromTypeIndex(keptType, change.end);
      const at = Y.createAbsolutePositionFromRelativePosition(from, doc)?.index, till = Y.createAbsolutePositionFromRelativePosition(to, doc)?.index;
      const was = keptText.slice(change.start, change.end);
      const between = at === undefined || till === undefined || till < at ? undefined : text.toString().slice(at, till);
      if (between !== undefined && between !== was && change.text && between.includes(change.text)) { kept.destroy(); return; }
      const before = Y.encodeStateVector(kept);
      kept.transact(() => {
        for (const run of wordRuns(keptText, change)) {
          if (run.end > run.start) keptType.delete(run.start, run.end - run.start);
          if (run.text) keptType.insert(run.start, run.text);
        }
      });
      const typed = Y.encodeStateAsUpdate(kept, before);
      kept.destroy();
      // `typed` carries the kept copy's own random client id. Merged into a copy of this one, it shows where it lands in the
      // text as it is now; that change is made here again under this tab's own id, so carets and the name-tag Undo name this
      // tab (applying an update made under this tab's id would make Yjs give this doc a new one).
      const merged = new Y.Doc({ gc: false });
      Y.applyUpdate(merged, Y.encodeStateAsUpdate(doc));
      let lands: TextChange[] = [];
      merged.getText("source").observe(event => { lands = deltaChanges(event.delta as { retain?: number; insert?: unknown; delete?: number }[]); });
      Y.applyUpdate(merged, typed);
      merged.destroy();
      if (lands.length) doc.transact(() => { applyText(lands.reverse()); }, START);
    }

    /** Commits taken one at a time, in the order this tab heard them. */
    let folding: Promise<unknown> = Promise.resolve();
    function fold(next: LiveCommit) {
      const run = folding.then(() => foldOne(next));
      folding = run.catch(() => undefined);
      return run;
    }
    /**
     * A commit GitHub has now (ticket am-59). GitHub's newest version, read now, is the one taken (a notice heard late
     * names an older one). Already in the copy (another tab took it first), it only moves this tab's base; a save from the
     * room (its note, `noteSave`) is taken as the new version with no text entering; otherwise it enters as the outside
     * participant along GitHub's history (`enter`): on top of the version right before it, that one first when the copy
     * lacks it. A version older than one the copy holds enters nothing.
     */
    async function foldOne(heard: LiveCommit) {
      if (!copyId) return false;
      /** The draft's version as the fold began: a save landing meanwhile moves it on, and the fold leaves it there. */
      const began = store.get(scope, path)?.baseSha;
      const latest = await ports.github?.(scope, path)?.newest?.().catch(() => undefined);
      if (stopped) return false;
      // The notice names no live copies; GitHub's history does (the commit's `Live-Copy` lines). A newer commit than the
      // notice's is labelled with the notice's author, a guess (GitHub's newest names none), for the clash step's label.
      const next: LiveCommit = latest && latest.sha !== heard.sha ? { ...latest, ...(heard.author ? { author: heard.author } : {}) } : { ...heard, copies: heard.copies ?? latest?.copies };
      const file = store.get(scope, path);
      if (!file) return false;
      const base = await versionOf(file.baseSha, file.base);
      if (stopped) return false;
      const all = versions(), from = nodeOf(base);
      /** The copy's version for it: an occurrence of its text on the way to this tab's version makes it a later one. */
      const node = occurrenceOn(all, from, next.sha), again = node !== from && node !== next.sha;
      if (next.author) doc.transact(() => { if (meta.get(`n:${node}`) !== next.author) meta.set(`n:${node}`, next.author!); }, META);
      if (!versionsOf(all).has(from)) return false;
      if (again && !versionsOf(all).has(node)) {
        // A version this tab's came after: a notice that waited behind a newer one (nothing to do).
        if (latest?.sha !== next.sha) return true;
        // GitHub's newest brings back an earlier text exactly (a revert): a save from this room enters as its next
        // occurrence, as its note says; an outside one loads the branch again.
        if (!next.copies?.includes(hex(copyId)) && !noteOf(next, from)) return false;
      }
      // A save whose note did not come and whose commit does not say it was this room's (its tab was catching up, or
      // saved outside the publish menu), while the copy still holds its very text.
      if (!again && !holds(next.sha) && !noteOf(next) && !next.copies?.includes(hex(copyId)) && next.text === text.toString()) {
        const parent = await parentOf(next.sha);
        if (stopped) return false;
        if (parent && holds(parent.sha) && !holds(next.sha) && next.text === text.toString()) noteCopy(nodeOf(parent.sha), next.sha);
      }
      if (!versionsOf(versions()).has(node) && !await enter(next, again)) return false;
      if (stopped) return false;
      const now = store.get(scope, path);
      // A save that landed during the fold moved the draft on to a newer version: it stays there (`saved`).
      if (now && (now.baseSha === began || now.baseSha === next.sha)) {
        if (now.base !== next.text || now.baseSha !== next.sha) store.acceptBase(scope, path, { text: next.text, baseSha: next.sha });
        keptBase = versionsOf(versions()).has(node) ? node : nodeOf(next.sha);
      }
      // A version the copy holds after it (a save noted meanwhile): the draft moves on to it (`moveBase`).
      settle();
      keep();
      return true;
    }
    /** The text a save's note holds, when its items have all arrived. */
    function savedText(snapshot: Uint8Array) {
      try {
        const { sv } = Y.decodeSnapshot(snapshot);
        for (const [client, at] of sv) if (Y.getState(doc.store, client) < at) return undefined;
        const at = copyAt(Y, doc, snapshot);
        try { return at.getText("source").toString(); } finally { at.destroy(); }
      } catch { return undefined; }
    }
    /** Notes the copy as it is now as holding GitHub's version `version` (a save from the room: its text is the copy's
     * text now), from `from`; with no version, only the note, for the commit to come (`noteSave`). */
    function noteCopy(from: string, version?: string) {
      const noted = noteKey(from, text.toString()), snapshot = Y.encodeSnapshot(Y.snapshot(doc));
      doc.transact(() => {
        meta.set(`s:${noted}`, snapshot);
        meta.set(`t:${noted}`, from);
        if (version) meta.set(`g:${version}`, noted);
      }, META);
    }
    /** This tab is about to save the file as `text`: when the copy holds that very text, it notes the copy as it is, so the
     * others take the commit as the copy's own text (`fold`). Whether it noted it. */
    function noteSave(saving: string) {
      if (!synced || discarded || saving !== text.toString() || !keptBase) return false;
      noteCopy(keptBase);
      return true;
    }
    /** This tab's save landed (`markSaved`): its note becomes the copy's newest version. */
    function saved() {
      const file = store.get(scope, path);
      if (!file?.baseSha || !synced) return;
      const sha = file.baseSha, node = keptBase ? occurrenceOn(versions(), keptBase, sha) : sha;
      if (!versionsOf(versions()).has(node)) {
        const noted = noteOf({ sha, text: file.base }, keptBase);
        if (noted) doc.transact(() => { meta.set(`g:${node}`, noted); }, META);
        // Saved without a note (not through the publish menu), while the copy holds that very text: the copy is that version.
        else if (keptBase && text.toString() === file.base) noteCopy(keptBase, node);
      }
      if (versionsOf(versions()).has(node)) keptBase = node;
      settle();
      keep();
    }

    /** This tab's caret as the room hears it: who it is (the Yjs client id its changes carry, its GitHub name) and where,
     * as relative positions read when it moved (the pane's selection read now, in the text as it is), so text others add
     * meanwhile does not shift it. At most every CARET_MS. */
    let telling: unknown, told: JsonValue | undefined;
    function tellCaret() {
      if (!synced || discarded || stopped) return;
      const at = (index: number) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length))) as JsonValue;
      const now = selection?.();
      // The agents whose text this tab wrote: each where its latest change ended (ticket am-25).
      const written = [...agents.values()].filter(agent => agent.at).slice(-AGENT_CARETS).map(agent => {
        const there = Y.relativePositionToJSON(agent.at!) as JsonValue;
        return { author: agent.author, name: agent.name, caret: { anchor: there, head: there } };
      });
      told = { author: me, name: cut(scope.account), caret: now ? { anchor: at(now.anchor), head: at(now.head) } : null,
        ...(startClient === undefined ? {} : { start: startClient }), ...(written.length ? { agents: written } : {}) };
      telling ??= clock.setTimeout(() => { telling = undefined; if (!stopped && told !== undefined) room.setPresence?.(told); }, CARET_MS);
    }
    /** Others' carets in this tab's text: whoever says where theirs is in a copy of this file that this one has the words of. */
    function carets(): LiveCaret[] {
      if (!synced || discarded) return [];
      const out: LiveCaret[] = [];
      // Someone else's say: only a position in this file's text counts. A named root type is looked up only when it is this
      // text's, as Yjs would make any other name a new empty type in this copy.
      const at = (json: unknown) => {
        if (!json || typeof json !== "object") return undefined;
        const said = json as { tname?: unknown; type?: unknown };
        if ((said.tname != null && said.tname !== "source") || said.type != null) return undefined;
        try {
          const found = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc);
          return found?.type === text ? found.index : undefined;
        } catch { return undefined; }
      };
      type Said = { author?: unknown; name?: unknown; agent?: unknown; caret?: { anchor?: unknown; head?: unknown } | null; agents?: unknown };
      /** One caret said: who, by name and author id, and where; `agent` its program, none for a person. */
      const read = (peer: string, said: Said | null, agent: (said: Said) => string | undefined) => {
        if (!said || typeof said !== "object" || !Number.isSafeInteger(said.author) || typeof said.name !== "string" || !said.caret) return;
        const anchor = at(said.caret.anchor), head = at(said.caret.head);
        if (anchor === undefined || head === undefined) return;
        const program = agent(said);
        out.push({ peer, author: said.author as number, name: cut(said.name), ...(program === undefined ? {} : { agent: program }), anchor, head });
      };
      for (const [peer, { access, state }] of peers) {
        const said = state as Said | null;
        read(peer, said, said => access === "agent" ? (typeof said.agent === "string" ? cut(said.agent) : "") : undefined);
        // The agents whose text a tab wrote into the copy, where their latest change ended (ticket am-25), named as their commands name them.
        if (access === "editor" && said && typeof said === "object" && Array.isArray(said.agents))
          for (const written of (said.agents as unknown[]).slice(0, AGENT_CARETS))
            if (written && typeof written === "object") read(`${peer}/${(written as Said).author}`, written as Said, said => cut(said.name as string));
      }
      // The agents whose text this tab wrote, drawn here too.
      for (const agent of agents.values()) {
        const index = agent.at && Y.createAbsolutePositionFromRelativePosition(agent.at, doc)?.index;
        if (index !== undefined) out.push({ peer: `agent/${agent.author}`, author: agent.author, name: agent.name, agent: agent.name, who: agent.who, anchor: index, head: index });
      }
      // Two participants naming the same author (or this tab's own id): one of them is not who it says, so neither tag takes anything back.
      const claims = new Map<number, number>();
      for (const caret of out) claims.set(caret.author, (claims.get(caret.author) ?? 0) + 1);
      for (const caret of out) if (caret.author === me || claims.get(caret.author)! > 1) caret.contested = true;
      return out;
    }

    /** Client ids whose text reached this copy from others and that no one here has been named for yet (ticket am-26). */
    const unnamed = new Set<number>();
    /** Who presence says wrote under `id`: a tab (its own id or its draft's), an agent in the room, or one a tab wrote for. */
    function authorNamed(id: number): SaveAuthor | undefined {
      type Said = { author?: unknown; start?: unknown; name?: unknown; agents?: unknown };
      for (const { access, state } of peers.values()) {
        const said = state as Said | null;
        if (!said || typeof said !== "object") continue;
        if ((said.author === id || said.start === id) && typeof said.name === "string")
          return access === "agent" ? { name: cut(said.name), agent: true } : { name: cut(said.name) };
        if (access === "editor" && Array.isArray(said.agents))
          for (const written of (said.agents as unknown[]).slice(0, AGENT_CARETS)) {
            const agent = written as Said | null;
            if (agent && typeof agent === "object" && agent.author === id && typeof agent.name === "string") return { name: cut(agent.name), agent: true };
          }
      }
      return undefined;
    }
    /** Notes for the commit everyone presence now names among the ids whose text came from others. */
    function nameAuthors() {
      for (const id of unnamed) {
        const who = authorNamed(id);
        if (who) { (ports.authors ?? saveAuthors()).note(start.key, store.get(scope, path)?.baseSha ?? null, who); unnamed.delete(id); }
      }
    }
    /** The clients whose text an update just added to this copy (their clock moved on from `before`), and `sender`, whose
     * own change (an UPDATE frame) changed the text: a deletion adds no text of its own, only marks others' as deleted, so
     * its author shows only as the frame's sender. This tab's own ids, and the agents it writes for, are not others'. A
     * catch-up repeating text this copy holds already names no one again. The outside participant's and the copy's
     * birth's ids are GitHub's, no one's. */
    function heardFrom(before: Map<number, number>, sender?: number) {
      const clients = [...Y.decodeStateVector(Y.encodeStateVector(doc))].filter(([client, clock]) => clock > (before.get(client) ?? 0)).map(([client]) => client);
      const github = new Set(versions().map(edge => edge.client));
      for (const client of sender === undefined ? clients : [...clients, sender]) {
        const local = authors.get(client);
        if (client === me || client === startClient || github.has(client) || (local && agentIds.has(local.origin)) || unnamed.size >= UNNAMED_LIMIT) continue;
        unnamed.add(client);
      }
      nameAuthors();
    }

    function hello() {
      if (stopped) return;
      void send(HELLO, Y.encodeStateVector(doc)).then(sent => {
        if (!sent || synced || stopped) return;
        clock.clearTimeout(waiting);
        waiting = clock.setTimeout(() => { void begin(false); }, LIVE_TEXT_CATCH_UP_MS);
      });
    }
    /** After a new room key or a reconnect: every tab asks again for what it is missing, and a commit waits for the answer. */
    function again() {
      if (synced) {
        catching = true;
        clock.clearTimeout(caught);
        caught = clock.setTimeout(() => { catching = false; foldsReady(); }, LIVE_TEXT_CATCH_UP_MS);
      }
      hello();
    }
    // Every caught-up copy answers every request, and after a new key every copy asks: frames grow with the square of the
    // people in the room, fine for the 2-5 this is for (ADR 0003, join traffic).
    function answer(kind: number, theirs: boolean, from: number, vector: Uint8Array) {
      void send(REPLY, Y.encodeStateAsUpdate(doc, vector), from);
      if (kind === HELLO && theirs) void send(ASK, Y.encodeStateVector(doc));
    }
    /** Copies this one told of itself, after meeting them (`meet`). */
    const toldCopies = new Set<string>();
    /**
     * Two copies of one room met (a tab started its own while another's was out of reach, or came back with a copy kept
     * from before the others started theirs): the one with the lower id stays (an order that never changes as copies merge, so tabs never bounce between them) and the tabs of
     * the other join it, their drafts going in as a newcomer's do. Every tab decides the same from the frames alone.
     */
    function meet(other: Uint8Array) {
      if (!copyId) return;
      const lower = [...other].findIndex((byte, index) => byte !== copyId![index]);
      const theirsWin = lower >= 0 && other[lower] < copyId[lower];
      if (theirsWin) {
        preferred.set(start.key, Uint8Array.from(other));
        leaving = true;
        keeper.write(start.key, undefined);
        // The draft keeps only GitHub's text and this browser's own words: they go into the other copy as a newcomer's
        // draft does, and everyone else's words of this copy go in from their own tabs, so none goes in twice.
        const mine = ownDraft();
        if (mine !== undefined && mine !== store.text(scope, path)) store.edit({ scope, path, text: mine, record: false, origin: "shared", rebase: rebaseHistory });
        ended("again");
        return;
      }
      const name = hex(other);
      if (toldCopies.has(name)) return;
      toldCopies.add(name);
      hello();
    }
    /**
     * The draft with only GitHub's text and this browser's own words of this copy: a draft following the copy (caught up)
     * as the copy has it at its newest version; a resumed draft not started yet as its kept copy has it at the version it
     * was kept over, with what was typed since. None when the draft holds no one else's words (a joiner not caught up).
     */
    function ownDraft() {
      const keepOf = (snapshot: Uint8Array) => {
        const { sv } = Y.decodeSnapshot(snapshot);
        return (client: number, at: number) => ownClients.has(client) || at < (sv.get(client) ?? 0);
      };
      if (synced) {
        const head = edgeFor(versions(), headOf(versions()) ?? "");
        return head && textWith(doc, keepOf(head.snapshot));
      }
      const file = store.get(scope, path), own = store.text(scope, path);
      if (!resume?.base || !file || own === undefined) return undefined;
      const kept = new Y.Doc({ gc: false });
      try {
        Y.applyUpdate(kept, resume.update);
        const all = edges(Y, kept), over = edgeFor(all, resume.base);
        if (!over || textAt(Y, kept, all, resume.base) !== file.base) return undefined;
        const keep = keepOf(over.snapshot), keptType = kept.getText("source");
        const change = typedSince(keptType.toString(), resume.draft ?? start.text, own);
        if (change) kept.transact(() => {
          for (const run of wordRuns(keptType.toString(), change)) {
            if (run.end > run.start) keptType.delete(run.start, run.end - run.start);
            if (run.text) keptType.insert(run.start, run.text);
          }
        });
        return textWith(kept, (client, at) => client === kept.clientID || keep(client, at));
      } finally { kept.destroy(); }
    }
    /** A caught-up copy of the room has been heard from: this tab joins it rather than starting one. */
    let heardCopy = false;
    function receive(bytes: Uint8Array) {
      if (bytes.length < HEAD) return;
      const view = new DataView(bytes.buffer, bytes.byteOffset), kind = bytes[0], theirs = bytes[1] === 1;
      const tag = bytes.subarray(2, 22), id = view.getUint32(22), payload = bytes.subarray(HEAD);
      const none = sameTag(tag, NO_COPY);
      if (theirs && !none) heardCopy = true;
      try {
        if (kind === HELLO || kind === ASK) {
          // Tabs that have no caught-up copy yet ask one another: the one with a copy of its own (kept from before), else
          // the lower id, starts the room's copy at once, and the others are caught up by it, so a room starts one copy.
          // Two tabs back with the same kept copy, neither caught up: the lower id starts. A tab that heard from a caught-up
          // copy of the room waits for it instead.
          if (kind === HELLO && !theirs && !synced && !starting && (none ? copyId || (me < id && !heardCopy) : copyId && sameTag(tag, copyId) && me < id)) void begin(false);
          // A request from a tab with no copy, while this one has none either: answered once this one has (it starts the
          // room's copy, or is caught up), so a joiner is not left waiting for the fallback.
          if (!copyId) {
            if (none) { if (asked.length < INBOX_LIMIT) asked.push({ kind, theirs, from: id, vector: Uint8Array.from(payload) }); }
            // A caught-up copy says it is here (after a reconnect, its request lost before): this tab asks it, rather than
            // waiting out the fallback and starting a copy of its own.
            else if (kind === HELLO && theirs && !synced && !starting) void send(HELLO, Y.encodeStateVector(doc));
            return;
          }
          // A request from another copy of the room: the two meet. One from a tab with no copy yet is answered.
          if (!none && !sameTag(tag, copyId)) { meet(tag); return; }
          // Only a copy that is caught up answers: a seed alone would tell a waiting tab the room is empty.
          if (synced && !starting) answer(kind, theirs, id, payload);
          else if (asked.length < INBOX_LIMIT) asked.push({ kind, theirs, from: id, vector: Uint8Array.from(payload) });
          return;
        }
        if (kind !== REPLY && kind !== UPDATE && kind !== GITHUB) return;
        if (none) return;
        if (!copyId) {
          // Joining: the first answer to this tab's own request from a caught-up copy (the one the room agreed on, when
          // two met) makes this copy that one.
          const wanted = preferred.get(start.key);
          if (kind !== REPLY || !theirs || id !== me || (wanted && !sameTag(wanted, tag))) return;
          copyId = Uint8Array.from(tag);
        } else if (!sameTag(tag, copyId)) { meet(tag); return; }
        // A frame naming an agent whose text this tab writes is not that agent's here: only this tab writes under its id.
        const local = authors.get(id), agentHere = local !== undefined && agentIds.has(local.origin);
        const before = Y.decodeStateVector(Y.encodeStateVector(doc)), theirChange = kind === UPDATE && id !== me && !agentHere;
        textChanged = false;
        Y.applyUpdate(doc, payload, theirChange ? authorOrigin(id) : REMOTE);
        heardFrom(before, theirChange && textChanged ? id : undefined);
        // Caught up only by an answer to its own request: one to another tab's holds only what that tab lacked.
        if (kind === REPLY && theirs && id === me) {
          if (!synced) void begin(true);
          else if (catching) { catching = false; clock.clearTimeout(caught); foldsReady(); }
        }
        settle();
      } catch { /* A broken update is dropped; the next catch-up brings what it lacked. */ }
    }
    return {
      receive, hello, again, tellCaret, carets, nameAuthors, fold, noteSave, saved,
      id: () => copyId && hex(copyId),
      versions: () => versions().map(({ from, to, client }) => ({ from, to, ...(client === undefined ? {} : { client }) })),
      /** Whether a commit can enter now: caught up, and not catching up again after a reconnect. */
      ready: () => synced && !catching && !starting,
      starting: () => starting,
      /** Alone in the room (first in, or everyone else left before catching this tab up): its own draft starts the copy. */
      startOwn: () => begin(false),
      /** The name-tag Undo: `author`'s latest change that still changes the text (its UPDATE frames, grouped as Yjs groups
       * typing), taken back in the copy, which everyone follows, and recorded as this tab's own step in `history`.
       * Changes it has taken back are not counted; a change whose words someone removed since is skipped. */
      authors: {
        undo(author, history) {
          const found = authors.get(author);
          if (!synced || discarded || !found) return false;
          taking = { undo: found.undo, history };
          try { return found.undo.undo() !== null; } finally { taking = undefined; }
        },
        can: author => synced && !discarded && Boolean(authors.get(author)?.undo.undoStack.some(undoable)),
      } satisfies AuthorUndo,
      destroy() {
        clock.clearTimeout(waiting); clock.clearTimeout(telling); clock.clearTimeout(caught); keep(); unsubscribe();
        for (const end of [...notesWaiting]) end(); page?.removeEventListener("pagehide", keep); page?.document.removeEventListener("visibilitychange", hidden);
        // Gone before anyone hears it: a name tag asking now finds nothing to take back.
        const had = authors.size > 0;
        for (const { undo } of authors.values()) undo.destroy();
        authors.clear();
        doc.destroy();
        if (had) authorsChanged();
      },
    };
  }

  const authors: AuthorUndo = {
    undo: (author, history) => copy?.authors.undo(author, history) ?? false,
    can: author => copy?.authors.can(author) ?? false,
  };
  const carets = {
    list: () => copy?.carets() ?? [],
    on: (watcher: () => void) => { caretWatchers.add(watcher); return () => { caretWatchers.delete(watcher); }; },
    own: (next: (() => CaretSelection | undefined) | undefined) => { selection = next; copy?.tellCaret(); },
  };
  const stop = () => {
    stopped = true;
    clock.clearTimeout(unheard);
    if (live.get(start.key) === share) live.delete(start.key);
    stopSaves();
    unwatch();
    room.close();
    copy?.destroy();
    copy = undefined;
    for (const attempt of waitingFolds.splice(0)) attempt();
    caretsMoved();
    caretWatchers.clear();
  };
  return { stop, authors, carets };
}

/** The switch for live sharing: on unless this browser's localStorage holds `native-site-editor:live-sharing` = `off`
 * (tests pass `on`). On by default since slice am-31 (Lex, 2026-10-31); `off` keeps a browser out of every room. */
export const LIVE_SHARING_KEY = "native-site-editor:live-sharing";
function liveSharingOn() {
  try { return globalThis.localStorage?.getItem(LIVE_SHARING_KEY) !== "off"; } catch { return true; }
}

/**
 * Live sharing as it runs: calling it stops it. Its name-tag Undo (ticket am-24; carets call it from slices 22, 23 and
 * 25) takes back the latest text change of `author`, the Yjs client id a caret names, in the open file's shared copy.
 */
export interface LiveText {
  (): void;
  /**
   * Takes back `author`'s latest text change in the open file; false when there is none to take back. It is this tab's
   * own step in `history` (the Undo list of the page or pane the name tag is on; the file's own by default), so its
   * Undo puts their words back and its Redo takes them again.
   */
  undoAuthor(author: number, history?: string): boolean;
  /** Whether `author` has a text change in the open file the name tag can take back. */
  canUndoAuthor(author: number): boolean;
  /** Called when what the name tags can take back may have changed; returns its unsubscribe. */
  onAuthorUndo(listener: () => void): () => void;
}

/** Shares the open file while it is open in the draft store, for as long as this runs; calling the result stops it. */
export function startLiveText(ports: LiveTextPorts): LiveText {
  type Share = { key: string; stop(): void; authors?: AuthorUndo; drawing?: boolean; undraw?: () => void };
  let current: Share | undefined;
  const listeners = new Set<() => void>();
  const changed = () => { for (const listener of [...listeners]) try { listener(); } catch { /* A name tag must not break sharing. */ } };
  const port = (stop: () => void): LiveText => Object.assign(stop, {
    undoAuthor: (author: number, history?: string) => current?.authors?.undo(author, history) ?? false,
    canUndoAuthor: (author: number) => current?.authors?.can(author) ?? false,
    onAuthorUndo(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  // Who changed each file, for the commit (ticket am-26): an agent writing into this tab's drafts is named; a file whose
  // draft went, or is back to its saved text (Undo, Discard, a save here or elsewhere), has no authors.
  const fileAuthors = ports.authors ?? saveAuthors();
  const stopAgents = ports.store.subscribe(event => {
    if (event.type === "history") return;
    if (event.type === "file" && event.change === "dropped") { fileAuthors.forget(event.key); return; }
    if (event.type === "file" && event.change !== "saved" && event.change !== "base") return;
    const file = ports.store.get(event.scope, event.path);
    if (!file || file.baseSha === undefined) return;
    if (!file.changed) { fileAuthors.forget(event.key); return; }
    const agent = event.type === "text" && event.origin !== "shared" && event.origin !== "discard" && event.origin !== "external" ? liveAuthor() : undefined;
    if (agent) fileAuthors.note(event.key, file.baseSha, { name: cut(agent.name), agent: true });
  });
  if (!(ports.on ?? liveSharingOn())) return port(() => { stopAgents(); listeners.clear(); });
  const loadCarets = ports.loadCarets ?? (typeof document === "undefined" ? undefined
    : () => import("./components/live-carets").then(module => module.startCarets));
  /** The file this tab discarded while sharing: it stays out of the copy until another file shows. */
  let left: string | undefined;
  const check = () => {
    const scope = ports.scope(), path = ports.openFile.peek();
    const file = scope && path && scope.repoId > 0 ? ports.store.get(scope, path) : undefined;
    // A file GitHub's text is unknown for, or a deleted, opaque or uploaded one, has no text to share.
    const shareable = file && file.baseSha !== undefined && !file.flags?.deleted && !file.flags?.opaque && !file.flags?.upload;
    const key = shareable && file.key !== left ? file.key : undefined;
    if (current?.key === key) return;
    current?.stop();
    if (!key) { current = undefined; return; }
    const share: Share = { key, stop: () => undefined };
    current = share;
    const at = { scope: file!.scope, path: file!.path };
    const shared = shareFile(ports, at.scope, at.path, why => {
      if (current !== share) return;
      if (why === "left") left = key;
      share.stop();
      current = undefined;
      check();
    }, () => { if (current === share) changed(); }, () => {
      // Someone else is here: their carets are drawn (loaded once, with Yjs) for as long as this file is shared.
      if (current !== share || share.drawing || !loadCarets) return;
      share.drawing = true;
      void loadCarets().then(start => {
        if (current !== share) return;
        share.undraw = start({
          ...at, carets: shared.carets.list, onCarets: shared.carets.on, own: shared.carets.own,
          canUndo: author => shared.authors.can(author), undo: (author, history) => shared.authors.undo(author, history),
          onAuthorUndo: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        });
      }).catch(() => { share.drawing = false; });
    });
    share.stop = () => { share.undraw?.(); share.undraw = undefined; shared.stop(); };
    share.authors = shared.authors;
  };
  const stopEffect = effect(() => { void ports.openFile.value; untracked(() => { left = undefined; check(); }); });
  const stopStore = ports.store.subscribe(event => { if (event.type === "file") check(); });
  // `clear` (sign-out, another workspace) says nothing per file: any settled change looks again, which is cheap.
  const stopState = ports.store.subscribeState(check);
  return port(() => { stopAgents(); stopEffect(); stopStore(); stopState(); current?.stop(); current = undefined; listeners.clear(); });
}

