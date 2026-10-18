// Ticket 18: quiet waiting and the user's explicit Watch. Loaded lazily with the agent menu.
//
// With the live relay, the receiving tab is where requests to agents live (src/agent-records.ts
// conversations), so it answers the request tools over the socket with the hub's own rules
// (shared/agent-requests.ts). A wait answers at once by default. Only while the user has turned
// on Watch in the agent menu does the tab hold one, until a request arrives here (an in-memory
// wake, never a storage read) or its time runs out: at most 25 s, clipped to the relay's budget
// and to Watch's end. Watch lasts 10 minutes per activation and counts 25 held waits across
// this browser's tabs and every grant, in one small localStorage record per workspace; only the
// user starting it again resets it. Ending it stops new waits and nothing else.
import { workspaceKey, type AgentWorkspace } from "../shared/agent-command";
import type { AgentRequest } from "../shared/agent";
import type { AgentReadResult } from "../shared/agent-read";
import { requestForAgent, requestOperation, type AgentRequests, type WatchReport } from "../shared/agent-requests";
import { HttpError } from "../shared/http-error";
import type { JsonValue } from "../shared/agent-command";

export const WATCH_MS = 10 * 60_000;
export const WATCH_WAITS = 25;
export const WAIT_MS = 25_000;
/** An ended activation is still shown as paused for a day, then forgotten. */
const KEEP_ENDED_MS = 24 * 60 * 60_000;

/** All Watch keeps: when this activation started and ends, and how many waits it held. */
export interface WatchRecord { startedAt: number; until: number; waits: number }
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const watchKey = (workspace: AgentWorkspace) => `native-site-editor:agent-watch:${workspaceKey({ ...workspace, account: workspace.account.toLowerCase() })}`;

export function agentWatch(workspace: AgentWorkspace, storage: Store = localStorage) {
  const key = watchKey(workspace);
  function read(now = Date.now()): WatchRecord | undefined {
    let value: Partial<WatchRecord> | null;
    try { value = JSON.parse(storage.getItem(key) ?? "null"); } catch { return undefined; }
    if (!value || !Number.isFinite(value.startedAt) || !Number.isFinite(value.until) || !Number.isSafeInteger(value.waits) ||
      value.until! - value.startedAt! > WATCH_MS || value.until! < value.startedAt! || value.waits! < 0 || value.waits! > WATCH_WAITS) return undefined;
    if (now - value.until! > KEEP_ENDED_MS) { try { storage.removeItem(key); } catch { /* Read-only storage forgets nothing. */ } return undefined; }
    return { startedAt: value.startedAt!, until: value.until!, waits: value.waits! };
  }
  const write = (record: WatchRecord) => { storage.setItem(key, JSON.stringify(record)); return record; };
  return {
    key,
    read,
    /** The user's explicit start or renewal: the only thing that resets the deadline and the count. */
    start: (now = Date.now()) => write({ startedAt: now, until: now + WATCH_MS, waits: 0 }),
    stop: () => { storage.removeItem(key); },
    report(now = Date.now()): WatchReport {
      const record = read(now);
      if (!record) return { state: "off" };
      if (now >= record.until) return { state: "paused", reason: "ended", at: record.until };
      if (record.waits >= WATCH_WAITS) return { state: "paused", reason: "used", at: now };
      return { state: "on", until: record.until, waitsLeft: WATCH_WAITS - record.waits };
    },
    /** Counts one held wait; none once Watch is off, ended or used up. */
    use(now = Date.now()): WatchRecord | undefined {
      const record = read(now);
      if (!record || now >= record.until || record.waits >= WATCH_WAITS) return undefined;
      return write({ ...record, waits: record.waits + 1 });
    },
  };
}
export type AgentWatch = ReturnType<typeof agentWatch>;

