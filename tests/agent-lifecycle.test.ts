import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentLifecycle, AlarmDeadlines, DEADLINES_KEY, DISCONNECT_GRACE, LIFECYCLE_KEY, TOMBSTONE_AFTER_DELETION, type LifecycleRecord } from "../worker/agent-lifecycle";
import { AgentRelay, relayObjectName, type RelayScope, type RelaySocket } from "../worker/agent-relay";
import { createGrant, getGrant, getHub, rebindGrant, revokeGrant } from "../worker/agent-context";
import { METADATA_KEY, METADATA_ROUTE, type Ledger } from "../worker/agent-metadata";
import type { Env } from "../worker/app";
import { CountedStorage, UsageCounters, startCountedWorker } from "./fakes/counted-agent";
import { origin, repo, signIn } from "./mcp-harness";
import { workspaceKey } from "../shared/agent-command";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const handshake = (scope: RelayScope) => JSON.stringify({ type: "handshake", ...scope, owner: true });
function editor(tabId = "tab", generation = 1) {
  const scope = { workspace, tabId, generation };
  let attachment: unknown = { ...scope, role: "editor", handshaken: true, everHandshaken: true, owner: { tabId, generation } };
  const socket = {
    scope, readyState: 1, sent: [] as string[],
    send(message: string) { this.sent.push(message); },
    close() { this.readyState = 3; },
    serializeAttachment(value: unknown) { attachment = structuredClone(value); },
    deserializeAttachment() { return structuredClone(attachment); },
  } satisfies RelaySocket;
  return socket;
}
async function fixture(tabs = 1) {
  const h = await startCountedWorker();
  const signed = await signIn(h.worker);
  const sessionId = signed.cookie.split("=")[1];
  const env: Env = { SESSIONS: h.namespace, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
  const name = await relayObjectName(workspace);
  const editors = Array.from({ length: tabs }, (_, n) => editor(`tab-${n}`, n + 1));
  h.restoreEditors(name, editors);
  if (editors.length) await h.handshake(name, editors.at(-1)!, handshake(editors.at(-1)!.scope));
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const input = { sessionId, login: "lex", repoId: repo.id, repo: repo.full_name, branch: "main", via: "token" as const, expiresAt: now + 3600_000 };
  const grant = await createGrant(env, input);
  const storage = h.storage(name);
  const reconnect = async () => {
    const socket = editor("reconnected", 10);
    h.restoreEditors(name, [socket]);
    await h.handshake(name, socket, handshake(socket.scope));
    return socket;
  };
  const dispatch = async (id = grant.id) => {
    const body = JSON.stringify({ edit: "private content" });
    return h.namespace.get(name).fetch(new Request("https://session.internal/relay/dispatch", { method: "POST", body,
      headers: { "Content-Length": String(Buffer.byteLength(body)), [AgentRelay.identityHeader]: JSON.stringify({ workspace, grantId: id, requestId: 1 }) } }));
  };
  return { ...h, env, name, relayStorage: storage, editors, grant, input, sessionId, cookie: signed.cookie, reconnect, dispatch,
    now: () => now, advance: (ms: number) => { now += ms; },
    record: () => storage.get<LifecycleRecord>(LIFECYCLE_KEY), ledger: () => storage.get<Ledger>(METADATA_KEY),
    async dispose() { Date.now = realNow; await h.worker.dispose(); } };
}

test("first of two tabs closes: no deadline; open background tab keeps grants without activity", async () => {
  const h = await fixture(2);
  try {
    h.counters.reset();
    const detectedAt = h.now();
    await h.close(h.name, h.editors[0]);
    assert.equal(h.now(), detectedAt, "detection time is the close event");
    assert.equal((await h.record())?.disconnectDeadline, undefined);
    assert.equal(await h.relayStorage.getAlarm(), null);
    h.advance(2 * DISCONNECT_GRACE);
    await h.alarm(h.name);
    assert.ok(await getGrant(h.env, h.grant.id));
    const pending = h.dispatch();
    const owner = h.editors[1];
    for (let n = 0; n < 100 && !owner.sent.some(message => JSON.parse(message).type === "command"); n++) await Promise.resolve();
    const command = owner.sent.map(message => JSON.parse(message) as { type: string; id: string }).find(value => value.type === "command");
    assert.ok(command);
    h.message(h.name, owner, JSON.stringify({ type: "result", ...owner.scope, id: command.id, result: { read: "works" } }));
    assert.deepEqual(await (await pending).json(), { ok: true, result: { read: "works" } });
    assert.equal((await h.ledger())!.entries.length, 1);
    assert.equal(h.counters.log.filter(row => row.name === `agent:${h.grant.id}` && row.category === "lifecycle").length, 0, "grant deletion call count");
  } finally { await h.dispose(); }
});

test("last close records close + five minutes; alarm deletes record, hub entry and ledger only at eligibility", async () => {
  const h = await fixture();
  try {
    const detectedAt = h.now();
    await h.close(h.name, h.editors[0]);
    const record = (await h.record())!;
    assert.equal(record.disconnectDeadline, detectedAt + DISCONNECT_GRACE);
    assert.equal(await h.relayStorage.getAlarm(), record.disconnectDeadline);
    h.advance(DISCONNECT_GRACE - 1);
    await h.alarm(h.name);
    assert.ok(await getGrant(h.env, h.grant.id));
    h.advance(1);
    const deletedAt = h.now();
    const get = h.namespace.get;
    let physicalCalls = 0;
    h.namespace.get = name => ({ fetch: request => {
      assert.equal(h.inCriticalSection(h.name), false, "external cleanup starts after blockConcurrencyWhile returns");
      physicalCalls++;
      return get(name).fetch(request);
    } });
    await h.alarm(h.name);
    h.namespace.get = get;
    assert.ok(physicalCalls >= 2, "physical cleanup call count");
    assert.equal(deletedAt, detectedAt + DISCONNECT_GRACE, "deletion time is the alarm run, separate from detection");
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
    assert.deepEqual((await getHub(h.env, h.sessionId))!.grants, []);
    assert.deepEqual((await h.ledger())!.entries, []);
    assert.equal(await h.relayStorage.getAlarm(), null);
    const socket = await h.reconnect();
    assert.ok(socket.sent.some(message => JSON.parse(message).type === "ready"));
    assert.deepEqual(await (await h.dispatch()).json(), { ok: false, code: "connect-agent-again", outcome: "not-sent" });
    const fresh = await createGrant(h.env, h.input);
    assert.ok(await getGrant(h.env, fresh.id));
    const pending = h.dispatch(fresh.id);
    // Observe a real relay command, then close to settle it without a timer wait.
    for (let n = 0; n < 100 && !socket.sent.some(message => JSON.parse(message).type === "command"); n++) await Promise.resolve();
    assert.ok(socket.sent.some(message => JSON.parse(message).type === "command"));
    await h.close(h.name, socket);
    assert.equal((await (await pending).json()).code, "unknown-outcome");
  } finally { await h.dispose(); }
});

test("reconnect immediately before eligibility cancels generation; old and repeated alarms delete nothing", async () => {
  const h = await fixture();
  try {
    await h.error(h.name, h.editors[0]);
    const old = (await h.record())!;
    h.advance(DISCONNECT_GRACE - 1);
    await h.reconnect();
    assert.ok((await h.record())!.generation > old.generation);
    assert.equal((await h.record())!.disconnectDeadline, undefined);
    assert.equal(await h.relayStorage.getAlarm(), null);
    h.advance(60_000);
    h.counters.reset();
    await h.alarm(h.name); await h.alarm(h.name);
    assert.ok(await getGrant(h.env, h.grant.id));
    assert.equal(h.counters.byCategory.lifecycle.keysDeleted, 0, "late alarm deleted key count");
    const lifecycle = new AgentLifecycle(h.relayStorage, new AlarmDeadlines(h.relayStorage));
    assert.equal(await lifecycle.fence(old.generation, 0, (await h.ledger())!.entries), false, "even stale deletion work cannot fence the new generation");
  } finally { await h.dispose(); }
});

test("remote-only grant arms grace; dispatch never extends it, and a never-handshaken or closing socket is not presence", async () => {
  const h = await fixture(0);
  try {
    const deadline = (await h.record())!.disconnectDeadline!;
    assert.equal(deadline, h.now() + DISCONNECT_GRACE);
    h.advance(60_000);
    h.restoreEditors(h.name, []);
    h.counters.reset();
    for (let n = 0; n < 3; n++) assert.equal((await (await h.dispatch()).json()).code, "editor-unavailable");
    assert.equal(Object.values(h.counters.byCategory).reduce((n, value) => n + value.keysWritten, 0), 0, "remote tool traffic written key count");
    assert.equal(h.counters.readKeys.filter(key => key === LIFECYCLE_KEY).length, 1, "lifecycle read key count per object wake");
    assert.equal((await h.record())!.disconnectDeadline, deadline);
    const unproven = editor();
    unproven.serializeAttachment({ ...unproven.scope, role: "editor", handshaken: false });
    const closing = editor("closing"); closing.readyState = 2;
    h.restoreEditors(h.name, [unproven, closing]);
    h.advance(DISCONNECT_GRACE);
    await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
  } finally { await h.dispose(); }
});

test("unknown edit outcome on last close still cleans on schedule", async () => {
  const h = await fixture();
  try {
    const pending = h.dispatch();
    for (let n = 0; n < 100 && !h.editors[0].sent.some(message => JSON.parse(message).type === "command"); n++) await Promise.resolve();
    assert.ok(h.editors[0].sent.some(message => JSON.parse(message).type === "command"));
    await h.close(h.name, h.editors[0]);
    assert.deepEqual(await (await pending).json(), { ok: false, code: "unknown-outcome", outcome: "unknown" });
    assert.equal((await h.record())!.disconnectDeadline, h.now() + DISCONNECT_GRACE);
    h.advance(DISCONNECT_GRACE); await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
  } finally { await h.dispose(); }
});

test("failed deletion stays fenced across reconnect and retries; tombstones refuse reserve, finalize and rebind", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  try {
    const second = await createGrant(h.env, h.input);
    const oldGrant = await getGrant(h.env, h.grant.id);
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE);
    let failing = true;
    h.namespace.get = name => ({ fetch: request => failing && String(name) === `agent:${h.grant.id}` && request.method === "DELETE"
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    assert.deepEqual((await h.ledger())!.entries.map(entry => [entry.id, entry.state]), [[h.grant.id, "cleaned"]]);
    assert.equal(await h.storage(`agent:${second.id}`).get("session"), undefined);
    assert.ok(await h.relayStorage.getAlarm());
    await h.reconnect();
    assert.equal((await (await h.dispatch()).json()).code, "connect-agent-again");
    for (const action of [
      { action: "reserve", sessionId: h.sessionId, bytes: 100, expiresAt: h.input.expiresAt, generation: 99 },
      { action: "finalize", generation: 1 },
    ]) {
      const response = await h.namespace.get(h.name).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
        method: "POST", body: JSON.stringify({ ...action, workspace: workspaceKey(workspace), id: h.grant.id }),
      }));
      assert.equal((await response.json()).reason, "cleaned");
    }
    await assert.rejects(rebindGrant(h.env, h.grant.id, oldGrant, { repoId: repo.id, repo: repo.full_name, branch: "other" }), { status: 401 });
    failing = false; h.advance(30_000); await h.alarm(h.name); await h.alarm(h.name);
    assert.deepEqual((await h.ledger())!.entries, []);
    assert.equal(await h.relayStorage.getAlarm(), null);
    await h.reconnect();
    assert.equal((await (await h.dispatch()).json()).code, "connect-agent-again");
    const tombstone = await h.namespace.get(h.name).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
      method: "POST", body: JSON.stringify({ action: "reserve", workspace: workspaceKey(workspace), id: h.grant.id,
        generation: 99, sessionId: h.sessionId, bytes: 100, expiresAt: h.input.expiresAt }),
    }));
    assert.equal((await tombstone.json()).reason, "cleaned", "physical release cannot resurrect a tombstoned id");
    assert.ok(await createGrant(h.env, h.input));
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("agent cleanup preserves live sign-in, config, repository cache and unrelated session purpose", async () => {
  const h = await fixture();
  try {
    const session = await h.storage(h.sessionId).get("session");
    const local = h.namespace.get(h.name);
    await local.fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify(session) }));
    await local.fetch(new Request("https://session.internal/config", { method: "PUT", body: JSON.stringify({ appId: "keep" }) }));
    await h.relayStorage.put("repositoryCache", { marker: "keep" });
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE); await h.alarm(h.name);
    assert.deepEqual(await h.relayStorage.get("session"), session);
    assert.deepEqual(await h.storage(h.sessionId).get("session"), session);
    assert.deepEqual(await h.relayStorage.get("config"), { appId: "keep" });
    assert.deepEqual(await h.relayStorage.get("repositoryCache"), { marker: "keep" });
    assert.equal(await h.relayStorage.getAlarm(), (session as { expiresAt: number }).expiresAt);
  } finally { await h.dispose(); }
});

