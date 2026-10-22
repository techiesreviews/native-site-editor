import assert from "node:assert/strict";
import { test } from "node:test";
import { serialize } from "node:v8";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { CountedStorage, FakeClock, UsageCounters, countedSocket, startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, payload, repo, signIn, workerFetch } from "./mcp-harness";

async function connected() {
  const harness = await startCountedWorker();
  const { worker } = harness;
  const { cookie } = await signIn(worker);
  const tab = editorTab(worker, cookie);
  const connection = await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" });
  assert.equal(connection.status, 200);
  const { token } = await connection.json() as { token: string };
  const rpc = async (method: string, params?: object) => {
    const response = await worker.dispatchFetch(origin + "/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    assert.equal(response.status, 200);
    // The real SDK returns an SSE envelope even for a single JSON-RPC response.
    const body = await response.text();
    const json = JSON.parse(body.startsWith("event:") ? body.split("data: ")[1].split("\n")[0] : body);
    assert.equal(json.error, undefined, body);
    return json.result;
  };
  return { ...harness, rpc, token };
}
const initialize = { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "usage-test", version: "1" } };

test("MCP authentication measures three calls; first use adds only use-grant", async () => {
  const h = await connected();
  try {
    h.counters.reset();
    await h.rpc("initialize", initialize);
    assert.equal(h.counters.byCategory.auth.calls, 4, JSON.stringify(h.counters.log));
    assert.deepEqual(h.counters.log.filter(row => row.action).map(row => row.action), ["use-grant"]);
    h.counters.reset();
    await h.rpc("tools/list");
    assert.equal(h.counters.byCategory.auth.calls, 3, JSON.stringify(h.counters.log));
    assert.deepEqual(h.counters.log.map(row => row.category), ["auth", "auth", "auth"]);
    const [grant, session, hub] = h.counters.log;
    assert.match(grant.name, /^agent:/);
    assert.match(session.name, /^[a-f0-9]{64}$/);
    assert.equal(hub.name, `agent-hub:${session.name}`);
    assert.equal(h.counters.byCategory.data.calls, 0);
    // The older static evidence said +2; markGrantUsed writes only the hub (+1).
  } finally { await h.worker.dispose(); }
});

