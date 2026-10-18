import type { AgentCommand } from "../shared/agent";
import type { AgentEdit, AgentStatus } from "../shared/agent-edit";
import { mediaTools, type AgentMedia } from "../shared/agent-media";
import type { AgentRead, AgentReadResult } from "../shared/agent-read";
import { payloadIdentity, workspaceKey, type AgentWorkspace, type JsonValue } from "../shared/agent-command";
import { AgentFailureError, classifyAgentFailure, type AgentFailure } from "../shared/agent-failure";
import { AgentRecordsError, type AgentRecords } from "./agent-records";
import { createAgentOwner } from "./agent-owner";
import { browserAgentRecovery } from "./agent-recovery";

type Snapshot = Awaited<ReturnType<AgentRecords["snapshot"]>>;
type Mode = "connecting" | "live" | "other-owner" | "taken-over" | "taking-over" | "takeover-failed" |
  "reconnecting" | "paused" | "quota" | "workspace-changed" | "fallback" | "off";
interface State { mode: Mode; closed?: boolean; resetAt?: number; retryAt?: number }
interface Scope { workspace: AgentWorkspace; tabId: string; generation: number }
interface Result { state: "applied" | "conflict" | "unknown"; message: string; result?: AgentCommand["result"]; operationId: string }
type Socket = Pick<WebSocket, "readyState" | "send" | "close" | "addEventListener">;
const operations = new Set(["update_active_draft", "create_file_draft", "write_file", "create_page", "set_page_details", "add_section", "make_component", "move_section", "remove_section", "move_file", "delete_file", "open_page", "inspect_preview", "list_media", "preview_media", "improve_images", "loop_video", "video_still", "write_subtitles", "frame_image", "place_media", "describe_media", "change_collection", "adding_settings", "remove_media", "keep_media", "restore_media", "replace_media"]);
type Recovery = ReturnType<typeof browserAgentRecovery>;
interface Registry {
  read: () => { tabId: string; generation: number } | undefined;
  write: (owner: { tabId: string; generation: number }) => void;
  clear: (owner: { tabId: string; generation: number }) => void;
  held: (generation: number) => Promise<boolean>;
  hold: (generation: number) => Promise<(() => void) | undefined>;
}
interface Options {
  workspace: AgentWorkspace;
  repo: string;
  tabId: string;
  current: () => AgentWorkspace | undefined;
  records: AgentRecords;
  reload: (snapshot: Snapshot) => Promise<void>;
  media?: (request: AgentMedia, generation: number, current: () => boolean, deadline: number) => Promise<AgentReadResult>;
  edit?: (request: AgentEdit | AgentStatus, generation: number, current: () => boolean) => Promise<AgentReadResult>;
  read?: (read: AgentRead) => Promise<AgentReadResult>;
  run: (command: AgentCommand, ownerGeneration: number) => Promise<{ message?: string; result?: AgentCommand["result"] } | void>;
  listen: (state: State) => void;
  socket?: (url: string) => Socket;
  /** One plain route probe, only after the first socket attempt fails. */
  now?: () => number;
  probe?: (signal: AbortSignal) => Promise<number | { status: number; body?: unknown; text?: string; retryAfter?: string | null }>;
  registry?: Registry;
  recovery?: (reconnect: (current: () => boolean) => Promise<void>) => Recovery;
  clock?: { setTimeout: (callback: () => void, delay: number) => number; clearTimeout: (timer: number) => void };
  events?: { window: Pick<EventTarget, "addEventListener" | "removeEventListener">; document: Pick<EventTarget, "addEventListener" | "removeEventListener"> };
}

/** Hints only: the generation in IndexedDB is the authority at admission and commit. */
function browserRegistry(workspace: AgentWorkspace): Registry {
  const key = `native-site-editor:agent-owner:${workspaceKey(workspace)}`;
  const name = (generation: number) => `${key}:${generation}`;
  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null") as { tabId?: unknown; generation?: unknown } | null;
      return value && typeof value.tabId === "string" && typeof value.generation === "number" ? { tabId: value.tabId, generation: value.generation } : undefined;
    } catch { return undefined; }
  };
  return {
    read,
    write: owner => { localStorage.setItem(key, JSON.stringify(owner)); },
    clear: owner => {
      const stored = read();
      if (stored?.tabId === owner.tabId && stored.generation === owner.generation) localStorage.removeItem(key);
    },
    held: async generation => navigator.locks
      ? (await navigator.locks.query()).held?.some(lock => lock.name === name(generation)) ?? false
      : read()?.generation === generation,
    hold: generation => {
      if (!navigator.locks) return Promise.resolve(() => {});
      return new Promise((resolve, reject) => {
        navigator.locks.request(name(generation), { ifAvailable: true }, lock => {
          if (!lock) { resolve(undefined); return; }
          return new Promise<void>(release => resolve(release));
        }).catch(reject);
      });
    },
  };
}

