import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { AgentRelay, relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { DISCONNECT_GRACE, LIFECYCLE_KEY, type LifecycleRecord } from "../worker/agent-lifecycle";
import { accountMetadata, METADATA_KEY, type MetadataAction } from "../worker/agent-metadata";
import { accountPending, PENDING_KEY } from "../worker/oauth-pending";
import { REGISTRATION_BUDGET } from "../worker/oauth-registration";
import { agentWatch, createRequestTools } from "../src/agent-watch";
import { indexedDbAgentRecords, type AgentCommit } from "../src/agent-records";
import { draftKey, type SavedDraft } from "../src/drafts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";
import type { OAuthClient } from "../worker/oauth";
import type { RepositoryCache } from "../worker/github";
import { classifyAgentFailure } from "../shared/agent-failure";
import { workspaceKey } from "../shared/agent-command";
import { CountedStorage, UsageCounters, countedSocket, startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, payload, repo, signIn, startWorker } from "./mcp-harness";

// Consolidated server budgets. Browser ownership, receipts and fault matrices remain
// in their existing focused tests; validation.md names that evidence separately.
// The global fake clock is used only by serial top-level tests in this file.
const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const scope = { workspace, tabId: "budget-owner", generation: 1 };
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const id = (n: number) => n.toString(16).padStart(64, "0");
const handshake = JSON.stringify({ type: "handshake", ...scope, owner: true });
const totals = (counters: UsageCounters) => Object.values(counters.byCategory).reduce((sum, count) => ({
  calls: sum.calls + count.calls, keys: sum.keys + count.keysWritten, bytes: sum.bytes + count.bytesWritten,
  alarms: sum.alarms + count.alarms,
}), { calls: 0, keys: 0, bytes: 0, alarms: 0 });
const report = (t: TestContext, h: { counters: UsageCounters }) => t.diagnostic(JSON.stringify({
  categories: h.counters.byCategory, waitedMs: h.counters.waitedMs,
}));
async function fixture() {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie);
  const response = await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" });
  assert.equal(response.status, 200);
  const grant = await response.json() as { id: string; token: string };
  const name = await relayObjectName(workspace), traffic = countedSocket();
  let attachment: unknown = { ...scope, role: "editor", handshaken: true, owner: { tabId: scope.tabId, generation: 1 } };
  const frames: Record<string, any>[] = [];
  let answer = true;
  const socket = {
    readyState: 1, close() {}, deserializeAttachment: () => attachment,
    serializeAttachment(value: unknown) { attachment = value; },
    send(text: string) {
      traffic.send(text);
      const frame = JSON.parse(text); frames.push(frame);
      if (frame.type === "command" && answer) queueMicrotask(() => {
        // This seam measures dispatch, not the browser commit. Receipt correctness
        // is proved by native-agent-edits and agent-tools-edit, not this response.
        const result = frame.command.operation === "read" ? { ok: true, value: { content: "browser draft" } }
          : { ok: true, value: { requestId: frame.command.id, state: "applied", message: "Applied." } };
        const reply = JSON.stringify({ type: "result", ...scope, id: frame.id, result });
        traffic.receive(reply); h.message(name, socket, reply);
      });
    },
  } satisfies RelaySocket;
  h.restoreEditors(name, [socket]);
  await h.handshake(name, socket, handshake);
  const rpc = async (method: string, params?: object) => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${grant.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    assert.equal(response.status, 200);
    const text = await response.text();
    const value = JSON.parse(text.startsWith("event:") ? text.split("data: ")[1].split("\n")[0] : text);
    assert.equal(value.error, undefined, text); return value.result;
  };
  const call = (tool: string, args: object) => rpc("tools/call", { name: tool, arguments: args });
  return { ...h, name, cookie, grant, socket, frames, traffic, rpc, call, silent: () => { answer = false; } };
}

