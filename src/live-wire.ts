// A live room's wire (slices 30 and 35): JSON messages split into parts that fit a room frame, the room key's
// encoding in a link, and random ids. A synced session (src/live-session.ts) and a preview link (src/preview-visit.ts,
// src/preview-serve.ts) use it; it imports nothing of the editor, so a preview link's page stays apart from the
// editor's boot code.

import type { LiveRoom } from "./live-room";
import type { LiveAccess } from "../shared/live-room";

/** A frame's share of a message: big renders (a page's images) go in parts that fit a room frame. */
const PART_BYTES = 512 * 1024;
/** A message of more parts than this is dropped (32 MiB). */
const MAX_PARTS = 64;

/** Who sent a frame, as the relay names it. */
type Sender = { peer: string; access: LiveAccess };

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
export const randomId = (bytes = 16) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const b64u = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
  decode: (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0)),
};

export const importSessionKey = (key: string) =>
  crypto.subtle.importKey("raw", b64u.decode(key), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

/**
 * The session's wire over one live room: JSON messages, each split into parts that fit a frame, sent one at a time in
 * order (sealing is asynchronous, so two sent at once could swap). `lost` hears a message the socket did not take.
 */
export function sessionWire<In>(room: () => Pick<LiveRoom, "send"> | undefined, receive: (message: In, from: Sender) => void, lost: () => void) {
  let queue = Promise.resolve();
  const parts = new Map<string, { count: number; got: Map<number, Uint8Array> }>();
  const decoder = new TextDecoder();
  const deliver = (bytes: Uint8Array, from: Sender) => {
    let message: In;
    try { message = JSON.parse(decoder.decode(bytes)) as In; } catch { return; }
    if (message && typeof message === "object") receive(message, from);
  };
  return {
    send(message: unknown) {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      const count = Math.max(1, Math.ceil(bytes.length / PART_BYTES));
      // Too big to send (over 32 MiB): the copy is sent whole again, once the assets are spread over smaller messages.
      if (count > MAX_PARTS) { lost(); return; }
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
    receive(frame: Uint8Array, from: Sender) {
      if (frame.length < 9) return;
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const body = frame.subarray(9);
      if (view.getUint8(0) === 0) { deliver(body, from); return; }
      const index = view.getUint16(5), count = view.getUint16(7);
      // Parts are put back together per sender: nobody can slip a part into someone else's message.
      const id = `${from.peer}:${view.getUint32(1)}`;
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
      deliver(all, from);
    },
  };
}
