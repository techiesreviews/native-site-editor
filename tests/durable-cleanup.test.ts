import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { handle, type Env } from "../worker/app.ts";
import { cleanupObject, inventoryObject } from "../worker/agent-maintenance.ts";
import { startCountedWorker } from "./fakes/counted-agent.ts";
import { forEachAwait } from "./support/await-race.ts";
// @ts-expect-error Plain Node ESM intentionally has no declarations.
import { parseArgs, runCleanup } from "../scripts/agents/durable-cleanup.mjs";
// @ts-expect-error Plain Node ESM intentionally has no declarations.
import { maintenanceBudget, maintenanceLock, readManifest, reserveMaintenance, runInventory, sanitizeClassification, writeManifest } from "../scripts/agents/durable-inventory.mjs";

const now = Date.UTC(2026, 9, 19, 12);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const token = "cleanup-secret-".repeat(4);
const id = (n: number) => n.toString(16).padStart(64, "0");
const options = { account: "account", namespace: "namespace", deployment: "preview", maintenanceUrl: "https://editor.example" };
const internal = (body?: unknown) => new Request("https://session.internal/maintenance/cleanup", {
  method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
interface Classification {
  schema: string; version: number; status: string; fingerprint: string; totalKeys: number;
  totalBytes: number; alarm: number | null; records: { kind: string; count: number; bytes: number; eligibility: string; latestExpiresAt?: number }[];
}
interface Outcome {
  schema: string; version: number; status: string; reason?: string; method?: string; deletedKeys: number;
  keptKeys: number; unresolvedCommands: number; invocations: number; fingerprint: string;
}
function memory(entries: [string, unknown][], alarm: number | null = now) {
  const map = new Map(entries);
  const calls: { deletes: string[][]; all: number; deleteAlarm: number; writes: [string, unknown][] } = {
    deletes: [], all: 0, deleteAlarm: 0, writes: [],
  };
  return { map, calls, get alarm() { return alarm; }, storage: {
    list: async (input: { startAfter?: string; limit: number }) => new Map([...map]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .filter(([key]) => !input.startAfter || key > input.startAfter).slice(0, input.limit)),
    getAlarm: async () => alarm,
    deleteAlarm: async () => { calls.deleteAlarm++; alarm = null; },
    setAlarm: async (at: number) => { alarm = at; },
    deleteAll: async () => { calls.all++; map.clear(); },
    delete: async (keys: string[]) => { calls.deletes.push(keys); return keys.reduce((n, key) => n + Number(map.delete(key)), 0); },
    put: async (key: string, value: unknown) => { calls.writes.push([key, value]); map.set(key, value); },
  } };
}
async function inventory(store: ReturnType<typeof memory>, time = now): Promise<Classification> {
  return (await inventoryObject(internal(), store.storage, time)).json();
}
async function clean(store: ReturnType<typeof memory>, input: { expected?: string; allowance?: number; sockets?: number; now?: number } = {}): Promise<Outcome> {
  const classification = await inventory(store, input.now);
  const expected = input.expected ?? classification.fingerprint;
  const retained = classification.records.filter(record => record.eligibility === "preserve" &&
    ["sign-in-session", "record-fence", "oauth-pending"].includes(record.kind)).map(record => record.latestExpiresAt ?? 0);
  const wakeDay = retained.length ? day(Math.max(...retained)) : undefined;
  return (await cleanupObject(internal({ expected, allowance: input.allowance ?? 10, wakeDay }), store.storage,
    { sockets: input.sockets ?? 0, now: input.now ?? now })).json();
}
function fixture(t: TestContext, count = 1) {
  const dir = mkdtempSync(join(tmpdir(), "durable-cleanup-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const path = join(dir, "manifest.json");
  const cleanupPath = join(dir, "preview-namespace.cleanup.json");
  const budgetPath = join(dir, "account-namespace.budget.json");
  const lines: string[] = [];
  const manifest = readManifest(path, options, now);
  manifest.listComplete = true; manifest.permission = "confirmed";
  manifest.objects = Array.from({ length: count }, (_, n) => ({ id: id(n + 1), hasStoredData: true, status: "classified", classification: {
    schema: "durable-inventory", version: 1, status: "classified", fingerprint: id(1000 + n), totalKeys: 1, totalBytes: 10, alarm: now,
    records: [{ kind: "sign-in-session", count: 1, bytes: 10, eligibility: "expired" }],
  } }));
  const save = () => writeManifest(path, manifest);
  save();
  return { dir, path, cleanupPath, budgetPath, manifest, save, lines,
    ports: { path, env: { MAINTENANCE_CLEANUP_TOKEN: token }, clock: () => now, stdout: (line: string) => lines.push(line) } };
}
const reply = (extra: Partial<Outcome> = {}) => Response.json({ schema: "durable-cleanup", version: 1, status: "deleted", method: "deleteAll",
  deletedKeys: 1, keptKeys: 0, unresolvedCommands: 0, invocations: 1, fingerprint: id(1000), ...extra });
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("cleanup public route is separately disabled and authenticates before any DO work", async () => {
  const calls: Request[] = [], ids: string[] = [];
  const environment: Env = { ASSETS: { fetch: async () => new Response("asset") }, SESSIONS: {
    idFromName: () => { throw new Error("No named discovery"); },
    idFromString: value => { ids.push(value); return value; },
    get: () => ({ fetch: async request => { calls.push(request); return reply(); } }),
  }, MAINTENANCE_INVENTORY_TOKEN: token };
  const send = (body: unknown = { id: id(1), expected: id(2), allowance: 1 }, auth = token, method = "POST") => handle(
    new Request("https://editor.example/__maintenance/cleanup", { method, headers: { Authorization: `Bearer ${auth}` },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }) }), environment);
  assert.equal((await send()).status, 404);
  environment.MAINTENANCE_CLEANUP_TOKEN = "short";
  assert.equal((await send()).status, 404);
  environment.MAINTENANCE_CLEANUP_TOKEN = token;
  assert.equal((await send({}, "bad")).status, 401);
  assert.equal((await send({}, "")).status, 401);
  const wrongMethod = await send({}, token, "GET");
  assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get("Allow"), "POST");
  for (const body of [null, {}, { id: id(1), expected: "x", allowance: 1 }, { id: "short", expected: id(2), allowance: 1 },
    ...[0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1].map(allowance => ({ id: id(1), expected: id(2), allowance }))])
    assert.equal((await send(body)).status, 400);
  assert.equal((await handle(new Request("https://editor.example/__maintenance/cleanup", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "{" }), environment)).status, 400);
  assert.deepEqual(ids, []); assert.deepEqual(calls, []);
  assert.equal((await send()).status, 200);
  assert.deepEqual(ids, [id(1)]); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://session.internal/maintenance/cleanup");
  assert.deepEqual(await calls[0].json(), { expected: id(2), allowance: 1 });
  assert.equal(calls[0].headers.get("Authorization"), null);
});

