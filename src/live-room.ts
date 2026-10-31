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
  LIVE_ACCESS_ENDED, LIVE_PING, LIVE_PING_MS, LIVE_ROOM_CLOSED, PRESENCE_HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, readLiveServerMessage,
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
/** What `connect` throws when the room refuses this participant for good, so it stops instead of retrying: an agent
 * while no tab has the room open (409), or a tab signed out (401) or without access to the repository (403). */
export class LiveRoomClosed extends Error {
  constructor(message = "No tab has this room open.") { super(message); }
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
  /** Opens the room's socket; the default is the browser's WebSocket to this editor. Agents pass one that sends their
   * connection, and throws LiveRoomClosed on a 409. */
  connect?: (url: string) => Promise<LiveRoomSocket>;
  /** Another participant's decrypted content frame. */
  onMessage(bytes: Uint8Array): void;
  /** Who is here now: everyone heard from within the presence timeout, by relay peer id. */
  onPeers?(peers: ReadonlyMap<string, LivePeer>): void;
  /** Who else the relay says is connected (heard from or not), by relay peer id: on joining (each reconnect too)
   * and on each join and leave. A dropped socket says nothing: being cut off is not being alone. */
  onMembers?(members: ReadonlyMap<string, LiveAccess>): void;
  /** This participant holds a room key: the first, a new one, or one taken again after a reconnect. Frames sent
   * meanwhile may not have arrived, so a caller that keeps state in step syncs it again here. */
  onKey?(): void;
  /** The room ended for this participant and does not reconnect: no tab has it open (agents), its connection ended, or it was refused. */
  onClosed?(): void;
  clock?: LiveClock;
}

const DATA = 0, PRESENCE = 1;
const RECONNECT_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** A key request nobody answered is sent again this often (a backstop: `keyed` and `make-key` normally settle it). */
const REREQUEST_MS = 5_000;
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

/** Final answers to the plain request; anything else (426: allowed, the upgrade itself failed) is worth retrying. */
const refusals: Record<number, string> = {
  400: "This live room's address is not valid.",
  401: "Sign in again to join this live room.",
  403: "This live room is not open to you.",
};
/** A failed upgrade hides its status, so one plain request (same check, no socket) tells a refusal from a network
 * failure. Only a socket that never opened asks: later drops reconnect without it. */
