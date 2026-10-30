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
// - After a new room key or a reconnect, every tab asks again for what it is
//   missing, so frames lost meanwhile are made good.
//
// Frames (inside the room's encryption): a kind byte, whether the sender is
// caught up, the 20-byte starting-text tag, then a Yjs state vector or update.
// Copies with another tag (a tab on another version of the file) are ignored.

import { effect, untracked, type ReadonlySignal } from "@preact/signals-core";
import { applyChanges, diffRange, type DraftEvent, type DraftTextStore, type TextChange } from "./draft-store";
import type { DraftScope } from "./drafts";
import { openLiveRoom, type LiveClock, type LiveRoom, type LiveRoomOptions } from "./live-room";
import { LIVE_MESSAGE_LIMIT } from "../shared/live-room";

type Yjs = typeof import("yjs");
type Doc = import("yjs").Doc;
type Room = Pick<LiveRoom, "send" | "close">;
type Store = Pick<DraftTextStore, "get" | "text" | "edit" | "subscribe">;

export interface LiveTextPorts {
  store: Store;
  /** The file on show; its draft store entry is the one shared. */
  openFile: ReadonlySignal<string | undefined>;
  /** The drafts' scope on show; none on the overview or while a load runs. */
  scope(): DraftScope | undefined;
  /** Tests: the room (src/live-room.ts `openLiveRoom` by default), Yjs and the clock. */
  openRoom?: (options: LiveRoomOptions) => Room;
  loadYjs?: () => Promise<Yjs>;
  clock?: LiveClock;
}

const HELLO = 1, ASK = 2, REPLY = 3, UPDATE = 4;
const HEAD = 2 + 20;
/** A tab that found others waits this long, after asking, for one of them to catch it up; then it starts from its own draft. */
export const LIVE_TEXT_CATCH_UP_MS = 5_000;
/** Frames that arrive while Yjs loads wait, up to this many. */
const INBOX_LIMIT = 500;
/** The room closes a socket over its limit: a larger copy is not sent (the room's own framing needs a little room). */
const FRAME_LIMIT = LIVE_MESSAGE_LIMIT - 1024;
const LOCAL = Symbol("local"), REMOTE = Symbol("remote"), START = Symbol("start");

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

