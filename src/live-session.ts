// A synced session (slice 30; CONTEXT.md "Synced session"): Lex shares the page he
// shows through a link, and people without an account edit its text with him.
//
// The link is `/live?s=<token>#k=<key>&site=<name>&by=<login>`. The token names
// the session's own relay instance and room (worker/app.ts, `/api/live/share`
// and `/api/live/guest`); the room key, the site's name and Lex's travel after
// `#`, so the server never sees them. Every share makes a new token and key.
//
// Lex's tab holds the room open (it alone has editor sign-in) and sends each
// render of the page on show (src/components/native-preview.ts, `mirror`),
// encrypted with that key. A guest's page (src/live-guest.ts) draws the copy in
// its own preview frame and sends back the text typed there; Lex's tab writes
// it as its own text change, so it is his unsaved change and only he saves,
// publishes, changes files or settings, or uses agents. Stop sharing, or Lex's
// tab closing, closes the room: the relay ends each guest's socket, and the
// link refuses from then on.

// The room itself (src/live-room.ts) loads with the first share or join, never with the editor.
import type { LivePeer, LiveRoom } from "./live-room";
import type { JsonValue } from "../shared/agent-command";
import type { GuestTextEdit, MirrorMessage, NativePreview } from "./components/native-preview";

/** The guest page's address. */
export const LIVE_SESSION_PATH = "/live";
/** A frame's share of a message: big renders (a page's images) go in parts that fit a room frame. */
const PART_BYTES = 512 * 1024;
/** A message of more parts than this is dropped (32 MiB). */
const MAX_PARTS = 64;

/** Lex's tab to guests: the page on show, Lex's name and each guest's typing written so far (its frame's numbering). */
export type HostMessage =
  | { t: "render"; payload: Extract<MirrorMessage, { kind: "render" }>["payload"]; typed: Record<string, number> }
  | { t: "assets"; assets: Extract<MirrorMessage, { kind: "assets" }>["assets"] };
/** A guest to Lex's tab: one text change typed in their copy, numbered as their frame numbered it. */
export type GuestMessage = { t: "edit"; from: string; edit: GuestTextEdit; seq: number; session: number };
/** What each participant shows the others: a name, and for a guest the id its messages carry. */
export type SessionPresence = { name: string; guest?: string };
/** Someone in the session, as Lex's tab lists them. */
export interface SessionGuest { id: string; name: string }

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
export const randomId = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const b64u = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
  decode: (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0)),
};