test("route redacts thrown runtime errors and non-OK internal response bodies", async () => {
  for (const throws of [true, false]) {
    const environment: Env = { ASSETS: { fetch: async () => new Response("asset") }, MAINTENANCE_CLEANUP_TOKEN: token,
      SESSIONS: { idFromName: () => "", idFromString: value => value,
        get: () => ({ fetch: async () => { if (throws) throw new Error(token); return new Response(token, { status: 503, headers: { "Retry-After": "120" } }); } }) } };
    const result = await handle(new Request("https://editor.example/__maintenance/cleanup", { method: "POST",
      headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: id(1), expected: id(2), allowance: 1 }) }), environment);
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "Cleanup unavailable" });
    if (!throws) assert.equal(result.headers.get("Retry-After"), "120");
  }
});

test("expired isolated sign-in deletes its alarm before deleteAll; empty retry is idempotent", async () => {
  const store = memory([["session", { kind: "user", expiresAt: now - 1 }], ["repositoryCache:0", "private-cache"],
    ["alarm-deadlines", { session: now - 1 }], ["agent-lifecycle", { generation: 2, cleaned: {} }]]);
  const expected = (await inventory(store)).fingerprint;
  const deletion = store.storage.deleteAll;
  store.storage.deleteAll = async () => { assert.equal(store.alarm, null); await deletion(); };
  const result = await clean(store, { expected });
  assert.equal(result.status, "deleted"); assert.equal(result.method, "deleteAll"); assert.equal(result.deletedKeys, 4);
  assert.equal(result.invocations, 1); assert.equal(store.calls.all, 1); assert.equal(store.calls.deleteAlarm, 1);
  assert.equal((await clean(store, { expected })).status, "kept"); assert.equal(store.calls.all, 1);
});

test("expired hub mixed with a live record fence deletes only expired keys and schedules the fence", async () => {
  const store = memory([["session", { kind: "agent-hub", grants: [], expiresAt: now - 300_001, commands: [{ state: "pending" }] }],
    ["drafts", {}], ["context", { secret: "draft" }], ["requests", []], ["agent-cleaned-until", now + 50],
    ["alarm-deadlines", { session: now - 300_001 }]]);
  const result = await clean(store, { allowance: 2 });
  assert.equal(result.method, "keys"); assert.equal(result.unresolvedCommands, 1); assert.equal(result.invocations, 2);
  assert.deepEqual(store.calls.deletes.flat().sort(), ["context", "drafts", "requests", "session"]);
  assert.equal(store.map.get("agent-cleaned-until"), now + 50);
  assert.deepEqual(store.map.get("alarm-deadlines"), { session: now + 50 }); assert.equal(store.alarm, now + 50);
});

test("partial deletion is chunked at 128 and removes an obsolete alarm", async () => {
  const store = memory([["config", {}], ["alarm-deadlines", { session: now - 1 }],
    ...Array.from({ length: 260 }, (_, n): [string, unknown] => [`draft:${id(n)}`, "expired"])]);
  const result = await clean(store);
  assert.equal(result.method, "keys"); assert.equal(result.invocations, 1);
  assert.ok(store.calls.deletes.every(keys => keys.length <= 128));
  assert.deepEqual([...store.map.keys()], ["config", "alarm-deadlines"]); assert.equal(store.alarm, null);
});

test("live sign-in, config, oauth registrations, one-time auth and limiter remain untouched", async () => {
  const values: [string, unknown][][] = [
    ...["user", "oauth-client", "oauth", "install", "owner-setup", "oauth-request", "oauth-code", "agent"].map(kind =>
      [["session", { kind, generation: 7, expiresAt: now + 100 }]] as [string, unknown][]),
    [["config", {}]], [["oauth-registration-budget", { hour: {}, day: {}, ips: {} }]],
    [["agent-metadata", { workspace: "workspace", entries: [] }]], [["agent-cleaned-until", now + 1]],
    [["session", { kind: "user", expiresAt: now + 100 }], ["repositoryCache", {}], ["repositoryCache:0", "cache"]],
    [["session", { kind: "agent-hub", grants: [], expiresAt: now + 100 }]],
  ];
  for (const entries of values) {
    const store = memory(entries);
    assert.equal((await clean(store)).status, "kept");
    assert.deepEqual(store.calls, { deletes: [], all: 0, deleteAlarm: 0, writes: [] });
  }
});

test("live legacy content requires browser recovery; pending commands remain unresolved and untouched", async () => {
  const entries: [string, unknown][] = [["session", { kind: "agent-hub", grants: [], expiresAt: now + 1,
    commands: [{ state: "pending" }, { state: "applied" }], context: {} }], ["drafts", {}]];
  const store = memory(entries);
  const result = await clean(store);
  assert.equal(result.reason, "awaiting-browser-recovery"); assert.equal(result.unresolvedCommands, 1);
  assert.equal(store.calls.all, 0); assert.deepEqual(store.calls.deletes, []); assert.deepEqual([...store.map], entries);
});

test("legacy expiry requires five-minute clock margin and every grant expiry; orphan mirrors can expire", async () => {
  const hub = { kind: "agent-hub", expiresAt: now - 300_000, grants: [{ id: "grant", expiresAt: now + 10 }], context: {} };
  const store = memory([["session", hub], ["drafts", {}]]);
  assert.equal((await clean(store)).reason, "awaiting-browser-recovery");
  hub.grants = [];
  assert.equal((await clean(store, { now: now - 1 })).reason, "awaiting-browser-recovery");
  assert.equal((await clean(store)).method, "deleteAll");
  const orphan = memory([["context", {}], ["drafts", {}], ["requests", []]]);
  assert.equal((await clean(orphan)).method, "deleteAll");
});

test("unknown keys and malformed records require review; unknown legacy command outcomes are reported", async () => {
  for (const entry of [["unknown-secret-key", "secret-body"], ["agent-cleaned-until", "invalid"],
    ["agent-lifecycle", {}], ["alarm-deadlines", { strange: 1 }],
    ["session", { kind: "agent-hub", expiresAt: 1, grants: [], commands: [{ state: "unknown" }] }]] satisfies [string, unknown][]) {
    const store = memory([entry]); const result = await clean(store);
    assert.equal(result.status, "review"); assert.equal(store.calls.all, 0); assert.deepEqual(store.calls.deletes, []);
    if (entry[0] === "session") assert.equal(result.unresolvedCommands, 1);
    assert.ok(!JSON.stringify(result).includes("secret"));
  }
});

