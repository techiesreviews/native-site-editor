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
//
// Frames (inside the room's encryption): a kind byte, whether the sender is
// caught up, the 20-byte starting-text tag, a 4-byte copy id (the sender's;
// in a REPLY, the copy whose request it answers), then a Yjs state vector or
// update. Copies with another tag (a tab on another version of the file) are
// ignored, and a tab counts as caught up only by a REPLY to its own request:
// one to someone else's holds only what they lacked.
//
// Live sharing is off unless switched on (`liveSharingOn`): the ticket's
// default is no room socket for a tab alone with a file, and no cheaper way to
// be found exists. Lex decides in the Tuesday pack whether it is on for all.

import { effect, untracked, type ReadonlySignal } from "@preact/signals-core";
import { applyChanges, diffRange, type DraftEvent, type DraftTextStore, type TextChange } from "./draft-store";
import type { DraftScope } from "./drafts";
import { openLiveRoom, type LiveClock, type LiveRoom, type LiveRoomOptions } from "./live-room";
import { LIVE_MESSAGE_LIMIT } from "../shared/live-room";

type Yjs = typeof import("yjs");
type Doc = import("yjs").Doc;
type Room = Pick<LiveRoom, "send" | "close">;
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

/** `text` written into a fresh copy of `base` under a fixed client id, so every tab writing the same makes the same items. */
function fixedUpdate(Y: Yjs, client: number, base: Uint8Array | null, edit: TextChange | null) {
  const doc = new Y.Doc();
  doc.clientID = client;
  if (base) Y.applyUpdate(doc, base);
  const text = doc.getText("source");
  if (edit) doc.transact(() => {
    if (edit.end > edit.start) text.delete(edit.start, edit.end - edit.start);
    if (edit.text) text.insert(edit.start, edit.text);
  });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
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

/** Shares one file while it is open; returns its stop. `ended`: this tab left the copy (Discard), or must start it
 * again (GitHub's text changed while it was being made). */
function shareFile(ports: LiveTextPorts, scope: DraftScope, path: string, ended: (why: "left" | "again") => void) {
  const store = ports.store, clock = ports.clock ?? systemClock, keeper = ports.keeper ?? (pageKeeper ??= browserKeeper());
  const start = store.get(scope, path)!;
  const base = start.base, baseSha = start.baseSha ?? null;
  let stopped = false, aloneOnce = false, editors = 0, discarded = false;
  let copy: ReturnType<typeof makeCopy> | undefined, loading = false;
  const inbox: Uint8Array[] = [];
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
    // Agents join the shared copy in a later slice (am-25): only other tabs count here.
    onMembers(members) {
      editors = [...members.values()].filter(access => access === "editor").length;
      if (!editors) { aloneOnce = true; void copy?.startOwn(); }
      else if (!copy && !loading) void load();
    },
    onKey: () => copy?.hello(),
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
      const seed = base ? fixedUpdate(Y, uint32(tag), null, { start: 0, end: 0, text: base }) : null;
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
      if (!editors || aloneOnce) await copy.startOwn(); else copy.hello();
    } catch { /* Yjs did not load, or starting the copy failed: this tab keeps its own draft, as before, until the room changes again. */ }
    finally { loading = false; }
  }

  function makeCopy(Y: Yjs, tag: Uint8Array, seed: Uint8Array | null, resume: KeptCopy | undefined) {
    const doc: Doc = new Y.Doc();
    const text = doc.getText("source");
    if (seed) Y.applyUpdate(doc, seed, START);
    let synced = false, starting = false, waiting: unknown, keeping: unknown;
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
    /** This copy's id in frames: a REPLY naming it answers this tab's own request. */
    const me = crypto.getRandomValues(new Uint32Array(1))[0];

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
    const follow = (changes?: TextChange[]) => {
      const now = text.toString(), draft = store.text(scope, path);
      if (draft === undefined || draft === now) return;
      store.edit({ scope, path, changes: changesBetween(draft, now, changes), record: false, origin: "shared" });
    };

    // A reload or a closed tab keeps the newest copy too.
    const page = typeof window === "undefined" ? undefined : window;
    const hidden = () => { if (document.visibilityState === "hidden") keep(); };
    page?.addEventListener("pagehide", keep);
    page?.document.addEventListener("visibilitychange", hidden);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      // Alone, nothing goes out: whoever joins next is caught up by HELLO and REPLY.
      if (origin !== REMOTE && editors) void send(UPDATE, update);
      if (synced && keeping === undefined) keeping = clock.setTimeout(keep, KEEP_MS);
    });
    text.observe((event, transaction) => {
      if (synced && transaction.origin !== LOCAL) follow(deltaChanges(event.delta as { retain?: number; insert?: unknown; delete?: number }[]));
    });
    const unsubscribe = store.subscribe((event: DraftEvent) => {
      if (event.type !== "text" || event.key !== start.key || discarded || !synced || event.origin === "shared" || event.origin === "discard") return;
      // Another tab of this browser's saved draft, adopted (`reload`): it may lag behind this copy, so the draft
      // follows the copy again rather than sending that text to everyone as this tab's edit.
      if (event.origin === "external") { follow(); return; }
      const now = text.toString();
      if (event.text === now) return;
      const changes = changesBetween(now, event.text, event.changes).sort((a, b) => b.start - a.start);
      doc.transact(() => {
        for (const change of changes) {
          if (change.end > change.start) text.delete(change.start, change.end - change.start);
          if (change.text) text.insert(change.start, change.text);
        }
      }, LOCAL);
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
        const client = adds(own) ? uint32(await digest(`${baseSha ?? ""}\n${own}`)) : undefined;
        if (stopped) return;
        // Typed meanwhile, or the room's copy caught up with it: decide again on the text as it is now.
        if (store.text(scope, path) !== own || adds(own) !== (client !== undefined)) continue;
        if (client !== undefined) Y.applyUpdate(doc, fixedUpdate(Y, client, seed, diffRange(base, own!)), START);
        break;
      }
      synced = true;
      starting = false;
      follow();
      for (const request of asked.splice(0)) answer(request.kind, request.theirs, request.from, request.vector);
      keep();
      // Caught up, it asks the others for what only it has (a resumed copy, its own changes); starting its own
      // copy, it tells the room, in case another did the same meanwhile.
      hello();
    }

    /**
     * The draft's changes after the kept copy's last write (`typedSince` from the draft as it was kept; from the share's
     * start for copies kept without it), placed on the copy as it is now. The room may have caught this copy up with
     * them already (they were shared before a reload lost the copy's write): what lies between the change's two ends is
     * read again here. Already there: nothing goes in. As kept: the change goes in. Changed by others too: its text goes
     * in after theirs, so nobody's words are lost.
     */
    function resumeDraft(resume: KeptCopy) {
      const own = store.text(scope, path);
      const change = own === undefined ? undefined : typedSince(keptText, resume.draft ?? start.text, own);
      if (!change) return;
      // The kept copy again, apart, to name the change's ends by Yjs item (the same items as in this copy).
      const kept = new Y.Doc();
      if (seed) Y.applyUpdate(kept, seed);
      Y.applyUpdate(kept, resume.update);
      const keptType = kept.getText("source");
      const from = Y.createRelativePositionFromTypeIndex(keptType, change.start, -1), to = Y.createRelativePositionFromTypeIndex(keptType, change.end);
      kept.destroy();
      const at = Y.createAbsolutePositionFromRelativePosition(from, doc)?.index, till = Y.createAbsolutePositionFromRelativePosition(to, doc)?.index;
      const now = text.toString(), was = keptText.slice(change.start, change.end);
      doc.transact(() => {
        if (at === undefined || till === undefined || till < at) {
          if (change.text) text.insert(Math.min(change.start, now.length), change.text);
          return;
        }
        const between = now.slice(at, till);
        if (between === was) {
          if (till > at) text.delete(at, till - at);
          if (change.text) text.insert(at, change.text);
        } else if (change.text && !between.includes(change.text)) text.insert(till, change.text);
      }, START);
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
        Y.applyUpdate(doc, payload, REMOTE);
        // Caught up only by an answer to its own request: one to another tab's holds only what that tab lacked.
        if (kind === REPLY && theirs && id === me && !synced) void begin(true);
      } catch { /* A broken update is dropped; the next catch-up brings what it lacked. */ }
    }
    return {
      receive, hello,
      /** Alone in the room (first in, or everyone else left before catching this tab up): its own draft starts the copy. */
      startOwn: () => begin(false),
      destroy() { clock.clearTimeout(waiting); keep(); unsubscribe(); page?.removeEventListener("pagehide", keep); page?.document.removeEventListener("visibilitychange", hidden); doc.destroy(); },
    };
  }

  return () => {
    stopped = true;
    unwatch();
    room.close();
    copy?.destroy();
    copy = undefined;
  };
}