test("sign-out and one revoke deny immediately while physical deletion is held or fails; other grants survive", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  try {
    const second = await createGrant(h.env, h.input);
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    h.namespace.get = name => ({ async fetch(request) {
      if (String(name) === `agent:${h.grant.id}` && request.method === "DELETE") { entered(); await held; return new Response(null, { status: 503 }); }
      return get(name).fetch(request);
    } });
    const revoking = revokeGrant(h.env, h.grant.id, h.sessionId);
    await started;
    const rpc = (token: string) => h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal((await rpc(h.grant.token)).status, 401);
    assert.equal((await rpc(second.token)).status, 200);
    release(); await revoking;
    assert.ok((await h.ledger())!.entries.some(entry => entry.id === h.grant.id), "failed physical deletion remains counted");
    h.namespace.get = get;
    await revokeGrant(h.env, h.grant.id, h.sessionId);
    assert.equal((await h.ledger())!.entries.some(entry => entry.id === h.grant.id), false);
    let releaseLogout!: () => void, enteredLogout!: () => void;
    const heldLogout = new Promise<void>(resolve => { releaseLogout = resolve; });
    const startedLogout = new Promise<void>(resolve => { enteredLogout = resolve; });
    h.namespace.get = name => ({ async fetch(request) {
      if (String(name) === `agent:${second.id}` && request.method === "DELETE") {
        enteredLogout(); await heldLogout; return new Response(null, { status: 503 });
      }
      return get(name).fetch(request);
    } });
    const logout = h.worker.dispatchFetch(origin + "/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: h.cookie } });
    try {
      await startedLogout;
      assert.equal((await rpc(second.token)).status, 401, "session fence precedes delayed physical deletion");
    } finally { releaseLogout(); }
    assert.equal((await logout).status, 204);
    h.namespace.get = get;
    await revokeGrant(h.env, second.id, h.sessionId);
    await assert.rejects(getGrant(h.env, second.id), { status: 401 });
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("deadline table schedules earliest purpose, clears independently, and preserves legacy expiry without constructor writes", async () => {
  const counters = new UsageCounters(), storage = new CountedStorage(counters);
  await storage.put("session", { kind: "user", expiresAt: 900 }); await storage.setAlarm(900);
  counters.reset();
  const deadlines = new AlarmDeadlines(storage);
  new AgentLifecycle(storage, deadlines, () => 1);
  assert.equal(counters.byCategory.data.keysWritten, 0, "constructor written key count");
  assert.equal(counters.log.length, 0, "constructor alarm call count");
  assert.deepEqual(await deadlines.read(), { session: 900 });
  await deadlines.set("agent-cleanup", 300);
  await deadlines.set("registration", 500);
  assert.equal(await storage.getAlarm(), 300);
  await deadlines.set("session", 1000);
  assert.equal(await storage.getAlarm(), 300, "later purpose cannot postpone earliest");
  await deadlines.set("agent-cleanup"); assert.equal(await storage.getAlarm(), 500);
  await deadlines.set("registration"); assert.equal(await storage.getAlarm(), 1000);
  await deadlines.set("session"); assert.equal(await storage.getAlarm(), null);
  assert.equal(await storage.get(DEADLINES_KEY), undefined);
});

test("combined real alarm fires session, agent and registration purposes in order; DELETE preserves unrelated deadlines", async () => {
  const h = await fixture();
  try {
    const local = h.namespace.get(h.name);
    const session = await h.storage(h.sessionId).get<object>("session");
    await local.fetch(new Request("https://session.internal/", { method: "PUT", body: JSON.stringify({ ...session, expiresAt: h.now() + 120_000 }) }));
    await h.close(h.name, h.editors[0]);
    const registered = await local.fetch(new Request("https://session.internal/oauth-registration", {
      method: "POST", body: JSON.stringify({ ipHash: "no-cf-ip", clientId: `mcp_${"a".repeat(32)}`, expiresAt: h.now() + 180 * 86400_000 }),
    }));
    assert.equal((await registered.json()).allowed, true);
    assert.deepEqual(await h.relayStorage.get(DEADLINES_KEY), {
      session: h.now() + 120_000, "agent-cleanup": h.now() + DISCONNECT_GRACE, registration: h.now() + 600_000,
    });
    h.advance(120_000); await h.alarm(h.name);
    assert.equal(await h.relayStorage.get("session"), undefined);
    assert.ok(await getGrant(h.env, h.grant.id));
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 180_000);
    h.advance(180_000); await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 300_000);
    await local.fetch(new Request("https://session.internal/", { method: "DELETE" }));
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 300_000, "session DELETE cannot clear registration's deadline");
    h.advance(300_000); await h.alarm(h.name);
    const budget = await h.relayStorage.get<{ pending: object; retained: number }>("oauth-registration-budget");
    assert.deepEqual(budget!.pending, {}); assert.equal(budget!.retained, 1);
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 86400_000);
  } finally { await h.dispose(); }
});