test("oversized objects and open sockets defer without deleting", async () => {
  const large = memory(Array.from({ length: 2050 }, (_, n) => [`draft:${id(n)}`, "draft"]));
  assert.equal((await clean(large)).reason, "oversized"); assert.equal(large.calls.all, 0);
  const store = memory([["session", { kind: "user", expiresAt: 1 }]]);
  assert.equal((await clean(store, { sockets: 1 })).reason, "present"); assert.equal(store.calls.all, 0);
  assert.equal((await clean(memory([]), { sockets: 1 })).reason, "present");
});

test("fingerprints detect generation, expiry, key and same-size nested grant changes", async () => {
  for (const change of ["generation", "expiry", "key", "nested"]) {
    const session = { kind: change === "nested" ? "agent-hub" : "agent", generation: 7, expiresAt: now - 500_000,
      grants: [{ id: id(1), generation: 7, expiresAt: now - 500_000 }] };
    const store = memory([["session", session]]); const expected = (await inventory(store)).fingerprint;
    if (change === "generation") session.generation++;
    if (change === "expiry") session.expiresAt++;
    if (change === "key") store.map.set("agent-cleaned-until", now + 1);
    if (change === "nested") session.grants[0].generation++;
    assert.equal((await clean(store, { expected })).reason, "changed"); assert.equal(store.calls.all, 0);
  }
});

test("real SessionStore gates generation updates at every cleanup storage await", async () => {
  for (const method of ["deleteAll", "keys"] as const) {
    const count = await forEachAwait(race => {
      const run: {
        runtime?: Awaited<ReturnType<typeof startCountedWorker>>;
        done: Promise<void>; update?: Promise<Response>; outcome?: Outcome;
        next: { kind: string; generation: number; expiresAt: number };
      } = { done: Promise.resolve(), next: { kind: "user", generation: 8, expiresAt: Date.now() + 86_400_000 } };
      run.done = (async () => {
        const runtime = run.runtime = await startCountedWorker();
        const storage = runtime.storage("cleanup-race");
        await storage.put("session", { kind: "agent", generation: 7, expiresAt: Date.now() - 60_000 });
        // Force a per-key path with a retained fence, or a wholly disposable object.
        if (method === "keys") await storage.put("agent-cleaned-until", run.next.expiresAt);
        const stub = runtime.namespace.get("cleanup-race");
        const classification = await (await stub.fetch(new Request("https://session.internal/maintenance/inventory", { method: "POST" }))).json() as Classification;
        const list = storage.list.bind(storage), getAlarm = storage.getAlarm.bind(storage);
        const deleteAll = storage.deleteAll.bind(storage), remove = storage.delete.bind(storage);
        const deleteAlarm = storage.deleteAlarm.bind(storage), setAlarm = storage.setAlarm.bind(storage), put = storage.put.bind(storage);
        Object.assign(storage, {
          list: race.port("list", (input: Parameters<typeof list>[0]) => list(input)),
          getAlarm: race.port("getAlarm", () => getAlarm()),
          deleteAll: race.port("deleteAll", () => deleteAll()),
          delete: race.port("delete", (keys: string[]) => remove(keys)),
          deleteAlarm: race.port("deleteAlarm", () => deleteAlarm()),
          setAlarm: race.port("setAlarm", (at: number) => setAlarm(at)),
          put: race.port("put", (key: string, value: unknown) => put(key, value)),
        });
        try {
          run.outcome = await (await stub.fetch(internal({ expected: classification.fingerprint,
            allowance: 2, wakeDay: method === "keys" ? day(run.next.expiresAt) : undefined }))).json() as Outcome;
        } finally { await runtime.worker.dispose(); }
      })();
      return run;
    }, run => {
      const runtime = run.runtime!;
      assert.equal(runtime.inCriticalSection("cleanup-race"), true);
      // Start the concurrent event, but do not await it while cleanup holds the
      // gate. forEachAwait now releases cleanup; the queued writer follows it.
      run.update = runtime.namespace.get("cleanup-race").fetch(new Request("https://session.internal/", {
        method: "PUT", body: JSON.stringify(run.next),
      }));
    }, async run => {
      assert.equal((await run.update!).status, 204);
      assert.equal(run.outcome?.method, method);
      const storage = run.runtime!.storage("cleanup-race");
      assert.deepEqual(await storage.get("session"), run.next);
      assert.equal(await storage.get("repositoryCacheGeneration"), 1);
      assert.equal(await storage.get("repositoryCache"), undefined);
      assert.deepEqual(await storage.get("alarm-deadlines"), { session: run.next.expiresAt });
      assert.equal(await storage.getAlarm(), run.next.expiresAt);
      if (method === "keys") assert.equal(await storage.get("agent-cleaned-until"), run.next.expiresAt);
    });
    assert.ok(count >= 5, `${method} must exercise classification and deletion awaits`);
  }
});

test("missing or mismatched wake day defers budget before any storage mutation", async () => {
  for (const wakeDay of [undefined, day(now - 86_400_000), day(now + 2 * 86_400_000)]) {
    const store = memory([["session", { kind: "user", expiresAt: now + 86_400_000 }],
      ["oauth-pending", { expired: { expiresAt: now - 1 } }]]);
    const before = structuredClone([...store.map]);
    const expected = (await inventory(store)).fingerprint;
    const result = await (await cleanupObject(internal({ expected, allowance: 2, wakeDay }), store.storage, { sockets: 0, now })).json() as Outcome;
    assert.equal(result.status, "deferred"); assert.equal(result.reason, "budget"); assert.equal(result.invocations, 1);
    assert.deepEqual(store.calls, { deletes: [], all: 0, deleteAlarm: 0, writes: [] });
    assert.deepEqual([...store.map], before); assert.equal(store.alarm, now);
  }
});

test("expiry is rechecked now: crossing expiry requires reinventory, extension prevents deletion", async () => {
  const session = { kind: "agent", generation: 1, expiresAt: now + 10 };
  const store = memory([["session", session]]); const expected = (await inventory(store)).fingerprint;
  assert.equal((await clean(store, { expected, now: now + 11 })).reason, "changed");
  assert.equal((await clean(store, { now: now + 11 })).method, "deleteAll");
  const extended = memory([["session", { ...session, expiresAt: now - 1 }]]);
  const old = (await inventory(extended)).fingerprint;
  extended.map.set("session", { ...session, expiresAt: now + 100 });
  assert.equal((await clean(extended, { expected: old })).reason, "changed");
  assert.equal((await clean(extended)).status, "kept");
});

test("fingerprint is stable across list ordering, changes without revealing keys, and sanitizes as optional", async () => {
  const entries: [string, unknown][] = [["config", {}], ["agent-cleaned-until", now + 10]];
  const a = await inventory(memory(entries)), b = await inventory(memory([...entries].reverse()));
  assert.match(a.fingerprint, /^[a-f0-9]{64}$/); assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(sanitizeClassification(a).fingerprint, a.fingerprint);
  assert.equal(sanitizeClassification({ ...a, fingerprint: token }).fingerprint, undefined);
});

