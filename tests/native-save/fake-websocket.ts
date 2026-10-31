import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { AgentRelay, type LiveRooms, type LiveSocket, type RelaySocket } from "../../worker/agent-relay.ts";
import { LIVE_MESSAGE_LIMIT, type LiveAccess } from "../../shared/live-room.ts";
import type { RelayConnect } from "./fake-hub.ts";

function frame(opcode: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(payload.length < 126 ? 2 : payload.length <= 65535 ? 4 : 10);
  header[0] = 0x80 | opcode;
  header[1] = header.length === 2 ? payload.length : header.length === 4 ? 126 : 127;
  if (header.length === 4) header.writeUInt16BE(payload.length, 2);
  if (header.length === 10) header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

const open = new Map<object, Set<NodeSocket>>();

/** Test-only deployment restart: the server closes every socket of this relay, as workerd does
 * when an isolate is replaced. Returns how many open sockets were closed. */
export function closeRelaySockets(relay: AgentRelay, code = 1012, reason = "Service restart"): number {
  const sockets = [...open.get(relay) ?? []];
  for (const socket of sockets) socket.close(code, reason);
  open.delete(relay);
  return sockets.length;
}

/** What a socket feeds: the agent relay (text only) or a live rooms instance (text and binary). */
interface SocketCore {
  owner: object;
  limit: number;
  binary: boolean;
  message(socket: NodeSocket, message: string | ArrayBuffer): void;
  gone(socket: NodeSocket): void;
}
/** When SessionStore's auto-response last answered each live socket's ping (getWebSocketAutoResponseTimestamp). */
const pinged = new WeakMap<object, number>();
export const livePingedAt = (socket: LiveSocket) => pinged.get(socket) ?? null;

/** Small RFC 6455 adapter for fixture messages; relay and room rules stay in AgentRelay and LiveRooms. */
class NodeSocket implements RelaySocket, LiveSocket {
  private attachment: unknown;
  private buffer: Buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;
  private fragmentOpcode = 0;
  private accepted = false;
  private closing = false;
  constructor(private socket: Duplex, private core: SocketCore) {
    socket.once("close", () => { open.get(core.owner)?.delete(this); core.gone(this); });
    socket.on("error", () => { core.gone(this); socket.destroy(); });
  }
  get readyState() { return this.socket.destroyed || this.closing ? 3 : this.accepted ? 1 : 0; }
  serializeAttachment(value: unknown) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(message: string | ArrayBuffer) {
    if (this.readyState !== 1) throw new Error("Fixture socket is closed.");
    this.socket.write(typeof message === "string" ? frame(1, Buffer.from(message)) : frame(2, Buffer.from(message)));
  }
  close(code = 1000, reason = "") {
    if (this.closing || this.socket.destroyed) return;
    this.closing = true;
    this.core.gone(this);
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    this.socket.end(frame(8, Buffer.concat([payload, Buffer.from(reason)])));
  }
  accept(key: string, head: Buffer) {
    const hash = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    this.socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${hash}\r\n\r\n`);
    this.accepted = true;
    open.set(this.core.owner, (open.get(this.core.owner) ?? new Set()).add(this));
    this.socket.on("data", (chunk: Buffer) => this.receive(chunk));
    if (head.length) this.receive(head);
  }
  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const limit = this.core.limit;
    while (this.readyState === 1 && this.buffer.length >= 2) {
      const flags = this.buffer[0], opcode = flags & 15, final = !!(flags & 128);
      let length = this.buffer[1] & 127, offset = 2;
      if (flags & 0x70 || !(this.buffer[1] & 128)) return this.close(1002, "Expected masked client frame.");
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2); offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const wide = this.buffer.readBigUInt64BE(2);
        if (wide > BigInt(limit)) return this.close(1009, "Relay message is too large.");
        length = Number(wide); offset = 10;
      }
      if (length + this.fragmentBytes > limit) return this.close(1009, "Relay message is too large.");
      if (opcode >= 8 && (!final || length > 125)) return this.close(1002, "Invalid control frame.");
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (opcode === 8) { this.close(); return; }
      if (opcode === 9) { this.socket.write(frame(10, payload)); continue; }
      if (opcode === 10) continue;
      const data = opcode === 1 || opcode === 2 && this.core.binary;
      if (!(data || opcode === 0) || (opcode === 0) !== (this.fragments.length > 0)) return this.close(1002, "Expected text frame.");
      if (opcode !== 0) this.fragmentOpcode = opcode;
      this.fragments.push(payload); this.fragmentBytes += length;
      if (!final) continue;
      const whole = Buffer.concat(this.fragments);
      this.fragments = []; this.fragmentBytes = 0;
      if (this.fragmentOpcode === 2) { this.core.message(this, whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.byteLength)); continue; }
      let message: string;
      try { message = new TextDecoder("utf-8", { fatal: true }).decode(whole); }
      catch { return this.close(1007, "Invalid UTF-8."); }
      // Mirrors SessionStore's setWebSocketAutoResponse without entering the relay core.
      if (message === "ping") { pinged.set(this, Date.now()); this.send("pong"); }
      else this.core.message(this, message);
    }
  }
}

/** Live rooms through the fixture: SESSIONS answers `/live/join` by having the upgrade join `rooms`. */
export type LiveConnect = (rooms: LiveRooms, join: { room: string; access: LiveAccess; rejoin?: string }) => Response;

/** Authorize through the real public Worker route before accepting the Node upgrade. */
export function installRelayUpgrade(server: { on(event: "upgrade", listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown }, route: (request: IncomingMessage, connect: RelayConnect, live: LiveConnect) => Promise<Response>) {
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/api/agent/relay" && pathname !== "/api/live/room") return;
    socket.on("error", () => socket.destroy());
    const run = async () => {
      const key = request.headers["sec-websocket-key"];
      if (request.method !== "GET" || request.headers.upgrade?.toLowerCase() !== "websocket" || request.headers["sec-websocket-version"] !== "13" || typeof key !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); return;
      }
      let adapter: NodeSocket | undefined, joined: (() => void) | undefined;
      const response = await route(request, (relay, scope) => {
        adapter = new NodeSocket(socket, { owner: relay, limit: AgentRelay.maxBytes, binary: false, message: (from, message) => relay.message(from, message as string), gone: from => relay.disconnect(from) });
        return new Response(null, { status: relay.connect(adapter, scope) ? 204 : 409 });
      }, (rooms, join) => {
        // As SessionStore does: an agent waits for a tab; the welcome goes out once the socket is accepted.
        if (!rooms.admits(join.room, join.access)) return new Response(null, { status: 409 });
        const live = adapter = new NodeSocket(socket, { owner: rooms, limit: LIVE_MESSAGE_LIMIT, binary: true, message: (from, message) => rooms.message(from, message), gone: from => rooms.leave(from) });
        joined = () => rooms.join(live, join.room, join.access, join.rejoin === undefined ? {} : { rejoin: join.rejoin });
        return new Response(null, { status: 204 });
      });
      if (adapter && response.ok) { adapter.accept(key, head); joined?.(); }
      else socket.end(`HTTP/1.1 ${response.status} Refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    void run().catch(() => socket.destroy()); // Failed authorization/upgrade closes this fixture socket.
  });
}