test("legacy alarms preserve live sign-ins and config, then expire session/cache and legacy registration budgets", async () => {
  const h = await fixture();
  try {
    const storage = h.storage("legacy-session");
    const session = { kind: "user", expiresAt: h.now() + 1000 };
    await storage.put({ session, config: { appId: "keep" }, repositoryCache: { keep: true } });
    await storage.setAlarm(h.now());
    await h.alarm("legacy-session");
    assert.deepEqual(await storage.get("session"), session);
    assert.deepEqual(await storage.get("repositoryCache"), { keep: true });
    assert.equal(await storage.getAlarm(), session.expiresAt);
    h.advance(1000); await h.alarm("legacy-session");
    assert.equal(await storage.get("session"), undefined);
    assert.equal(await storage.get("repositoryCache"), undefined);
    assert.deepEqual(await storage.get("config"), { appId: "keep" });
    const budget = h.storage("legacy-registration");
    await budget.put("oauth-registration-budget", { hour: { start: h.now() - 86400_000, count: 1 }, day: { start: h.now() - 86400_000, count: 1 }, ips: {} });
    await budget.setAlarm(h.now());
    await h.alarm("legacy-registration");
    assert.equal(await budget.get("oauth-registration-budget"), undefined);
    assert.equal(await budget.getAlarm(), null);
  } finally { await h.dispose(); }
});