/** A link's parts, from the guest page's address; undefined when it is not a whole edit link. */
export function readSessionLink(href: string): { token: string; key: string; site: string; by: string } | undefined {
  let url: URL;
  try { url = new URL(href); } catch { return undefined; }
  const token = url.searchParams.get("s") ?? "";
  const hash = new URLSearchParams(url.hash.slice(1));
  const key = hash.get("k") ?? "";
  if (!/^[a-f\d]{32}$/.test(token) || !/^[\w-]{43}$/.test(key)) return undefined;
  return { token, key, site: (hash.get("site") ?? "").slice(0, 100), by: (hash.get("by") ?? "").slice(0, 100) };
}
export const importSessionKey = (key: string) =>
  crypto.subtle.importKey("raw", b64u.decode(key), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/**
 * The session's wire over one live room: JSON messages, each split into parts that fit a frame, sent one at a time in
 * order (sealing is asynchronous, so two sent at once could swap). `lost` hears a message the socket did not take.
 */
export function sessionWire<In>(room: () => Pick<LiveRoom, "send"> | undefined, receive: (message: In) => void, lost: () => void) {
  let queue = Promise.resolve();
  const parts = new Map<number, { count: number; got: Map<number, Uint8Array> }>();
  const decoder = new TextDecoder();
  const deliver = (bytes: Uint8Array) => {
    let message: In;
    try { message = JSON.parse(decoder.decode(bytes)) as In; } catch { return; }
    if (message && typeof message === "object") receive(message);
  };
  return {
    send(message: unknown) {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      const count = Math.max(1, Math.ceil(bytes.length / PART_BYTES));
      if (count > MAX_PARTS) return;
      const id = crypto.getRandomValues(new Uint32Array(1))[0];
      queue = queue.then(async () => {
        for (let index = 0; index < count; index++) {
          const part = bytes.subarray(index * PART_BYTES, (index + 1) * PART_BYTES);
          const frame = new Uint8Array(9 + part.length);
          const view = new DataView(frame.buffer);
          view.setUint8(0, count === 1 ? 0 : 1);
          view.setUint32(1, id);
          view.setUint16(5, index);
          view.setUint16(7, count);
          frame.set(part, 9);
          const sent = await room()?.send(frame).catch(() => false);
          if (!sent) { lost(); return; }
        }
      });
    },
    receive(frame: Uint8Array) {
      if (frame.length < 9) return;
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const body = frame.subarray(9);
      if (view.getUint8(0) === 0) { deliver(body); return; }
      const id = view.getUint32(1), index = view.getUint16(5), count = view.getUint16(7);
      if (count < 2 || count > MAX_PARTS || index >= count) return;
      const entry = parts.get(id) ?? { count, got: new Map() };
      if (entry.count !== count) return;
      entry.got.set(index, Uint8Array.from(body));
      parts.set(id, entry);
      // Only the latest few messages wait for their parts: an older one missing a part is let go.
      for (const old of [...parts.keys()].slice(0, Math.max(0, parts.size - 4))) parts.delete(old);
      if (entry.got.size < count) return;
      parts.delete(id);
      const all = new Uint8Array([...entry.got.values()].reduce((sum, part) => sum + part.length, 0));
      let offset = 0;
      for (let at = 0; at < count; at++) { const part = entry.got.get(at)!; all.set(part, offset); offset += part.length; }
      deliver(all);
    },
  };
}

export interface SharePorts {
  repo: string;
  branch: string;
  /** The site's name and Lex's, shown on the guest's page (they travel after `#`). */
  site: string;
  host: string;
  /** The editing preview now, and whether the workspace shared is still the one shown. */
  preview(): NativePreview | undefined;
  holds(): boolean;
  /** Who is in the session changed, or (`ended`) it ended by itself: the room refused, or the preview closed. */
  changed(state: { guests: SessionGuest[]; ended?: true }): void;
}

/** Starts a synced session on the page shown: resolves its link once the room is open, or throws. */
export async function startSharing(ports: SharePorts) {
  const { openLiveRoom } = await import("./live-room");
  const token = randomId();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = b64u.encode(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
  const link = `${location.origin}${LIVE_SESSION_PATH}?${new URLSearchParams({ s: token })}#${new URLSearchParams({ k: raw, site: ports.site, by: ports.host })}`;
  // Each guest's typing written so far, by their frame's numbering; and the guests in the session.
  const typed: Record<string, number> = {};
  let guests: SessionGuest[] = [];
  let ended = false;
  let mirror: ReturnType<NativePreview["mirror"]> | undefined;
  // A guest's letters are written in order, one at a time.
  let writing = Promise.resolve();
  // A render the socket did not take is sent whole again once the room is back (`onKey`).
  const wire = sessionWire<GuestMessage>(() => room, (message) => { if (message.t === "edit") written(message); }, () => undefined);

  const end = () => {
    if (ended) return;
    ended = true;
    mirror?.stop();
    mirror = undefined;
    room.close();
    ports.changed({ guests: [], ended: true });
  };
  // Every guest gets the whole page again (a joiner, or after a render the socket did not take): each copy holds the
  // assets it was sent, so they all start afresh. With nobody in, no copy is made.
  const sendWhole = () => {
    mirror?.stop();
    mirror = undefined;
    const preview = ports.preview();
    if (!preview || ended || !guests.length) return;
    mirror = preview.mirror((message) => {
      if (!ports.holds()) { end(); return; }
      wire.send(message.kind === "render" ? { t: "render", payload: message.payload, typed } satisfies HostMessage : { t: "assets", assets: message.assets } satisfies HostMessage);
    }, end);
  };
  const written = (message: GuestMessage) => {
    const from = guests.find((guest) => guest.id === message.from);
    if (!from || !message.edit || typeof message.seq !== "number" || typeof message.session !== "number") return;
    const edit = message.edit;
    if (typeof edit.path !== "string" || !Array.isArray(edit.node) || !edit.node.every((step) => Number.isInteger(step) && step >= 0) ||
      typeof edit.before !== "string" || typeof edit.after !== "string" || edit.after.length > 100_000) return;
    writing = writing.then(async () => {
      if (ended || !ports.holds()) return;
      const preview = ports.preview();
      const done = await preview?.guestTextEdit({ path: edit.path, node: edit.node, before: edit.before, after: edit.after, live: edit.live === true },
        `${from.id}:${message.session}`);
      typed[from.id] = Math.max(typed[from.id] ?? 0, message.seq);
      // Not written (the page changed under it): the guest's copy drops the typed text with the next render.
      if (!done) preview?.refresh();
    });
  };
  const peersChanged = (peers: ReadonlyMap<string, LivePeer>) => {
    const next: SessionGuest[] = [];
    for (const peer of peers.values()) {
      const state = peer.state as SessionPresence | null | undefined;
      if (peer.access !== "guest" || !state || typeof state.guest !== "string" || !/^[a-f\d]{32}$/.test(state.guest) || typeof state.name !== "string") continue;
      next.push({ id: state.guest, name: state.name.trim().slice(0, 40) || "Guest" });
    }
    const joined = next.some((guest) => !guests.some((known) => known.id === guest.id));
    const same = next.length === guests.length && !joined;
    guests = next;
    if (joined || !guests.length) sendWhole();
    if (!same) ports.changed({ guests });
  };

  const room: LiveRoom = openLiveRoom({
    address: `/api/live/share?${new URLSearchParams({ repo: ports.repo, branch: ports.branch, session: token })}`,
    key,
    onMessage: (bytes) => wire.receive(bytes),
    onPeers: peersChanged,
    // Back after a dropped socket: frames meanwhile may be lost, so every guest gets the whole page.
    onKey: () => sendWhole(),
    onClosed: end,
  });
  room.setPresence({ name: ports.host } satisfies SessionPresence as JsonValue);
  try { await room.ready(); } catch (error) { end(); throw error; }
  return {
    link,
    /** Ends the session: guests' pages say so, and the link refuses. */
    stop: end,
  };
}

export type SyncedSession = Awaited<ReturnType<typeof startSharing>>;

/** What the project menu shows: no session, one starting, or one open with its link and guests. */
export type ShareState = { sharing: false; starting?: true } | { sharing: true; link: string; guests: SessionGuest[] };

/**
 * Lex's side of Share to edit for the workspace shown: one session at a time. It ends by itself when another project
 * or branch opens (`check`, after each load), when the room refuses, or when the editing preview closes.
 */
export function createShareControl(ports: Pick<SharePorts, "preview"> & {
  /** The repository and branch shown, the site's name and Lex's; none when nothing is open. */
  workspace(): Pick<SharePorts, "repo" | "branch" | "site" | "host"> | undefined;
  /** Whether the workspace open when sharing began is still the one shown. */
  stamp(): { holds(): boolean };
  start?: typeof startSharing;
}) {
  let state: ShareState = { sharing: false };
  let session: SyncedSession | undefined;
  let holds: { holds(): boolean } | undefined;
  let run = 0;
  const listeners = new Set<(state: ShareState) => void>();
  const set = (next: ShareState) => { state = next; for (const listener of [...listeners]) listener(state); };
  return {
    state: () => state,
    /** Hears each change of state; returns the way to stop. */
    watch(listener: (state: ShareState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Starts a session (or keeps the one open): its link, or undefined when nothing is open to share. Throws when the room refuses. */
    async start(): Promise<string | undefined> {
      if (state.sharing) return state.link;
      const where = ports.workspace();
      if (!where || state.starting) return undefined;
      const mine = ++run;
      const since = holds = ports.stamp();
      set({ sharing: false, starting: true });
      try {
        const started = await (ports.start ?? startSharing)({
          ...where, preview: ports.preview, holds: () => since.holds(),
          changed: (change) => {
            if (mine !== run) return;
            if (change.ended) { session = undefined; set({ sharing: false }); return; }
            if (state.sharing) set({ ...state, guests: change.guests });
          },
        });
        if (mine !== run || !since.holds()) { started.stop(); return undefined; }
        session = started;
        set({ sharing: true, link: started.link, guests: [] });
        return started.link;
      } catch (error) {
        if (mine === run) set({ sharing: false });
        throw error;
      }
    },
    /** Stop sharing: guests' pages say the session ended, and the link refuses. */
    stop() {
      run++;
      const open = session;
      session = undefined;
      set({ sharing: false });
      open?.stop();
    },
    /** After a load: a session of another project or branch than the one shown ends. */
    check() {
      if ((session || (!state.sharing && state.starting)) && holds && !holds.holds()) this.stop();
    },
  };
}