/** One opt-in activation, one pinned workspace, no mailbox and no mutation retries. Loaded only by the lazy menu. */
export function createLiveTransport(options: Options) {
  const workspace = { ...options.workspace, account: options.workspace.account.toLowerCase() };
  const key = workspaceKey(workspace), { records } = options;
  const registry = options.registry ?? browserRegistry(workspace);
  const clock = options.clock ?? { setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: timer => window.clearTimeout(timer) };
  const events = options.events ?? { window, document };
  const socketFactory = options.socket ?? (typeof WebSocket === "undefined" ? undefined : (url: string) => new WebSocket(url));
  let state: State = { mode: "connecting" }, stopped = false, epoch = 0, generation: number | undefined;
  let opening: { socket: Socket; current: () => boolean } | undefined;
  let socket: Socket | undefined, handshaken = false, session = 0, release: (() => void) | undefined;
  let heartbeat: number | undefined, pong: number | undefined;
  let recovery: Recovery | undefined, first = true, takeoverFlight: Promise<void> | undefined;
  const flights = new Map<string, { identity: string; promise: Promise<Result> }>();
  const scope = (): Scope => ({ workspace, tabId: options.tabId, generation: generation! });
  // A workspace briefly absent (a refresh reloading the repository) is no move: the socket, ownership
  // and recovery carry on, and only command admission waits for it (`present`).
  const moved = () => { const now = options.current(); return now !== undefined && workspaceKey(now) !== key; };
  const current = () => !stopped && !moved();
  const present = () => current() && options.current() !== undefined;
  const matches = (value: Partial<Scope>) => value.workspace && typeof value.workspace.account === "string" && workspaceKey(value.workspace) === key && value.tabId === options.tabId && value.generation === generation;
  function show(next: State) { if (!stopped) { state = next; options.listen(state); } }
  function clearHeartbeat() {
    if (heartbeat !== undefined) clock.clearTimeout(heartbeat);
    if (pong !== undefined) clock.clearTimeout(pong);
    heartbeat = pong = undefined;
  }
  function close() {
    const old = socket;
    socket = undefined;
    opening = undefined;
    handshaken = false;
    session++;
    clearHeartbeat();
    old?.close();
  }
  function unhold() {
    release?.(); release = undefined;
    if (generation !== undefined) {
      try { registry.clear({ tabId: options.tabId, generation }); } catch { /* Hints cannot undo the durable fence. */ }
    }
  }
  function halt(mode: Mode) {
    epoch++;
    recovery?.dispose(); recovery = undefined;
    close(); unhold();
    show({ mode });
  }
  async function prove(at: number) {
    if (!current() || epoch !== at) return false;
    const stored = await records.workspace(workspace);
    if (!current() || epoch !== at) return false;
    if (stored.generation !== generation) { halt("taken-over"); return false; }
    if (stored.paused) { halt("takeover-failed"); return false; }
    return true;
  }
  function beat(source: Socket) {
    clearHeartbeat();
    heartbeat = clock.setTimeout(() => {
      heartbeat = undefined;
      if (socket !== source || !handshaken || source.readyState !== 1) return;
      try { source.send("ping"); }
      catch { source.close(); return; }
      pong = clock.setTimeout(() => { pong = undefined; source.close(); }, 10_000);
    }, 45_000);
  }
  function handshake(source: Socket) {
    if (socket !== source || source.readyState !== 1) return;
    try { source.send(JSON.stringify({ type: "handshake", ...scope(), owner: true })); }
    catch { source.close(); }
  }
  async function readCommand(source: Socket, value: Partial<Scope> & { id?: unknown; command?: unknown }, deadline: number) {
    const at = epoch, connection = session;
    const valid = () => present() && socket === source && session === connection && handshaken && state.mode === "live" && source.readyState === 1;
    let result: AgentReadResult;
    try {
      const read = value.command as AgentRead | AgentEdit | AgentStatus | AgentMedia;
      const editing = read.operation === "edit" || read.operation === "status" || read.operation === "media";
      if (typeof value.id !== "string" || !value.id || !matches(value) || !valid() || (editing ? (typeof read.id !== "string" || !/^[\w.:-]{1,128}$/.test(read.id) || typeof read.grantId !== "string" || !read.grantId ||
            (read.operation === "edit" || read.operation === "media") && (!read.args || typeof read.args !== "object" || Array.isArray(read.args) || !Number.isFinite(read.createdAt))) : (!read.args || typeof read.args !== "object" || Array.isArray(read.args) ||
          !["get_site", "list_files", "read_file", "export_site", "get_page", "get_selection"].includes(read.tool) ||
          (read.tool === "read_file" && (typeof read.args.path !== "string" || !read.args.path || read.args.path.length > 1024)) ||
          (read.tool === "get_page" && (typeof read.args.page !== "string" || !read.args.page || read.args.page.length > 1024)) ||
          (read.args.folder !== undefined && (typeof read.args.folder !== "string" || read.args.folder.length > 1024)) ||
          (read.args.source !== undefined && typeof read.args.source !== "boolean"))) ||
          !await prove(at) || !valid())
        result = { ok: false, message: "This read is incomplete or belongs to another workspace, tab or generation. Read the site again." };
      else if (read.operation === "media") result = typeof read.path === "string" && mediaTools.includes(read.tool)
        ? await options.media?.(read, generation!, valid, deadline) ?? { ok: false, message: "Browser media tools are unavailable. Refresh the editor." }
        : { ok: false, message: "Unknown browser media tool." };
      else if (editing) result = await options.edit?.(read, generation!, valid) ?? { ok: false, message: "Browser edit tools are unavailable. Refresh the editor." };
      else result = await options.read?.(read) ?? { ok: false, message: "Browser read tools are unavailable. Refresh the editor." };
    } catch (error) { result = { ok: false, message: error instanceof Error ? error.message : "The browser read failed." }; }
    if (socket !== source || !await prove(at).catch(() => false) || !valid()) return;
    let message = JSON.stringify({ type: "result", id: value.id, ...scope(), result });
    if (new TextEncoder().encode(message).byteLength > 8 * 1024 * 1024)
      message = JSON.stringify({ type: "result", id: value.id, ...scope(), result: { ok: false, message: "The result is too large. Export a folder with export_site instead." } });
    try { source.send(message); } catch { source.close(); }
  }
  async function command(source: Socket, value: Partial<Scope> & { id?: unknown; command?: unknown }, deadline: number) {
    const at = epoch, connection = session;
    if ((value.command as { operation?: unknown } | null)?.operation && ["read", "edit", "status", "media"].includes((value.command as { operation: string }).operation)) return readCommand(source, value, deadline);
    const incoming = value.command as Partial<AgentCommand> | null;
    const operationId = typeof incoming?.id === "string" ? incoming.id : "";
    const refuse = (message: string): Result => ({ state: "conflict", message, operationId });
    let result: Result;
    if (!matches(value) || !present() || !handshaken || state.mode !== "live")
      result = refuse("This tab no longer receives agent changes for that workspace. Read the site again.");
    else if (typeof value.id !== "string" || !value.id || !incoming || typeof incoming !== "object" || !operationId || typeof incoming.operation !== "string" || !operations.has(incoming.operation) ||
      typeof incoming.path !== "string" || typeof incoming.content !== "string" || typeof incoming.commit !== "string" ||
      incoming.state !== "pending" || !Number.isFinite(incoming.createdAt) || typeof incoming.grantId !== "string" || !incoming.grantId ||
      incoming.repoId !== workspace.repoId || incoming.branch !== workspace.branch ||
      (incoming.args !== undefined && (!incoming.args || typeof incoming.args !== "object" || Array.isArray(incoming.args))))
      result = refuse("This agent change is incomplete or belongs to another site or branch. Read the site again.");
    else {
      try {
        // Admission awaits IndexedDB: the socket, its handshake and liveness must still hold before the executor runs.
        const admitted = await prove(at);
        if (!admitted || !present() || socket !== source || session !== connection || !handshaken || state.mode !== "live" || source.readyState !== 1)
          result = refuse("Another tab took over agent changes, this site changed, or the connection was lost. Nothing was changed.");
        else {
          const identity = payloadIdentity(incoming as JsonValue), existing = flights.get(operationId);
          if (existing && existing.identity !== identity) result = refuse("This change's id is already running with different work.");
          else {
            const work = existing ?? { identity, promise: (async (): Promise<Result> => {
              try {
                const outcome = await options.run({ ...incoming as AgentCommand, ownerGeneration: generation! }, generation!);
                return { state: "applied", message: outcome?.message ?? "Applied in the editor as an unsaved draft.", ...outcome, operationId };
              } catch (error) {
                const message = error instanceof Error ? error.message : "The change could not be applied.";
                return { state: error instanceof AgentRecordsError && error.code === "unknown" || /unproven|outcome.*unknown|could not prove|could not confirm whether/i.test(message) ? "unknown" : "conflict", message, operationId };
              }
            })() };
            flights.set(operationId, work);
            try { result = await work.promise; }
            finally { if (flights.get(operationId) === work) flights.delete(operationId); }
          }
        }
      } catch (error) { result = refuse(error instanceof Error ? error.message : "Browser storage is unavailable."); }
    }
    // Check the durable generation even when a frozen tab missed every ownership hint.
    if (socket !== source || !await prove(at).catch(() => false)) return;
    // Correlation belongs to this socket and handshake epoch, never a replacement connection.
    if (socket === source && source.readyState === 1 && handshaken && session === connection && epoch === at && !stopped && !moved() && state.mode === "live") {
      try { source.send(JSON.stringify({ type: "result", id: value.id, ...scope(), result })); } catch { source.close(); }
    }
  }
  async function connect(valid: () => boolean) {
    const at = epoch;
    if (!await prove(at) || !valid()) return;
    close();
    const source = socketFactory!(`/api/agent/relay?${new URLSearchParams({ repo: options.repo, branch: workspace.branch, tabId: options.tabId, generation: String(generation) })}`);
    socket = source;
    opening = { socket: source, current: valid };
    await new Promise<void>((resolve, reject) => {
      let ready = false, settled = false;
      let readiness: Promise<boolean> = Promise.resolve(false);
      let limit: number | undefined;
      const arm = () => {
        if (limit !== undefined) clock.clearTimeout(limit);
        limit = clock.setTimeout(() => { failed(); source.close(); }, 10_000);
      };
      const failed = () => {
        if (settled) return;
        settled = true;
        if (limit !== undefined) clock.clearTimeout(limit);
        reject(new AgentFailureError({ kind: "transient" }));
      };
      arm();
      source.addEventListener("open", () => {
        if (socket !== source || !current() || epoch !== at || !valid()) { source.close(); failed(); return; }
        handshake(source);
      });
      source.addEventListener("message", event => {
        if (socket !== source || epoch !== at) return;
        if (event.data === "pong") { if (handshaken) beat(source); return; }
        let value;
        try { value = JSON.parse(String(event.data)); } catch { return; }
        if (!value || typeof value !== "object") return;
        if (value.type === "reset" && value.handshakeRequired === true) {
          handshaken = false; session++; clearHeartbeat(); readiness = Promise.resolve(false); arm();
          show({ mode: "connecting" });
          void prove(at).then(ok => { if (ok && socket === source) handshake(source); }).catch(() => { source.close(); });
        } else if (value.type === "ready" && matches(value)) {
          const handshakeEpoch = session;
          readiness = prove(at).then(ok => {
            if (session !== handshakeEpoch) return false;
            if (!ok || socket !== source || !current() || !ready && !valid()) { source.close(); failed(); return false; }
            ready = settled = handshaken = true;
            if (opening?.socket === source) opening = undefined;
            if (limit !== undefined) clock.clearTimeout(limit);
            show({ mode: "live" }); beat(source); resolve(); return true;
          }).catch(() => { source.close(); failed(); return false; });
        } else if (value.type === "command") {
          const arrived = session;
          // The relay's remaining total budget, counted from arrival here (never a fresh 10 s), less one-way latency.
          const remaining = typeof value.remainingMs === "number" && Number.isFinite(value.remainingMs) ? Math.min(10_000, Math.max(0, value.remainingMs)) : 10_000;
          const deadline = Date.now() + remaining - 250;
          // The relay may send a waiting command immediately after ready, before IndexedDB answers.
          void readiness.then(() => {
            if (session === arrived && socket === source) return command(source, value, deadline);
          }).catch(() => { source.close(); });
        }
      });
      const lost = () => {
        if (limit !== undefined) clock.clearTimeout(limit);
        failed();
        if (socket !== source) return;
        if (opening?.socket === source) opening = undefined;
        socket = undefined; handshaken = false; session++; clearHeartbeat();
        if (ready && current() && epoch === at) recovery?.report({ kind: "transient" });
      };
      source.addEventListener("close", lost);
      source.addEventListener("error", () => { lost(); source.close(); });
    });
  }
  function recover() {
    if (recovery) return;
    recovery = (options.recovery ?? (reconnect => browserAgentRecovery(workspace, options.tabId, reconnect)))(connect);
    recovery.subscribe(() => {
      if (!current() || generation === undefined) return;
      const next = recovery?.state();
      if (!next) return;
      if (next.mode === "ok") { if (handshaken && socket?.readyState === 1) show({ mode: "live" }); return; }
      // Quota stays recorded during manual Retry. Its lease renewal must not cancel that
      // same pending handshake; a fresh quota report invalidates current() and closes it.
      if (next.mode === "paused" || next.mode === "quota" && !(opening?.socket === socket && opening?.current())) close();
      show({ ...next, mode: next.mode });
    });
  }
  async function open() {
    recover();
    if (!recovery!.allowAutomatic()) { const next = recovery!.state(); show({ ...next, mode: next.mode === "ok" ? "connecting" : next.mode }); return; }
    show({ mode: "connecting" });
    const at = epoch;
    try { await connect(() => current() && epoch === at && Boolean(recovery?.allowAutomatic())); }
    catch {
      if (!current() || epoch !== at) return;
      close();
      if (!recovery?.allowAutomatic()) return;
      let failure: AgentFailure = { kind: "transient" };
      if (first) {
        first = false;
        const probe = await absent();
        if (!current() || epoch !== at) return;
        if (probe.missing) { halt("fallback"); return; }
        failure = probe.failure;
      }
      recovery?.report(failure);
    }
    first = false;
  }
  function takeover(): Promise<void> {
    if (takeoverFlight) return takeoverFlight;
    halt("taking-over");
    const at = epoch;
    takeoverFlight = (async () => {
      let owner: ReturnType<typeof createAgentOwner> | undefined;
      try {
        const stored = await records.workspace(workspace);
        if (!current() || epoch !== at) return;
        owner = createAgentOwner({ workspace, generation: stored.generation, records, reload: async snapshot => {
          if (!current() || epoch !== at) throw new Error("The open site changed during takeover.");
          await options.reload(snapshot);
          if (!current() || epoch !== at) throw new Error("The open site changed during takeover.");
        } });
        const acquired = await owner.takeover();
        if (!current() || epoch !== at) return;
        generation = acquired.generation;
        const held = await registry.hold(generation);
        if (!current() || epoch !== at) { held?.(); return; }
        if (!held) throw new Error("Another tab receives agent changes.");
        release = held;
        registry.write({ tabId: options.tabId, generation });
        await open();
      } catch {
        if (owner) await records.pause(workspace, owner.generation).catch(() => undefined);
        if (current() && epoch === at) halt("takeover-failed");
      }
    })().finally(() => { takeoverFlight = undefined; });
    return takeoverFlight;
  }
  /** One plain probe: only a missing relay route (404) selects the legacy fallback. Any other
   * answer is classified in full, so a quota body or Retry-After reaches the coordinator. */
  async function absent(): Promise<{ missing: boolean; failure: AgentFailure }> {
    // Headers and body share one 10 s deadline: a stalled probe is a network failure, never a wait.
    const stop = new AbortController();
    let limit: number | undefined;
    const expired = new Promise<undefined>(resolve => { limit = clock.setTimeout(() => { stop.abort(); resolve(undefined); }, 10_000); });
    const answer = await Promise.race([(options.probe ?? (async (signal: AbortSignal) => {
      const response = await fetch("/api/agent/relay", { signal }), text = await response.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { /* Cloudflare's 1027 answer is HTML. */ }
      return { status: response.status, body, text, retryAfter: response.headers.get("Retry-After") };
    }))(stop.signal).catch(() => undefined), expired]).finally(() => clock.clearTimeout(limit!));
    const probe = typeof answer === "number" ? { status: answer } : answer;
    if (probe?.status === 404) return { missing: true, failure: { kind: "other" } };
    const failure = classifyAgentFailure({ ...probe, networkError: !probe, now: (options.now ?? Date.now)() });
    return { missing: false, failure: failure.kind === "other" ? { kind: "transient" } : failure };
  }
  async function start() {
    const at = epoch;
    try { await begin(); } catch {
      if (!current() || epoch !== at) return;
      // Browser storage refused before any socket: no tab can own here. Without a relay route the
      // legacy fallback still answers agents (refusing edits plainly); otherwise stay paused.
      if (first) {
        first = false;
        const { missing, failure } = await absent();
        if (!current() || epoch !== at) return;
        if (missing) { halt("fallback"); return; }
        // A quota answer or Retry-After is recorded for the workspace: a later takeover waits for it.
        if (failure.kind === "quota" || failure.kind === "transient" && failure.retryAt !== undefined) { recover(); recovery!.report(failure); }
      }
      halt("takeover-failed");
    }
  }
  async function begin() {
    if (!socketFactory) { show({ mode: "fallback" }); return; }
    const at = epoch, stored = await records.workspace(workspace);
    if (!current() || epoch !== at) return;
    const hint = registry.read();
    const held = await registry.held(stored.generation);
    if (!current() || epoch !== at) return;
    if (held && hint?.tabId !== options.tabId) { show({ mode: "other-owner" }); return; }
    if (stored.paused) { show({ mode: "takeover-failed" }); return; }
    await takeover();
  }
  const check = () => {
    const at = epoch;
    if (!current()) { if (!stopped && moved()) halt("workspace-changed"); return; }
    if (generation === undefined) {
      if (state.mode === "other-owner" && !registry.read()) show({ mode: "other-owner", closed: true });
      return;
    }
    void prove(at).then(ok => {
      if (ok && socket?.readyState === 1 && handshaken) { if (heartbeat === undefined && pong === undefined) beat(socket); }
      else if (ok && state.mode === "live" && socket?.readyState !== 0 && recovery?.allowAutomatic()) recovery.report({ kind: "transient" });
    }).catch(() => { if (current() && epoch === at) halt("takeover-failed"); });
  };
  const storage = (event: Event) => {
    const changed = (event as StorageEvent).key;
    if (changed === undefined || changed === null || changed === `native-site-editor:agent-owner:${key}`) check();
  };
  const freeze = () => { clearHeartbeat(); };
  const hide = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) freeze();
    else stop();
  };
  const stop = () => {
    if (stopped) return;
    halt("off"); stopped = true;
    events.window.removeEventListener("storage", storage);
    events.window.removeEventListener("pageshow", check);
    events.window.removeEventListener("pagehide", hide);
    events.document.removeEventListener("resume", check);
    events.document.removeEventListener("freeze", freeze);
    events.document.removeEventListener("visibilitychange", check);
  };
  events.window.addEventListener("storage", storage);
  events.window.addEventListener("pageshow", check);
  events.window.addEventListener("pagehide", hide);
  events.document.addEventListener("resume", check);
  events.document.addEventListener("freeze", freeze);
  events.document.addEventListener("visibilitychange", check);
  return {
    start, takeover, stop,
    state: () => state,
    changed: () => { if (!stopped && moved()) halt("workspace-changed"); },
    retry: () => recovery?.retry() ?? Promise.resolve({}),
    report: (failure: AgentFailure) => { recovery?.report(failure); },
  };
}