for (const scenario of ["startup", "menu open", "idle visible", "idle hidden"]) {
  test(`remote-off ${scenario}: server routes cause 0 hub calls, 0 uploads, 0 agent keys written`, async t => {
    const h = await startCountedWorker();
    try {
      const { cookie } = await signIn(h.worker);
      h.counters.reset(); h.github.requests.length = 0;
      // No browser simulation here. /api/session is normal authentication on
      // startup; the other states make no agent HTTP request (quiet browser spec).
      const response = await h.worker.dispatchFetch(origin + "/api/session", { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      assert.equal(h.counters.log.filter(row => row.name.startsWith("agent-") || row.name.startsWith("agent:")).length, 0);
      assert.equal(h.counters.log.filter(row => /context|draft/.test(row.path)).length, 0);
      assert.equal(totals(h.counters).keys, 0);
      report(t, h);
    } finally { await h.worker.dispose(); }
  });
}

test("quiet connected idle: 300000 virtual ms, 0 polling calls, 0 keys written, 0 alarms", async t => {
  const h = await fixture();
  try {
    h.counters.reset(); h.clock.install();
    await new Promise(resolve => setTimeout(resolve, 300_000));
    assert.deepEqual(totals(h.counters), { calls: 0, keys: 0, bytes: 0, alarms: 0 });
    assert.equal(await h.storage(h.name).getAlarm(), null);
    assert.equal(h.counters.log.length, 0, "no alarm scheduling either");
    assert.equal(h.counters.waitedMs, 300_000); report(t, h);
  } finally { await h.worker.dispose(); }
});

for (const [tool, args] of [["read_file", { path: "index.html" }], ["write_file", { path: "budget.txt", content: "draft", requestId: "budget-edit" }]] as const) {
  test(`already-authorized ${tool}: <=4 control-path DO calls (3 authentication + 1 dispatch)`, async t => {
    const h = await fixture();
    try {
      h.counters.reset();
      await h.rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "budget", version: "1" } });
      assert.equal(h.counters.byCategory.auth.calls, 4, "initialization counted separately");
      report(t, h);
      h.counters.reset(); h.github.requests.length = 0;
      const before = { ...h.traffic.counters };
      assert.notEqual((await h.call(tool, args)).isError, true);
      assert.equal(h.counters.byCategory.auth.calls, 3);
      assert.equal(h.counters.byCategory.control.calls, 1);
      assert.equal(totals(h.counters).calls, 4);
      assert.equal(totals(h.counters).keys, 0);
      assert.equal(h.github.requests.length, 0);
      assert.equal(h.traffic.counters.sent - before.sent, 1);
      assert.equal(h.traffic.counters.received - before.received, 1);
      assert.equal(h.counters.byCategory.lifecycle.calls, 0);
      t.diagnostic(`WebSocket: 1 command / ${h.traffic.counters.sentBytes - before.sentBytes} wire bytes, 1 result / ${h.traffic.counters.receivedBytes - before.receivedBytes} wire bytes`);
      report(t, h);
    } finally { await h.worker.dispose(); }
  });
}

test("Watch: <=25 waits per activation, <=25000 ms each, <=600000 ms total; 0 server storage", async t => {
  const stored = new Map<string, string>();
  const watch = agentWatch(workspace, { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); }, removeItem: key => { stored.delete(key); } }, () => Date.now());
  const h = await startCountedWorker();
  try {
    h.clock.install(); watch.start();
    const tools = createRequestTools({ workspace, watch, now: () => Date.now(), list: async () => [], save: async () => false });
    let waits = 0;
    for (let n = 0; n < 26; n++) {
      const before = Date.now();
      await tools.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "g", waitMs: 25_000 }, () => true, Date.now() + 25_000);
      const duration = Date.now() - before;
      assert.ok(duration <= 25_000);
      if (duration) waits++;
    }
    assert.ok(waits <= 25); assert.equal(waits, 24, "ten-minute deadline clips this empty 25 s sequence");
    assert.equal(h.counters.waitedMs, 600_000);
    assert.deepEqual(totals(h.counters), { calls: 0, keys: 0, bytes: 0, alarms: 0 });
    t.diagnostic(`browser request-tools layer: ${waits} held waits, ${h.counters.waitedMs} ms; relay call cost: agent-watch.test.ts`);
  } finally { await h.worker.dispose(); }
});

