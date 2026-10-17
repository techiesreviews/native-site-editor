import { AgentFailureError, type AgentFailure } from "../shared/agent-failure";

interface RecordState {
  quota?: { at: number; resetAt?: number };
  /** When the current run of failures began: the two-minute window counts from here. */
  since?: number;
  attempts: number[];
  retryAt?: number;
  paused?: "transient";
  lease?: { tab: string; until: number };
}
interface RecoveryOptions {
  workspace: { account: string; repoId: number };
  tabId: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  channel: { subscribe(listener: () => void): () => void; post(): void };
  now(): number;
  random(): number;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
  /** Runs `run` only while no other tab of the browser runs one; `undefined` when another does. */
  exclusive<T>(run: () => Promise<T>): Promise<T | undefined>;
  reconnect(): Promise<void>;
}
interface RecoveryState {
  mode: "ok" | "reconnecting" | "paused" | "quota";
  resetAt?: number;
  retryAt?: number;
  nextAttemptAt?: number;
}
const LEASE = 15_000;
const WINDOW = 120_000;
/** A recovery read still unanswered after this counts as a network failure. */
const READ_LIMIT = 30_000;
type Workspace = RecoveryOptions["workspace"];
const recoveryKey = (workspace: Workspace) => `native-site-editor:agent-recovery:${workspace.account}:${workspace.repoId}`;
function readRecord(storage: Pick<Storage, "getItem">, key: string): RecordState {
  try {
    const record = JSON.parse(storage.getItem(key) ?? "null");
    return record && Array.isArray(record.attempts) ? record : { attempts: [] };
  }
  catch { return { attempts: [] }; }
}
/** Whether a tab of this workspace paused or is recovering remote work: tabs with remote agents off honour it too. */
export function recoveryHolds(storage: Pick<Storage, "getItem">, workspace: Workspace, now: number) {
  const record = readRecord(storage, recoveryKey(workspace));
  return Boolean(record.quota || record.paused || record.lease || record.attempts.length || (record.retryAt ?? 0) > now);
}
/**
 * A tab with remote agents off records a quota answer or a cooldown, so every tab of the
 * workspace pauses or waits; it returns which one it recorded.
 */
export function recordFailure(storage: Pick<Storage, "getItem" | "setItem">, workspace: Workspace, failure: AgentFailure, now: number) {
  if (failure.kind !== "quota" && (failure.kind !== "transient" || failure.retryAt === undefined)) return undefined;
  const key = recoveryKey(workspace), record = readRecord(storage, key);
  if (failure.kind === "quota") record.quota = { at: now, resetAt: failure.resetAt };
  if (failure.retryAt !== undefined) record.retryAt = Math.max(record.retryAt ?? 0, failure.retryAt);
  storage.setItem(key, JSON.stringify(record));
  return failure.kind;
}