test("retained alarm wakes are included in allowance; unbounded lifecycle chains are deferred", async () => {
  const store = memory([["session", { kind: "user", expiresAt: 1 }], ["agent-cleaned-until", now + 100]]);
  assert.equal((await clean(store, { allowance: 1 })).reason, "budget"); assert.equal(store.calls.all, 0);
  assert.deepEqual(store.calls.deletes, []); assert.deepEqual(store.calls.writes, []);
  const unbounded = memory([["session", { kind: "user", expiresAt: 1 }], ["agent-metadata", { workspace: "w", entries: [] }],
    ["alarm-deadlines", { "agent-cleanup": now + 100 }]]);
  assert.equal((await clean(unbounded)).reason, "budget"); assert.deepEqual(unbounded.calls.deletes, []);
});

test("internal handler rejects invalid methods and body before reads", async () => {
  const store = memory([]); let reads = 0;
  store.storage.list = async () => { reads++; return new Map(); };
  assert.equal((await cleanupObject(new Request("https://session.internal/maintenance/cleanup"), store.storage, { sockets: 0 })).status, 405);
  assert.equal((await cleanupObject(internal({ allowance: 0 }), store.storage, { sockets: 0 })).status, 400);
  assert.equal(reads, 0);
});

test("default script prints redacted local plan with zero network calls and no credentials", async t => {
  const f = fixture(t, 2);
  const result = await runCleanup(options, { ...f.ports, env: {}, fetch: async () => { throw new Error("No network"); } });
  assert.equal(result.status, "plan"); assert.equal(result.plan.eligible, 2);
  assert.equal(existsSync(f.cleanupPath), false); assert.ok(!result.line.includes(id(1)));
  assert.ok(!result.line.includes(token)); assert.equal(f.lines.length, 1);
});

test("nested invocations are charged in full and excess stops the batch", async t => {
  const f = fixture(t, 2); let calls = 0;
  const result = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return reply({ invocations: 3 }); } });
  assert.equal(result.status, "limited"); assert.equal(calls, 1); assert.equal(json(f.budgetPath).count, 3);
});

test("cleanup reserves before network, never refunds, protects checkpoint permissions and excludes raw ids", async t => {
  const f = fixture(t);
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => {
    assert.equal(json(f.budgetPath).count, 1); assert.equal(json(f.cleanupPath).objects[0].status, "reserved");
    return reply({ unresolvedCommands: 2 });
  } });
  assert.equal(statSync(f.dir).mode & 0o777, 0o700); assert.equal(statSync(f.cleanupPath).mode & 0o777, 0o600);
  assert.ok(!readFileSync(f.cleanupPath, "utf8").includes(id(1))); assert.ok(!readFileSync(f.cleanupPath, "utf8").includes(token));
  assert.equal(json(f.cleanupPath).objects[0].key, createHash("sha256").update(id(1)).digest("hex"));
  assert.equal(json(f.cleanupPath).objects[0].unresolvedCommands, 2);
});

test("inventory and cleanup share invocation ceiling; row ledger and future fields survive inventory", async t => {
  const f = fixture(t);
  writeManifest(f.budgetPath, { account: options.account, namespace: options.namespace, day: "2026-10-19", count: 998, rows: 321, extraLedger: { value: 7 } });
  await runInventory(options, { ...f.ports, env: { CLOUDFLARE_API_TOKEN: "fake", MAINTENANCE_INVENTORY_TOKEN: token }, path: join(f.dir, "inventory-other.json"),
    fetch: async (url: string) => url.includes("api.cloudflare.com") ? Response.json({ success: true, result: [{ id: id(2), hasStoredData: true }] }) : Response.json({ ...f.manifest.objects[0].classification }) });
  assert.equal(json(f.budgetPath).count, 999); assert.equal(json(f.budgetPath).rows, 321);
  assert.deepEqual(json(f.budgetPath).extraLedger, { value: 7 });
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => reply() });
  assert.equal(json(f.budgetPath).count, 1000);
  const next = fixture(t);
  const result = await runCleanup({ ...options, delete: true }, { ...next.ports, budgetPath: f.budgetPath, fetch: async () => { throw new Error("No budget"); } });
  assert.equal(result.status, "limited"); assert.equal(json(f.budgetPath).count, 1000);
});

test("cleanup reserves the latest retained expiry day before calling; both daily ceilings apply", async t => {
  for (const sameDay of [false, true]) {
    const f = fixture(t);
    const expiry = now + (sameDay ? 1000 : 86_400_000);
    const store = memory([["session", { kind: "user", expiresAt: expiry }],
      ["agent-cleaned-until", expiry + 1000], ["oauth-pending", { old: { expiresAt: now - 1 } }]]);
    f.manifest.objects[0].classification = await inventory(store); f.save();
    const wakeDay = day(expiry + 1000);
    writeManifest(f.budgetPath, { account: options.account, namespace: options.namespace, day: day(now),
      count: sameDay ? 999 : 998, scheduled: sameDay ? {} : { [wakeDay]: 1000 } });
    const blocked = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { throw new Error("No room for wake"); } });
    assert.equal(blocked.status, "limited");
    assert.equal(json(f.budgetPath).count, sameDay ? 999 : 998);
    writeManifest(f.budgetPath, { ...json(f.budgetPath), count: sameDay ? 998 : 999, scheduled: sameDay ? {} : { [wakeDay]: 999 } });
    let calls = 0;
    await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
      calls++;
      assert.equal(json(f.budgetPath).count, 1000);
      assert.deepEqual(json(f.budgetPath).scheduled, sameDay ? {} : { [wakeDay]: 1000 });
      assert.equal(json(f.cleanupPath).objects[0].wakeDay, wakeDay);
      assert.equal(JSON.parse(String(init.body)).wakeDay, wakeDay);
      return cleanupObject(internal(JSON.parse(String(init.body))), store.storage, { sockets: 0, now });
    } });
    assert.equal(calls, 1); assert.equal(store.alarm, expiry + 1000);
    assert.equal(json(f.cleanupPath).objects[0].status, "deleted");
  }
});

