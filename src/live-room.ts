// A live room's participant (ADR 0003): one socket to the relay, the room key
// in memory only, encrypted frames, presence and reconnecting. The first one
// in makes a random AES-GCM key; later ones send a one-time ECDH public key
// and any member answers with the room key wrapped for them (ECDH, HKDF,
// AES-GCM), so neither the Worker nor the relay ever holds it. Loaded lazily:
// only when a live room opens, never at boot.
//
// Known limit: this keeps the key from anything that reads or logs relay
// traffic, but the editor's own server serves this code, so it does not
// protect against a changed server.

import {
  LIVE_ROOM_CLOSED, PRESENCE_HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, readLiveServerMessage,
  type LiveAccess, type LiveClientMessage, type LiveServerMessage,
} from "../shared/live-room";
import type { JsonValue } from "../shared/agent-command";

/** What a participant's socket needs: a browser WebSocket fits, as does a Node or Miniflare one. */
export interface LiveRoomSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code?: number }) => void): void;
}
export interface LiveClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
}
export interface LivePeer { access: LiveAccess; state?: JsonValue }
export interface LiveRoomOptions {
  repo: string;
  branch: string;
  file: string;
  /** Opens the room's socket; the default is the browser's WebSocket to this editor. Agents pass one that sends their connection. */
  connect?: (url: string) => Promise<LiveRoomSocket>;
  /** Another participant's decrypted content frame. */
  onMessage(bytes: Uint8Array): void;
  /** Who is here now: everyone heard from within the presence timeout, by relay peer id. */
  onPeers?(peers: ReadonlyMap<string, LivePeer>): void;
  /** No tab has the room open (an agent only): the room has ended and does not reconnect. */
  onClosed?(): void;
  clock?: LiveClock;
}

const DATA = 0, PRESENCE = 1;
const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const HANDOVER = new TextEncoder().encode("native-site-editor live room key v1");

const b64u = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
  decode: (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0)),
};
type Bytes = Uint8Array<ArrayBuffer>;
const joined = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

async function seal(key: CryptoKey, plain: Bytes): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return joined(iv, new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain))).buffer;
}
async function open(key: CryptoKey, frame: Bytes): Promise<Bytes | null> {
  if (frame.length < 12 + 16) return null;
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: frame.subarray(0, 12) }, key, frame.subarray(12))); }
  catch { return null; }
}

/** The wrapping key both sides derive: ECDH between one-time P-256 keys, then HKDF over both public keys. */
async function handoverKey(privateKey: CryptoKey, theirs: Bytes, salt: Bytes) {
  const publicKey = await crypto.subtle.importKey("raw", theirs, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: HANDOVER }, material, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}