/** Shares one file while it is open; returns its stop. */
function shareFile(ports: LiveTextPorts, scope: DraftScope, path: string) {
  const store = ports.store, clock = ports.clock ?? systemClock;
  const start = store.get(scope, path)!;
  const base = start.base, baseSha = start.baseSha ?? null;
  let stopped = false, aloneOnce = false, editors = 0;
  let copy: ReturnType<typeof makeCopy> | undefined, loading = false;
  const inbox: Uint8Array[] = [];

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
      const seedClient = uint32(tag);
      // The one starting text everyone shares, made before anything else so it is never sent.
      const seed = base ? fixedUpdate(Y, seedClient, null, { start: 0, end: 0, text: base }) : null;
      if (stopped) return;
      copy = makeCopy(Y, tag, seed);
      for (const bytes of inbox.splice(0)) copy.receive(bytes);
      if (!editors || aloneOnce) await copy.startOwn(); else copy.hello();
    } catch { /* Yjs did not load: this tab keeps its own draft, as before. */ }
    finally { loading = false; }
  }

  function makeCopy(Y: Yjs, tag: Uint8Array, seed: Uint8Array | null) {
    const doc: Doc = new Y.Doc();
    const text = doc.getText("source");
    if (seed) Y.applyUpdate(doc, seed, START);
    let synced = false, starting = false, waiting: unknown;
    /** Catch-up requests that came before this copy could answer: answered once it can. */
    let asked: { kind: number; theirs: boolean; vector: Uint8Array }[] = [];

    const frame = (kind: number, payload: Uint8Array) => {
      const out = new Uint8Array(HEAD + payload.length);
      out[0] = kind;
      out[1] = synced ? 1 : 0;
      out.set(tag, 2);
      out.set(payload, HEAD);
      return out;
    };
    const send = (kind: number, payload: Uint8Array) => {
      if (stopped || HEAD + payload.length > FRAME_LIMIT) return Promise.resolve(false);
      return room.send(frame(kind, payload)).catch(() => false);
    };
    /** The draft now follows the shared copy (outside history: someone else's change). */
    const follow = (changes?: TextChange[]) => {
      const now = text.toString(), draft = store.text(scope, path);
      if (draft === undefined || draft === now) return;
      store.edit({ scope, path, changes: changesBetween(draft, now, changes), record: false, origin: "shared" });
    };

    doc.on("update", (update: Uint8Array, origin: unknown) => { if (origin !== REMOTE) void send(UPDATE, update); });
    text.observe((event, transaction) => {
      if (synced && transaction.origin !== LOCAL) follow(deltaChanges(event.delta as { retain?: number; insert?: unknown; delete?: number }[]));
    });
    const unsubscribe = store.subscribe((event: DraftEvent) => {
      if (!synced || event.type !== "text" || event.origin === "shared" || event.key !== start.key) return;
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
      for (;;) {
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
      for (const request of asked.splice(0)) answer(request.kind, request.theirs, request.vector);
      // A tab that started its own copy tells the room, in case another did the same meanwhile.
      if (!caught) hello();
    }

    function hello() {
      if (stopped) return;
      void send(HELLO, Y.encodeStateVector(doc)).then(sent => {
        if (!sent || synced || stopped) return;
        clock.clearTimeout(waiting);
        waiting = clock.setTimeout(() => { void begin(false); }, LIVE_TEXT_CATCH_UP_MS);
      });
    }
    function answer(kind: number, theirs: boolean, vector: Uint8Array) {
      void send(REPLY, Y.encodeStateAsUpdate(doc, vector));
      if (kind === HELLO && theirs) void send(ASK, Y.encodeStateVector(doc));
    }
    function receive(bytes: Uint8Array) {
      if (bytes.length < HEAD || !sameTag(bytes.subarray(2, HEAD), tag)) return;
      const kind = bytes[0], theirs = bytes[1] === 1, payload = bytes.subarray(HEAD);
      try {
        if (kind === HELLO || kind === ASK) {
          // Only a copy that is caught up answers: a seed alone would tell a waiting tab the room is empty.
          if (synced && !starting) answer(kind, theirs, payload);
          else if (asked.length < INBOX_LIMIT) asked.push({ kind, theirs, vector: Uint8Array.from(payload) });
          return;
        }
        if (kind !== REPLY && kind !== UPDATE) return;
        Y.applyUpdate(doc, payload, REMOTE);
        if (kind === REPLY && theirs && !synced) void begin(true);
      } catch { /* A broken update is dropped; the next catch-up brings what it lacked. */ }
    }
    return {
      receive, hello,
      /** Alone in the room (first in, or everyone else left before catching this tab up): its own draft starts the copy. */
      startOwn: () => begin(false),
      destroy() { clock.clearTimeout(waiting); unsubscribe(); doc.destroy(); },
    };
  }

  return () => {
    stopped = true;
    room.close();
    copy?.destroy();
    copy = undefined;
  };
}

/** Shares the open file while it is open in the draft store, for as long as this runs; returns its stop. */
export function startLiveText(ports: LiveTextPorts) {
  let current: { key: string; stop(): void } | undefined;
  const check = () => {
    const scope = ports.scope(), path = ports.openFile.peek();
    const file = scope && path && scope.repoId > 0 ? ports.store.get(scope, path) : undefined;
    // A file GitHub's text is unknown for, or a deleted, opaque or uploaded one, has no text to share.
    const key = file && file.baseSha !== undefined && !file.flags?.deleted && !file.flags?.opaque && !file.flags?.upload ? file.key : undefined;
    if (current?.key === key) return;
    current?.stop();
    current = key ? { key, stop: shareFile(ports, file!.scope, file!.path) } : undefined;
  };
  const stopEffect = effect(() => { void ports.openFile.value; untracked(check); });
  const stopStore = ports.store.subscribe(event => { if (event.type === "file") check(); });
  return () => { stopEffect(); stopStore(); current?.stop(); current = undefined; };
}