/** After takeover: this tab's draft memory takes the durable drafts (a read any local change overtook is
 * dropped), and the open file shows what this tab now owns unless the user typed during the read. */
export async function reloadTakeover(snapshot: Snapshot, host: {
  open: string | undefined;
  key(path: string): string;
  keys(): string[];
  settle(keys: string[]): Promise<void>;
  draft(path: string): { content?: string; deleted?: boolean } | undefined;
  /** The open file's editor text, `undefined` once it is not the open, mounted file of this workspace. */
  mounted(path: string): string | undefined;
  restore(path: string): Promise<void>;
}) {
  const { open } = host, shown = open === undefined ? undefined : host.mounted(open), before = open === undefined ? undefined : host.draft(open);
  await host.settle([...new Set([...host.keys(), ...snapshot.drafts.map(([key]) => key)])]);
  if (open === undefined || shown === undefined || host.mounted(open) !== shown) return;
  const after = host.draft(open), stored = snapshot.drafts.find(([key]) => key === host.key(open))?.[1];
  // Memory must hold the durable record (or its absence), not a local change made meanwhile.
  if (after ? after.content !== stored?.content || Boolean(after.deleted) !== Boolean(stored?.deleted) : stored) return;
  // Deleted or moved away, discarded (gone from memory), or other text than the editor shows.
  if (after ? after.deleted || after.content !== shown : before) await host.restore(open);
}