async function oneTimeKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { privateKey: pair.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}
/** The member's side: the room key wrapped for one joiner's public key. */
async function wrapFor(roomKey: CryptoKey, joinerPublic: Bytes) {
  const mine = await oneTimeKeys();
  const wrapping = await handoverKey(mine.privateKey, joinerPublic, joined(joinerPublic, mine.publicKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey("raw", roomKey, wrapping, { name: "AES-GCM", iv }));
  return { publicKey: b64u.encode(mine.publicKey), wrapped: b64u.encode(joined(iv, wrapped)) };
}
/** The joiner's side. The room key stays extractable only so this tab can hand it on in turn. */
async function unwrapFrom(request: { privateKey: CryptoKey; publicKey: Bytes }, memberPublic: string, wrapped: string) {
  const theirs = b64u.decode(memberPublic), bytes = b64u.decode(wrapped);
  const wrapping = await handoverKey(request.privateKey, theirs, joined(request.publicKey, theirs));
  return crypto.subtle.unwrapKey("raw", bytes.subarray(12), wrapping, { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

function browserSocket(url: string): Promise<LiveRoomSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(new URL(url, location.href).href.replace(/^http/, "ws"));
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("close", () => reject(new Error("The live room could not be joined.")), { once: true });
  });
}
const systemClock: LiveClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export function openLiveRoom(options: LiveRoomOptions) {
  const clock = options.clock ?? systemClock;
  const connect = options.connect ?? browserSocket;
  const url = `/api/live/room?${new URLSearchParams({ repo: options.repo, branch: options.branch, file: options.file })}`;
  let socket: LiveRoomSocket | null = null;
  let peer = "";
  let closed = false, attempt = 0;
  let roomKey: CryptoKey | null = null;
  let request: { privateKey: CryptoKey; publicKey: Bytes } | null = null;
  let waiting: { from: string; publicKey: string }[] = [];
  let ownState: JsonValue | undefined;
  /** Who the relay says is connected; presence only counts for them. */
  const members = new Map<string, LiveAccess>();
  const presence = new Map<string, { state: JsonValue; seenAt: number }>();
  let keyed: { promise: Promise<CryptoKey>; resolve(key: CryptoKey): void; reject(error: Error): void };
  const resetKeyed = () => {
    let resolve!: (key: CryptoKey) => void, reject!: (error: Error) => void;
    keyed = { promise: new Promise<CryptoKey>((ok, fail) => { resolve = ok; reject = fail; }), resolve, reject };
    keyed.promise.catch(() => undefined);
  };
  resetKeyed();
  let heartbeat: unknown, sweep: unknown, retry: unknown;

  const peers = () => {
    const now = clock.now(), out = new Map<string, LivePeer>();
    for (const [id, seen] of presence)
      if (members.has(id) && now - seen.seenAt < PRESENCE_TIMEOUT_MS) out.set(id, { access: members.get(id)!, state: seen.state });
    return out;
  };
  const changed = () => options.onPeers?.(peers());
  /** Drops whoever has not been heard from within the timeout, then waits for the next one due. */
  const expire = () => {
    clock.clearTimeout(sweep);
    sweep = undefined;
    const now = clock.now();
    let dropped = false, next = Infinity;
    for (const [id, seen] of presence) {
      const due = seen.seenAt + PRESENCE_TIMEOUT_MS;
      if (due <= now) { presence.delete(id); dropped = true; }
      else next = Math.min(next, due);
    }
    if (next < Infinity) sweep = clock.setTimeout(expire, next - now);
    if (dropped) changed();
  };
  const sendControl = (message: LiveClientMessage) => { try { socket?.send(JSON.stringify(message)); } catch { /* The close handler reconnects. */ } };
  const sendFrame = async (kind: number, payload: Uint8Array) => {
    const key = await keyed.promise;
    const frame = await seal(key, joined(Uint8Array.of(kind), payload));
    if (roomKey === key) socket?.send(frame);
  };
  const sayHere = () => {
    clock.clearTimeout(heartbeat);
    heartbeat = clock.setTimeout(sayHere, PRESENCE_HEARTBEAT_MS);
    if (!roomKey || !peer) return;
    void sendFrame(PRESENCE, new TextEncoder().encode(JSON.stringify({ peer, state: ownState ?? null }))).catch(() => undefined);
  };
  const answer = async (from: string, publicKey: string) => {
    if (!roomKey) { waiting.push({ from, publicKey }); return; }
    try { sendControl({ type: "key", to: from, ...await wrapFor(roomKey, b64u.decode(publicKey)) }); }
    catch { /* A malformed public key gets no answer. */ }
  };
  const keyReady = (key: CryptoKey) => {
    roomKey = key;
    request = null;
    keyed.resolve(key);
    const queued = waiting;
    waiting = [];
    for (const item of queued) if (members.has(item.from)) void answer(item.from, item.publicKey);
    sayHere();
  };
  const makeKey = async () => keyReady(await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]));
  const askForKey = async () => {
    request = await oneTimeKeys();
    sendControl({ type: "key-request", publicKey: b64u.encode(request.publicKey) });
  };

  const control = async (message: LiveServerMessage) => {
    switch (message.type) {
      case "welcome": {
        peer = message.peer;
        attempt = 0;
        members.clear();
        for (const item of message.peers) members.set(item.peer, item.access);
        for (const id of presence.keys()) if (!members.has(id)) presence.delete(id);
        changed();
        // Alone: keep the key this tab already had, or make one. Others in: take theirs.
        if (!members.size) { if (roomKey) keyReady(roomKey); else await makeKey(); return; }
        if (roomKey) { roomKey = null; resetKeyed(); }
        await askForKey();
        return;
      }
      case "joined": members.set(message.peer, message.access); return;
      case "left":
        members.delete(message.peer);
        presence.delete(message.peer);
        waiting = waiting.filter(item => item.from !== message.peer);
        changed();
        // Everyone who could hand the key over left first: this tab makes it.
        if (!roomKey && request && !members.size) await makeKey();
        return;
      case "key-request": await answer(message.from, message.publicKey); return;
      case "key":
        if (!request || roomKey) return;
        try { keyReady(await unwrapFrom(request, message.publicKey, message.wrapped)); }
        catch { /* A forged or broken handover is ignored; another member's answer may still come. */ }
        return;
    }
  };
  const frame = async (data: Bytes) => {
    if (!roomKey) return;
    const plain = await open(roomKey, data);
    if (!plain?.length) return;
    if (plain[0] === DATA) { options.onMessage(plain.subarray(1)); return; }
    if (plain[0] !== PRESENCE) return;
    let value: { peer?: unknown; state?: JsonValue };
    try { value = JSON.parse(new TextDecoder().decode(plain.subarray(1))) as typeof value; } catch { return; }
    if (typeof value.peer !== "string" || !members.has(value.peer)) return;
    presence.set(value.peer, { state: value.state ?? null, seenAt: clock.now() });
    if (sweep === undefined) expire();
    changed();
  };

  const reconnect = () => {
    if (closed) return;
    clock.clearTimeout(retry);
    retry = clock.setTimeout(() => { void join(); }, RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]);
  };
  // Frames are handled in arrival order: a key must land before the content that follows it.
  let queue = Promise.resolve();
  const join = async () => {
    let next: LiveRoomSocket;
    try { next = await connect(url); }
    catch { reconnect(); return; }
    if (closed) { next.close(1000); return; }
    socket = next;
    peer = "";
    next.addEventListener("message", event => {
      if (socket !== next) return;
      queue = queue.then(async () => {
        if (typeof event.data === "string") { const message = readLiveServerMessage(event.data); if (message) await control(message); }
        else if (event.data instanceof ArrayBuffer) await frame(new Uint8Array(event.data));
        else if (ArrayBuffer.isView(event.data)) await frame(Uint8Array.from(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)));
      }).catch(() => undefined);
    });
    next.addEventListener("close", event => {
      if (socket !== next) return;
      socket = null;
      members.clear();
      changed();
      if (event.code === LIVE_ROOM_CLOSED) { stop(); options.onClosed?.(); return; }
      reconnect();
    });
  };
  const stop = () => {
    closed = true;
    for (const timer of [heartbeat, sweep, retry]) clock.clearTimeout(timer);
    keyed.reject(new Error("The live room is closed."));
    roomKey = null;
  };
  void join();

  return {
    /** Settles once this participant holds the room key (made, kept or handed over); rejects once closed. */
    ready: () => keyed.promise.then(() => undefined),
    /** Sends content to everyone else in the room, once this tab has the room key. */
    send: (bytes: Uint8Array) => sendFrame(DATA, bytes),
    /** What this participant shows others (name, colour, caret); sent now and with every heartbeat. */
    setPresence(state: JsonValue) { ownState = state; sayHere(); },
    peers,
    /** Leaves at once: the relay tells the others straight away. */
    close() {
      const current = socket;
      socket = null;
      stop();
      current?.close(1000, "Left the live room.");
    },
  };
}

export type LiveRoom = ReturnType<typeof openLiveRoom>;
