import { workspaceKey, type AgentWorkspace, type JsonValue } from "../shared/agent-command";

export interface RelayScope {
  workspace: AgentWorkspace;
  tabId: string;
  generation: number;
}
export interface RelaySocket {
  readonly readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
export interface RelayClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
}
type Attachment = RelayScope & { role: "editor"; handshaken: boolean; owner?: { tabId: string | null; generation: number } };
type FailureCode = "editor-unavailable" | "busy" | "waiting" | "too-large" | "cancelled" | "timeout" | "unknown-outcome";
type Outcome = { ok: true; result: JsonValue } | { ok: false; code: FailureCode; outcome: "unknown" | "not-sent" };
/** A dispatcher names the workspace; tab and generation are optional fences. The
 * relay resolves the current owner (an MCP grant does not know which tab owns). */
export interface RelayReservation { readonly cancelled: boolean; release(): void }
export interface RelayTarget {
  workspace: AgentWorkspace;
  tabId?: string;
  generation?: number;
}
export interface RelayCancelKey { requestId: string | number; grantId: string }
interface Pending {
  cancelKey?: RelayCancelKey;
  socket: RelaySocket;
  scope: RelayScope;
  bytes: number;
  /** Set until the owner's (fresh) handshake sends it; cleared once sent. */
  unsent?: (now: number) => string;
  deadline: number;
  timer: unknown;
  finish(outcome: Outcome): void;
}
const utf8 = new TextEncoder();
const bytes = (value: string) => utf8.encode(value).byteLength;
const placeholder = "00000000-0000-0000-0000-000000000000";
const failure = (code: FailureCode, outcome: "unknown" | "not-sent" = "not-sent"): Outcome => ({ ok: false, code, outcome });
/** A call lost before it reached the browser was never sent; after, its outcome is unknown. */
const lost = (call: { unsent?: unknown }) => call.unsent === undefined ? failure("unknown-outcome", "unknown") : failure("editor-unavailable");
/** Ticket 18: a wait_for_requests the tab may hold while the user's Watch is on. It gets its own total
 * deadline of 10–25 s (the agent's waitMs; the tab answers at once without Watch) and one per workspace. */
export const WAIT_LIMIT_MS = 25_000;
function waitBudget(command: JsonValue): number | undefined {
  if (!command || typeof command !== "object" || Array.isArray(command) || command.operation !== "requests" || command.tool !== "wait_for_requests") return undefined;
  const wanted = typeof command.waitMs === "number" && Number.isFinite(command.waitMs) ? command.waitMs : WAIT_LIMIT_MS;
  return Math.min(WAIT_LIMIT_MS, Math.max(10_000, Math.floor(wanted)));
}
const sameScope = (a: RelayScope, b: RelayScope) => a.tabId === b.tabId && a.generation === b.generation && workspaceKey(a.workspace) === workspaceKey(b.workspace);

/** Shared by the editor upgrade and future MCP dispatchers. Repository names can
 * change; the repository id and case-insensitive GitHub account are the identity. */
