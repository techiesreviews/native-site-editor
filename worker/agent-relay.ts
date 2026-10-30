import { workspaceKey, type AgentWorkspace, type JsonValue } from "../shared/agent-command";
import { LIVE_MESSAGE_LIMIT, LIVE_ROOM_CLOSED, readLiveClientMessage, type LiveAccess, type LiveServerMessage } from "../shared/live-room";

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
type Attachment = RelayScope & { role: "editor"; handshaken: boolean; everHandshaken?: boolean; owner?: { tabId: string | null; generation: number } };
/** `replaced`: a newer look at the same long job took over this look's wait, so this one took nothing. */
type FailureCode = "editor-unavailable" | "busy" | "waiting" | "too-large" | "cancelled" | "timeout" | "unknown-outcome" | "connect-agent-again" | "replaced";
/** `tookOver`: this look ended its job's wait the tab already had (ticket am-54), which may have taken requests. */
type Outcome = ({ ok: true; result: JsonValue } | { ok: false; code: FailureCode; outcome: "unknown" | "not-sent" }) & { tookOver?: true };
/** A dispatcher names the workspace; tab and generation are optional fences. The
 * relay resolves the current owner (an MCP grant does not know which tab owns). */
/** `signal` aborts when a matching cancel arrives during intake, so the body reader stops at once. */
export interface RelayReservation { readonly cancelled: boolean; readonly signal: AbortSignal; release(): void }
export interface RelayTarget {
  workspace: AgentWorkspace;
  tabId?: string;
  generation?: number;
}
/** `job`: the key is a long job's id (ticket am-17), set by the job's own messages only: a client's request id may look like one. */
export interface RelayCancelKey { requestId: string | number; grantId: string; job?: true }
interface Pending {
  id: string;
  cancelKey?: RelayCancelKey;
  /** The command as JSON: a newer look takes over this wait only with the same command. */
  command: string;
  /** A newer look at the same job takes over this wait: the earlier look answers `replaced`. */
  adopt(resolve: (outcome: Outcome) => void, signal?: AbortSignal): void;
  /** It ended a sent wait of its job, or took one over that had: the look it gives its answer is told (`tookOver`);
   * replaced, it passes the mark on to the newer look and answers `replaced` unmarked. */
  tookOver: boolean;
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
/** A wait_for_requests the tab holds until a request arrives, or an ask_user until the user answers (ticket
 * am-15). It gets its own total deadline of 10–25 s (the agent's waitMs). Several agents may share one connection, each with its watchdog
 * waiting: at most WAITS_PER_SITE waits per workspace, leaving pending slots for their edits. */
export const WAIT_LIMIT_MS = 25_000;
const heldTools = new Set(["wait_for_requests", "ask_user"]);
export const WAITS_PER_SITE = 3;
function waitBudget(command: JsonValue): number | undefined {
  if (!command || typeof command !== "object" || Array.isArray(command) || command.operation !== "requests" || !heldTools.has(String(command.tool))) return undefined;
  const wanted = typeof command.waitMs === "number" && Number.isFinite(command.waitMs) ? command.waitMs : WAIT_LIMIT_MS;
  return Math.min(WAIT_LIMIT_MS, Math.max(10_000, Math.floor(wanted)));
}
/** A long job's cancel (ticket am-17, worker/mcp.ts) is remembered far longer than a call's, ids only: a
 * job's looks come up to a minute apart, and a cancelled job never waits again. At most JOB_CANCELS per connection,
 * so one connection's cancels never push out another's; a connection's own grant ids bound the whole. */
const JOB_CANCEL_MS = 24 * 60 * 60_000, JOB_CANCELS = 16;
const sameKey = (a: RelayCancelKey, b: RelayCancelKey) => a.grantId === b.grantId && a.requestId === b.requestId && a.job === b.job;
const sameScope = (a: RelayScope, b: RelayScope) => a.tabId === b.tabId && a.generation === b.generation && workspaceKey(a.workspace) === workspaceKey(b.workspace);

/** Shared by the editor upgrade and future MCP dispatchers. Repository names can
 * change; the repository id and case-insensitive GitHub account are the identity. */
export async function relayObjectName(workspace: AgentWorkspace): Promise<string> {
  return `agent-relay:${await sha256(workspaceKey(workspace))}`;
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
  /** The workspace's outstanding waits, in memory only. */
  private waitIds = new Set<string>();
  private reserved = { count: 0, bytes: 0 };
  private intakes = new Map<{ cancelled: boolean; stop: AbortController }, RelayCancelKey>();
  /** Brief cancellation memory only; lazy expiry leaves idle hibernation possible. */
  private recentCancels = new Map<string, number>();
  /** Cancelled long jobs by connection, then job id, with their expiry; in memory only like the rest: a wake forgets them. */
  private cancelledJobs = new Map<string, Map<string | number, number>>();
  /** Jobs whose newest look, marked `tookOver`, ended as its caller left (ticket am-54), kept like a job's cancel:
   * the job's next look that waits carries the mark on, so the hint still reaches the agent. */
  private markedJobs = new Map<string, Map<string | number, number>>();

  private cancelId(key: RelayCancelKey) { return JSON.stringify([key.grantId, key.requestId, key.job === true]); }
  private pruneCancels() {
    for (const [key, expiry] of this.recentCancels) if (expiry <= this.clock.now()) this.recentCancels.delete(key);
    for (const byGrant of [this.cancelledJobs, this.markedJobs]) for (const [grant, jobs] of byGrant) {
      for (const [job, expiry] of jobs) if (expiry <= this.clock.now()) jobs.delete(job);
      if (!jobs.size) byGrant.delete(grant);
    }
  }
  /** Remembers a job for a day, at most JOB_CANCELS per connection, so one connection never pushes out another's. */
  private rememberJob(byGrant: Map<string, Map<string | number, number>>, key: RelayCancelKey) {
    const jobs = byGrant.get(key.grantId) ?? new Map<string | number, number>();
    jobs.delete(key.requestId);
    jobs.set(key.requestId, this.clock.now() + JOB_CANCEL_MS);
    if (jobs.size > JOB_CANCELS) jobs.delete(jobs.keys().next().value!);
    byGrant.set(key.grantId, jobs);
  }
  /** Takes the mark a job's left look kept for it, if any. */
  private takeMark(key?: RelayCancelKey) {
    return key?.job === true && this.markedJobs.get(key.grantId)?.delete(key.requestId) === true;
  }
  private recentlyCancelled(key?: RelayCancelKey) {
    this.pruneCancels();
    return key !== undefined && (this.recentCancels.has(this.cancelId(key)) ||
      key.job === true && this.cancelledJobs.get(key.grantId)?.has(key.requestId) === true);
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
      this.sockets.set(socket, { ...scope, role: "editor", handshaken: false, everHandshaken: (value as Attachment).everHandshaken ?? (value as Attachment).handshaken });
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

  eligibleEditors(sockets: RelaySocket[], workspace = this.workspace) {
    return sockets.filter(socket => socket.readyState === 1 && this.sockets.get(socket)?.everHandshaken === true &&
      workspaceKey(this.sockets.get(socket)!.workspace) === workspace).length;
  }
  isHandshaken(socket: RelaySocket) { return this.sockets.get(socket)?.handshaken === true; }
  private cleaned = new Set<string>();
  refuse(ids: string[]) { for (const id of ids) this.cleaned.add(id); }
  get pendingCount() { return this.calls.size; }
  get waiting() { return this.waitIds.size > 0; }
  get waits() { return this.waitIds.size; }
  get reservedCount() { return this.reserved.count; }

  /** Holds a pending slot and `length` bytes while a dispatch body is still
   * arriving, so concurrent intake shares the five-command / 8 MiB bounds and is
   * refused before the body is read. Release is idempotent. */
  reserve(length: number, cancelKey?: RelayCancelKey): RelayReservation | Outcome {
    if (cancelKey && this.cleaned.has(cancelKey.grantId)) return failure("connect-agent-again");
    if (this.recentlyCancelled(cancelKey)) return failure("cancelled");
    if (this.calls.size + this.reserved.count >= 5) return failure("busy");
    if (this.buffered + this.reserved.bytes + length > AgentRelay.maxBytes) return failure("too-large");
    this.reserved.count++;
    this.reserved.bytes += length;
    let held = true;
    const stop = new AbortController();
    const reservation = { cancelled: false, stop, signal: stop.signal, release: () => {
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
    if (cancelKey && this.cleaned.has(cancelKey.grantId)) return Promise.resolve(failure("connect-agent-again"));
    if (intake?.reservation.cancelled || this.recentlyCancelled(cancelKey)) return Promise.resolve(failure("cancelled"));
    const started = intake?.started ?? this.clock.now();
    const wanted = AgentRelay.readTarget(target);
    if (!wanted || signal?.aborted) return Promise.resolve(failure(wanted ? "cancelled" : "editor-unavailable"));
    const owner = this.owner;
    if (!owner || owner.tabId === null || (wanted.tabId !== undefined && wanted.tabId !== owner.tabId) ||
      (wanted.generation !== undefined && wanted.generation !== owner.generation)) return Promise.resolve(failure("editor-unavailable"));
    const scope: RelayScope = { workspace: wanted.workspace, tabId: owner.tabId, generation: owner.generation };
    // A job holds one wait (ticket am-52), so whatever the tab answers reaches exactly one look, and one job's
    // looks never crowd out other agents' waits. How each look settles:
    // - a newer look with the same command takes the wait over: the earlier look answers `replaced` (not sent) at
    //   once, and its caller leaving no longer ends the wait; an unsent wait is still sent once, on the handshake;
    // - a newer look with another command (the grant's generation or the look's agent name changed) passes the
    //   checks below with the held wait's place, wait and bytes counted as free, then ends the held wait as
    //   `replaced`, unknown once sent (the tab is told, as for a cancel), and sends its own; refused, it ends nothing;
    // - the newest look gets the tab's answer, or cancelled (its caller leaves, tasks/cancel), timeout or lost, marked
    //   `tookOver` when a sent wait of its job was ended on the way: only that answer may say what the wait took;
    // - a look marked `tookOver` that a newer look replaces (either way) passes the mark on and answers `replaced`
    //   unmarked, so it still answers working: each chain of takeovers has one marked answer, the newest look's;
    // - a marked newest look whose caller leaves keeps the mark for its job: the job's next look that waits (adopted
    //   or sent) carries it; tasks/cancel ends the job, so its mark goes with it;
    // - a next look refused before it waits (editor-unavailable, busy, waiting, too large, timeout) leaves the mark for
    //   a later look: it is taken only once a look passes every check;
    // - the relay wakes between the left look and the next one: the mark, in memory like a job's cancel, is forgotten,
    //   so that look waits on unmarked and the ended wait's requests come back only with all: true.
    const json = JSON.stringify(command);
    const held = cancelKey?.job ? [...this.calls.values()].find(call => call.cancelKey && sameKey(call.cancelKey, cancelKey) && sameScope(call.scope, scope)) : undefined;
    if (held?.command === json) {
      if (this.takeMark(cancelKey)) held.tookOver = true;
      return new Promise(resolve => held.adopt(resolve, signal));
    }
    const freed = { calls: held ? 1 : 0, waits: held && this.waitIds.has(held.id) ? 1 : 0, bytes: held?.bytes ?? 0 };
    const receivers = [...this.sockets].filter(([socket, metadata]) => socket.readyState === 1 && sameScope(metadata, scope));
    const entry = receivers.find(([, metadata]) => metadata.handshaken) ?? receivers[0];
    if (!entry) return Promise.resolve(failure("editor-unavailable"));
    const [receiver, receiverMetadata] = entry;
    if (this.calls.size - freed.calls + this.reserved.count >= 5) return Promise.resolve(failure("busy"));
    const wait = waitBudget(command);
    if (wait !== undefined && this.waitIds.size - freed.waits >= WAITS_PER_SITE) return Promise.resolve(failure("waiting"));
    // Measure the complete wire envelope before allocating a correlation id,
    // promise, pending entry or timer. UUIDs have the placeholder's fixed width.
    // remainingMs is filled in at each send (at most 5 digits, measured at its widest): the tab fences
    // commits against this total deadline without comparing clocks.
    const candidate = JSON.stringify({ type: "command", id: placeholder, ...scope, remainingMs: 10_000, command });
    const length = bytes(candidate) + (cancelKey ? bytes(JSON.stringify(cancelKey)) : 0);
    if (this.buffered - freed.bytes + this.reserved.bytes + length > AgentRelay.maxBytes) return Promise.resolve(failure("too-large"));
    const deadline = started + (wait ?? 10_000);
    if (this.clock.now() >= deadline) return Promise.resolve(failure("timeout"));
    const tookOver = this.takeMark(cancelKey) || held !== undefined && (held.unsent === undefined || held.tookOver);
    held?.finish(failure("replaced", held.unsent === undefined ? "unknown" : "not-sent"));
    const id = crypto.randomUUID();
    const message = candidate.replace(placeholder, id);
    const framed = (now: number) => message.replace('"remainingMs":10000', `"remainingMs":${Math.max(0, Math.floor(deadline - now))}`);
    return new Promise(first => {
      let resolve: (outcome: Outcome) => void = first, listening = signal;
      const cancel = () => {
        if (call.tookOver && call.cancelKey?.job) this.rememberJob(this.markedJobs, call.cancelKey);
        call.finish(failure("cancelled", call.unsent === undefined ? "unknown" : "not-sent"));
      };
      const call: Pending = { id, cancelKey, command: json, tookOver, socket: receiver, scope, bytes: length, deadline, timer: undefined, adopt: (next, nextSignal) => {
        const earlier = resolve;
        listening?.removeEventListener("abort", cancel);
        resolve = next;
        listening = nextSignal;
        listening?.addEventListener("abort", cancel, { once: true });
        earlier(failure("replaced"));
      }, finish: outcome => {
        if (!this.calls.delete(id)) return;
        this.waitIds.delete(id);
        this.buffered -= length;
        const sent = call.unsent === undefined;
        call.unsent = undefined;
        this.clock.clearTimeout(call.timer);
        listening?.removeEventListener("abort", cancel);
        resolve(call.tookOver && (outcome.ok || outcome.code !== "replaced") ? { ...outcome, tookOver: true } : outcome);
        if (sent && !outcome.ok && (outcome.code === "cancelled" || outcome.code === "timeout" || outcome.code === "replaced")) {
          // The tab ends a wait on `cancelled` or `timeout`; a replaced wait ends as cancelled there.
          try { call.socket.send(JSON.stringify({ type: "cancel", id, ...call.scope, reason: outcome.code === "replaced" ? "cancelled" : outcome.code })); }
          catch { this.disconnect(call.socket); }
        }
      } };
      this.calls.set(id, call);
      if (wait !== undefined) this.waitIds.add(id);
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
      metadata.everHandshaken = true;
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
    if (key.job) {
      this.rememberJob(this.cancelledJobs, key);
      this.markedJobs.get(key.grantId)?.delete(key.requestId);
    } else {
      this.recentCancels.delete(id);
      this.recentCancels.set(id, this.clock.now() + 10_000);
      if (this.recentCancels.size > 32) this.recentCancels.delete(this.recentCancels.keys().next().value!);
    }
    for (const [reservation, intakeKey] of this.intakes)
      if (this.cancelId(intakeKey) === id) { reservation.cancelled = true; reservation.stop.abort(); }
    for (const call of [...this.calls.values()])
      if (call.cancelKey && sameKey(call.cancelKey, key))
        call.finish(failure("cancelled", call.unsent === undefined ? "unknown" : "not-sent"));
  }

  disconnect(socket: RelaySocket) {
    this.sockets.delete(socket);
    for (const call of [...this.calls.values()])
      if (call.socket === socket) call.finish(lost(call));
  }
}

/** The Durable Object instance holding a site and branch's live rooms (ADR 0003). The agent relay's
 * instances are per GitHub account; collaborators signed in as other accounts must meet in one room,
 * so live rooms use the same class under a name of the repository id and branch only. */
export async function liveRoomObjectName(repoId: number, branch: string): Promise<string> {
  return `live-room:${await sha256(JSON.stringify([repoId, branch]))}`;
}
/** A file's room inside that instance: a fixed-width socket tag, whatever the path's length. */
export async function liveRoomTag(file: string): Promise<string> {
  return sha256(file);
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", utf8.encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export interface LiveSocket {
  readonly readyState: number;
  send(message: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface LiveAttachment { role: "live"; room: string; peer: string; access: LiveAccess }
const readLive = (value: unknown): LiveAttachment | null => {
  const item = value as Partial<LiveAttachment> | null;
  return item && typeof item === "object" && item.role === "live" && typeof item.room === "string" && /^[a-f\d]{64}$/.test(item.room) &&
    typeof item.peer === "string" && (item.access === "editor" || item.access === "agent") ? item as LiveAttachment : null;
};

/** Forwards each room's frames and stores nothing: no storage port, no history, no keys. Who is in
 * which room lives in the socket attachments, which hibernation keeps with the sockets. Binary
 * frames (ciphertext) go to the room's other sockets unread; the only text frames it acts on are
 * the key handover's public keys and wrapped keys (shared/live-room.ts). */
export class LiveRooms {
  static readonly identityHeader = "X-Live-Room";
  private sockets = new Map<LiveSocket, LiveAttachment>();

  constructor(sockets: LiveSocket[]) {
    for (const socket of sockets) {
      const metadata = readLive(socket.deserializeAttachment());
      if (metadata && socket.readyState === 1) this.sockets.set(socket, metadata);
    }
  }

  static owns(socket: { deserializeAttachment(): unknown }) { return readLive(socket.deserializeAttachment()) !== null; }

  private members(room: string, except?: LiveSocket) {
    return [...this.sockets].filter(([socket, metadata]) => socket !== except && metadata.room === room && socket.readyState === 1);
  }
  private send(socket: LiveSocket, message: LiveServerMessage | ArrayBuffer) {
    try { socket.send(message instanceof ArrayBuffer ? message : JSON.stringify(message)); }
    catch { this.leave(socket); }
  }

  /** An agent joins only a room a tab has open: only a tab makes the room key. */
  admits(room: string, access: LiveAccess) {
    return access !== "agent" || this.members(room).some(([, metadata]) => metadata.access !== "agent");
  }
  /** Refuses (false) whom `admits` refuses. */
  join(socket: LiveSocket, room: string, access: LiveAccess): boolean {
    if (!this.admits(room, access)) return false;
    const others = this.members(room);
    const metadata: LiveAttachment = { role: "live", room, peer: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""), access };
    socket.serializeAttachment(metadata);
    this.sockets.set(socket, metadata);
    this.send(socket, { type: "welcome", peer: metadata.peer, peers: others.map(([, other]) => ({ peer: other.peer, access: other.access })) });
    for (const [other] of others) this.send(other, { type: "joined", peer: metadata.peer, access });
    return true;
  }

  message(socket: LiveSocket, message: string | ArrayBuffer): boolean {
    const metadata = this.sockets.get(socket);
    if (!metadata || socket.readyState !== 1) return false;
    if ((typeof message === "string" ? bytes(message) : message.byteLength) > LIVE_MESSAGE_LIMIT) {
      this.leave(socket);
      socket.close(1009, "Live room message is too large.");
      return false;
    }
    if (typeof message !== "string") {
      for (const [other] of this.members(metadata.room, socket)) this.send(other, message);
      return true;
    }
    const value = readLiveClientMessage(message);
    if (!value) return false;
    if (value.type === "key-request") {
      for (const [other] of this.members(metadata.room, socket)) this.send(other, { type: "key-request", from: metadata.peer, publicKey: value.publicKey });
      return true;
    }
    const target = this.members(metadata.room, socket).find(([, other]) => other.peer === value.to);
    if (!target) return false;
    this.send(target[0], { type: "key", from: metadata.peer, publicKey: value.publicKey, wrapped: value.wrapped });
    return true;
  }

  /** A clean leave is announced at once. The room's last tab leaving closes the agents still in it. */
  leave(socket: LiveSocket) {
    const metadata = this.sockets.get(socket);
    if (!metadata) return;
    this.sockets.delete(socket);
    const others = this.members(metadata.room);
    for (const [other] of others) this.send(other, { type: "left", peer: metadata.peer });
    if (metadata.access === "agent" || others.some(([, other]) => other.access !== "agent")) return;
    for (const [other] of others) {
      this.sockets.delete(other);
      try { other.close(LIVE_ROOM_CLOSED, "No tab has this room open."); } catch { /* Already closed. */ }
    }
  }
}
