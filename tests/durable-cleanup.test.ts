import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { handle, type Env } from "../worker/app.ts";
import { cleanupObject, inventoryObject } from "../worker/agent-maintenance.ts";
// @ts-expect-error Plain Node ESM intentionally has no declarations.
import { parseArgs, runCleanup } from "../scripts/agents/durable-cleanup.mjs";
// @ts-expect-error Plain Node ESM intentionally has no declarations.
import { maintenanceLock, readManifest, runInventory, sanitizeClassification, writeManifest } from "../scripts/agents/durable-inventory.mjs";

const now = Date.UTC(2026, 9, 19, 12);
const token = "cleanup-secret-".repeat(4);
const id = (n: number) => n.toString(16).padStart(64, "0");
const options = { account: "account", namespace: "namespace", deployment: "preview", maintenanceUrl: "https://editor.example" };
const internal = (body?: unknown) => new Request("https://session.internal/maintenance/cleanup", {
  method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
interface Classification {
  schema: string; version: number; status: string; fingerprint: string; totalKeys: number;
  totalBytes: number; alarm: number | null; records: { kind: string; count: number; bytes: number; eligibility: string }[];
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
  const expected = input.expected ?? (await inventory(store, input.now)).fingerprint;
  return (await cleanupObject(internal({ expected, allowance: input.allowance ?? 10 }), store.storage,
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
        get: () => ({ fetch: async () => { if (throws) throw new Error(token); return new Response(token, { status: 503 }); } }) } };
    const result = await handle(new Request("https://editor.example/__maintenance/cleanup", { method: "POST",
      headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: id(1), expected: id(2), allowance: 1 }) }), environment);
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "Cleanup unavailable" });
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
  const hub = { kind: "agent-hub", expiresAt: now - 300_000, grants: [{ expiresAt: now + 10 }], context: {} };
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