export interface RequestPorts {
  workspace: AgentWorkspace;
  /** This browser's requests of the workspace, read fresh. */
  list(): Promise<AgentRequest[]>;
  /** Keeps one request when `accept` sees the stored copy in the writing transaction. */
  save(request: AgentRequest, accept: (stored: AgentRequest | undefined) => boolean): Promise<boolean>;
  watch: AgentWatch;
  now?: () => number;
  clock?: { setTimeout(callback: () => void, delay: number): unknown; clearTimeout(timer: unknown): void };
}

const notDismissed = (stored: AgentRequest | undefined) => Boolean(stored && stored.state !== "dismissed");
const ok = (value: unknown): AgentReadResult => ({ ok: true, value: JSON.parse(JSON.stringify(value)) as { [key: string]: JsonValue } });

/** The tab's side of wait_for_requests, reply_to_request and get_selection(request). */
export function createRequestTools(ports: RequestPorts) {
  const now = ports.now ?? Date.now;
  const clock = ports.clock ?? { setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay), clearTimeout: (timer: unknown) => clearTimeout(timer as number) };
  const waiters = new Set<() => void>();
  const scope = { repoId: ports.workspace.repoId, branch: ports.workspace.branch };
  async function take(grantId: string, all: boolean) {
    const { result } = requestOperation(await ports.list(), { type: "take-requests", grantId, all, ...scope }) as { result: { requests: AgentRequest[] } };
    const taken = [];
    // A request dismissed (perhaps in another tab) since the read is not handed out.
    for (const request of result.requests) if (await ports.save(request, notDismissed)) taken.push(requestForAgent(request));
    return taken;
  }
  /** Ends at a wake (a request arrived or Watch changed) or after `ms`. */
  function hold(ms: number) {
    return new Promise<void>(resolve => {
      const done = () => { waiters.delete(done); clock.clearTimeout(timer); resolve(); };
      const timer = clock.setTimeout(done, ms);
      waiters.add(done);
    });
  }
  async function wait(command: AgentRequests, current: () => boolean, deadline: number) {
    const all = command.args.all === true;
    let requests = await take(command.grantId, all);
    const wanted = typeof command.waitMs === "number" && Number.isFinite(command.waitMs) ? Math.min(WAIT_MS, command.waitMs) : WAIT_MS;
    if (requests.length || !current() || wanted <= 0) return ok({ requests, watch: ports.watch.report(now()) });
    const started = now(), used = ports.watch.use(started);
    // Quiet by default: without Watch (or once it ended or used its waits) the answer is immediate.
    if (!used) return ok({ requests, watch: ports.watch.report(started) });
    const ms = Math.min(deadline, used.until, started + wanted) - started;
    if (ms > 0) await hold(ms);
    // The relay gave up or the socket went: take nothing it could not deliver.
    if (current()) requests = await take(command.grantId, all);
    return ok({ requests, watch: ports.watch.report(now()) });
  }
  async function reply(command: AgentRequests) {
    const { request: id, status, message, requestIds } = command.args;
    const { result } = requestOperation(await ports.list(), { type: "reply", id, status, message, requestIds, ...scope }) as { result: AgentRequest };
    if (!await ports.save(result, notDismissed)) throw new HttpError(409, "The user dismissed this request.");
    return ok({ id: result.id, state: result.state });
  }
  async function find(command: AgentRequests) {
    const { result } = requestOperation(await ports.list(), { type: "request", id: command.args.request, ...scope }) as { result: AgentRequest };
    return ok(requestForAgent(result));
  }
  return {
    async run(command: AgentRequests, current: () => boolean, deadline: number): Promise<AgentReadResult> {
      try {
        if (command.tool === "wait_for_requests") return await wait(command, current, deadline);
        if (command.tool === "reply_to_request") return await reply(command);
        if (command.tool === "get_request") return await find(command);
        return { ok: false, message: "Unknown request tool." };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "The editor could not read its requests." };
      }
    },
    /** A request arrived or changed here, or Watch stopped: every held wait looks again. */
    notify() { for (const wake of [...waiters]) wake(); },
    get holding() { return waiters.size; },
  };
}
