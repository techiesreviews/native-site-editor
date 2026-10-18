// Fake operations are billing proxies, not exact SQLite charges. Counts describe
// calls, keys and bytes only. Byte sizes use node:v8 serialize(value).length,
// excluding keys and alarm metadata. Worker and SessionStore logic run unchanged.
import { AsyncLocalStorage } from "node:async_hooks";
import { serialize } from "node:v8";
import { build } from "esbuild";
import type { RelaySocket } from "../../worker/agent-relay";
import type { Env, handle } from "../../worker/app";
import { fakeGitHub, githubState } from "../mcp-harness";

export type Category = "auth" | "control" | "data" | "messages" | "lifecycle" | "migration";
const categories: Category[] = ["auth", "control", "data", "messages", "lifecycle", "migration"];
// `calls`: DO stub fetch invocations; `alarms`: alarm deliveries (not fetches).
const counts = () => ({ calls: 0, alarms: 0, keysRead: 0, keysWritten: 0, keysDeleted: 0, bytesWritten: 0, failedWrites: 0 });
type Operation = { category: Category; name: string; path: string; action?: string };
const active = new AsyncLocalStorage<Operation>();
const incoming = new AsyncLocalStorage<{ authHubPending: boolean }>();
export class UsageCounters {
  byCategory = Object.fromEntries(categories.map(category => [category, counts()])) as Record<Category, ReturnType<typeof counts>>;
  log: Operation[] = [];
  readKeys: string[] = [];
  retainedBytes = 0;
  peakRetainedBytes = 0;
  waitedMs = 0;
  reset() {
    for (const category of categories) this.byCategory[category] = counts();
    this.log.length = 0;
    this.readKeys.length = 0;
    this.peakRetainedBytes = this.retainedBytes;
    this.waitedMs = 0;
  }
  retained(delta: number) {
    this.retainedBytes += delta;
    this.peakRetainedBytes = Math.max(this.peakRetainedBytes, this.retainedBytes);
  }
}
const size = (value: unknown) => serialize(value).length;

/** In-memory storage returns clones, counts attempted keys (including misses),
 * and atomically rejects an injected put/delete before changing values/counts.
 * Transactions roll back values on rejection; operation counts remain attempts.
 */