test("new remote-only grant receives its own grace while older fenced deletion retries", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  try {
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE);
    h.namespace.get = name => ({ fetch: request => String(name) === `agent:${h.grant.id}` && request.method === "DELETE"
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    const fresh = await createGrant(h.env, h.input);
    const deadline = h.now() + DISCONNECT_GRACE;
    assert.equal((await h.record())!.disconnectDeadline, deadline);
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 30_000, "new grace cannot postpone an older deletion retry");
    h.namespace.get = get;
    h.advance(30_000); await h.alarm(h.name);
    assert.ok(await getGrant(h.env, fresh.id));
    assert.equal(await h.relayStorage.getAlarm(), deadline);
    h.advance(DISCONNECT_GRACE - 30_000); await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, fresh.id), { status: 401 });
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("local fence transaction failure rolls back both ledger and tombstones; retry still deletes safely", async () => {
  const h = await fixture();
  try {
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE);
    h.relayStorage.failNextWrite();
    await assert.rejects(h.alarm(h.name), /Injected/);
    assert.equal((await h.ledger())!.entries[0].state, "final");
    assert.deepEqual((await h.record())!.cleaned, {});
    assert.equal(await h.relayStorage.getAlarm(), h.now());
    await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
    assert.deepEqual((await h.ledger())!.entries, []);
  } finally { await h.dispose(); }
});