test("midnight imports 500 reserved wakes: inventory and cleanup admit only 500 more calls together", async t => {
  const f = fixture(t, 520);
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => reply() });
  const tomorrow = now + 86_400_000, laterDay = day(now + 2 * 86_400_000);
  writeManifest(f.budgetPath, { ...json(f.budgetPath), count: 1000, rows: 4999,
    scheduled: { [day(now)]: 7, [day(tomorrow)]: 500, [laterDay]: 41 } });
  let inventoryCalls = 0, cleanupCalls = 0;
  const inspect = (path: string) => runInventory({ ...options, limit: 100 }, { ...f.ports, path: join(f.dir, path), clock: () => tomorrow,
    env: { CLOUDFLARE_API_TOKEN: "fake", MAINTENANCE_INVENTORY_TOKEN: token },
    fetch: async (url: string) => {
      if (url.includes("api.cloudflare.com")) return Response.json({ success: true,
        result: Array.from({ length: 101 }, (_, n) => ({ id: id(n + 1000), hasStoredData: true })) });
      inventoryCalls++; return Response.json(f.manifest.objects[0].classification);
    } });
  const remove = () => runCleanup({ ...options, delete: true, canaryVerified: true, rowsPerKey: 1, rowsPerObject: 1, limit: 100 },
    { ...f.ports, clock: () => tomorrow, fetch: async () => { cleanupCalls++; return reply(); } });
  await inspect("first.json");
  assert.equal(json(f.budgetPath).count, 600); assert.equal(json(f.budgetPath).rows, 0);
  assert.deepEqual(json(f.budgetPath).scheduled, { [laterDay]: 41 });
  await remove(); await inspect("second.json"); await remove(); await remove();
  assert.equal(inventoryCalls, 200); assert.equal(cleanupCalls, 300);
  assert.equal(json(f.budgetPath).count, 1000); assert.equal(json(f.budgetPath).rows, 600);
  assert.equal((await inspect("last.json")).status, "limited");
  assert.equal((await remove()).status, "limited");
  assert.equal(inventoryCalls + cleanupCalls, 500);
  assert.deepEqual(json(f.budgetPath).scheduled, { [laterDay]: 41 });
});

test("future reservations validate, survive manifest reload, and roll forward after skipped days", t => {
  const f = fixture(t);
  const previous = { day: day(now), count: 20, scheduled: { [day(now + 86_400_000)]: 500, [day(now + 2 * 86_400_000)]: 30 } };
  f.manifest.budget = previous; f.save();
  assert.deepEqual(readManifest(f.path, options, now).budget.scheduled, previous.scheduled);
  assert.deepEqual(readManifest(f.path, { ...options, rescan: true }, now).budget.scheduled, previous.scheduled);
  const ledger = maintenanceBudget(f.budgetPath, options, previous, () => now);
  assert.equal(reserveMaintenance(ledger.budget, now + 2 * 86_400_000), true);
  assert.equal(ledger.budget.count, 31); assert.deepEqual(ledger.budget.scheduled, {});
  // A manifest ahead of the shared ledger must not erase that day's wake charge.
  writeManifest(f.budgetPath, { account: options.account, namespace: options.namespace, ...previous });
  assert.equal(maintenanceBudget(f.budgetPath, options, { day: day(now + 86_400_000), count: 5 }, () => now).budget.count, 500);
  for (const scheduled of [null, [], { "2026-02-30": 1 }, { "tomorrow": 1 }, { [day(now)]: -1 }, { [day(now)]: 1.5 }]) {
    writeManifest(f.budgetPath, { account: options.account, namespace: options.namespace, day: day(now), count: 0, scheduled });
    assert.throws(() => maintenanceBudget(f.budgetPath, options, { day: "", count: 0 }, () => now), /Invalid namespace budget/);
  }
});

test("lost-response retries reuse wakeDay despite rescan and charge both days again without refunds", async t => {
  const f = fixture(t);
  const expiry = now + 86_400_000;
  const store = memory([["session", { kind: "user", expiresAt: expiry }], ["oauth-pending", { old: { expiresAt: now - 1 } }]]);
  f.manifest.objects[0].classification = await inventory(store); f.save();
  const first = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
    assert.equal((await (await cleanupObject(internal(JSON.parse(String(init.body))), store.storage, { sockets: 0, now })).json() as Outcome).status, "deleted");
    throw new Error("Lost response");
  } });
  assert.equal(first.status, "interrupted");
  assert.equal(json(f.budgetPath).count, 1); assert.deepEqual(json(f.budgetPath).scheduled, { [day(expiry)]: 1 });
  assert.equal(json(f.cleanupPath).objects[0].wakeDay, day(expiry));
  f.manifest.objects[0].classification.records[0].latestExpiresAt = expiry + 86_400_000; f.save();
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.wakeDay, day(expiry)); assert.equal(body.allowance, 2);
    assert.equal(json(f.budgetPath).count, 2); assert.deepEqual(json(f.budgetPath).scheduled, { [day(expiry)]: 2 });
    return cleanupObject(internal(body), store.storage, { sockets: 0, now });
  } });
  assert.equal(store.calls.deletes.length, 1);
  // The second response needed no wake; both reservations remain charged.
  assert.deepEqual(json(f.budgetPath).scheduled, { [day(expiry)]: 2 });
});

test("crash after reserve re-sends once, charges twice, and never deletes twice", async t => {
  const f = fixture(t); const store = memory([["session", { kind: "user", expiresAt: 1 }]]);
  f.manifest.objects[0].classification = await inventory(store); f.save();
  const first = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
    const result = await cleanupObject(internal(JSON.parse(String(init.body))), store.storage, { sockets: 0, now });
    assert.equal((await result.json() as Outcome).method, "deleteAll");
    throw new Error(`${token} crashed after deletion`);
  } });
  assert.equal(first.status, "interrupted"); assert.equal(json(f.cleanupPath).objects[0].status, "reserved");
  let calls = 0;
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
    calls++; return cleanupObject(internal(JSON.parse(String(init.body))), store.storage, { sockets: 0, now });
  } });
  assert.equal(calls, 1); assert.equal(store.calls.all, 1); assert.equal(json(f.budgetPath).count, 2);
  assert.ok(!f.lines.join("").includes(token));
});

test("429/503 save shared Retry-After cooldown and explicit resume does not spin", async t => {
  for (const status of [429, 503]) {
    const f = fixture(t); let calls = 0;
    const first = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => {
      calls++; return new Response(token, { status, headers: { "Retry-After": "60" } });
    } });
    assert.equal(first.status, "paused"); assert.equal(json(f.budgetPath).notBefore, now + 60_000);
    const stopped = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return reply(); } });
    assert.equal(stopped.status, "paused"); assert.equal(calls, 1);
    await runCleanup({ ...options, delete: true }, { ...f.ports, clock: () => now + 60_001, fetch: async () => { calls++; return reply(); } });
    assert.equal(calls, 2); assert.equal(json(f.budgetPath).count, 2);
  }
});

