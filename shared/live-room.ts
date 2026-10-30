// Live rooms (ADR 0003): one room per site, branch and file, carried by the
// relay Durable Object. Content travels as binary frames the relay forwards
// unread: a 12-byte AES-GCM IV, then ciphertext. The few plain text frames
// below say who is in the room and hand the room key over, wrapped for one
// joiner, so the relay only ever sees public keys and wrapped keys.

/** How a participant got past the room access check. Synced-session links (slice 30) add their own kind. */
export type LiveAccess = "editor" | "agent";

/** Sent by the relay. `welcome` lists who was already in; its `keyed` says the joiner holds the key: it was first in
 * (so it makes one) or it reconnected in place of its own earlier socket (so it keeps the key it had).
 * `keyed`: a member now holds the key (members send presence; a joiner still waiting asks again). `make-key`:
 * the last key holder left, so this tab makes a new key. */
export type LiveServerMessage =
  | { type: "welcome"; peer: string; keyed: boolean; peers: { peer: string; access: LiveAccess; keyed: boolean }[] }
  | { type: "joined"; peer: string; access: LiveAccess }
  | { type: "left"; peer: string }
  | { type: "keyed"; peer: string }
  | { type: "make-key" }
  | { type: "key-request"; from: string; publicKey: string }
  | { type: "key"; from: string; publicKey: string; wrapped: string };

/** Sent by a participant: "I hold the key now", a joiner's one-time ECDH public key, or the room key wrapped for that joiner. */
export type LiveClientMessage =
  | { type: "keyed" }
  | { type: "key-request"; publicKey: string }
  | { type: "key"; to: string; publicKey: string; wrapped: string };

/** A frame larger than this closes the socket (1009); a whole 1 MiB file and its overhead fit. */
export const LIVE_MESSAGE_LIMIT = 2 * 1024 * 1024;
/** Each participant says it is here this often (an encrypted frame, so it wakes the relay). */
export const PRESENCE_HEARTBEAT_MS = 15_000;
/** A participant not heard from for this long has gone: a crashed tab cannot say it left. */
export const PRESENCE_TIMEOUT_MS = 30_000;
/** The relay closes an agent's socket with this when no tab has the room open (an agent never makes the key). */
export const LIVE_ROOM_CLOSED = 4404;
/** The relay closes an agent's socket with this once its connection ends: revoked, rebound, past its 8 hours or agents paused. */
export const LIVE_ACCESS_ENDED = 4403;

const peerPattern = /^[a-f\d]{16,32}$/;
// Base64url: a raw P-256 public key is 87 characters; a wrapped 256-bit key (IV, key, tag) is 80.
const keyPattern = /^[\w-]{16,128}$/;

/** A site file a room can be about: relative, no empty, `.` or `..` parts, no backslashes or control characters. */
export function liveRoomFile(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && !/[\\\x00-\x1f\x7f]/.test(value) &&
    value.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

/** Reads a participant's text frame; anything else is ignored. */
export function readLiveClientMessage(text: string): LiveClientMessage | null {
  let value: Record<string, unknown>;
  try { value = JSON.parse(text) as Record<string, unknown>; } catch { return null; }
  if (value && typeof value === "object" && value.type === "keyed") return { type: "keyed" };
  if (!value || typeof value !== "object" || typeof value.publicKey !== "string" || !keyPattern.test(value.publicKey)) return null;
  if (value.type === "key-request") return { type: "key-request", publicKey: value.publicKey };
  if (value.type === "key" && typeof value.to === "string" && peerPattern.test(value.to) && typeof value.wrapped === "string" && keyPattern.test(value.wrapped))
    return { type: "key", to: value.to, publicKey: value.publicKey, wrapped: value.wrapped };
  return null;
}

/** Reads the relay's text frame; anything else is ignored. */
export function readLiveServerMessage(text: string): LiveServerMessage | null {
  let value: Record<string, unknown>;
  try { value = JSON.parse(text) as Record<string, unknown>; } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const peer = (key: string) => typeof value[key] === "string" && peerPattern.test(value[key]);
  const access = (item: unknown): item is LiveAccess => item === "editor" || item === "agent";
  const key = (name: string) => typeof value[name] === "string" && keyPattern.test(value[name]);
  switch (value.type) {
    case "welcome":
      return peer("peer") && typeof value.keyed === "boolean" && Array.isArray(value.peers) && value.peers.every(item => item && typeof item === "object" &&
        typeof item.peer === "string" && peerPattern.test(item.peer) && access(item.access) && typeof item.keyed === "boolean") ? value as LiveServerMessage : null;
    case "joined": return peer("peer") && access(value.access) ? value as LiveServerMessage : null;
    case "left": case "keyed": return peer("peer") ? value as LiveServerMessage : null;
    case "make-key": return { type: "make-key" };
    case "key-request": return peer("from") && key("publicKey") ? value as LiveServerMessage : null;
    case "key": return peer("from") && key("publicKey") && key("wrapped") ? value as LiveServerMessage : null;
    default: return null;
  }
}
