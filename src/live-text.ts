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
import type { DraftScope } from "./drafts";
import { openLiveRoom, type LiveClock, type LivePeer, type LiveRoom, type LiveRoomOptions } from "./live-room";
import type { JsonValue } from "../shared/agent-command";
import { LIVE_MESSAGE_LIMIT } from "../shared/live-room";
import { rebaseHistory } from "./shared-undo";
import { liveAuthor, type LiveAuthor } from "./live-author";
import { saveAuthors, type SaveAuthors } from "./save-authors";
import type { SaveAuthor } from "../shared/types";
import { runChanges } from "./text-merge";

type Yjs = typeof import("yjs");
type Doc = import("yjs").Doc;
type Room = Pick<LiveRoom, "send" | "close"> & Partial<Pick<LiveRoom, "setPresence">>;
type Store = Pick<DraftTextStore, "get" | "text" | "edit" | "subscribe" | "subscribeState">;

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
export interface KeptCopy { tag: Uint8Array; update: Uint8Array; draft?: string }
/** Where kept copies live: this browser only (memory, then IndexedDB), never the server. */
export interface CopyKeeper {
  read(key: string): Promise<KeptCopy | undefined>;
  write(key: string, copy: KeptCopy | undefined): void;
}

const HELLO = 1, ASK = 2, REPLY = 3, UPDATE = 4;
const HEAD = 2 + 20 + 4;
/** A tab that found others waits this long, after asking, for one of them to catch it up; then it starts from its own draft. */
export const LIVE_TEXT_CATCH_UP_MS = 5_000;
/** A caret that moves tells the room at most this often (typing moves it with every key). */
const CARET_MS = 50;
/** A name longer than this is cut: presence is only what others say of themselves. */
const NAME_LIMIT = 80;
/** The most agents' carets one tab's presence is read for (ticket am-25). */
const AGENT_CARETS = 16;
/** A name cut to NAME_LIMIT characters, never inside one. */
const cut = (name: string) => [...name].slice(0, NAME_LIMIT).join("");
/** The most client ids of others' text one copy holds while waiting for presence to name them (the starting texts' never are). */
const UNNAMED_LIMIT = 256;
/** Frames that arrive while Yjs loads wait, up to this many. */
const INBOX_LIMIT = 500;
/** The room closes a socket over its limit: a larger copy is not sent (the room's own framing needs a little room). */
const FRAME_LIMIT = LIVE_MESSAGE_LIMIT - 1024;
const LOCAL = Symbol("local"), REMOTE = Symbol("remote"), START = Symbol("start");
/** A copy is kept this long after its last change, as drafts are (src/drafts.ts), and at once when the page hides or the file
 * closes: the copy kept and the draft saved must say the same, or text shared since would go in again on resuming. */
const KEEP_MS = 200;