/** The switch for live sharing: on in this browser when its localStorage holds `native-site-editor:live-sharing` = `on`
 * (and in tests that pass `on`). Off by default until Lex decides (Tuesday pack). */
export const LIVE_SHARING_KEY = "native-site-editor:live-sharing";
function liveSharingOn() {
  try { return globalThis.localStorage?.getItem(LIVE_SHARING_KEY) === "on"; } catch { return false; }
}

/** Shares the open file while it is open in the draft store, for as long as this runs; returns its stop. */
export function startLiveText(ports: LiveTextPorts) {
  if (!(ports.on ?? liveSharingOn())) return () => undefined;
  let current: { key: string; stop(): void } | undefined;
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
    const share: { key: string; stop(): void } = { key, stop: () => undefined };
    current = share;
    share.stop = shareFile(ports, file!.scope, file!.path, why => {
      if (current !== share) return;
      if (why === "left") left = key;
      share.stop();
      current = undefined;
      check();
    });
  };
  const stopEffect = effect(() => { void ports.openFile.value; untracked(() => { left = undefined; check(); }); });
  const stopStore = ports.store.subscribe(event => { if (event.type === "file") check(); });
  // `clear` (sign-out, another workspace) says nothing per file: any settled change looks again, which is cheap.
  const stopState = ports.store.subscribeState(check);
  return () => { stopEffect(); stopStore(); stopState(); current?.stop(); current = undefined; };
}