test("inaccessible responses and malformed or network outcomes stop without leaking secrets", async t => {
  for (const status of [401, 403, 200, 0]) {
    const f = fixture(t, 2); let calls = 0;
    const result = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => {
      calls++; if (!status) throw new Error(token); return Response.json({ secret: token }, { status });
    } });
    assert.equal(calls, 1); assert.equal(result.status, [401, 403].includes(status) ? "inaccessible" : "interrupted");
    assert.ok(!(readFileSync(f.cleanupPath, "utf8") + f.lines.join("")).includes(token));
  }
});

test("canary is limited to ten distinct objects across runs; batches need flag and accounting", async t => {
  const f = fixture(t, 12); let calls = 0;
  const fetcher = async () => { calls++; return reply(); };
  await runCleanup({ ...options, delete: true, limit: 6 }, { ...f.ports, fetch: fetcher });
  assert.equal(calls, 6);
  const second = await runCleanup({ ...options, delete: true, limit: 6 }, { ...f.ports, fetch: fetcher });
  assert.equal(calls, 10); assert.equal(second.status, "canary-complete");
  assert.equal((await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: fetcher })).status, "canary-complete");
  assert.equal((await runCleanup({ ...options, delete: true, canaryVerified: true }, { ...f.ports, fetch: fetcher })).status, "needs-accounting");
  assert.equal(calls, 10);
  await runCleanup({ ...options, delete: true, canaryVerified: true, rowsPerKey: 2, rowsPerObject: 3 }, { ...f.ports, fetch: fetcher });
  assert.equal(calls, 12); assert.equal(json(f.budgetPath).rows, 10);
});

test("canaries skip objects over 128 keys; unknown, review, oversized and no-fingerprint are never sent", async t => {
  const f = fixture(t, 7);
  f.manifest.objects[0].classification.records[0] = { kind: "unknown", count: 1, bytes: 1, eligibility: "review" };
  f.manifest.objects[1].classification.records[0].eligibility = "review";
  f.manifest.objects[2].status = "deferred"; f.manifest.objects[2].classification.status = "deferred";
  delete f.manifest.objects[3].classification.fingerprint;
  f.manifest.objects[4].classification.records[0].eligibility = "legacy-candidate";
  f.manifest.objects[5].classification.totalKeys = 129;
  f.save(); const sent: string[] = [];
  const result = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).id); return reply();
  } });
  assert.deepEqual(sent, [id(7)]); assert.equal(result.report.review, 2);
  const plan = await runCleanup(options, f.ports);
  assert.equal(plan.plan.oversized, 1); assert.equal(plan.plan["needs-reinventory"], 1); assert.equal(plan.plan["awaiting-browser-recovery"], 1);
});

test("batch limit is at most 100 objects and row ceiling refuses before the call", async t => {
  const f = fixture(t, 120); let calls = 0;
  const fetcher = async () => { calls++; return reply(); };
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: fetcher });
  const batch = await runCleanup({ ...options, delete: true, canaryVerified: true, rowsPerKey: 1, rowsPerObject: 1, limit: 100 }, { ...f.ports, fetch: fetcher });
  assert.equal(batch.status, "limited"); assert.equal(calls, 110); assert.equal(json(f.budgetPath).rows, 200);
  writeManifest(f.budgetPath, { ...json(f.budgetPath), rows: 4999 });
  const stopped = await runCleanup({ ...options, delete: true, canaryVerified: true, rowsPerKey: 1, rowsPerObject: 1, limit: 100 }, { ...f.ports, fetch: fetcher });
  assert.equal(stopped.status, "limited"); assert.equal(calls, 110);
  await assert.rejects(runCleanup({ ...options, delete: true, limit: 101 }, f.ports));
});

test("rescan verification reports redacted totals, reappearance and unresolved commands; removes files only on success", async t => {
  const f = fixture(t);
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => reply({ unresolvedCommands: 2 }) });
  assert.equal((await runCleanup({ ...options, verify: true }, f.ports)).status, "verification-failed");
  assert.ok(existsSync(f.path)); assert.ok(existsSync(f.cleanupPath));
  await runInventory({ ...options, rescan: true }, { ...f.ports, clock: () => now + 1000,
    env: { CLOUDFLARE_API_TOKEN: "fake", MAINTENANCE_INVENTORY_TOKEN: token },
    fetch: async (url: string) => url.includes("api.cloudflare.com") ? Response.json({ success: true, result: [{ id: id(1), hasStoredData: true }] }) :
      Response.json(f.manifest.objects[0].classification) });
  const reappeared = await runCleanup({ ...options, verify: true }, f.ports);
  assert.equal(reappeared.report.reappeared, 1); assert.equal(reappeared.report.complete, false); assert.ok(existsSync(f.path));
  await runInventory({ ...options, rescan: true }, { ...f.ports, clock: () => now + 2000,
    env: { CLOUDFLARE_API_TOKEN: "fake", MAINTENANCE_INVENTORY_TOKEN: token },
    fetch: async () => Response.json({ success: true, result: [{ id: id(1), hasStoredData: false }] }) });
  const verified = await runCleanup({ ...options, verify: true }, { ...f.ports, env: {}, fetch: async () => { throw new Error("No verify calls"); } });
  assert.equal(verified.status, "complete"); assert.equal(verified.report.deleted, 1); assert.equal(verified.report.unresolvedCommands, 2);
  assert.deepEqual(Object.keys(verified.report), ["scanned", "classified", "deleted", "deferred", "unknown", "review", "inaccessible", "reappeared", "unresolvedCommands", "complete"]);
  assert.ok(!existsSync(f.path)); assert.ok(!existsSync(f.cleanupPath)); assert.ok(existsSync(f.budgetPath));
  assert.ok(!verified.line.includes(id(1))); assert.ok(!verified.line.includes(token));
});

test("verify needs complete rescan and permission; missing IDs in complete listing are absent", async t => {
  const f = fixture(t);
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => reply() });
  f.manifest.scanTime = now + 1000; f.manifest.batches = [{ start: now + 1000, end: now + 1001, calls: 0, status: "complete" }];
  f.manifest.objects = []; f.manifest.listComplete = false; f.save();
  assert.equal((await runCleanup({ ...options, verify: true }, f.ports)).report.complete, false);
  f.manifest.listComplete = true; f.manifest.permission = "inaccessible"; f.save();
  assert.equal((await runCleanup({ ...options, verify: true }, f.ports)).report.complete, false);
  f.manifest.permission = "confirmed"; f.save();
  assert.equal((await runCleanup({ ...options, verify: true }, f.ports)).report.complete, true);
});