test("cleanup fences a first grant PUT delayed past cleanup, even within its original allocation deadline", async () => {
  const h = await fixture(0);
  const get = h.namespace.get;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let creating: Promise<unknown> | undefined;
  let delayedId = "", delayedStatus = 0;
  try {
    h.advance(DISCONNECT_GRACE - 1000);
    h.namespace.get = name => ({ async fetch(request) {
      if (String(name).startsWith("agent:") && request.method === "PUT") {
        delayedId = String(name).slice(6); entered(); await held;
        const response = await get(name).fetch(request); delayedStatus = response.status; return response;
      }
      return get(name).fetch(request);
    } });
    creating = createGrant(h.env, h.input);
    const rejected = assert.rejects(creating, { status: 503 });
    await started;
    h.advance(1000); await h.alarm(h.name);
    assert.deepEqual((await h.ledger())!.entries, []);
    release(); await rejected;
    assert.equal(delayedStatus, 409, "grant object refuses first PUT after physical cleanup, before allocation deadline");
    assert.equal(await h.storage(`agent:${delayedId}`).get("session"), undefined);
    assert.deepEqual((await getHub(h.env, h.sessionId))!.grants, []);
    h.advance(h.input.expiresAt - h.now());
    await h.alarm(`agent:${delayedId}`);
    assert.equal(await h.storage(`agent:${delayedId}`).get("agent-cleaned-until"), undefined, "record tombstone expires with its grant");
  } finally { release(); await creating?.catch(() => undefined); h.namespace.get = get; await h.dispose(); }
});