export function createAgentRecovery(options: RecoveryOptions) {
  const key = recoveryKey(options.workspace);
  const listeners = new Set<() => void>();
  let timer: number | undefined, renewal: number | undefined, nextAttemptAt: number | undefined;
  let disposed = false, running = false, flight: Promise<{ retryAt?: number }> | undefined;
  let generation = 0;
  let abandon!: () => void;
  // Disposal lets go of the lock at once: a read still running is fenced and decides nothing.
  const abandoned = new Promise<{ retryAt?: number }>((resolve) => { abandon = () => resolve({}); });
  const read = () => readRecord(options.storage, key);
  function notify() { for (const listener of listeners) listener(); }
  function write(record: RecordState) {
    options.storage.setItem(key, JSON.stringify(record));
    options.channel.post();
    notify();
  }
  function clearTimers() {
    if (timer !== undefined) options.clearTimeout(timer);
    if (renewal !== undefined) options.clearTimeout(renewal);
    timer = renewal = nextAttemptAt = undefined;
  }
  function owns(record = read()) { return record.lease?.tab === options.tabId && record.lease.until > options.now(); }
  function release(record = read()) {
    if (record.lease?.tab === options.tabId) { delete record.lease; write(record); }
  }
  function claim() {
    const record = read();
    if (record.lease && record.lease.tab !== options.tabId && record.lease.until > options.now()) return false;
    record.lease = { tab: options.tabId, until: options.now() + LEASE };
    write(record);
    return owns();
  }
  function renew() {
    renewal = options.setTimeout(() => {
      if (disposed || !owns()) return;
      const record = read();
      record.lease!.until = options.now() + LEASE;
      write(record);
      renew();
    }, LEASE / 3);
  }
  function state(): RecoveryState {
    const record = read();
    return {
      mode: record.quota ? "quota" : record.paused ? "paused"
        : record.lease || record.attempts.length || (record.retryAt ?? 0) > options.now() ? "reconnecting" : "ok",
      resetAt: record.quota?.resetAt, retryAt: record.retryAt, nextAttemptAt,
    };
  }
  function schedule() {
    if (disposed || running || timer !== undefined) return;
    const record = read();
    if (record.quota || record.paused) {
      if ((record.retryAt ?? 0) > options.now())
        timer = options.setTimeout(() => { timer = undefined; notify(); schedule(); }, record.retryAt! - options.now());
      return;
    }
    if (record.lease && !owns()) {
      timer = options.setTimeout(() => { timer = undefined; schedule(); }, Math.max(1, record.lease.until - options.now()));
      return;
    }
    if (!record.lease && !record.attempts.length && !record.retryAt) return;
    if (!claim()) return schedule();
    const current = read();
    const delay = 1000 * 2 ** current.attempts.length * (0.5 + options.random());
    nextAttemptAt = Math.max(options.now() + delay, current.retryAt ?? 0);
    if (current.attempts.length >= 5 || nextAttemptAt - (current.since ?? current.attempts[0] ?? options.now()) > WINDOW) {
      current.paused = "transient";
      delete current.lease;
      write(current);
      clearTimers();
      schedule();
      return;
    }
    renew();
    const expected = current.attempts.length;
    timer = options.setTimeout(() => { timer = undefined; void attempt(false, expected); }, nextAttemptAt - options.now());
    notify();
  }
  function report(failure: AgentFailure) {
    if (disposed) return failure.kind;
    if (failure.kind === "other") return failure.kind;
    const record = read();
    if (failure.kind === "auth") {
      generation++;
      clearTimers();
      record.paused = "transient";
      delete record.lease;
      write(record);
      return "auth";
    }
    if (failure.retryAt !== undefined) record.retryAt = Math.max(record.retryAt ?? 0, failure.retryAt);
    if (failure.kind === "quota") {
      generation++;
      record.quota = { at: options.now(), resetAt: failure.resetAt };
      delete record.lease;
      clearTimers();
    } else if (!record.quota && !record.paused && !record.lease) {
      record.lease = { tab: options.tabId, until: options.now() + LEASE };
      record.since ??= options.now();
    }
    write(record);
    if (!running) { clearTimers(); schedule(); }
    return failure.kind;
  }
  /** `expected`: the attempts an automatic read was scheduled after; another tab's read since then cancels it. */
  async function attempt(manual: boolean, expected?: number): Promise<{ retryAt?: number }> {
    const result = await options.exclusive(() => Promise.race([attemptAlone(manual, expected), abandoned]));
    // Another tab is reading the hub: its outcome decides what happens next.
    if (result === undefined && !disposed) { clearTimers(); schedule(); notify(); }
    return result ?? {};
  }
  async function attemptAlone(manual: boolean, expected?: number): Promise<{ retryAt?: number }> {
    if (disposed || !owns()) return {};
    const record = read(), at = generation;
    if ((record.retryAt ?? 0) > options.now()) return { retryAt: record.retryAt };
    if (!manual && (record.quota || record.paused)) return {};
    if (!manual && (record.attempts.length !== expected || options.now() - (record.since ?? options.now()) > WINDOW)) {
      clearTimers();
      schedule();
      return {};
    }
    running = true;
    record.attempts.push(options.now());
    write(record);
    try {
      // This callback reads the hub. It never repeats a failed mutation.
      let limit: number | undefined;
      try {
        await Promise.race([options.reconnect(), new Promise<never>((_, reject) => {
          limit = options.setTimeout(() => reject(new AgentFailureError({ kind: "transient" })), READ_LIMIT);
        })]);
      } finally { options.clearTimeout(limit!); }
      if (!disposed && generation === at && owns()) write({ attempts: [] });
    } catch (error) {
      if (disposed || generation !== at || !owns()) return {};
      const failure = error instanceof AgentFailureError ? error.failure : { kind: "transient" } as const;
      if (failure.kind === "auth" || failure.kind === "other") {
        const current = read();
        current.paused = "transient";
        write(current);
      } else report(failure);
    } finally {
      running = false;
      clearTimers();
      if (!disposed) { release(); schedule(); notify(); }
    }
    return {};
  }
  const unsubscribe = options.channel.subscribe(() => {
    if (disposed) return;
    const record = read();
    if (record.quota || record.paused || !owns()) { generation++; clearTimers(); }
    notify();
    schedule();
  });
  schedule();
  return {
    state,
    allowAutomatic: () => !disposed && state().mode === "ok",
    report,
    retry(): Promise<{ retryAt?: number }> {
      if (flight) return flight;
      const record = read();
      if (running) return Promise.resolve({ retryAt: record.lease?.until });
      if ((record.retryAt ?? 0) > options.now()) return Promise.resolve({ retryAt: record.retryAt });
      if (disposed || !claim()) return Promise.resolve({ retryAt: read().lease?.until });
      clearTimers();
      const current = read();
      // Manual Retry starts a fresh budget. Quota stays paused until a successful read.
      current.attempts = [];
      current.since = options.now();
      delete current.paused;
      write(current);
      renew();
      flight = attempt(true).finally(() => { flight = undefined; notify(); });
      return flight;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      disposed = true;
      abandon();
      generation++;
      clearTimers();
      unsubscribe();
      release();
      listeners.clear();
    },
  };
}

/** Storage events deliver changes only to other tabs. Local subscribers hear writes directly. */
export function browserAgentRecovery(workspace: Workspace, tabId: string, reconnect: () => Promise<void>) {
  const key = recoveryKey(workspace);
  return createAgentRecovery({
    workspace, tabId, reconnect, storage: localStorage,
    channel: {
      post() {},
      subscribe(listener) {
        const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) listener(); };
        window.addEventListener("storage", changed);
        return () => window.removeEventListener("storage", changed);
      },
    },
    now: () => Date.now(), random: () => Math.random(),
    // Longer delays overflow the browser's timer; the callback then checks the time again.
    setTimeout: (callback, delay) => window.setTimeout(callback, Math.min(delay, 2_147_483_647)),
    // Web Locks need a secure page; without them the shared lease alone keeps tabs apart.
    exclusive: (run) => navigator.locks ? navigator.locks.request(key, { ifAvailable: true }, (lock) => (lock ? run() : undefined)) : run(),
    clearTimeout: (timer) => window.clearTimeout(timer),
  });
}