test("shared namespace and checkpoint locks exclude concurrent writers", async t => {
  const f = fixture(t);
  const release = maintenanceLock(f.budgetPath, "Namespace budget");
  await assert.rejects(runCleanup({ ...options, delete: true }, f.ports), /Namespace budget is locked/); release();
  const releaseCleanup = maintenanceLock(f.cleanupPath, "Cleanup checkpoint");
  await assert.rejects(runCleanup({ ...options, delete: true }, f.ports), /Cleanup checkpoint is locked/); releaseCleanup();
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => {
    await assert.rejects(runInventory(options, { ...f.ports, env: { CLOUDFLARE_API_TOKEN: "fake", MAINTENANCE_INVENTORY_TOKEN: token } }), /Namespace budget is locked/);
    return reply();
  } });
});

test("CLI validates options, prints help and never echoes secrets on failure", async () => {
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.deepEqual(parseArgs(["--delete", "--canary-verified", "--rows-per-key", "2", "--rows-per-object", "3"]),
    { delete: true, canaryVerified: true, rowsPerKey: 2, rowsPerObject: 3 });
  for (const args of [["--token", token], ["--delete", "--delete"], ["--verify", "--delete"], ["--limit"]]) assert.throws(() => parseArgs(args));
  const script = "scripts/agents/durable-cleanup.mjs";
  assert.match(execFileSync(process.execPath, [script, "--help"], { encoding: "utf8" }), /Without --delete/);
  try { execFileSync(process.execPath, [script, "--token", token], { stdio: "pipe" }); assert.fail("Expected failure"); }
  catch (error) {
    const failure = error as { stderr: Buffer };
    assert.ok(!failure.stderr.toString().includes(token)); assert.match(failure.stderr.toString(), /RESULT: failed durable-cleanup/);
  }
});

test("retained session and fence need one wake at their latest expiry; live lifecycle fences survive", async () => {
  const store = memory([["session", { kind: "user", expiresAt: now + 200 }], ["agent-cleaned-until", now + 100],
    ["repositoryCache:expired", { expiresAt: now - 1 }], ["oauth-pending", { old: { expiresAt: now - 1 } }]]);
  const result = await clean(store, { allowance: 2 });
  assert.equal(result.invocations, 2); assert.equal(store.alarm, now + 200);
  assert.equal(store.map.has("repositoryCache:expired"), true); assert.equal(store.map.has("oauth-pending"), false);
  assert.equal(result.keptKeys, store.map.size);
  const fenced = memory([["agent-lifecycle", { generation: 7, cleaned: { [id(1)]: now + 100 } }]]);
  assert.equal((await clean(fenced)).status, "kept"); assert.equal(fenced.calls.all, 0);
});

test("an empty pass can be verified later; old inventory never falsely reports reappearance", async t => {
  const f = fixture(t);
  const first = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => reply() });
  assert.equal(first.report.reappeared, 0); assert.equal(first.report.deferred, 0);
  const empty = fixture(t, 0);
  await runCleanup({ ...options, delete: true }, { ...empty.ports, fetch: async () => { throw new Error("No candidates"); } });
  assert.ok(existsSync(empty.cleanupPath));
  empty.manifest.scanTime = now + 10; empty.manifest.batches = [{ start: now + 10, end: now + 10, status: "complete", calls: 0 }]; empty.save();
  assert.equal((await runCleanup({ ...options, verify: true }, empty.ports)).status, "complete");
});

test("quota without Retry-After still saves a cooldown and no repeated call is made", async t => {
  const f = fixture(t); let calls = 0;
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return new Response(null, { status: 429 }); } });
  assert.equal(json(f.budgetPath).notBefore, now + 60_000);
  assert.equal((await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return reply(); } })).status, "paused");
  assert.equal(calls, 1);
});

test("hard crash keeps fail-closed locks; inspected lock removal resumes the reserved operation", async t => {
  const f = fixture(t);
  const code = `import { runCleanup } from './scripts/agents/durable-cleanup.mjs';
    await runCleanup(${JSON.stringify({ ...options, delete: true })}, {
      path: ${JSON.stringify(f.path)}, clock: () => ${now}, env: { MAINTENANCE_CLEANUP_TOKEN: 'x'.repeat(32) },
      fetch: async () => process.exit(99)
    });`;
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", code], { stdio: "pipe" }));
  assert.equal(json(f.budgetPath).count, 1); assert.equal(json(f.cleanupPath).objects[0].status, "reserved");
  await assert.rejects(runCleanup({ ...options, delete: true }, f.ports), /Namespace budget is locked/);
  // These test-owned locks have been inspected after the child exited. Production
  // operators must do the same; neither tool silently steals another run's lock.
  for (const path of [f.path, f.cleanupPath, f.budgetPath]) rmSync(`${path}.lock`);
  let calls = 0;
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return reply(); } });
  assert.equal(calls, 1); assert.equal(json(f.budgetPath).count, 2);
});

test("reserved operation resumes against an empty rescan without losing its original cost bound", async t => {
  const f = fixture(t); let calls = 0;
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { throw new Error("Lost response"); } });
  f.manifest.objects[0] = { id: id(1), hasStoredData: false, status: "empty" }; f.save();
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async (_url: string, init: RequestInit) => {
    calls++; assert.deepEqual(JSON.parse(String(init.body)), { id: id(1), expected: id(1000), allowance: 1 });
    return reply({ status: "kept", method: undefined, deletedKeys: 0, keptKeys: 0 });
  } });
  assert.equal(calls, 1); assert.equal(json(f.budgetPath).count, 2);
});

test("a fresh complete scan can prove a lost-response object is empty; pre-reserved command count survives", async t => {
  const f = fixture(t);
  f.manifest.objects[0].classification.records[0].commandsByState = { pending: 3, unknown: 0 };
  // Legacy command totals are sanitized only on their owning hub record.
  f.manifest.objects[0].classification.records[0].kind = "legacy-agent-hub"; f.save();
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { throw new Error("Lost response"); } });
  f.manifest.objects[0] = { id: id(1), hasStoredData: false, status: "empty" };
  f.manifest.scanTime = now + 10; f.manifest.batches = [{ start: now + 10, end: now + 11, calls: 0, status: "complete" }]; f.save();
  const verified = await runCleanup({ ...options, verify: true }, f.ports);
  assert.equal(verified.status, "complete"); assert.equal(verified.report.unresolvedCommands, 3);
  assert.equal(verified.report.deleted, 0); assert.equal(verified.report.deferred, 0);
});