test("lost or timed-out edit: unknown at 10000 ms, 0 replay, 0 payload keys written", async t => {
  const h = await fixture();
  try {
    await h.rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "budget", version: "1" } });
    h.silent(); h.clock.install(); h.counters.reset();
    const result = payload(await h.call("write_file", { path: "lost.txt", content: "private", requestId: "lost" }));
    assert.equal(result.state, "unknown");
    assert.equal(h.counters.waitedMs, 10_000);
    assert.equal(h.frames.filter(frame => frame.type === "command").length, 1);
    assert.equal(totals(h.counters).keys, 0); report(t, h);
  } finally { await h.worker.dispose(); }
});

test("failed ledger write and unreachable ledger: 0 grants allocated, fail closed", async t => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie), name = await relayObjectName(workspace);
    await h.settle(name); h.storage(name).failNextWrite(); h.counters.reset();
    const connect = () => tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" });
    assert.equal((await connect()).status, 503);
    assert.equal(Object.values(h.counters.byCategory).reduce((sum, count) => sum + count.failedWrites, 0), 1);
    const get = h.namespace.get;
    h.namespace.get = name => name.startsWith("agent-relay:") ? { fetch: async () => { throw new Error("unreachable ledger"); } } : get(name);
    assert.equal((await connect()).status, 503);
    assert.equal(h.counters.log.filter(row => row.name.startsWith("agent:")).length, 0);
    report(t, h);
  } finally { await h.worker.dispose(); }
});

test("workspace ledger: 5 connections and 65536 aggregate bytes; refusal writes 0 keys", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  const reserve = (n: number, count: number): MetadataAction => ({ action: "reserve", workspace: workspaceKey(workspace), id: id(n), sessionId: id(800), generation: 1, bytes: count, expiresAt: 1000 });
  for (let n = 1; n <= 5; n++) assert.equal((await accountMetadata(storage, reserve(n, 100), 1)).allowed, true);
  counters.reset(); assert.equal((await accountMetadata(storage, reserve(6, 100), 1)).reason, "connections");
  assert.equal(totals(counters).keys, 0);
  const fresh = new CountedStorage(counters);
  let count = 65000;
  for (let n = 0; n < 3; n++) {
    const ledger = { workspace: workspaceKey(workspace), entries: [{ id: id(1), sessionId: id(800), generation: 1, state: "pending", bytes: count, expiresAt: 1000, at: 1 }] };
    count = 65536 - bytes(ledger);
  }
  assert.equal((await accountMetadata(fresh, reserve(1, count), 1)).allowed, true);
  assert.equal(bytes(await fresh.get(METADATA_KEY)) + count, 65536);
  counters.reset(); assert.equal((await accountMetadata(fresh, reserve(2, 1), 1)).reason, "bytes");
  assert.equal(totals(counters).keys, 0);
});

test("relay intake: 5 pending / 8388608 bytes, refusal reserves 0 extra bytes", () => {
  const relay = new AgentRelay([]), reservations = [];
  for (let n = 0; n < 5; n++) reservations.push(relay.reserve(n === 0 ? 8388604 : 1));
  assert.equal(relay.reservedCount, 5); assert.equal(relay.reservedBytes, 8388608);
  assert.deepEqual(relay.reserve(1), { ok: false, code: "busy", outcome: "not-sent" });
  assert.deepEqual(relay.reserve(0), { ok: false, code: "busy", outcome: "not-sent" });
  for (const reservation of reservations) { assert.ok(!("ok" in reservation)); reservation.release(); }
  assert.equal(relay.pendingCount, 0); assert.equal(relay.bufferedBytes, 0);
  assert.equal(relay.reservedCount, 0); assert.equal(relay.reservedBytes, 0);
  const full = relay.reserve(8388608); assert.ok(!("ok" in full));
  assert.deepEqual(relay.reserve(1), { ok: false, code: "too-large", outcome: "not-sent" });
  full.release();
  assert.deepEqual(relay.reserve(8388609), { ok: false, code: "too-large", outcome: "not-sent" });
});