export class CountedStorage {
  private values = new Map<string, unknown>();
  private alarm: number | null = null;
  private fail = false;
  constructor(private counters: UsageCounters, private fallback: Category = "data") {}
  private get count() { return this.counters.byCategory[active.getStore()?.category ?? this.fallback]; }
  failNextWrite() { this.fail = true; }
  private checkWrite() {
    if (!this.fail) return;
    this.fail = false;
    this.count.failedWrites++;
    throw new Error("Injected storage write failure");
  }
  async get<T>(key: string): Promise<T | undefined>;
  async get<T>(keys: string[]): Promise<Map<string, T>>;
  async get<T>(key: string | string[]): Promise<T | undefined | Map<string, T>> {
    const keys = typeof key === "string" ? [key] : key;
    this.count.keysRead += keys.length;
    this.counters.readKeys.push(...keys);
    if (typeof key === "string") return structuredClone(this.values.get(key)) as T | undefined;
    return new Map(keys.filter(key => this.values.has(key)).map(key => [key, structuredClone(this.values.get(key)) as T]));
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(key: string | Record<string, unknown>, value?: unknown) {
    this.checkWrite();
    const entries = Object.entries(typeof key === "string" ? { [key]: value } : key)
      .map(([key, value]) => [key, structuredClone(value)] as const);
    for (const [key, value] of entries) {
      const bytes = size(value);
      this.counters.retained(bytes - (this.values.has(key) ? size(this.values.get(key)) : 0));
      this.values.set(key, value);
      this.count.keysWritten++;
      this.count.bytesWritten += bytes;
    }
  }
  async delete(key: string): Promise<boolean>;
  async delete(keys: string[]): Promise<number>;
  async delete(key: string | string[]): Promise<boolean | number> {
    this.checkWrite();
    const keys = typeof key === "string" ? [key] : key;
    this.count.keysDeleted += keys.length;
    let deleted = 0;
    for (const key of keys) if (this.values.has(key)) {
      this.counters.retained(-size(this.values.get(key)));
      this.values.delete(key);
      deleted++;
    }
    return typeof key === "string" ? Boolean(deleted) : deleted;
  }
  async list({ prefix = "", start, end, limit = Infinity }: { prefix?: string; start?: string; end?: string; limit?: number } = {}) {
    const keys = [...this.values.keys()].filter(key => key.startsWith(prefix) &&
      (start === undefined || key >= start) && (end === undefined || key < end)).sort().slice(0, limit);
    return this.get(keys);
  }
  async transaction<T>(fn: (storage: CountedStorage) => Promise<T>) {
    const snapshot = structuredClone(this.values);
    const alarm = this.alarm;
    try { return await fn(this); }
    catch (error) {
      const bytes = (values: Map<string, unknown>) => [...values.values()].reduce<number>((sum, value) => sum + size(value), 0);
      this.counters.retained(bytes(snapshot) - bytes(this.values));
      this.values = snapshot;
      this.alarm = alarm;
      throw error;
    }
  }
  private lifecycle(action: string) {
    const parent = active.getStore();
    this.counters.log.push({ category: "lifecycle", name: parent?.name ?? "storage", path: action });
  }
  async setAlarm(at: number | Date) { this.lifecycle("setAlarm"); this.alarm = Number(at); }
  async getAlarm() { return this.alarm; }
  async deleteAlarm() { this.lifecycle("deleteAlarm"); this.alarm = null; }
  async deleteAll() { await this.delete([...this.values.keys()]); }
}

/** Socket traffic is separate from DO HTTP invocations and storage operations. */
export function countedSocket() {
  const counters = { sent: 0, received: 0, sentBytes: 0, receivedBytes: 0 };
  const bytes = (message: string | ArrayBuffer | ArrayBufferView) =>
    typeof message === "string" ? Buffer.byteLength(message) : message.byteLength;
  return {
    category: "messages" as const, counters,
    send(message: string | ArrayBuffer | ArrayBufferView) { counters.sent++; counters.sentBytes += bytes(message); },
    receive(message: string | ArrayBuffer | ArrayBufferView) { counters.received++; counters.receivedBytes += bytes(message); },
  };
}

/** Run serially: globals are restored in finally by the caller. Timers advance
 * only after eight immediate turns plus a real 1ms I/O turn without new timers.
 * Recheck the generation so crypto, streams and client microtasks can clear long
 * client deadlines before the next virtual jump. No automatic alarm execution.
 */
export class FakeClock {
  private now = Date.now();
  private timers = new Map<number, { at: number; run: () => void }>();
  private next = 0;
  private generation = 0;
  private installed = false;
  private pumping = false;
  private real = { now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  constructor(private counters: UsageCounters) {}
  install() {
    if (this.installed) throw new Error("Clock already installed");
    this.installed = true;
    Date.now = () => this.now;
    // The fake implements timer identity and ref/unref used by SDK deadlines.
    // Node also types unused Timeout methods and setTimeout.__promisify__.
    // eslint-disable-next-line no-restricted-syntax -- The global timer seam deliberately implements only the Timeout surface used here.
    globalThis.setTimeout = ((callback: (...args: any[]) => void, delay = 0, ...args: any[]) => {
      const id = ++this.next;
      const token = { id, unref() { return this; }, ref() { return this; } };
      this.timers.set(id, { at: this.now + Math.max(0, Number(delay) || 0), run: () => callback(...args) });
      this.generation++;
      this.pump();
      return token;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((token: { id?: number } | number | undefined) => {
      if (token !== undefined) this.timers.delete(typeof token === "number" ? token : token.id!);
      this.generation++;
    }) as typeof clearTimeout;
  }
  private pump() {
    if (this.pumping) return;
    this.pumping = true;
    const idle = (rounds: number, generation: number) => {
      if (!this.installed || !this.timers.size) { this.pumping = false; return; }
      if (generation !== this.generation) { setImmediate(() => idle(8, this.generation)); return; }
      if (rounds) { setImmediate(() => idle(rounds - 1, generation)); return; }
      this.real.setTimeout(() => {
        if (!this.installed) { this.pumping = false; return; }
        if (generation !== this.generation) { idle(8, this.generation); return; }
        const first = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (first) {
          const [id, timer] = first;
          this.timers.delete(id);
          this.counters.waitedMs += timer.at - this.now;
          this.now = timer.at;
          timer.run();
        }
        setImmediate(() => idle(8, this.generation));
      }, 1);
    };
    setImmediate(() => idle(8, this.generation));
  }
  uninstall() {
    Date.now = this.real.now;
    globalThis.setTimeout = this.real.setTimeout;
    globalThis.clearTimeout = this.real.clearTimeout;
    this.installed = false;
    this.timers.clear();
  }
}

type Instance = { fetch(request: Request): Promise<Response>; alarm(): Promise<void>; webSocketMessage(socket: RelaySocket, message: string): Promise<void>; webSocketClose(socket: RelaySocket, code: number, reason: string, clean: boolean): Promise<void>; webSocketError(socket: RelaySocket, error: unknown): Promise<void> };
type FakeContext = { getWebSockets(): RelaySocket[]; setWebSocketAutoResponse(value: unknown): void; storage: CountedStorage; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> };
async function loadWorker() {
  const { outputFiles } = await build({
    stdin: { contents: 'export { SessionStore, default } from "./worker/index.ts"; export { handle } from "./worker/app.ts";', resolveDir: process.cwd() },
    banner: { js: "class WebSocketRequestResponsePair { constructor(request, response) { this.request = request; this.response = response; } }" },
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", conditions: ["workerd"],
    plugins: [{ name: "cloudflare-base", setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "base", namespace: "cloudflare" }));
      build.onLoad({ filter: /.*/, namespace: "cloudflare" }, () => ({
        contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
      }));
    } }],
  });
  return await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text + "\n//# sourceURL=counted-worker.js").toString("base64")}`) as {
    SessionStore: new (ctx: FakeContext, env: Env) => Instance; handle: typeof handle;
  };
}

export async function startCountedWorker() {
  const runtime = await loadWorker();
  const counters = new UsageCounters(), clock = new FakeClock(counters), github = githubState();
  const sockets = new Map<string, RelaySocket[]>();
  const gates = new Set<string>();
  const objects = new Map<string, { instance: Instance; storage: CountedStorage; ctx: FakeContext; idle(): Promise<unknown> }>();
  function object(name: string) {
    let entry = objects.get(name);
    if (!entry) {
      const storage = new CountedStorage(counters);
      // One queue per object mirrors blockConcurrencyWhile across concurrent calls.
      let blocked = Promise.resolve<unknown>(undefined);
      const ctx: FakeContext = { getWebSockets: () => sockets.get(name) ?? [], setWebSocketAutoResponse() {}, storage, blockConcurrencyWhile(fn) {
        const result = blocked.then(async () => {
          gates.add(name);
          try { return await fn(); } finally { gates.delete(name); }
        });
        blocked = result.catch(() => undefined);
        return result;
      } };
      // Events (fetches, alarms) wait for an active block, as the runtime holds them.
      entry = { storage, ctx, instance: new runtime.SessionStore(ctx, env), idle: () => blocked };
      objects.set(name, entry);
    }
    return entry;
  }
  const namespace = {
    idFromName: (name: string) => name,
    get: (name: string) => ({ async fetch(request: Request) {
      const url = new URL(request.url);
      // Per-request marker: /mcp authenticates before dispatching any tool.
      // Its first plain hub GET belongs to authenticateAgent; subsequent hub
      // reads are data (including result polls). No stack inspection or changes
      // to product code. The authentication baseline guards this ordering.
      const marker = incoming.getStore();
      const authenticating = Boolean(marker?.authHubPending && name.startsWith("agent-hub:") && request.method === "GET" && url.pathname === "/");
      if (authenticating && marker) marker.authHubPending = false;
      const action = url.pathname === "/agent-operation" ? (await request.clone().json() as { type?: string }).type : undefined;
      const category: Category = request.method === "DELETE" ? "lifecycle"
        : action ? (["add-grant", "remove-grant", "use-grant"].includes(action) ? "auth" : "control")
        : url.pathname.startsWith("/relay/") ? "control"
        : url.pathname.startsWith("/repository-cache") || url.pathname.startsWith("/agent-draft") ? "data"
        : name.startsWith("agent-hub:") ? (authenticating ? "auth" : "data") : "auth";
      const operation = { category, name, path: url.pathname + url.search, ...(action ? { action } : {}) };
      counters.byCategory[category].calls++;
      counters.log.push(operation);
      const entry = object(name);
      await entry.idle();
      return active.run(operation, () => entry.instance.fetch(request));
    } }),
  } satisfies Env["SESSIONS"];
  const env: Env = { SESSIONS: namespace, ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test", GITHUB_APP_SLUG: "test" };
  const pending = new Set<Promise<unknown>>();
  const fetcher: typeof fetch = (input, init) => fakeGitHub(new Request(input, init), github);
  const worker = {
    async dispatchFetch(url: string, init?: RequestInit) {
      return incoming.run({ authHubPending: new URL(url).pathname === "/mcp" }, () =>
        runtime.handle(new Request(url, init), env, fetcher, { waitUntil(promise) { pending.add(promise); } }));
    },
    async dispose() { try { await Promise.all(pending); } finally { clock.uninstall(); } },
  };
  return { worker, dispatchFetch: (url: string, init?: RequestInit) => worker.dispatchFetch(url, init), counters, clock, github, namespace,
    storage: (name: string) => object(name).storage,
    /** Restore a hibernated editor socket, then deliver its real scope handshake. */
    attach(name: string, socket: RelaySocket, handshake: string) {
      // Metadata admission can wake this object before any relay/socket work.
      if (sockets.has(name)) throw new Error("A socket is already attached to this relay");
      sockets.set(name, [socket]);
      void object(name).instance.webSocketMessage(socket, handshake);
    },
    message(name: string, socket: RelaySocket, message: string) { void object(name).instance.webSocketMessage(socket, message); },
    handshake(name: string, socket: RelaySocket, message: string) { return object(name).instance.webSocketMessage(socket, message); },
    settle(name: string) { return object(name).idle(); },
    inCriticalSection: (name: string) => gates.has(name),
    /** Simulate a wake with runtime-retained editor attachments. */
    restoreEditors(name: string, editors: RelaySocket[]) {
      sockets.set(name, editors);
      const entry = object(name);
      entry.instance = new runtime.SessionStore(entry.ctx, env);
    },
    close(name: string, socket: RelaySocket) { return object(name).instance.webSocketClose(socket, 1000, "closed", true); },
    error(name: string, socket: RelaySocket) { return object(name).instance.webSocketError(socket, new Error("Lost socket")); },
    async alarm(name: string) {
      const operation: Operation = { category: "lifecycle", name, path: "alarm" };
      counters.log.push(operation);
      counters.byCategory.lifecycle.alarms++;
      const entry = object(name);
      await entry.idle();
      return active.run(operation, () => entry.instance.alarm());
    },
  };
}