export async function relayObjectName(workspace: AgentWorkspace): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", utf8.encode(workspaceKey(workspace)));
  return `agent-relay:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

type BodyRead = { ok: true; value: JsonValue } | { ok: false; code: "timeout" | "too-large" | "cancelled" | "invalid" };
/** Reads a dispatch body of at most `limit` bytes before `deadline` (epoch ms).
 * Expiry, overflow or abort cancels the reader itself (no further pulls) and
 * returns at once: the outcome never waits on the source's cancel promise. */
export async function readRelayBody(body: ReadableStream<Uint8Array> | null, limit: number, deadline: number, signal?: AbortSignal): Promise<BodyRead> {
  if (signal?.aborted) return { ok: false, code: "cancelled" };
  if (!body) return { ok: false, code: "invalid" };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onAbort = () => {};
  const stopped = new Promise<"timeout" | "cancelled">(resolve => {
    timer = setTimeout(() => resolve("timeout"), Math.max(0, deadline - Date.now()));
    onAbort = () => resolve("cancelled");
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  const stop = (code: "timeout" | "too-large" | "cancelled"): BodyRead => {
    reader.cancel().catch(() => undefined);
    return { ok: false, code };
  };
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), stopped]);
      if (next === "timeout" || next === "cancelled") return stop(next);
      if (next.done) break;
      if ((total += next.value.byteLength) > limit) return stop("too-large");
      chunks.push(next.value);
    }
  } catch {
    return { ok: false, code: "invalid" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  try { return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(joined)) as JsonValue }; }
  catch { return { ok: false, code: "invalid" }; }
}

/** In-memory only: no storage port and no offline mailbox. The socket runtime
 * retains outstanding sends; their serialized bytes stay reserved until settled.
 * Wire heartbeat for ticket 14: the exact text "ping" gets the exact text "pong"
 * through setWebSocketAutoResponse, without entering this module.
 *
 * The browser proves ownership through its durable owner transaction. A handshake
 * explicitly claims that generation; dispatch must independently name the same
 * tab and generation. Focus and ordinary socket activity never choose an owner. */
export class AgentRelay {
  static readonly maxBytes = 8 * 1024 * 1024;
  static readonly identityHeader = "X-Agent-Relay-Identity";
  private sockets = new Map<RelaySocket, Attachment>();
  private owner: { tabId: string | null; generation: number } | undefined;
  private workspace: string | undefined;
  private calls = new Map<string, Pending>();
  private buffered = 0;
  /** The workspace's one outstanding wait (ticket 18), in memory only. */
  private waitId: string | undefined;
  private reserved = { count: 0, bytes: 0 };
  private intakes = new Map<{ cancelled: boolean; release(): void }, RelayCancelKey>();
  /** Brief cancellation memory only; lazy expiry leaves idle hibernation possible. */
  private recentCancels = new Map<string, number>();

  private cancelId(key: RelayCancelKey) { return JSON.stringify([key.grantId, key.requestId]); }
  private pruneCancels() {
    for (const [key, expiry] of this.recentCancels) if (expiry <= this.clock.now()) this.recentCancels.delete(key);
  }
  private recentlyCancelled(key?: RelayCancelKey) {
    this.pruneCancels();
    return key !== undefined && this.recentCancels.has(this.cancelId(key));
  }

  constructor(sockets: RelaySocket[], private clock: RelayClock = {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
  }) {
    for (const socket of sockets) {
      const value = socket.deserializeAttachment();
      const scope = AgentRelay.readScope(value);
      if (!scope || !value || typeof value !== "object" || !("role" in value) || value.role !== "editor" || socket.readyState !== 1) continue;
      if (this.workspace && this.workspace !== workspaceKey(scope.workspace)) continue;
      this.workspace = workspaceKey(scope.workspace);
      this.sockets.set(socket, { ...scope, role: "editor", handshaken: false });
      // Only an explicit, recorded owner claim restores ownership; a socket that
      // connected and never handshook claims nothing (decision 04).
      const owner = (value as Attachment).owner;
      if (!owner || !Number.isSafeInteger(owner.generation) || owner.generation < 1 || (owner.tabId !== null && typeof owner.tabId !== "string")) continue;
      if (!this.owner || owner.generation > this.owner.generation) this.owner = { tabId: owner.tabId, generation: owner.generation };
      else if (owner.generation === this.owner.generation && owner.tabId !== this.owner.tabId) this.owner.tabId = null;
    }
    this.reset();
  }

  static readScope(value: unknown): RelayScope | null {
    if (!value || typeof value !== "object") return null;
    const scope = value as Partial<RelayScope>;
    const workspace = scope.workspace;
    if (!workspace || typeof workspace.account !== "string" || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(workspace.account) ||
      !Number.isSafeInteger(workspace.repoId) || workspace.repoId <= 0 || typeof workspace.branch !== "string" || !workspace.branch || workspace.branch.length > 255 ||
      typeof scope.tabId !== "string" || !/^[a-z\d_-]{1,128}$/i.test(scope.tabId) ||
      !Number.isSafeInteger(scope.generation) || scope.generation! < 1) return null;
    // Copy only metadata: never serialize an untrusted message or command body.
    return { workspace: { account: workspace.account.toLowerCase(), repoId: workspace.repoId, branch: workspace.branch }, tabId: scope.tabId, generation: scope.generation! };
  }

  static readTarget(value: unknown): RelayTarget | null {
    if (!value || typeof value !== "object") return null;
    const target = value as Partial<RelayTarget>;
    const probe = AgentRelay.readScope({ workspace: target.workspace, tabId: target.tabId ?? "any", generation: target.generation ?? 1 });
    if (!probe) return null;
    return { workspace: probe.workspace, ...(target.tabId === undefined ? {} : { tabId: probe.tabId }), ...(target.generation === undefined ? {} : { generation: probe.generation }) };
  }

  get pendingCount() { return this.calls.size; }
  get waiting() { return this.waitId !== undefined; }
  get reservedCount() { return this.reserved.count; }

  /** Holds a pending slot and `length` bytes while a dispatch body is still
   * arriving, so concurrent intake shares the five-command / 8 MiB bounds and is
   * refused before the body is read. Release is idempotent. */
  reserve(length: number, cancelKey?: RelayCancelKey): RelayReservation | Outcome {
    if (this.recentlyCancelled(cancelKey)) return failure("cancelled");
    if (this.calls.size + this.reserved.count >= 5) return failure("busy");
    if (this.buffered + this.reserved.bytes + length > AgentRelay.maxBytes) return failure("too-large");
    this.reserved.count++;
    this.reserved.bytes += length;
    let held = true;
    const reservation = { cancelled: false, release: () => {
      if (!held) return;
      held = false;
      this.intakes.delete(reservation);
      this.reserved.count--;
      this.reserved.bytes -= length;
    } };
    if (cancelKey) this.intakes.set(reservation, { ...cancelKey });
    return reservation;
  }
  get reservedBytes() { return this.reserved.bytes; }
  get bufferedBytes() { return this.buffered; }

  connect(socket: RelaySocket, scope: RelayScope): boolean {
    const identity = AgentRelay.readScope(scope);
    if (!identity) return false;
    scope = identity;
    const key = workspaceKey(scope.workspace);
    if (this.workspace && this.workspace !== key) return false;
    this.workspace = key;
    const metadata: Attachment = { ...scope, role: "editor", handshaken: false, ...(this.owner ? { owner: { ...this.owner } } : {}) };
    socket.serializeAttachment(metadata);
    this.sockets.set(socket, metadata);
    return true;
  }

  /** Restart invalidates every old request, never replays it. In a real isolate
   * loss the caller's promise is gone too (the internal HTTP request fails).
   * Restored sockets receive an explicit unknown outcome for ALL old requests,
   * without retaining their ids or payloads in attachments. Also usable by a
   * host that can report an orderly reset before replacing its relay instance. */
  reset() {
    for (const call of [...this.calls.values()]) call.finish(lost(call));
    for (const [socket, metadata] of this.sockets) {
      metadata.handshaken = false;
      metadata.owner = this.owner && { ...this.owner };
      socket.serializeAttachment(metadata);
      try { socket.send(JSON.stringify({ type: "reset", code: "unknown-outcome", handshakeRequired: true })); }
      catch { this.disconnect(socket); }
    }
  }

  /** Sends to the current owner tab. A restored (post-hibernation) owner socket
   * gets the command after its fresh handshake, inside the same 10 s deadline;
   * with no owner socket at all the answer is immediate "editor-unavailable". */
  dispatch(target: RelayTarget, command: JsonValue, signal?: AbortSignal, intake?: { started: number; reservation: RelayReservation }, cancelKey?: RelayCancelKey): Promise<Outcome> {
    // The body's reservation becomes this call's own accounting in the same turn.
    intake?.reservation.release();
    if (intake?.reservation.cancelled || this.recentlyCancelled(cancelKey)) return Promise.resolve(failure("cancelled"));
    const started = intake?.started ?? this.clock.now();
    const wanted = AgentRelay.readTarget(target);
    if (!wanted || signal?.aborted) return Promise.resolve(failure(wanted ? "cancelled" : "editor-unavailable"));
    const owner = this.owner;
    if (!owner || owner.tabId === null || (wanted.tabId !== undefined && wanted.tabId !== owner.tabId) ||
      (wanted.generation !== undefined && wanted.generation !== owner.generation)) return Promise.resolve(failure("editor-unavailable"));
    const scope: RelayScope = { workspace: wanted.workspace, tabId: owner.tabId, generation: owner.generation };
    const receivers = [...this.sockets].filter(([socket, metadata]) => socket.readyState === 1 && sameScope(metadata, scope));
    const entry = receivers.find(([, metadata]) => metadata.handshaken) ?? receivers[0];
    if (!entry) return Promise.resolve(failure("editor-unavailable"));
    const [receiver, receiverMetadata] = entry;
    if (this.calls.size + this.reserved.count >= 5) return Promise.resolve(failure("busy"));
    const wait = waitBudget(command);
    if (wait !== undefined && this.waitId !== undefined) return Promise.resolve(failure("waiting"));
    // Measure the complete wire envelope before allocating a correlation id,
    // promise, pending entry or timer. UUIDs have the placeholder's fixed width.
    // remainingMs is filled in at each send (at most 5 digits, measured at its widest): the tab fences
    // commits against this total deadline without comparing clocks.
    const candidate = JSON.stringify({ type: "command", id: placeholder, ...scope, remainingMs: 10_000, command });
    const length = bytes(candidate) + (cancelKey ? bytes(JSON.stringify(cancelKey)) : 0);
    if (this.buffered + this.reserved.bytes + length > AgentRelay.maxBytes) return Promise.resolve(failure("too-large"));
    const deadline = started + (wait ?? 10_000);
    if (this.clock.now() >= deadline) return Promise.resolve(failure("timeout"));
    const id = crypto.randomUUID();
    const message = candidate.replace(placeholder, id);
    const framed = (now: number) => message.replace('"remainingMs":10000', `"remainingMs":${Math.max(0, Math.floor(deadline - now))}`);
    return new Promise(resolve => {
      const cancel = () => call.finish(failure("cancelled", call.unsent === undefined ? "unknown" : "not-sent"));
      const call: Pending = { cancelKey, socket: receiver, scope, bytes: length, deadline, timer: undefined, finish: outcome => {
        if (!this.calls.delete(id)) return;
        if (this.waitId === id) this.waitId = undefined;
        this.buffered -= length;
        const sent = call.unsent === undefined;
        call.unsent = undefined;
        this.clock.clearTimeout(call.timer);
        signal?.removeEventListener("abort", cancel);
        resolve(outcome);
        if (sent && !outcome.ok && (outcome.code === "cancelled" || outcome.code === "timeout")) {
          try { call.socket.send(JSON.stringify({ type: "cancel", id, ...call.scope, reason: outcome.code })); }
          catch { this.disconnect(call.socket); }
        }
      } };
      this.calls.set(id, call);
      if (wait !== undefined) this.waitId = id;
      this.buffered += length;
      const now = this.clock.now();
      call.timer = this.clock.setTimeout(() => call.finish(failure("timeout", call.unsent === undefined ? "unknown" : "not-sent")), deadline - now);
      signal?.addEventListener("abort", cancel, { once: true });
      if (!receiverMetadata.handshaken) { call.unsent = framed; return; }
      try { receiver.send(framed(now)); }
      catch { this.disconnect(receiver); }
    });
  }

  message(socket: RelaySocket, message: string | ArrayBuffer): boolean {
    const metadata = this.sockets.get(socket);
    if (!metadata || socket.readyState !== 1 || typeof message !== "string") return false;
    const length = bytes(message);
    if (length > AgentRelay.maxBytes) {
      this.disconnect(socket);
      socket.close(1009, "Relay message is too large.");
      return false;
    }
    let value: { type?: string; id?: string; result?: JsonValue; owner?: boolean };
    try { value = JSON.parse(message); } catch { return false; }
    if (!value || typeof value !== "object") return false;
    const scope = AgentRelay.readScope(value);
    if (!scope || !sameScope(metadata, scope)) return false;
    if (value.type === "handshake" && value.owner === true) {
      if (this.owner && (scope.generation < this.owner.generation || (scope.generation === this.owner.generation && scope.tabId !== this.owner.tabId))) return false;
      if ([...this.sockets].some(([other, otherMetadata]) => other !== socket && other.readyState === 1 && otherMetadata.handshaken && sameScope(otherMetadata, scope))) return false;
      this.owner = { tabId: scope.tabId, generation: scope.generation };
      for (const call of [...this.calls.values()]) if (!sameScope(call.scope, scope)) call.finish(lost(call));
      // Carry the ownership fence on every surviving editor socket. Losing the
      // new owner's socket followed by restart must not revive an old owner.
      for (const [other, otherMetadata] of this.sockets) {
        if (other !== socket) otherMetadata.handshaken = false;
        otherMetadata.owner = { ...this.owner };
        other.serializeAttachment(otherMetadata);
      }
      metadata.handshaken = true;
      socket.serializeAttachment(metadata);
      try { socket.send(JSON.stringify({ type: "ready", ...scope })); }
      catch { this.disconnect(socket); return false; }
      // Commands that waited for this owner's fresh handshake go out now.
      for (const call of [...this.calls.values()]) {
        if (call.unsent === undefined || !sameScope(call.scope, scope)) continue;
        call.socket = socket;
        // A late handshake (or delayed timer) never sends an expired command.
        const now = this.clock.now();
        if (now >= call.deadline) { call.finish(failure("timeout")); continue; }
        const queued = call.unsent;
        call.unsent = undefined;
        try { socket.send(queued(now)); }
        catch { this.disconnect(socket); return false; }
      }
      return true;
    }
    if (value.type !== "result" || !metadata.handshaken || typeof value.id !== "string" || !("result" in value)) return false;
    const call = this.calls.get(value.id);
    if (!call || call.socket !== socket || !sameScope(call.scope, scope) || this.owner?.tabId !== scope.tabId || this.owner.generation !== scope.generation) return false;
    if (this.clock.now() >= call.deadline) call.finish(failure("timeout", "unknown"));
    else if (this.buffered + this.reserved.bytes + length > AgentRelay.maxBytes) call.finish(failure("too-large", "unknown"));
    else call.finish({ ok: true, result: value.result! });
    return true;
  }

  /** Fence matching intake and pending work, including dispatches still in transit. */
  cancel(key: RelayCancelKey) {
    this.pruneCancels();
    const id = this.cancelId(key);
    this.recentCancels.delete(id);
    this.recentCancels.set(id, this.clock.now() + 10_000);
    if (this.recentCancels.size > 32) this.recentCancels.delete(this.recentCancels.keys().next().value!);
    for (const [reservation, intakeKey] of this.intakes)
      if (this.cancelId(intakeKey) === id) reservation.cancelled = true;
    for (const call of [...this.calls.values()])
      if (call.cancelKey?.requestId === key.requestId && call.cancelKey.grantId === key.grantId)
        call.finish(failure("cancelled", call.unsent === undefined ? "unknown" : "not-sent"));
  }

  disconnect(socket: RelaySocket) {
    this.sockets.delete(socket);
    for (const call of [...this.calls.values()])
      if (call.socket === socket) call.finish(lost(call));
  }
}