test("a per-key pass that kept preserved records verifies; expired content found again is reappearance", async t => {
  const f = fixture(t);
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => reply({ method: "keys", deletedKeys: 3, keptKeys: 2, invocations: 1 }) });
  const rescan = (records: { kind: string; count: number; bytes: number; eligibility: string }[], at: number) =>
    runInventory({ ...options, rescan: true }, { ...f.ports, clock: () => now + at,
      env: { CLOUDFLARE_API_TOKEN: "fake", MAINTENANCE_INVENTORY_TOKEN: token },
      fetch: async (url: string) => url.includes("api.cloudflare.com") ? Response.json({ success: true, result: [{ id: id(1), hasStoredData: true }] }) :
        Response.json({ schema: "durable-inventory", version: 1, status: "classified", fingerprint: id(2000 + at), totalKeys: records.length,
          totalBytes: 20, alarm: now + 60_000, records }) });
  await rescan([{ kind: "sign-in-session", count: 1, bytes: 10, eligibility: "expired" }], 1000);
  const again = await runCleanup({ ...options, verify: true }, f.ports);
  assert.equal(again.report.reappeared, 1); assert.equal(again.report.complete, false); assert.ok(existsSync(f.path));
  await rescan([{ kind: "record-fence", count: 1, bytes: 10, eligibility: "preserve" }, { kind: "alarm-deadlines", count: 1, bytes: 10, eligibility: "preserve" }], 2000);
  const verified = await runCleanup({ ...options, verify: true }, f.ports);
  assert.equal(verified.report.reappeared, 0); assert.equal(verified.status, "complete"); assert.ok(!existsSync(f.path));
});

test("an expired hub with a malformed nested grant needs review and is never deleted", async () => {
  for (const grants of [[null], [{}], [{ id: 7 }], [{ id: "a", expiresAt: "soon" }], [{ id: "a" }, 7]]) {
    const store = memory([["session", { kind: "agent-hub", grants, expiresAt: now - 400_000 }]]);
    const outcome = await clean(store);
    assert.equal(outcome.status, "review");
    assert.equal(outcome.deletedKeys, 0);
    assert.equal(store.calls.all, 0); assert.deepEqual(store.calls.deletes, []); assert.deepEqual(store.calls.writes, []);
    assert.equal(store.map.size, 1);
  }
});

test("rows for a retained-record wake are reserved on its UTC day and count first after rollover", async () => {
  const budget: Record<string, unknown> = { day: "", count: 0, rows: 0 };
  const today = now, tomorrow = "2026-10-20";
  // A per-key cleanup today: 1 call + 3 rows now, its wake and 4 rows tomorrow.
  assert.equal(reserveMaintenance(budget, today, 1, 3, tomorrow, 4), true);
  assert.equal(budget.count, 1); assert.equal(budget.rows, 3);
  assert.deepEqual(budget.scheduled, { [tomorrow]: 1 }); assert.deepEqual(budget.scheduledRows, { [tomorrow]: 4 });
  // Tomorrow's batches cannot take the rows the wake needs.
  assert.equal(reserveMaintenance(budget, today, 0, 0, tomorrow, 4997), false);
  const next = Date.UTC(2026, 9, 20, 0, 1);
  assert.equal(reserveMaintenance(budget, next, 1, 4997), false);
  assert.equal(reserveMaintenance(budget, next, 1, 4996), true);
  assert.equal(budget.count, 2); assert.equal(budget.rows, 5000);
  assert.deepEqual(budget.scheduled, {}); assert.deepEqual(budget.scheduledRows, {});
  // Same-day wake rows are charged to today.
  const same: Record<string, unknown> = { day: "", count: 0, rows: 0 };
  assert.equal(reserveMaintenance(same, today, 1, 2, "2026-10-19", 5), true);
  assert.equal(same.count, 2); assert.equal(same.rows, 7);
});

test("cleanup reserves the wake's rows from accounting: remaining keys plus the deadline table", async t => {
  const f = fixture(t);
  f.manifest.objects[0].classification.totalKeys = 3;
  f.manifest.objects[0].classification.records = [
    { kind: "legacy-agent-hub", count: 1, bytes: 10, eligibility: "expired" },
    { kind: "record-fence", count: 1, bytes: 10, eligibility: "preserve", latestExpiresAt: Date.UTC(2026, 9, 21, 3) } as never,
    { kind: "alarm-deadlines", count: 1, bytes: 10, eligibility: "preserve" },
  ];
  f.save();
  writeManifest(f.cleanupPath, { schema: "durable-cleanup-checkpoint", version: 1, account: "account", namespace: "namespace", deployment: "preview",
    canary: Array.from({ length: 10 }, (_, n) => id(500 + n)), objects: [], lastBatch: 0 });
  const bodies: { wakeDay?: string }[] = [];
  await runCleanup({ ...options, delete: true, canaryVerified: true, rowsPerKey: 2, rowsPerObject: 3 }, { ...f.ports,
    fetch: async (_url: string, init: { body: string }) => { bodies.push(JSON.parse(init.body)); return reply({ method: "keys", invocations: 2 }); } });
  assert.equal(bodies[0].wakeDay, "2026-10-21");
  const ledger = json(f.budgetPath);
  assert.equal(ledger.rows, 3 + 3 * 2);
  assert.deepEqual(ledger.scheduled, { "2026-10-21": 1 });
  assert.deepEqual(ledger.scheduledRows, { "2026-10-21": 3 + (3 + 1) * 2 });
});

test("an expired sign-in takes its unexpired pending ledger along; an orphan ledger keeps a wake at its expiry", async () => {
  const signedOut = memory([["session", { kind: "user", expiresAt: now - 1 }], ["oauth-pending", { live: { expiresAt: now + 60_000 } }]]);
  const gone = await clean(signedOut);
  assert.equal(gone.method, "deleteAll"); assert.equal(signedOut.map.size, 0); assert.equal(signedOut.alarm, null);
  const orphan = memory([["agent-cleaned-until", now - 1], ["oauth-pending", { live: { expiresAt: now + 60_000 } }]]);
  const kept = await clean(orphan, { allowance: 2 });
  assert.equal(kept.method, "keys"); assert.equal(kept.invocations, 2);
  assert.deepEqual([...orphan.map.keys()].sort(), ["alarm-deadlines", "oauth-pending"]);
  assert.equal(orphan.alarm, now + 60_000); assert.deepEqual(orphan.map.get("alarm-deadlines"), { session: now + 60_000 });
});

test("a presence deferral is retried by the next explicit run with an unchanged fingerprint", async t => {
  const f = fixture(t);
  let calls = 0;
  const first = await runCleanup({ ...options, delete: true }, { ...f.ports,
    fetch: async () => { calls++; return reply({ status: "deferred", reason: "present", method: undefined, deletedKeys: 0, keptKeys: 1 }); } });
  assert.equal(first.status, "complete"); assert.equal(json(f.cleanupPath).objects[0].reason, "present");
  const second = await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return reply(); } });
  assert.equal(calls, 2); assert.equal(second.report.deleted, 1); assert.equal(json(f.cleanupPath).objects[0].status, "deleted");
  await runCleanup({ ...options, delete: true }, { ...f.ports, fetch: async () => { calls++; return reply(); } });
  assert.equal(calls, 2);
});
