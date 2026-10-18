import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { handle, type Env } from "../worker/app.ts";
import { inventoryObject } from "../worker/agent-maintenance.ts";
// @ts-expect-error Plain Node ESM intentionally has no declarations.
import { inventoryReport, manifestPath, parseArgs, readManifest, reserveMaintenance, runInventory, sanitizeClassification, writeManifest } from "../scripts/agents/durable-inventory.mjs";

const token = "maintenance-secret-".repeat(3);
const apiToken = "cloudflare-api-secret";
const now = Date.UTC(2026, 9, 18, 12);
const id = (value: number) => value.toString(16).padStart(64, "0");
const options = { account: "account", namespace: "namespace", deployment: "preview", maintenanceUrl: "https://editor.example" };
const env = { CLOUDFLARE_API_TOKEN: apiToken, MAINTENANCE_INVENTORY_TOKEN: token };
const internal = () => new Request("https://session.internal/maintenance/inventory", { method: "POST" });
const blank = () => ({ schema: "durable-inventory", version: 1, status: "classified", totalKeys: 0, totalBytes: 0, alarm: null, records: [] });
interface Summary {
  kind: string; count: number; bytes: number; eligibility: string;
  earliestExpiresAt?: number; latestExpiresAt?: number; generation?: number;
  grants?: number; inlineContext?: boolean; commandsByState?: Record<string, number>;
}
interface Classification {
  status: string; reason?: string; totalKeys: number; totalBytes: number; alarm: number | null; records: Summary[];
}
function memory(entries: [string, unknown][]) {
  const map = new Map([...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  const calls: { startAfter?: string; limit: number }[] = [];
  return {
    calls,
    storage: {
      list: async (input: { startAfter?: string; limit: number }) => {
        calls.push(input);
        return new Map([...map].filter(([key]) => !input.startAfter || key > input.startAfter).slice(0, input.limit));
      },
      getAlarm: async () => now + 100,
    },
  };
}
function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "durable-inventory-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "manifest.json");
  const lines: string[] = [];
  return { path, lines, ports: { path, env, clock: () => now, stdout: (line: string) => lines.push(line) } };
}
function page(objects: { id: string; hasStoredData: boolean }[], cursor?: string) {
  return Response.json({ success: true, errors: [], result: objects, result_info: { cursor, count: objects.length } });
}

test("public inventory gates authorization and validates IDs before exactly one DO call", async () => {
  const calls: Request[] = [], ids: string[] = [];
  const environment: Env = {
    ASSETS: { fetch: async () => new Response("asset") },
    SESSIONS: {
      idFromName: () => { throw new Error("No named discovery"); },
      idFromString: (value) => { ids.push(value); return value; },
      get: (value: unknown) => { assert.equal(value, id(1)); return { fetch: async (request) => { calls.push(request); return Response.json(blank()); } }; },
    },
  };
  const send = (method = "POST", auth: string | undefined = token, body: unknown = { id: id(1) }) => handle(
    new Request(`${options.maintenanceUrl}/__maintenance/inventory`, {
      method, headers: auth ? { Authorization: `Bearer ${auth}` } : {},
      body: method === "GET" ? undefined : JSON.stringify(body),
    }), environment,
  );
  assert.equal((await send()).status, 404);
  environment.MAINTENANCE_INVENTORY_TOKEN = "short";
  assert.equal((await send()).status, 404);
  environment.MAINTENANCE_INVENTORY_TOKEN = token;
  assert.equal((await send("POST", "wrong")).status, 401);
  assert.equal((await send("POST", "")).status, 401);
  assert.equal((await send("GET")).status, 405);
  for (const bad of [id(1).toUpperCase().replace(/1$/, "A"), "short", "../../maintenance", 1, null]) {
    const result = await send("POST", token, { id: bad });
    assert.equal(result.status, 400);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
  }
  assert.deepEqual(ids, []);
  assert.deepEqual(calls, []);
  const good = await send();
  assert.equal(good.status, 200);
  assert.equal(good.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(ids, [id(1)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://session.internal/maintenance/inventory");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("Authorization"), null);
});

test("public paths never forward the internal maintenance route", async () => {
  let calls = 0;
  const environment: Env = {
    ASSETS: { fetch: async () => new Response("asset") },
    SESSIONS: {
      idFromName: () => { calls++; return ""; }, idFromString: () => { calls++; return ""; },
      get: () => { throw new Error("Unexpected DO work"); },
    },
  };
  const result = await handle(new Request("https://editor.example/maintenance/inventory", { method: "POST" }), environment);
  assert.equal(await result.text(), "asset");
  assert.equal(calls, 0);
  const store = memory([]);
  assert.equal((await inventoryObject(new Request("https://session.internal/maintenance/inventory"), store.storage)).status, 405);
  assert.equal(store.calls.length, 0);
});

test("classification exposes only counts, bytes, expiry, generation and eligibility", async () => {
  const secrets = ["stored-user-token", "secret-login", "secret-avatar", "secret-private-key", "secret-context-draft", "secret-draft-text", "secret-request-content", "secret-command", "secret-client-name", "https://secret-redirect.example", "secret-unknown-key"];
  const records: [string, unknown][] = [
    ["session", { kind: "user", token: secrets[0], login: secrets[1], avatar_url: secrets[2], expiresAt: now + 1000 }],
    ["config", { clientId: "client", clientSecret: "secret-config", privateKey: secrets[3] }],
    ["context", { drafts: [{ content: secrets[4] }] }],
    ["drafts", { [id(9)]: 17 }],
    [`draft:${id(9)}`, new TextEncoder().encode(secrets[5])],
    [`draft:${id(8)}`, new TextEncoder().encode("binary-draft").buffer],
    [`draft:${id(7)}`, "plain-draft"],
    ["requests", [{ message: secrets[6] }, { message: "another" }]],
    ["oauth-pending", { "secret-pending-hash": { bytes: 4, expiresAt: now + 50 }, other: { bytes: 5, expiresAt: now - 50 } }],
    ["oauth-registration-budget", { hour: { start: now, count: 1 }, day: { start: now, count: 1 }, ips: { "secret-ip-hash": { count: 1 } }, retained: 1 }],
    [`registration-client:mcp_${"a".repeat(32)}`, now + 500],
    [`registration:${String(now - 1).padStart(16, "0")}:mcp_${"a".repeat(32)}`, `mcp_${"a".repeat(32)}`],
    ["repositoryCache", { chunks: 1 }], ["repositoryCache:0", "secret-cache-content"], ["repositoryCacheGeneration", 6],
    [secrets[10], { token: "unknown-token", expiresAt: now + 1 }],
  ];
  const stored = memory(records);
  const result = await inventoryObject(internal(), stored.storage, now);
  const value = await result.json() as Classification;
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(value.status, "classified");
  assert.equal(value.totalKeys, records.length);
  const size = (item: unknown) => item instanceof ArrayBuffer || ArrayBuffer.isView(item) ? item.byteLength : Buffer.byteLength(typeof item === "string" ? item : JSON.stringify(item));
  assert.equal(value.totalBytes, records.reduce((sum, [, item]) => sum + size(item), 0));
  assert.equal(value.alarm, now + 100);
  const kind = (name: string) => value.records.filter(record => record.kind === name);
  assert.equal(kind("sign-in-session")[0].eligibility, "preserve");
  assert.equal(kind("sign-in-session")[0].earliestExpiresAt, now + 1000);
  assert.equal(kind("app-config")[0].eligibility, "preserve");
  assert.equal(kind("legacy-context")[0].eligibility, "legacy-candidate");
  assert.equal(kind("legacy-drafts")[0].count, 4);
  assert.equal(kind("legacy-drafts")[0].bytes, records.filter(([key]) => key === "drafts" || key.startsWith("draft:")).reduce((sum, [, item]) => sum + size(item), 0));
  assert.equal(kind("legacy-requests")[0].count, 2);
  assert.deepEqual(kind("oauth-pending")[0], { kind: "oauth-pending", count: 2, bytes: size(records[8][1]), eligibility: "preserve", earliestExpiresAt: now - 50, latestExpiresAt: now + 50 });
  assert.equal(kind("registration-limiter").reduce((sum, record) => sum + record.count, 0), 3);
  assert.equal(kind("registration-limiter").find(record => record.eligibility === "expired")?.count, 1);
  assert.equal(kind("repository-cache").find(record => record.generation === 6)?.count, 1);
  // The cache follows its live sign-in session; it never forces review.
  assert.ok(kind("repository-cache").every(record => record.eligibility === "preserve"));
  assert.deepEqual(kind("unknown")[0], { kind: "unknown", count: 1, bytes: size(records[15][1]), eligibility: "review" });
  const json = JSON.stringify(value);
  for (const secret of [...secrets, "unknown-token", "secret-config", "secret-cache-content", "plain-draft", "binary-draft", "secret-pending-hash", "secret-ip-hash"]) assert.ok(!json.includes(secret), secret);
  assert.deepEqual(stored.calls, [{ startAfter: undefined, limit: 128 }]);
});

test("an orphan repository cache is expired; an expired session's cache expires with it", async () => {
  const cache = (value: Classification) => value.records.filter(record => record.kind === "repository-cache").map(record => record.eligibility);
  const orphan = await (await inventoryObject(internal(), memory([["repositoryCache", { chunks: 1 }], ["repositoryCache:0", "x"]]).storage, now)).json() as Classification;
  assert.deepEqual(cache(orphan), ["expired"]);
  const ended = await (await inventoryObject(internal(), memory([["repositoryCache", { chunks: 0 }], ["session", { kind: "user", expiresAt: now - 1 }]]).storage, now)).json() as Classification;
  assert.deepEqual(cache(ended), ["expired"]);
});

test("sessions are classified by their internal kind, with hub queue summaries only", async () => {
  for (const kind of ["user", "oauth", "install", "owner-setup", "agent", "oauth-client", "oauth-request", "oauth-code"]) {
    for (const expiresAt of [now - 1, now, now + 1]) {
      const value = await (await inventoryObject(internal(), memory([["session", { kind, expiresAt, generation: 7, token: "secret-token", login: "private-login", clientName: "private-client" }]]).storage, now)).json() as Classification;
      assert.equal(value.records[0].eligibility, expiresAt <= now ? "expired" : "preserve");
      assert.equal(value.records[0].generation, kind === "agent" ? 7 : undefined);
      assert.ok(!JSON.stringify(value).includes("private"));
    }
  }
  const hub = { kind: "agent-hub", expiresAt: now + 100, grants: [{ id: "private-hash" }], context: { text: "secret-inline" }, commands: ["pending", "pending", "applied", "conflict", "failed"].map(state => ({ state, content: "secret-command" })) };
  const value = await (await inventoryObject(internal(), memory([["session", hub]]).storage, now)).json() as Classification;
  assert.deepEqual(value.records[0], { kind: "legacy-agent-hub", count: 1, bytes: Buffer.byteLength(JSON.stringify(hub)), eligibility: "legacy-candidate", earliestExpiresAt: now + 100, latestExpiresAt: now + 100, grants: 1, inlineContext: true, commandsByState: { pending: 2, applied: 1, conflict: 1, failed: 1, unknown: 0 } });
  for (const secret of ["private-hash", "secret-inline", "secret-command"]) assert.ok(!JSON.stringify(value).includes(secret));
});

test("unknown and malformed records require review; expiry cannot authorize malformed grants", async () => {
  for (const [key, record, status] of [
    ["secret-key", "secret-value", "unknown"], ["session", { kind: "unrecognized", expiresAt: 0 }, "unknown"],
    ["session", { kind: "agent", expiresAt: 0, generation: "secret" }, "classified"],
    ["session", { kind: "user", expiresAt: "secret" }, "classified"], ["oauth-pending", { bad: {} }, "classified"],
    ["config", "not-config", "classified"], ["relay:guessed", {}, "unknown"],
  ] as const) {
    const value = await (await inventoryObject(internal(), memory([[key, record]]).storage, now)).json() as Classification;
    assert.equal(value.status, status);
    assert.equal(value.records[0].eligibility, "review");
  }
});

test("storage pagination stops at key or byte cap and returns partial counts", async () => {
  const stored = memory(Array.from({ length: 2050 }, (_, index) => [`key-${id(index)}`, "data"] as [string, unknown]));
  const value = await (await inventoryObject(internal(), stored.storage, now)).json() as Classification;
  assert.equal(value.status, "deferred"); assert.equal(value.reason, "oversized");
  assert.equal(value.totalKeys, 2048); assert.equal(value.totalBytes, 2048 * 4);
  assert.equal(stored.calls.length, 16); assert.ok(stored.calls.every(call => call.limit === 128));
  assert.equal(stored.calls[1].startAfter, `key-${id(127)}`);
  const heavy = memory([["context", { text: "x".repeat(8 * 1024 * 1024) }], ["z", "unread"]]);
  const large = await (await inventoryObject(internal(), heavy.storage, now)).json() as Classification;
  assert.equal(large.status, "deferred"); assert.equal(large.totalKeys, 1); assert.equal(heavy.calls.length, 1);
});

test("discovery follows 3 opaque cursor pages, skips empty IDs and sanitizes the manifest", async t => {
  const { path, ports, lines } = fixture(t);
  const cursors: (string | null)[] = [], maintenance: string[] = [];
  const response = { ...blank(), privateKey: "secret-key", draft: "secret-draft-text", token, records: [{ kind: "agent-grant", count: 1, bytes: 100, eligibility: "preserve", generation: 3, earliestExpiresAt: now + 1, latestExpiresAt: now + 1, token: "secret-token", login: "secret-login" }] };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.cloudflare.com") {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${apiToken}`);
      cursors.push(url.searchParams.get("cursor"));
      if (cursors.length === 1) return page([{ id: id(1), hasStoredData: true }], "opaque+/one=!");
      if (cursors.length === 2) return page([{ id: id(2), hasStoredData: false }], "opaque/two==");
      return page([{ id: id(3), hasStoredData: true }]);
    }
    assert.equal(url.href, `${options.maintenanceUrl}/__maintenance/inventory`);
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    maintenance.push(JSON.parse(String(init?.body)).id);
    return Response.json(response);
  };
  const result = await runInventory(options, { ...ports, fetch: fetcher });
  assert.deepEqual(cursors, [null, "opaque+/one=!", "opaque/two=="]);
  assert.deepEqual(maintenance, [id(1), id(3)]);
  assert.deepEqual(result.report, { scanned: 3, classified: 2, empty: 1, deferred: 0, unknown: 0, inaccessible: 0, pending: 0, complete: true });
  assert.equal(result.manifest.budget.count, 2);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(path, "..")).mode & 0o777, 0o700);
  for (const secret of [token, apiToken, "secret-draft-text", "secret-token", "secret-login", "secret-key"])
    assert.ok(!(readFileSync(path, "utf8") + lines.join("\n")).includes(secret));
});