test("OAuth pending: 20 records / 65536 bytes; refused record writes 0 keys", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  await storage.put("session", { kind: "user", expiresAt: 1000 });
  const reserve = (n: number, count: number) => accountPending(storage, { action: "reserve", id: `oauth-request:${id(n)}`, bytes: count, expiresAt: 1000 }, 1);
  for (let n = 0; n < 20; n++) assert.equal((await reserve(n, n === 0 ? 65517 : 1)).allowed, true);
  const ledger = (await storage.get<Record<string, { bytes: number }>>(PENDING_KEY))!;
  assert.equal(Object.keys(ledger).length, 20); assert.equal(Object.values(ledger).reduce((sum, entry) => sum + entry.bytes, 0), 65536);
  counters.reset(); assert.equal((await reserve(20, 1)).allowed, false); assert.equal(totals(counters).keys, 0);
});

test("registration capacity: 10000 retained; 503 quota-shaped refusal, 0 client allocations", async t => {
  const h = await startCountedWorker();
  try {
    const now = Date.now();
    await h.storage(REGISTRATION_BUDGET).put(REGISTRATION_BUDGET, { retained: 10000, legacy: "uninventoried", pending: {}, hour: { start: now, count: 0 }, day: { start: now, count: 0 }, ips: {} });
    h.counters.reset();
    const response = await h.worker.dispatchFetch(origin + "/auth/mcp/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://client.example/cb"] }) });
    assert.equal(response.status, 503); assert.equal((await response.json() as { error: string }).error, "temporarily_unavailable");
    assert.equal(h.counters.log.filter(row => row.name.startsWith("oauth-client:")).length, 0);
    // First use also writes one alarm-deadlines key (28 serialized bytes);
    // capacity refusal creates no client or retained registration.
    assert.equal(totals(h.counters).keys, 1); assert.equal(totals(h.counters).bytes, 28);
    report(t, h);
  } finally { await h.worker.dispose(); }
});

for (const overflow of [false, true]) test(`relay body ${overflow ? "exceeds Content-Length: refused" : "arrives in pieces before deadline: delivered once"}; 0 payload storage`, async t => {
  const h = await fixture();
  try {
    h.silent(); h.counters.reset(); h.clock.install();
    const body = JSON.stringify({ operation: "read", tool: "read_file", args: { path: "index.html" } });
    let intake!: ReadableStreamDefaultController<Uint8Array>, consumed!: () => void;
    const pulled = new Promise<void>(resolve => { consumed = resolve; });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { intake = controller; controller.enqueue(Buffer.from(body.slice(0, 8))); }, pull() { consumed(); } });
    const init = { method: "POST", body: stream, duplex: "half", headers: { "Content-Length": String(Buffer.byteLength(body) - (overflow ? 1 : 0)), [AgentRelay.identityHeader]: JSON.stringify(scope) } } satisfies RequestInit & { duplex: string };
    const pending = h.namespace.get(h.name).fetch(new Request("https://session.internal/relay/dispatch", init));
    await pulled;
    setTimeout(() => { intake.enqueue(Buffer.from(body.slice(8))); intake.close(); }, 1000);
    if (!overflow) {
      await new Promise<void>(resolve => {
        const send = h.socket.send.bind(h.socket);
        h.socket.send = text => {
          send(text); const frame = JSON.parse(text);
          if (frame.type === "command") {
            h.message(h.name, h.socket, JSON.stringify({ type: "result", ...scope, id: frame.id, result: { ok: true } })); resolve();
          }
        };
      });
    }
    const response = await pending;
    assert.equal(response.status, overflow ? 413 : 200);
    assert.equal(h.frames.filter(frame => frame.type === "command").length, overflow ? 0 : 1);
    assert.equal(totals(h.counters).keys, 0); assert.equal(totals(h.counters).bytes, 0);
    t.diagnostic("intake and command only:"); report(t, h);
    h.counters.reset();
    // Five fresh reservations reach dispatch together: no leaked intake slot.
    // Admission of the entire byte budget proves intake released its bytes.
    const byteProbe = await h.namespace.get(h.name).fetch(new Request("https://session.internal/relay/dispatch", { method: "POST", body: "invalid JSON", headers: { "Content-Length": "8388608", [AgentRelay.identityHeader]: JSON.stringify(scope) } }));
    assert.equal(byteProbe.status, 400);
    const probe = Array.from({ length: 5 }, () => h.namespace.get(h.name).fetch(new Request("https://session.internal/relay/dispatch", { method: "POST", body: "null", headers: { "Content-Length": "4", [AgentRelay.identityHeader]: JSON.stringify(scope) } })));
    const results = await Promise.all(probe);
    for (const result of results) assert.notEqual((await result.json()).code, "busy");
    t.diagnostic("release probes, separate from the measured intake:"); report(t, h);
  } finally { await h.worker.dispose(); }
});