function browserSocket(url: string): Promise<LiveRoomSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(new URL(url, location.href).href.replace(/^http/, "ws"));
    socket.binaryType = "arraybuffer";
    const failed = () => {
      fetch(url, { credentials: "same-origin" }).then(
        response => reject(response.status in refusals ? new LiveRoomClosed(refusals[response.status]) : new Error("The live room could not be joined.")),
        () => reject(new Error("The live room could not be joined.")));
    };
    socket.addEventListener("open", () => { socket.removeEventListener("close", failed); resolve(socket); }, { once: true });
    socket.addEventListener("close", failed, { once: true });
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
  // Only this participant knows it: a reconnect names it so the relay replaces a socket it has not yet seen drop.
  const rejoin = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  const url = `/api/live/room?${new URLSearchParams({ repo: options.repo, branch: options.branch, file: options.file, rejoin })}`;
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
  let heartbeat: unknown, sweep: unknown, retry: unknown, rerequest: unknown, ping: unknown;

  const peers = () => {
    const now = clock.now(), out = new Map<string, LivePeer>();
    for (const [id, seen] of presence)
      if (members.has(id) && now - seen.seenAt < PRESENCE_TIMEOUT_MS) out.set(id, { access: members.get(id)!, state: seen.state });
    return out;
  };
  const changed = () => options.onPeers?.(peers());
  const membersChanged = () => options.onMembers?.(new Map(members));
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
  /** Waits for the key, then seals on that key for the socket current then: both must still hold after sealing. */
  const sendFrame = async (kind: number, payload: Uint8Array) => {
    if (closed) throw new Error("The live room is closed.");
    const key = await keyed.promise;
    const on = socket;
    const frame = await seal(key, joined(Uint8Array.of(kind), payload));
    if (closed) throw new Error("The live room is closed.");
    if (roomKey !== key || !on || socket !== on) return false;
    try { on.send(frame); return true; } catch { return false; }
  };
  const sayHere = () => {
    if (closed) return;
    clock.clearTimeout(heartbeat);
    heartbeat = clock.setTimeout(sayHere, PRESENCE_HEARTBEAT_MS);
    // Alone, nobody needs telling: the relay is not woken (its pings keep the socket counted as alive).
    if (!roomKey || !peer || !members.size) return;
    void sendFrame(PRESENCE, new TextEncoder().encode(JSON.stringify({ peer, state: ownState ?? null }))).catch(() => undefined);
  };
  /** Wraps the key for a joiner; sends it only if the room, socket and key are still the ones it was wrapped on. */
  const answer = async (to: string, publicKey: string) => {
    const key = roomKey, on = socket;
    if (!key) { waiting.push({ from: to, publicKey }); return; }
    let wrapped: Awaited<ReturnType<typeof wrapFor>>;
    try { wrapped = await wrapFor(key, b64u.decode(publicKey)); }
    catch { return; /* A malformed public key gets no answer. */ }
    if (!closed && socket === on && roomKey === key) sendControl({ type: "key", to, ...wrapped });
  };
  /** `handed`: the key came from a member, so the relay is told this tab holds it now. */
  const keyReady = (key: CryptoKey, handed = false) => {
    roomKey = key;
    request = null;
    clock.clearTimeout(rerequest);
    if (handed) sendControl({ type: "keyed" });
    keyed.resolve(key);
    const queued = waiting;
    waiting = [];
    for (const item of queued) if (members.has(item.from)) void answer(item.from, item.publicKey);
    sayHere();
    options.onKey?.();
  };
  /** The relay's runtime answers this itself, so a quiet socket still counts as alive there. */
  const pingRelay = () => {
    if (closed) return;
    clock.clearTimeout(ping);
    ping = clock.setTimeout(pingRelay, LIVE_PING_MS);
    try { socket?.send(LIVE_PING); } catch { /* The close handler reconnects. */ }
  };
  const ask = () => {
    if (!request) return;
    sendControl({ type: "key-request", publicKey: b64u.encode(request.publicKey) });
    clock.clearTimeout(rerequest);
    rerequest = clock.setTimeout(ask, REREQUEST_MS);
  };

  /** Handles one relay frame from `from`. After every await it re-checks that the room is open and `from` is still its socket. */
  const control = async (message: LiveServerMessage, from: LiveRoomSocket) => {
    const current = () => !closed && socket === from;
    const makeKey = async () => {
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      if (current() && !roomKey) keyReady(key);
    };
    switch (message.type) {
      case "welcome": {
        peer = message.peer;
        attempt = 0;
        members.clear();
        for (const item of message.peers) members.set(item.peer, item.access);
        for (const id of presence.keys()) if (!members.has(id)) presence.delete(id);
        changed();
        membersChanged();
        // Holding the key (first in, or back in place of its own earlier socket): keep the one it had, or make one. Otherwise take theirs.
        if (message.keyed) { if (roomKey) keyReady(roomKey); else await makeKey(); return; }
        if (roomKey) { roomKey = null; resetKeyed(); }
        const keys = await oneTimeKeys();
        if (!current() || roomKey) return;
        request = keys;
        ask();
        return;
      }
      case "joined": members.set(message.peer, message.access); membersChanged(); return;
      case "left":
        members.delete(message.peer);
        presence.delete(message.peer);
        waiting = waiting.filter(item => item.from !== message.peer);
        changed();
        membersChanged();
        return;
      // The last key holder left: the relay chose this tab to make a new one.
      case "make-key": if (!roomKey) await makeKey(); return;
      // A member holds the key now: say who is here so it sees this tab at once, or ask it if still waiting.
      case "keyed": if (roomKey) sayHere(); else ask(); return;
      case "key-request": await answer(message.from, message.publicKey); return;
      case "key": {
        const pending = request;
        if (!pending || roomKey) return;
        let key: CryptoKey;
        try { key = await unwrapFrom(pending, message.publicKey, message.wrapped); }
        catch { return; /* A forged or broken handover is ignored; another member's answer may still come. */ }
        if (current() && !roomKey && request === pending) keyReady(key, true);
        return;
      }
    }
  };
  const frame = async (data: Bytes, from: LiveRoomSocket) => {
    if (!roomKey) return;
    const plain = await open(roomKey, data);
    if (closed || socket !== from || !plain?.length) return;
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
    catch (error) {
      if (error instanceof LiveRoomClosed && !closed) { stop(); options.onClosed?.(); return; }
      reconnect();
      return;
    }
    if (closed) { next.close(1000); return; }
    socket = next;
    peer = "";
    pingRelay();
    next.addEventListener("message", event => {
      if (socket !== next) return;
      queue = queue.then(async () => {
        if (typeof event.data === "string") { const message = readLiveServerMessage(event.data); if (message) await control(message, next); }
        else if (event.data instanceof ArrayBuffer) await frame(new Uint8Array(event.data), next);
        else if (ArrayBuffer.isView(event.data)) await frame(Uint8Array.from(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)), next);
      }).catch(() => undefined);
    });
    next.addEventListener("close", event => {
      if (socket !== next) return;
      socket = null;
      members.clear();
      changed();
      if (event.code === LIVE_ROOM_CLOSED || event.code === LIVE_ACCESS_ENDED) { stop(); options.onClosed?.(); return; }
      reconnect();
    });
  };
  const stop = () => {
    closed = true;
    for (const timer of [heartbeat, sweep, retry, rerequest, ping]) clock.clearTimeout(timer);
    request = null;
    // Callers still waiting hold the pending promise: reject it. The key may have arrived already, and a settled
    // promise cannot reject, so later calls get a fresh, rejected one.
    keyed.reject(new Error("The live room is closed."));
    resetKeyed();
    keyed.reject(new Error("The live room is closed."));
    roomKey = null;
  };
  void join();

  return {
    /** Settles once this participant holds the room key (made, kept or handed over); rejects once closed. */
    ready: () => keyed.promise.then(() => undefined),
    /** Sends content to everyone else in the room, once this tab has the room key. Resolves true once handed to the
     * socket; false when it was not sent (the key changed during a handover, or the socket is down): send again after
     * `ready()`. Rejects once the room is closed. */
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