test("an older failed deletion retry cannot postpone a newer grant's disconnect deadline", async () => {
  const h = await fixture(0);
  const get = h.namespace.get;
  try {
    h.advance(DISCONNECT_GRACE);
    h.namespace.get = name => ({ fetch: request => String(name) === `agent:${h.grant.id}` && request.method === "DELETE"
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    const fresh = await createGrant(h.env, h.input);
    const deadline = (await h.record())!.disconnectDeadline!;
    h.advance(DISCONNECT_GRACE - 1000);
    await assert.rejects(h.alarm(h.name), /incomplete/);
    assert.equal(await h.relayStorage.getAlarm(), deadline);
    assert.ok(await getGrant(h.env, fresh.id));
    h.namespace.get = get;
    h.advance(1000); await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, fresh.id), { status: 401 });
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("reconnecting during a new grant's grace preserves older fenced deletion retries", async () => {
  const h = await fixture(0);
  const get = h.namespace.get;
  try {
    h.advance(DISCONNECT_GRACE);
    h.namespace.get = name => ({ fetch: request => String(name) === `agent:${h.grant.id}` && request.method === "DELETE"
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    const fresh = await createGrant(h.env, h.input);
    await h.reconnect();
    assert.equal((await h.record())!.disconnectDeadline, undefined);
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 30_000);
    h.namespace.get = get;
    h.advance(30_000); await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
    assert.ok(await getGrant(h.env, fresh.id));
    assert.equal(await h.relayStorage.getAlarm(), null);
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("sign-out denies authentication before a delayed grant inventory read", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let logout: Promise<Response> | undefined;
  try {
    let delayed = true;
    h.namespace.get = name => ({ async fetch(request) {
      if (delayed && String(name) === `agent-hub:${h.sessionId}` && request.method === "GET") {
        delayed = false; entered(); await held;
      }
      return get(name).fetch(request);
    } });
    logout = h.worker.dispatchFetch(origin + "/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: h.cookie } });
    await started;
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${h.grant.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal(response.status, 401);
    release(); assert.equal((await logout).status, 204);
  } finally { release(); await logout; h.namespace.get = get; await h.dispose(); }
});

test("storage latency does not move detection time or the five-minute eligibility deadline", async () => {
  const storage = new CountedStorage(new UsageCounters());
  let now = 100;
  const lifecycle = new AgentLifecycle(storage, new AlarmDeadlines(storage), () => now);
  const loss = lifecycle.presence(0);
  now += 2000; // The asynchronous local read completes after detection.
  await loss;
  assert.equal((await lifecycle.load()).disconnectDeadline, 100 + DISCONNECT_GRACE);
  assert.equal(await storage.getAlarm(), 100 + DISCONNECT_GRACE);
});

test("rebind racing source cleanup: a failed compensating delete still leaves the destination generation unusable", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  const destination = await relayObjectName({ ...workspace, branch: "other" });
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const previous = await getGrant(h.env, h.grant.id);
    h.namespace.get = name => ({ async fetch(request) {
      if (String(name) === destination && new URL(request.url).pathname === METADATA_ROUTE) {
        const body = await request.clone().json() as { action?: string };
        if (body.action === "finalize") { entered(); await held; }
      }
      if (String(name) === `agent:${h.grant.id}` && request.method === "DELETE") return new Response(null, { status: 503 });
      return get(name).fetch(request);
    } });
    const rebinding = rebindGrant(h.env, h.grant.id, previous, { repoId: repo.id, repo: repo.full_name, branch: "other" });
    const rejected = assert.rejects(rebinding, { status: 401 });
    await started;
    // The source workspace loses its last editor and is cleaned while the destination finalize is held.
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE); await h.alarm(h.name);
    assert.deepEqual((await h.ledger())!.entries, [], "a grant already rebound away releases the source entry, no endless retries");
    assert.equal(await h.relayStorage.getAlarm(), null);
    release(); await rejected;
    const rpc = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${h.grant.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal(rpc.status, 401, "hub removal denies before the failed record deletion");
    assert.equal((await getHub(h.env, h.sessionId))!.grants.some(grant => grant.id === h.grant.id), false);
    const counted = (await h.storage(destination).get<Ledger>(METADATA_KEY))!.entries.some(entry => entry.id === h.grant.id);
    assert.equal(counted, true, "an uncertain record deletion stays counted in the destination");
  } finally { release(); h.namespace.get = get; await h.dispose(); }
});

test("cleanup tombstones count toward the 64 KiB workspace budget, shrink after deletion and expire without another disconnect", async () => {
  const h = await fixture();
  try {
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE); await h.alarm(h.name);
    const after = (await h.record())!;
    assert.ok(after.cleaned[h.grant.id] <= h.now() + TOMBSTONE_AFTER_DELETION, "deleted grant keeps only a short tombstone");
    // Fill the lifecycle record with live tombstones: admission must count them before allocating.
    const many = Object.fromEntries(Array.from({ length: 900 }, (_, n) => [n.toString(16).padStart(64, "0"), h.now() + 60_000]));
    await h.relayStorage.put(LIFECYCLE_KEY, { ...after, cleaned: { ...after.cleaned, ...many } });
    await h.reconnect();
    const refuse = async () => {
      const response = await h.namespace.get(h.name).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
        method: "POST", body: JSON.stringify({ action: "reserve", workspace: workspaceKey(workspace), id: "f".repeat(64),
          generation: 1, sessionId: h.sessionId, bytes: 100, expiresAt: h.input.expiresAt }),
      }));
      return (await response.json()) as { allowed: boolean; reason?: string };
    };
    assert.deepEqual(await refuse(), { allowed: false, reason: "bytes", entries: [] } as never);
    // Without any new disconnect, expired tombstones are pruned on the next admission.
    h.advance(TOMBSTONE_AFTER_DELETION + 1);
    assert.equal((await refuse()).allowed, true);
    assert.deepEqual(Object.keys((await h.record())!.cleaned), []);
  } finally { await h.dispose(); }
});