test("403 and auth error envelopes are inaccessible, never empty or complete", async t => {
  const { ports } = fixture(t);
  for (const failure of [new Response("private-error", { status: 403 }), Response.json({ success: false, errors: [{ code: 10000, message: token }] })]) {
    const result = await runInventory({ ...options, rescan: true }, { ...ports, fetch: async () => failure });
    assert.equal(result.status, "inaccessible"); assert.equal(result.report.inaccessible, 1);
    assert.equal(result.report.empty, 0); assert.equal(result.report.complete, false);
    assert.ok(!result.line.includes(token));
  }
});

test("interruption checkpoints pending page IDs before cursor; resume skips classified IDs", async t => {
  const { path, ports } = fixture(t);
  const firstCalls: string[] = [];
  await runInventory(options, { ...ports, fetch: async (url: string, init: RequestInit) => {
    if (url.includes("api.cloudflare.com")) return page([{ id: id(1), hasStoredData: true }, { id: id(2), hasStoredData: true }, { id: id(3), hasStoredData: true }], "next-page");
    const current = JSON.parse(String(init.body)).id;
    firstCalls.push(current);
    if (current === id(2)) throw new Error(`network ${token}`);
    return Response.json(blank());
  } });
  assert.deepEqual(firstCalls, [id(1), id(2)]);
  const saved = readManifest(path, options, now);
  assert.equal(saved.cursor, "next-page");
  assert.deepEqual(saved.objects.map((entry: { status: string }) => entry.status), ["classified", "deferred", "pending"]);
  const resumed: string[] = [];
  const result = await runInventory(options, { ...ports, fetch: async (url: string, init: RequestInit) => {
    if (url.includes("api.cloudflare.com")) { resumed.push(new URL(url).searchParams.get("cursor")!); return page([{ id: id(4), hasStoredData: false }]); }
    resumed.push(JSON.parse(String(init.body)).id); return Response.json(blank());
  } });
  assert.deepEqual(resumed, [id(2), id(3), "next-page"]);
  assert.equal(result.report.complete, true); assert.equal(result.manifest.budget.count, 4);
});