test("disconnect detection 0 ms; eligibility 300000 ms; temporary data removed at alarm; permission, sign-in and App config survive", async t => {
  const h = await fixture(), realNow = Date.now;
  try {
    let now = Date.now(); Date.now = () => now;
    const sessionId = h.cookie.split("=")[1], config = h.namespace.get("native-site-editor/config");
    await config.fetch(new Request("https://session.internal/config", { method: "PUT", body: JSON.stringify({ appId: "preserved" }) }));
    const signedIn = await h.storage(sessionId).get("session");
    await h.close(h.name, h.socket);
    const detected = now, deadline = (await h.storage(h.name).get<LifecycleRecord>(LIFECYCLE_KEY))!.disconnectDeadline!;
    assert.equal(deadline - detected, DISCONNECT_GRACE); assert.equal(DISCONNECT_GRACE, 300_000);
    now = deadline - 1; await h.alarm(h.name);
    assert.ok(await h.storage(`agent:${h.grant.id}`).get("session"));
    await h.storage(`agent-hub:${sessionId}`).put({ context: { legacy: true }, requests: [] });
    now = deadline; h.counters.reset(); await h.alarm(h.name);
    assert.ok(await h.storage(`agent:${h.grant.id}`).get("session"), "the permission outlives the grace");
    assert.equal(await h.storage(`agent-hub:${sessionId}`).get("context"), undefined);
    assert.equal(await h.storage(`agent-hub:${sessionId}`).get("requests"), undefined);
    assert.deepEqual(await h.storage(sessionId).get("session"), signedIn);
    assert.deepEqual(await h.storage("native-site-editor/config").get("config"), { appId: "preserved" });
    assert.equal((await h.storage(`agent-hub:${sessionId}`).list({ prefix: "draft" })).size, 0);
    t.diagnostic(`detection=0 ms (explicit close); eligibility=${deadline - detected} ms; temporary-data cleanup=${now - detected} ms (manual alarm); browser drafts: native-agent-lifecycle spec`);
    report(t, h);
  } finally { Date.now = realNow; await h.worker.dispose(); }
});

test("Miniflare SessionStore: real hibernatable upgrade / handshake / auto pong", async () => {
  const { worker } = await startWorker();
  try {
    const { cookie } = await signIn(worker);
    const response = await worker.dispatchFetch(`${origin}/api/agent/relay?repo=lex%2Fstarter&branch=main&tabId=${scope.tabId}&generation=1`, { headers: { Cookie: cookie, Origin: origin, Upgrade: "websocket" } });
    assert.equal(response.status, 101); const socket = response.webSocket!; socket.accept();
    const next = () => new Promise<string>(resolve => socket.addEventListener("message", event => resolve(String(event.data)), { once: true }));
    const ready = next(); socket.send(handshake); assert.equal(JSON.parse(await ready).type, "ready");
    const pong = next(); socket.send("ping"); assert.equal(await pong, "pong");
    socket.close(1000);
  } finally { await worker.dispose(); }
});

