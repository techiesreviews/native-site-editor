import { AgentFailureError, type AgentFailure } from "../shared/agent-failure";

interface RecordState {
  quota?: { at: number; resetAt?: number };
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

export function createAgentRecovery(options: RecoveryOptions) {
  const key = `native-site-editor:agent-recovery:${options.workspace.account}:${options.workspace.repoId}`;
  const listeners = new Set<() => void>();
  let timer: number | undefined, renewal: number | undefined, nextAttemptAt: number | undefined;
  let disposed = false, running = false, flight: Promise<{ retryAt?: number }> | undefined;
  let generation = 0;
  function read(): RecordState {
    try {
      const record = JSON.parse(options.storage.getItem(key) ?? "null");
      return record && Array.isArray(record.attempts) ? record : { attempts: [] };
    }
    catch { return { attempts: [] }; }
  }
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
        timer = options.setTimeout(() => { timer = undefined; notify(); }, record.retryAt! - options.now());
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
    if (current.attempts.length >= 5 || nextAttemptAt - (current.attempts[0] ?? options.now()) > WINDOW) {
      current.paused = "transient";
      delete current.lease;
      write(current);
      clearTimers();
      schedule();
      return;
    }
    renew();
    timer = options.setTimeout(() => { timer = undefined; void attempt(false); }, nextAttemptAt - options.now());
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
    }
    write(record);
    if (!running) { clearTimers(); schedule(); }
    return failure.kind;
  }
  async function attempt(manual: boolean): Promise<{ retryAt?: number }> {
    if (disposed || !owns()) return {};
    const record = read(), at = generation;
    if ((record.retryAt ?? 0) > options.now()) return { retryAt: record.retryAt };
    if (!manual && (record.quota || record.paused)) return {};
    running = true;
    record.attempts.push(options.now());
    write(record);
    try {
      // This callback reads the hub. It never repeats a failed mutation.
      await options.reconnect();
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
      delete current.paused;
      write(current);
      renew();
      flight = attempt(true).finally(() => { flight = undefined; notify(); });
      return flight;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      disposed = true;
      generation++;
      clearTimers();
      unsubscribe();
      release();
      listeners.clear();
    },
  };
}

/** Storage events deliver changes only to other tabs. Local subscribers hear writes directly. */
export function browserAgentRecovery(workspace: RecoveryOptions["workspace"], tabId: string, reconnect: () => Promise<void>) {
  const key = `native-site-editor:agent-recovery:${workspace.account}:${workspace.repoId}`;
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
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer),
  });
}