test("batch limit defers the rest; new pass enumerates afresh and retains the budget", async t => {
  const { ports } = fixture(t);
  const calls: string[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    if (url.includes("api.cloudflare.com")) { calls.push("list"); return page([{ id: id(1), hasStoredData: true }, { id: id(2), hasStoredData: true }]); }
    calls.push(JSON.parse(String(init.body)).id); return Response.json(blank());
  };
  const first = await runInventory({ ...options, limit: 1 }, { ...ports, fetch: fetcher });
  assert.equal(first.report.pending, 1); assert.equal(first.report.complete, false);
  await runInventory(options, { ...ports, fetch: fetcher });
  assert.deepEqual(calls, ["list", id(1), id(2)]);
  await runInventory(options, { ...ports, fetch: fetcher });
  assert.deepEqual(calls, ["list", id(1), id(2)]);
  const rescan = await runInventory({ ...options, rescan: true }, { ...ports, fetch: fetcher });
  assert.equal(rescan.manifest.budget.count, 4);
  assert.deepEqual(calls, ["list", id(1), id(2), "list", id(1), id(2)]);
});

test("budget enforces 1000 calls including failures and resets at UTC midnight", async t => {
  const { path, ports } = fixture(t);
  const budget = { day: "", count: 0 };
  for (let call = 0; call < 1000; call++) assert.equal(reserveMaintenance(budget, now), true);
  assert.equal(reserveMaintenance(budget, now + 1000), false);
  assert.equal(reserveMaintenance(budget, Date.UTC(2026, 9, 19)), true);
  assert.deepEqual(budget, { day: "2026-10-19", count: 1 });
  const manifest = readManifest(path, options, now);
  manifest.budget = { day: "2026-10-18", count: 999 };
  manifest.permission = "confirmed"; manifest.listComplete = true;
  manifest.objects = [1, 2].map(value => ({ id: id(value), hasStoredData: true, status: "pending" }));
  writeManifest(path, manifest);
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(blank()); };
  const last = await runInventory(options, { ...ports, fetch: fetcher });
  assert.equal(calls, 1); assert.equal(last.manifest.budget.count, 1000); assert.equal(last.report.complete, false);
  const stopped = await runInventory(options, { ...ports, fetch: fetcher });
  assert.equal(calls, 1); assert.equal(stopped.report.pending, 1);
  const reset = await runInventory(options, { ...ports, fetch: fetcher, clock: () => Date.UTC(2026, 9, 19) });
  assert.equal(calls, 2); assert.equal(reset.manifest.budget.count, 1); assert.equal(reset.report.complete, true);
});