test("client record: 16384 UTF-8 bytes stored; 16385 refused with 0 DO calls", async t => {
  const h = await startCountedWorker();
  try {
    const body = (size: number) => {
      const client: OAuthClient = { kind: "oauth-client", clientId: `mcp_${"a".repeat(32)}`, name: "é".repeat(100), redirectUris: Array.from({ length: 9 }, () => `https://client.example/${"a".repeat(1700)}`), expiresAt: Date.now() + 180 * 86400000 };
      let remaining = size - bytes(client);
      for (let n = 0; n < client.redirectUris.length && remaining > 0; n++) {
        const padding = Math.min(remaining, 2000 - client.redirectUris[n].length);
        client.redirectUris[n] += "a".repeat(padding); remaining -= padding;
      }
      assert.equal(remaining, 0);
      return JSON.stringify({ client_name: client.name, redirect_uris: client.redirectUris });
    };
    const register = (size: number) => h.worker.dispatchFetch(origin + "/auth/mcp/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(size) });
    assert.equal((await register(16385)).status, 400); assert.equal(totals(h.counters).calls, 0);
    const response = await register(16384); assert.equal(response.status, 201);
    const { client_id: clientId } = await response.json() as { client_id: string };
    assert.equal(bytes(await h.storage(`oauth-client:${clientId}`).get("session")), 16384); report(t, h);
  } finally { await h.worker.dispose(); }
});

test("repository cache: 262144 stored bytes; 262145 stores 0 content bytes; authentication reads 0 cache keys", async t => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker), sessionId = cookie.split("=")[1], stub = h.namespace.get(sessionId);
    const put = (size: number) => {
      const value: RepositoryCache = { fetchedAt: Date.now(), repositories: [repo], installations: [], pages: { padding: { data: "é" } } };
      value.pages.padding.data += "x".repeat(size - bytes(value));
      return stub.fetch(new Request("https://session.internal/repository-cache", { method: "PUT", body: JSON.stringify({ token: "github-private-token", generation: 1, value }) }));
    };
    assert.equal((await put(262144)).status, 204);
    const chunks = await h.storage(sessionId).list({ prefix: "repositoryCache:" });
    assert.equal(Buffer.byteLength([...chunks.values()].join("")), 262144);
    h.counters.reset();
    assert.equal((await h.worker.dispatchFetch(origin + "/api/session", { headers: { Cookie: cookie } })).status, 200);
    assert.equal(h.counters.readKeys.filter(key => key === "repositoryCache" || key.startsWith("repositoryCache:")).length, 0);
    report(t, h);
    assert.equal((await put(262145)).status, 204);
    assert.equal((await h.storage(sessionId).list({ prefix: "repositoryCache:" })).size, 0);
  } finally { await h.worker.dispose(); }
});

test("duplicate edit: recorded browser outcome, 1 receipt and 1 revision", async () => {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("budget-duplicates", fake.factory);
  const draft: SavedDraft = { ...workspace, version: 1, repo: repo.full_name, path: "new.txt", baseSha: null, original: "", content: "once", updatedAt: Date.now() };
  const key = draftKey(draft, draft.path);
  const input: AgentCommit = { workspace, fence: 0, expectedRevision: 0, expectedDrafts: [[key, null]], drafts: [[key, draft]], receipt: { operationId: "once", authorizationId: "g", payloadIdentity: "same-work", outcome: { message: "Recorded." }, createdAt: Date.now(), issuedAt: Date.now() } };
  const first = await records.commit(input);
  assert.deepEqual(await records.commit(input), { receipt: first.receipt, duplicate: true });
  assert.equal(fake.stores.get("drafts")!.size, 1); assert.equal(fake.stores.get("receipts")!.size, 1);
  assert.equal((await records.workspace(workspace)).revision, 1);
  // Browser-only records; server mirror absence is counted by the relay tests above.
});

test("network / daily quota / auth remain distinct; quota-shaped Worker response preserves sign-in", async () => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker), sessionId = cookie.split("=")[1], session = await h.storage(sessionId).get("session");
    const get = h.namespace.get;
    h.namespace.get = name => name === sessionId ? { fetch: async () => { throw new Error("Exceeded allowed duration in Durable Objects free tier"); } } : get(name);
    const response = await h.worker.dispatchFetch(origin + "/api/session", { headers: { Cookie: cookie } });
    const body: unknown = await response.json();
    assert.equal(response.status, 503);
    assert.equal(classifyAgentFailure({ status: response.status, body, now: Date.now() }).kind, "quota");
    assert.equal(classifyAgentFailure({ networkError: true, now: Date.now() }).kind, "transient");
    assert.equal(classifyAgentFailure({ status: 401, body: { code: "signed-out" }, now: Date.now() }).kind, "auth");
    assert.deepEqual(await h.storage(sessionId).get("session"), session);
  } finally { await h.worker.dispose(); }
});