test("an edit without a receiving tab refuses immediately: 3 auth + 1 dispatch, no polling", async () => {
  const h = await connected();
  try {
    await h.rpc("initialize", initialize);
    h.counters.reset();
    const result = await h.rpc("tools/call", { name: "write_file", arguments: { path: "usage.txt", content: "new file" } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(payload(result)), /The editor isn't open/);
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.control.calls, 1);
    assert.equal(h.counters.byCategory.data.calls, 0);
    assert.equal(h.counters.waitedMs, 0);
    assert.equal(h.counters.log.some(row => row.action === "queue"), false);
  } finally { await h.worker.dispose(); }
});

test("an empty wait without a receiver answers quietly at once without a legacy take", async () => {
  const h = await connected();
  const client = new Client({ name: "usage-client", version: "1" });
  // After `initialized` the SDK opens its standby GET without awaiting it; on a busy machine its
  // three auth calls landed after the reset below. Count only once that request has settled.
  const send = workerFetch(h.worker);
  let standbySettled!: () => void;
  let gets = 0;
  let noStandby: ReturnType<typeof setTimeout> | undefined;
  const standby = new Promise<void>(resolve => { standbySettled = resolve; });
  const tracked = (input: string | URL | Request, init?: RequestInit) => {
    const response = send(input, init);
    // Its outcome does not matter here, only that it is over: a failed GET settles it too.
    if (init?.method === "GET") { gets++; response.finally(standbySettled).catch(() => {}); }
    return response;
  };
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${h.token}` } }, fetch: tracked,
    }));
    await client.listTools();
    await Promise.race([standby, new Promise((_, reject) => {
      noStandby = setTimeout(() => reject(new Error("The SDK opened no standby GET within 10 s; this test counts on it")), 10_000);
    })]);
    // One standby request only: a second would race the reset again.
    assert.equal(gets, 1);
    h.counters.reset();
    const result = await client.callTool({ name: "wait_for_requests", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.deepEqual(payload(result).requests, []);
    assert.match(payload(result).hint, /The editor isn't open/);
    assert.equal(h.counters.log.some(row => row.action === "take-requests"), false);
    assert.equal(h.counters.byCategory.auth.calls, 3);
    assert.equal(h.counters.byCategory.control.calls, 1);
    assert.equal(h.counters.byCategory.data.calls, 0);
    assert.equal(h.counters.waitedMs, 0);
    assert.equal(gets, 1, "no other GET was counted above");
  } finally { clearTimeout(noStandby); try { await client.close(); } finally { await h.worker.dispose(); } }
});

test("storage counts every key, clones values, lists prefixes and retains the global peak", async () => {
  const counters = new UsageCounters();
  const a = new CountedStorage(counters), b = new CountedStorage(counters);
  const entries = { "draft:a": { text: "original" }, "draft:b": new Uint8Array([1, 2, 3]) };
  await a.put(entries);
  const initial = serialize(entries["draft:a"]).length + serialize(entries["draft:b"]).length;
  entries["draft:a"].text = "mutated";
  const values = await a.get<{ text: string }>(["draft:a", "draft:b", "missing"]);
  values.get("draft:a")!.text = "changed clone";
  assert.deepEqual(await a.get("draft:a"), { text: "original" });
  assert.equal((await a.list({ prefix: "draft:" })).size, 2);
  assert.equal(counters.byCategory.data.keysRead, 6);
  assert.equal(counters.byCategory.data.keysWritten, 2);
  assert.equal(counters.byCategory.data.bytesWritten, initial);
  await b.put("other", "bigger".repeat(100));
  const peak = initial + serialize("bigger".repeat(100)).length;
  assert.equal(counters.peakRetainedBytes, peak);
  assert.equal(await a.delete(["draft:a", "draft:b", "missing"]), 2);
  assert.equal(counters.byCategory.data.keysDeleted, 3);
  await b.deleteAll();
  assert.equal(counters.retainedBytes, 0);
  assert.equal(counters.peakRetainedBytes, peak);
});

test("failed put/delete counts failure without written keys, bytes or retained changes; transactions roll back", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  await storage.put("key", "before");
  const retained = counters.retainedBytes;
  counters.reset();
  storage.failNextWrite();
  await assert.rejects(storage.put({ key: "after", extra: 1 }), /Injected/);
  storage.failNextWrite();
  await assert.rejects(storage.delete(["key"]), /Injected/);
  assert.deepEqual(counters.byCategory.data, { calls: 0, alarms: 0, keysRead: 0, keysWritten: 0, keysDeleted: 0, bytesWritten: 0, failedWrites: 2 });
  assert.equal(counters.retainedBytes, retained);
  assert.equal(counters.peakRetainedBytes, retained);
  assert.equal(await storage.get("key"), "before");
  await assert.rejects(storage.transaction(async tx => { await tx.put("key", "temporary"); throw new Error("rollback"); }), /rollback/);
  assert.equal(await storage.get("key"), "before");
  assert.equal(counters.retainedBytes, retained);
});

test("lifecycle runs the real alarm and DELETE; sockets count UTF-8 and binary traffic", async () => {
  const h = await startCountedWorker();
  try {
    const storage = h.storage("agent-hub:unit");
    await storage.put({ session: { kind: "agent-hub", expiresAt: Date.now() - 1 }, context: {}, drafts: {} });
    await storage.setAlarm(Date.now() + 1000);
    assert.ok(await storage.getAlarm());
    h.counters.reset();
    await h.alarm("agent-hub:unit");
    assert.ok(h.counters.byCategory.lifecycle.keysDeleted >= 4);
    assert.equal(h.counters.byCategory.lifecycle.calls, 0);
    assert.equal(h.counters.byCategory.lifecycle.alarms, 1);
    await h.namespace.get("agent-hub:unit").fetch(new Request("https://session.internal/", { method: "DELETE" }));
    assert.equal(h.counters.byCategory.lifecycle.calls, 1);
    assert.equal(h.counters.byCategory.lifecycle.alarms, 1);
    assert.equal(await storage.getAlarm(), null);
    assert.equal((await storage.list()).size, 0);
    const socket = countedSocket();
    socket.send("é"); socket.receive(new Uint8Array([1, 2, 3]));
    assert.deepEqual(socket.counters, { sent: 1, received: 1, sentBytes: 2, receivedBytes: 3 });
  } finally { await h.worker.dispose(); }
});

test("clock drains microtasks/immediates before advancing and clears client deadlines", async () => {
  const counters = new UsageCounters(), clock = new FakeClock(counters);
  const original = { now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  try {
    clock.install();
    const before = Date.now();
    const deadline = setTimeout(() => assert.fail("client timeout fired"), 60000);
    const done = new Promise<void>(resolve => setTimeout(resolve, 10000));
    await new Promise<void>(resolve => setImmediate(() => { assert.equal(Date.now(), before); resolve(); }));
    await done;
    clearTimeout(deadline);
    assert.equal(Date.now() - before, 10000);
    assert.equal(counters.waitedMs, 10000);
  } finally { clock.uninstall(); }
  assert.equal(Date.now, original.now);
  assert.equal(globalThis.setTimeout, original.setTimeout);
  assert.equal(globalThis.clearTimeout, original.clearTimeout);
});

test("fetches and alarms wait for an object's active concurrency block", async () => {
  const h = await startCountedWorker();
  try {
    const config = { clientId: "Iv1.held", clientSecret: "secret", slug: "held" };
    const object = h.namespace.get("native-site-editor/config");
    let release!: () => void;
    const held = new Promise<void>(resolve => (release = resolve));
    const storage = h.storage("native-site-editor/config");
    const put = storage.put.bind(storage);
    storage.put = (async (key: string, value: unknown) => { await held; return put(key, value); }) as typeof storage.put;
    const write = object.fetch(new Request("https://session.internal/config", { method: "PUT", body: JSON.stringify(config) }));
    await new Promise(resolve => setImmediate(resolve));
    const read = object.fetch(new Request("https://session.internal/config"));
    const alarm = h.alarm("native-site-editor/config");
    let settled = false;
    void Promise.all([read, alarm]).then(() => (settled = true));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    release();
    assert.equal((await write).status, 204);
    assert.deepEqual(await (await read).json(), config);
    await alarm;
  } finally { await h.worker.dispose(); }
});