test("quota, Retry-After and inaccessible maintenance calls stop and remain charged", async t => {
  const { ports } = fixture(t);
  for (const status of [429, 503, 403]) {
    let calls = 0;
    const result = await runInventory({ ...options, rescan: true }, { ...ports, fetch: async (url: string) => {
      if (url.includes("api.cloudflare.com")) return page([{ id: id(1), hasStoredData: true }, { id: id(2), hasStoredData: true }]);
      calls++; return Response.json({ code: "daily-quota", token }, { status, headers: { "Retry-After": "3600" } });
    } });
    assert.equal(calls, 1); assert.equal(result.report.complete, false);
    assert.equal(result.manifest.budget.count, [429, 503, 403].indexOf(status) + 1);
    assert.equal(result.manifest.objects[1].status, "pending");
  }
  const result = await runInventory({ ...options, rescan: true }, { ...ports, fetch: async (url: string) => url.includes("api.cloudflare.com")
    ? page([{ id: id(1), hasStoredData: true }, { id: id(2), hasStoredData: true }])
    : Response.json(blank(), { headers: { "Retry-After": "1" } }) });
  assert.equal(result.status, "paused"); assert.equal(result.report.pending, 1);
});

test("unknown, malformed and oversized classifications never claim complete coverage", async t => {
  const { path, ports } = fixture(t);
  for (const response of [
    { ...blank(), status: "deferred", reason: "oversized" },
    { ...blank(), records: [{ kind: "unknown", count: 1, bytes: 1, eligibility: "review" }] },
    { ...blank(), records: [{ kind: "app-config", count: 1, bytes: 1, eligibility: "review" }] },
    { error: "secret-draft-text" },
  ]) {
    const result = await runInventory({ ...options, rescan: true }, { ...ports, fetch: async (url: string) => url.includes("api.cloudflare.com")
      ? page([{ id: id(1), hasStoredData: true }]) : Response.json(response) });
    assert.equal(result.report.complete, false);
    assert.equal(result.status, "paused");
    assert.ok(result.report.deferred || result.report.unknown);
    assert.doesNotThrow(() => readManifest(path, options, now));
  }
});

