import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { AgentRelay, type RelaySocket } from "../../worker/agent-relay.ts";
import type { RelayConnect } from "./fake-hub.ts";

function frame(opcode: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(payload.length < 126 ? 2 : payload.length <= 65535 ? 4 : 10);
  header[0] = 0x80 | opcode;
  header[1] = header.length === 2 ? payload.length : header.length === 4 ? 126 : 127;
  if (header.length === 4) header.writeUInt16BE(payload.length, 2);
  if (header.length === 10) header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

const open = new Map<AgentRelay, Set<NodeRelaySocket>>();

/** Test-only deployment restart: the server closes every socket of this relay, as workerd does
 * when an isolate is replaced. Returns how many open sockets were closed. */
export function closeRelaySockets(relay: AgentRelay, code = 1012, reason = "Service restart"): number {
  const sockets = [...open.get(relay) ?? []];
  for (const socket of sockets) socket.close(code, reason);
  open.delete(relay);
  return sockets.length;
}

/** Small RFC 6455 adapter for fixture text messages; relay rules stay in AgentRelay. */
class NodeRelaySocket implements RelaySocket {
  private attachment: unknown;
  private buffer: Buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;
  private accepted = false;
  private closing = false;
  constructor(private socket: Duplex, private relay: AgentRelay) {
    socket.once("close", () => { open.get(relay)?.delete(this); relay.disconnect(this); });
    socket.on("error", () => { relay.disconnect(this); socket.destroy(); });
  }
  get readyState() { return this.socket.destroyed || this.closing ? 3 : this.accepted ? 1 : 0; }
  serializeAttachment(value: unknown) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(message: string) {
    if (this.readyState !== 1) throw new Error("Fixture socket is closed.");
    this.socket.write(frame(1, Buffer.from(message)));
  }
  close(code = 1000, reason = "") {
    if (this.closing || this.socket.destroyed) return;
    this.closing = true;
    this.relay.disconnect(this);
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    this.socket.end(frame(8, Buffer.concat([payload, Buffer.from(reason)])));
  }
  accept(key: string, head: Buffer) {
    const hash = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    this.socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${hash}\r\n\r\n`);
    this.accepted = true;
    open.set(this.relay, (open.get(this.relay) ?? new Set()).add(this));
    this.socket.on("data", (chunk: Buffer) => this.receive(chunk));
    if (head.length) this.receive(head);
  }
  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
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
        if (wide > BigInt(AgentRelay.maxBytes)) return this.close(1009, "Relay message is too large.");
        length = Number(wide); offset = 10;
      }
      if (length + this.fragmentBytes > AgentRelay.maxBytes) return this.close(1009, "Relay message is too large.");
      if (opcode >= 8 && (!final || length > 125)) return this.close(1002, "Invalid control frame.");
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < length; i++) payload[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (opcode === 8) { this.close(); return; }
      if (opcode === 9) { this.socket.write(frame(10, payload)); continue; }
      if (opcode === 10) continue;
      if (opcode !== 0 && opcode !== 1 || (opcode === 0) !== (this.fragments.length > 0)) return this.close(1002, "Expected text frame.");
      this.fragments.push(payload); this.fragmentBytes += length;
      if (!final) continue;
      let message: string;
      try { message = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(this.fragments)); }
      catch { return this.close(1007, "Invalid UTF-8."); }
      this.fragments = []; this.fragmentBytes = 0;
      // Mirrors SessionStore's setWebSocketAutoResponse without entering the relay core.
      if (message === "ping") this.send("pong");
      else this.relay.message(this, message);
    }
  }
}

/** Authorize through the real public Worker route before accepting the Node upgrade. */
export function installRelayUpgrade(server: { on(event: "upgrade", listener: (request: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown }, route: (request: IncomingMessage, connect: RelayConnect) => Promise<Response>) {
  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/api/agent/relay") return;
    socket.on("error", () => socket.destroy());
    const run = async () => {
      const key = request.headers["sec-websocket-key"];
      if (request.method !== "GET" || request.headers.upgrade?.toLowerCase() !== "websocket" || request.headers["sec-websocket-version"] !== "13" || typeof key !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"); return;
      }
      let adapter: NodeRelaySocket | undefined;
      const response = await route(request, (relay, scope) => {
        adapter = new NodeRelaySocket(socket, relay);
        return new Response(null, { status: relay.connect(adapter, scope) ? 204 : 409 });
      });
      if (adapter && response.ok) adapter.accept(key, head);
      else socket.end(`HTTP/1.1 ${response.status} Refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    void run().catch(() => socket.destroy()); // Failed authorization/upgrade closes this fixture socket.
  });
}