const isKept = (value: unknown): value is KeptCopy => {
  const copy = value as Partial<KeptCopy> | null;
  return !!copy && copy.tag instanceof Uint8Array && copy.tag.length === 20 && copy.update instanceof Uint8Array
    && (copy.draft === undefined || typeof copy.draft === "string");
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
const uint32 = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
/** The starting text's tag: its blob sha, or (a file not on GitHub) a hash of the text. */
async function tagOf(baseSha: string | null, base: string) {
  return baseSha && /^[a-f\d]{40}$/.test(baseSha)
    ? Uint8Array.from(baseSha.match(/../g)!, pair => parseInt(pair, 16))
    : (await digest(`new\n${base}`)).subarray(0, 20);
}
const sameTag = (a: Uint8Array, b: Uint8Array) => a.every((byte, index) => byte === b[index]);

/** `edits` (from the end of the text back) written into a fresh copy of `base` under a fixed client id, so every tab
 * writing the same makes the same items. */
function fixedUpdate(Y: Yjs, client: number, base: Uint8Array | null, edits: readonly TextChange[]) {
  const doc = new Y.Doc();
  doc.clientID = client;
  if (base) Y.applyUpdate(doc, base);
  const text = doc.getText("source");
  doc.transact(() => {
    for (const edit of edits) {
      if (edit.end > edit.start) text.delete(edit.start, edit.end - edit.start);
      if (edit.text) text.insert(edit.start, edit.text);
    }
  });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

/**
 * `change` on `text` as whole words, from the end of the text back: widened to the white space around it, then split
 * where it keeps runs of the text, so the words it kept are not written again. Written into a shared copy, a single
 * range would take others' words in it away and type its own again (sweep 2026-11-10 item 1).
 */
function wordRuns(text: string, change: TextChange): TextChange[] {
  let begin = change.start, end = change.end;
  while (begin > 0 && !/\s/.test(text[begin - 1])) begin--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return runChanges(text.slice(begin, end), text.slice(begin, change.start) + change.text + text.slice(change.end, end))
    .map(run => ({ start: begin + run.start, end: begin + run.end, text: run.text })).reverse();
}

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

/** Changes that turn `from` into `to`: `changes` when they do, else the one range between them. */
function changesBetween(from: string, to: string, changes?: readonly TextChange[]) {
  if (changes?.length) {
    try { if (applyChanges(from, changes).text === to) return [...changes]; } catch { /* Not in these offsets. */ }
  }
  return [diffRange(from, to)];
}

/**
 * What was typed since a share began (`began` to `own`), as one change on the kept copy's text (`kept`). Where the
 * kept copy and `began` differ (`stale`), that range is left as the copy has it; a change clear of it moves by its
 * length, and one across it falls back to the whole difference from the copy.
 */
export function typedSince(kept: string, began: string, own: string): TextChange | undefined {
  if (own === began) return undefined;
  const change = diffRange(began, own);
  if (kept === began) return change;
  const stale = diffRange(began, kept), shift = stale.text.length - (stale.end - stale.start);
  if (change.end <= stale.start) return change;
  if (change.start >= stale.end) return { start: change.start + shift, end: change.end + shift, text: change.text };
  return diffRange(kept, own);
}

/** The name-tag Undo (ticket am-24): takes back someone else's latest text change in the open file's shared copy. */
interface AuthorUndo {
  undo(author: number, history?: string): boolean;
  can(author: number): boolean;
}

/** The files each draft store shares with someone else right now, by key: an outside change (ticket am-33,
 * src/outside-merge.ts) leaves these to load the branch again, as before, so a room's copy never takes it twice. */
const liveFiles = new WeakMap<object, Map<string, () => boolean>>();
/** Whether `store`'s file under `key` is shared in a live room now: another tab is in, its copy is loading, a copy is
 * made (it stays while the file is open, also after the others left), or the room has not said who is here yet (for at
 * most LIVE_TEXT_CATCH_UP_MS after the file opened). */
export function liveShared(store: object, key: string) {
  return liveFiles.get(store)?.get(key)?.() ?? false;
}

/** Shares one file while it is open; returns its stop, its name-tag Undo and its carets. `ended`: this tab left the copy
 * (Discard), or must start it again (GitHub's text changed while it was being made). `authorsChanged`: what the name-tag
 * Undo can take back changed. `copied`: the copy is made (someone else is here), so carets can be drawn. */
function shareFile(ports: LiveTextPorts, scope: DraftScope, path: string, ended: (why: "left" | "again") => void, authorsChanged: () => void, copied: () => void) {
  const store = ports.store, clock = ports.clock ?? systemClock, keeper = ports.keeper ?? (pageKeeper ??= browserKeeper());
  const start = store.get(scope, path)!;
  const base = start.base, baseSha = start.baseSha ?? null;
  let stopped = false, aloneOnce = false, editors = 0, discarded = false, heard = false;
  let copy: ReturnType<typeof makeCopy> | undefined, loading = false;
  const inbox: Uint8Array[] = [];
  // Until the room says who is here, the file may be shared: a tab coming back to a page it typed on with others would
  // otherwise fold an outside change into a draft that holds the room's words, and the room's copy would take them twice.
  // A room that never answers (the relay out of reach) stops counting after the catch-up wait, so outside changes fold again.
  const unheard = clock.setTimeout(() => { heard = true; }, LIVE_TEXT_CATCH_UP_MS);
  const shared = () => !stopped && (!heard || editors > 0 || loading || copy !== undefined);
  let live = liveFiles.get(store);
  if (!live) liveFiles.set(store, live = new Map());
  live.set(start.key, shared);
  /** Others here, as the room's presence says; this tab's own caret (offsets in its text) and whoever draws carets. */
  let peers: ReadonlyMap<string, LivePeer> = new Map(), selection: (() => CaretSelection | undefined) | undefined;
  const caretWatchers = new Set<() => void>();
  const caretsMoved = () => { for (const watcher of [...caretWatchers]) try { watcher(); } catch { /* A caret must not break sharing. */ } };
  // Discard is this tab's own, from the moment it shares the file (alone, loading Yjs, or with a copy): it leaves the
  // shared copy rather than taking everyone's changes away, and drops its kept copy so nothing brings them back.
  const unwatch = store.subscribe(event => {
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
      if (!editors) { aloneOnce = true; void copy?.startOwn(); }
      else if (!copy && !loading) void load();
    },
    onKey: () => copy?.hello(),
    onPeers(next) { peers = next; caretsMoved(); copy?.nameAuthors(); },
    onPushed: commit => ports.onPushed?.(scope, commit),
  });

  async function load() {
    loading = true;
    try {
      const Y = await (ports.loadYjs ?? (() => import("yjs")))();
      const tag = await tagOf(baseSha, base);
      const kept = await keeper.read(start.key);
      if (stopped || discarded) return;
      // GitHub's text moved on meanwhile (a save landed): the copy starts again from it, with its tag.
      const now = store.get(scope, path);
      if (!now || now.base !== base || (now.baseSha ?? null) !== baseSha) { ended("again"); return; }
      // The one starting text everyone shares, made before anything else so it is never sent.
      const seed = base ? fixedUpdate(Y, uint32(tag), null, [{ start: 0, end: 0, text: base }]) : null;
      // A copy this tab shared before: kept unless the draft went back to GitHub's text since (discarded, or saved over).
      const own = store.text(scope, path);
      const resume = kept && sameTag(kept.tag, tag) && own !== undefined && own !== base ? kept : undefined;
      if (kept && !resume) keeper.write(start.key, undefined);
      try { copy = makeCopy(Y, tag, seed, resume); }
      catch (error) {
        // A kept state Yjs cannot apply (damaged, or from another Yjs version): dropped, and this tab joins as a fresh joiner.
        if (!resume) throw error;
        keeper.write(start.key, undefined);
        copy = makeCopy(Y, tag, seed, undefined);
      }
      for (const bytes of inbox.splice(0)) copy.receive(bytes);
      copied();
      if (!editors || aloneOnce) await copy.startOwn(); else copy.hello();
    } catch { /* Yjs did not load, or starting the copy failed: this tab keeps its own draft, as before, until the room changes again. */ }
    finally { loading = false; }
  }

  function makeCopy(Y: Yjs, tag: Uint8Array, seed: Uint8Array | null, resume: KeptCopy | undefined) {
    const doc: Doc = new Y.Doc();
    const text = doc.getText("source");
    if (seed) Y.applyUpdate(doc, seed, START);
    let synced = false, starting = false, waiting: unknown, keeping: unknown;
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
    // Its own earlier copy. What the draft took on after that copy was kept goes in when this tab starts its part (`begin`).
    if (resume) Y.applyUpdate(doc, resume.update, START);
    const keptText = text.toString();
    const keep = () => {
      clock.clearTimeout(keeping);
      keeping = undefined;
      const draft = store.text(scope, path);
      if (synced && !discarded) keeper.write(start.key, { tag, update: Y.encodeStateAsUpdate(doc), ...(draft === undefined ? {} : { draft }) });
    };
    /** Catch-up requests that came before this copy could answer: answered once it can. */
    let asked: { kind: number; theirs: boolean; from: number; vector: Uint8Array }[] = [];
    /** This copy's id in frames: a REPLY naming it answers this tab's own request. It is the Yjs client id its own
     * changes carry, which carets name (slices 22 and 23), so a name tag's Undo finds that author's changes. Read once: should
     * Yjs ever give this doc a new client id (it does on a clash, very rarely), carets must keep naming this one. */
    const me = doc.clientID;
    /** Agents whose text this tab wrote, by connection and name: the client id their changes carry, a Yjs id of their own
     * made here (random, as Yjs makes its own, and never one this copy has seen), and where their latest change ended. */
    const agents = new Map<string, { author: number; name: string; who: LiveAuthor; at?: import("yjs").RelativePosition }>();
    const agentAuthor = (who: LiveAuthor) => {
      const key = JSON.stringify([who.grant, who.name]);
      let found = agents.get(key);
      if (!found) {
        let author: number;
        do author = crypto.getRandomValues(new Uint32Array(1))[0];
        while (author === me || author === doc.clientID || doc.store.clients.has(author) || authors.has(author)
          || [...peers.values()].some(peer => (peer.state as { author?: unknown } | null)?.author === author));
        found = { author, name: cut(who.name), who: { grant: who.grant, name: who.name } };
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
      const out = new Uint8Array(HEAD + payload.length);
      out[0] = kind;
      out[1] = synced ? 1 : 0;
      out.set(tag, 2);
      new DataView(out.buffer).setUint32(22, id);
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
      // An agent's change goes out under its own client id (ticket am-25), the tab's own under the tab's.
      if (origin !== REMOTE && !theirs.has(origin as object) && editors)
        void send(UPDATE, update, typeof origin === "object" && origin ? agentIds.get(origin) ?? me : me);
      if (synced && keeping === undefined) keeping = clock.setTimeout(keep, KEEP_MS);
    });
    text.observe((event, transaction) => {
      textChanged = true;
      if (synced && transaction.origin !== LOCAL)
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
      const changes = changesBetween(now, event.text, event.changes).sort((a, b) => b.start - a.start);
      // An agent's change written into this tab's drafts (ticket am-25) joins the copy as the agent's.
      const agent = liveAuthor();
      if (agent) writeAgent(agent, changes);
      else doc.transact(() => { applyText(changes); }, LOCAL);
    });

    /**
     * Starts this tab's part in the copy: alone (`caught` false), or no one caught it up, its own draft
     * goes in; caught up by a tab that was, it keeps the room's copy and adds its own changes only when
     * they are not the room's text already. Its draft's changes over the starting text enter under the id
     * every tab with the same draft uses. Remote changes wait in the copy meanwhile; the draft follows after.
     */
    async function begin(caught: boolean) {
      if (synced || starting) return;
      starting = true;
      clock.clearTimeout(waiting);
      // Resumed from its own kept copy: what the draft took on after the copy was kept goes in, unless the copy has it now.
      if (resume) resumeDraft(resume);
      for (; !resume;) {
        const own = store.text(scope, path);
        const adds = (now: string | undefined) => now !== undefined && now !== base && (!caught || now !== text.toString());
        // `runs`: the draft goes in word by word (`wordRuns`), so a tab still on the bundle that wrote it as one range never
        // takes the same client id for other items.
        const client = adds(own) ? uint32(await digest(`runs\n${baseSha ?? ""}\n${own}`)) : undefined;
        if (stopped) return;
        // Typed meanwhile, or the room's copy caught up with it: decide again on the text as it is now.
        if (store.text(scope, path) !== own || adds(own) !== (client !== undefined)) continue;
        if (client !== undefined) { Y.applyUpdate(doc, fixedUpdate(Y, client, seed, wordRuns(base, diffRange(base, own!))), START); startClient = client; }
        break;
      }
      synced = true;
      starting = false;
      follow();
      for (const request of asked.splice(0)) answer(request.kind, request.theirs, request.from, request.vector);
      keep();
      // Changes others sent while this tab was catching up can be taken back from now on.
      if (authors.size) authorsChanged();
      // Its caret and theirs are in the shared text from now on.
      tellCaret();
      caretsMoved();
      // Caught up, it asks the others for what only it has (a resumed copy, its own changes); starting its own
      // copy, it tells the room, in case another did the same meanwhile.
      hello();
    }

    /**
     * The draft's changes after the kept copy's last write (`typedSince` from the draft as it was kept; from the share's
     * start for copies kept without it), made word by word on the kept copy and merged as Yjs merges typing, as if typed
     * then: the words it removes are those items, wherever others' changes moved them, so text others changed in that
     * range meanwhile is neither typed again nor lost. Where that lands in the copy as it is now goes in as this tab's own
     * change. The room may have caught this copy up with them already (they were shared before a reload lost the copy's
     * write): if what lies between the change's two ends holds its text, nothing goes in.
     */
    function resumeDraft(resume: KeptCopy) {
      const own = store.text(scope, path);
      const change = own === undefined ? undefined : typedSince(keptText, resume.draft ?? start.text, own);
      if (!change) return;
      // The kept copy again, apart: its change names the kept copy's items.
      const kept = new Y.Doc();
      if (seed) Y.applyUpdate(kept, seed);
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
      const merged = new Y.Doc();
      Y.applyUpdate(merged, Y.encodeStateAsUpdate(doc));
      let lands: TextChange[] = [];
      merged.getText("source").observe(event => { lands = deltaChanges(event.delta as { retain?: number; insert?: unknown; delete?: number }[]); });
      Y.applyUpdate(merged, typed);
      merged.destroy();
      if (lands.length) doc.transact(() => { applyText(lands.reverse()); }, START);
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
        if (who) { (ports.authors ?? saveAuthors()).note(start.key, baseSha, who); unnamed.delete(id); }
      }
    }
    /** The clients whose text an update just added to this copy (their clock moved on from `before`), and `sender`, whose
     * own change (an UPDATE frame) changed the text: a deletion adds no text of its own, only marks others' as deleted, so
     * its author shows only as the frame's sender. This tab's own ids, and the agents it writes for, are not others'. A
     * catch-up repeating text this copy holds already names no one again. */
    function heardFrom(before: Map<number, number>, sender?: number) {
      const clients = [...Y.decodeStateVector(Y.encodeStateVector(doc))].filter(([client, clock]) => clock > (before.get(client) ?? 0)).map(([client]) => client);
      for (const client of sender === undefined ? clients : [...clients, sender]) {
        const local = authors.get(client);
        if (client === me || client === startClient || (local && agentIds.has(local.origin)) || unnamed.size >= UNNAMED_LIMIT) continue;
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
    // Every caught-up copy answers every request, and after a new key every copy asks: frames grow with the square of the
    // people in the room, fine for the 2-5 this is for (ADR 0003, join traffic).
    function answer(kind: number, theirs: boolean, from: number, vector: Uint8Array) {
      void send(REPLY, Y.encodeStateAsUpdate(doc, vector), from);
      if (kind === HELLO && theirs) void send(ASK, Y.encodeStateVector(doc));
    }
    function receive(bytes: Uint8Array) {
      if (bytes.length < HEAD || !sameTag(bytes.subarray(2, 22), tag)) return;
      const kind = bytes[0], theirs = bytes[1] === 1, id = new DataView(bytes.buffer, bytes.byteOffset).getUint32(22), payload = bytes.subarray(HEAD);
      try {
        if (kind === HELLO || kind === ASK) {
          // Only a copy that is caught up answers: a seed alone would tell a waiting tab the room is empty.
          if (synced && !starting) answer(kind, theirs, id, payload);
          else if (asked.length < INBOX_LIMIT) asked.push({ kind, theirs, from: id, vector: Uint8Array.from(payload) });
          return;
        }
        if (kind !== REPLY && kind !== UPDATE) return;
        // A frame naming an agent whose text this tab writes is not that agent's here: only this tab writes under its id.
        const local = authors.get(id), agentHere = local !== undefined && agentIds.has(local.origin);
        const before = Y.decodeStateVector(Y.encodeStateVector(doc)), theirChange = kind === UPDATE && id !== me && !agentHere;
        textChanged = false;
        Y.applyUpdate(doc, payload, theirChange ? authorOrigin(id) : REMOTE);
        heardFrom(before, theirChange && textChanged ? id : undefined);
        // Caught up only by an answer to its own request: one to another tab's holds only what that tab lacked.
        if (kind === REPLY && theirs && id === me && !synced) void begin(true);
      } catch { /* A broken update is dropped; the next catch-up brings what it lacked. */ }
    }
    return {
      receive, hello, tellCaret, carets, nameAuthors,
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
        clock.clearTimeout(waiting); clock.clearTimeout(telling); keep(); unsubscribe(); page?.removeEventListener("pagehide", keep); page?.document.removeEventListener("visibilitychange", hidden);
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
    if (live.get(start.key) === shared) live.delete(start.key);
    unwatch();
    room.close();
    copy?.destroy();
    copy = undefined;
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