test("manifest re-sanitization, lock and argument checks fail closed", t => {
  const { path } = fixture(t);
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.equal(parseArgs(["--rescan", "--limit", "10"]).limit, 10);
  assert.throws(() => parseArgs(["--token", token]));
  assert.throws(() => sanitizeClassification({ ...blank(), records: [{ kind: "private-kind", count: 1, bytes: 2, eligibility: "preserve" }] }));
  const manifest = readManifest(path, options, now);
  manifest.token = token;
  manifest.objects.push({ id: id(1), hasStoredData: true, status: "classified", classification: { ...blank(), text: "secret-draft" } });
  writeManifest(path, manifest);
  const clean = readManifest(path, options, now);
  writeManifest(path, clean);
  assert.ok(!readFileSync(path, "utf8").includes(token));
  assert.ok(!readFileSync(path, "utf8").includes("secret-draft"));
  assert.throws(() => readManifest(path, { ...options, namespace: "other" }, now));
  assert.equal(inventoryReport(clean).complete, false);
  assert.equal(manifestPath({ ...options, manifest: "custom.json" }, "/tmp"), "/tmp/custom.json");
  writeFileSync(path, "invalid");
  assert.throws(() => readManifest(path, options, now), /Unreadable/);
});

test("namespace budget is shared across deployment manifests and locked during a run", async t => {
  const { path, ports } = fixture(t);
  const original = readManifest(path, options, now);
  original.budget = { day: "2026-10-18", count: 999 };
  writeManifest(path, original);
  let calls = 0;
  const fetcher = async (url: string) => {
    if (url.includes("api.cloudflare.com")) return page([{ id: id(1), hasStoredData: true }]);
    calls++;
    // A second manifest must not race the namespace's current reservation.
    await assert.rejects(runInventory({ ...options, deployment: "other" }, {
      ...ports, path: join(path, "..", "other.json"), fetch: async () => { throw new Error("Must not fetch while locked"); },
    }), /Namespace budget is locked/);
    return Response.json(blank());
  };
  await runInventory(options, { ...ports, fetch: fetcher });
  assert.equal(calls, 1);
  const other = await runInventory({ ...options, deployment: "other" }, { ...ports, path: join(path, "..", "other.json"), fetch: fetcher });
  assert.equal(calls, 1); assert.equal(other.manifest.budget.count, 1000);
  assert.equal(other.report.complete, false); assert.equal(other.report.deferred, 1);
});

test("failed maintenance is reserved on disk before fetch and never leaks its exception", async t => {
  const { path, ports, lines } = fixture(t);
  const result = await runInventory(options, { ...ports, fetch: async (url: string) => {
    if (url.includes("api.cloudflare.com")) return page([{ id: id(1), hasStoredData: true }]);
    const checkpoint = readManifest(path, options, now);
    assert.equal(checkpoint.budget.count, 1);
    assert.equal(checkpoint.batches[0].calls, 1);
    throw new Error(`${token} ${apiToken} secret-draft-text`);
  } });
  assert.equal(result.manifest.budget.count, 1); assert.equal(result.status, "interrupted");
  assert.equal(result.report.deferred, 1);
  for (const secret of [token, apiToken, "secret-draft-text"]) assert.ok(!(readFileSync(path, "utf8") + lines.join("\n")).includes(secret));
});
