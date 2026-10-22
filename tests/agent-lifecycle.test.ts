import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_PERMISSION_LIFETIME, AgentLifecycle, AlarmDeadlines, DEADLINES_KEY, DISCONNECT_GRACE, LIFECYCLE_KEY, RECORD_FENCE_BYTES, type LifecycleRecord } from "../worker/agent-lifecycle";
import { AgentRelay, relayObjectName, type RelayScope, type RelaySocket } from "../worker/agent-relay";
import { createGrant, getGrant, getHub, rebindGrant, revokeGrant, TEMPORARY_ROUTE } from "../worker/agent-context";
import { METADATA_KEY, METADATA_ROUTE, type Ledger } from "../worker/agent-metadata";
import type { Env } from "../worker/app";
import { CountedStorage, UsageCounters, startCountedWorker } from "./fakes/counted-agent";
import { origin, repo, signIn } from "./mcp-harness";
import { workspaceKey } from "../shared/agent-command";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
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
  const hubStorage = h.storage(`agent-hub:${sessionId}`);
  /** Temporary agent data as older hubs kept it: drafts mirror, context, requests and inline receipts. */
  const seedTemporary = async () => {
    const hub = await hubStorage.get<object>("session");
    await hubStorage.put({ session: { ...hub, context: { secret: "context" }, commands: [{ id: "receipt", state: "applied" }], tabId: "old" },
      context: { secret: "context" }, drafts: { ["d".repeat(64)]: 1 }, ["draft:" + "d".repeat(64)]: "draft text", requests: [{ id: "request" }] });
  };
  /** Temporary data still stored: separate keys, and fields kept inline in the hub record. */
  const leftovers = async () => {
    const present = [];
    for (const key of ["context", "drafts", "requests", "draft:" + "d".repeat(64)]) if (await hubStorage.get(key) !== undefined) present.push(key);
    const hub = await hubStorage.get<Record<string, unknown>>("session");
    return { present, inline: Object.keys(hub ?? {}).filter(key => !["kind", "login", "expiresAt", "grants"].includes(key)) };
  };
  /** One MCP tool call through the real Worker, as an agent makes it. */
  const tool = async (name: string, args: Record<string, unknown> = {}, token = grant.token) => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    const text = (await response.text()).trim();
    return { status: response.status, body: text ? JSON.parse(text.startsWith("event:") ? text.split("data: ")[1].split("\n")[0] : text) : undefined };
  };
  return { ...h, env, name, relayStorage: storage, editors, grant, input, sessionId, cookie: signed.cookie, reconnect, dispatch,
    hubStorage, seedTemporary, leftovers, tool,
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

test("last close records close + five minutes; the alarm then removes only temporary agent data and the permission stays", async () => {
  const h = await fixture();
  try {
    await h.seedTemporary();
    const detectedAt = h.now();
    await h.close(h.name, h.editors[0]);
    const record = (await h.record())!;
    assert.equal(record.disconnectDeadline, detectedAt + DISCONNECT_GRACE);
    assert.equal(await h.relayStorage.getAlarm(), record.disconnectDeadline);
    h.advance(DISCONNECT_GRACE - 1);
    await h.alarm(h.name);
    assert.equal((await h.leftovers()).present.length, 4, "nothing is removed before the grace ends");
    h.advance(1);
    const get = h.namespace.get;
    let hubCalls = 0;
    h.namespace.get = name => ({ fetch: request => {
      assert.equal(h.inCriticalSection(h.name), false, "external cleanup starts after blockConcurrencyWhile returns");
      if (new URL(request.url).pathname === TEMPORARY_ROUTE) hubCalls++;
      return get(name).fetch(request);
    } });
    await h.alarm(h.name);
    h.namespace.get = get;
    assert.equal(hubCalls, 1, "one temporary-data call per session hub");
    assert.deepEqual(await h.leftovers(), { present: [], inline: [] }, "drafts mirror, context, requests and receipts are gone");
    assert.ok(await getGrant(h.env, h.grant.id), "the permission outlives the grace");
    assert.deepEqual((await getHub(h.env, h.sessionId))!.grants.map(grant => grant.id), [h.grant.id]);
    assert.deepEqual((await h.ledger())!.entries.map(entry => [entry.id, entry.state]), [[h.grant.id, "final"]]);
    assert.equal(await h.relayStorage.getAlarm(), null);
  } finally { await h.dispose(); }
});

test("a permission survives 10 minutes with no tab: tools wait instead of failing auth, and work when a tab opens", async () => {
  const h = await fixture();
  try {
    await h.close(h.name, h.editors[0]);
    h.advance(DISCONNECT_GRACE); await h.alarm(h.name);
    h.advance(10 * 60_000 - DISCONNECT_GRACE);
    const closed = await h.tool("read_file", { path: "index.html" });
    assert.equal(closed.status, 200, "no auth error");
    assert.equal(closed.body.result.isError, true);
    const waiting = JSON.parse(closed.body.result.content[0].text);
    assert.equal(waiting.state, "waiting");
    assert.match(waiting.message, /^The editor isn't open for .+ on branch main\. Open it and the agent can continue/);
    assert.ok(waiting.message.includes(`open ${repo.full_name} on branch main there`), "the steps reopen this connection's site");
    assert.match(waiting.message, /remote agents are on \(the project menu shows Disconnect MCP/);
    assert.doesNotMatch(waiting.message, /Get started|gh repo create/, "no steps that create another repository");
    const site = await h.tool("get_site");
    assert.equal(JSON.parse(site.body.result.content[0].text).state, "waiting");
    // A tab opens with agents on: the same token reaches it, without reconnecting the agent.
    const socket = await h.reconnect();
    const pending = h.tool("read_file", { path: "index.html" });
    // Up to ~5 s of real time (Date.now is faked here): a loaded machine needs more than a few turns.
    for (let n = 0; n < 1000 && !socket.sent.some(message => JSON.parse(message).type === "command"); n++) await new Promise(resolve => setTimeout(resolve, 5));
    const command = socket.sent.map(message => JSON.parse(message) as { type: string; id: string }).find(value => value.type === "command")!;
    assert.ok(command, "the tool call reaches the new tab");
    h.message(h.name, socket, JSON.stringify({ type: "result", ...socket.scope, id: command.id, result: { ok: true, value: { path: "index.html", content: "works" } } }));
    const read = await pending;
    assert.deepEqual(JSON.parse(read.body.result.content[0].text), { path: "index.html", content: "works" });
  } finally { await h.dispose(); }
});

test("a permission ends 8 hours after the agent connected, even while the editor sign-in lasts", async () => {
  const h = await fixture();
  try {
    const long = await createGrant(h.env, { ...h.input, expiresAt: h.now() + 2 * AGENT_PERMISSION_LIFETIME });
    assert.equal(long.expiresAt, h.now() + AGENT_PERMISSION_LIFETIME);
    assert.equal((await getGrant(h.env, long.id)).expiresAt, h.now() + AGENT_PERMISSION_LIFETIME);
    const shorter = await createGrant(h.env, h.input);
    assert.equal(shorter.expiresAt, h.input.expiresAt, "a sign-in that ends sooner ends the permission sooner");
    h.advance(AGENT_PERMISSION_LIFETIME - 1);
    assert.ok(await getGrant(h.env, long.id));
    h.advance(1);
    await assert.rejects(getGrant(h.env, long.id), { status: 401 });
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
    assert.equal(await lifecycle.begin(old.generation, 0), false, "even stale cleanup work cannot claim the new generation");
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
    await h.seedTemporary();
    h.advance(DISCONNECT_GRACE);
    await h.alarm(h.name);
    assert.deepEqual(await h.leftovers(), { present: [], inline: [] });
    assert.ok(await getGrant(h.env, h.grant.id));
  } finally { await h.dispose(); }
});

test("unknown edit outcome on last close still cleans temporary data on schedule", async () => {
  const h = await fixture();
  try {
    const pending = h.dispatch();
    for (let n = 0; n < 100 && !h.editors[0].sent.some(message => JSON.parse(message).type === "command"); n++) await Promise.resolve();
    assert.ok(h.editors[0].sent.some(message => JSON.parse(message).type === "command"));
    await h.close(h.name, h.editors[0]);
    assert.deepEqual(await (await pending).json(), { ok: false, code: "unknown-outcome", outcome: "unknown" });
    assert.equal((await h.record())!.disconnectDeadline, h.now() + DISCONNECT_GRACE);
    await h.seedTemporary();
    h.advance(DISCONNECT_GRACE); await h.alarm(h.name);
    assert.deepEqual(await h.leftovers(), { present: [], inline: [] });
    assert.equal((await h.record())!.cleanupPending, undefined);
    assert.ok(await getGrant(h.env, h.grant.id));
  } finally { await h.dispose(); }
});

test("a failed temporary-data clear keeps the permission and retries in 30 s, even after a reconnect", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  try {
    await h.seedTemporary();
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE);
    let failing = true;
    h.namespace.get = name => ({ fetch: request => failing && new URL(request.url).pathname === TEMPORARY_ROUTE
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    assert.equal((await h.record())!.cleanupPending, true);
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 30_000);
    await h.reconnect();
    assert.equal((await h.record())!.disconnectDeadline, undefined);
    failing = false; h.advance(30_000); await h.alarm(h.name);
    assert.deepEqual(await h.leftovers(), { present: [], inline: [] }, "the claimed cleanup still finishes");
    assert.equal((await h.record())!.cleanupPending, undefined);
    assert.equal(await h.relayStorage.getAlarm(), null);
    assert.ok(await getGrant(h.env, h.grant.id));
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("tombstones written before 8-hour permissions still refuse their id until they expire, then admission prunes them", async () => {
  const h = await fixture();
  try {
    const legacy = "c".repeat(64);
    await h.relayStorage.put(LIFECYCLE_KEY, { generation: 3, cleaned: { [legacy]: h.now() + 60_000 } });
    h.restoreEditors(h.name, h.editors); // A later wake reads the stored record.
    const lifecycle = new AgentLifecycle(h.relayStorage as never, new AlarmDeadlines(h.relayStorage as never), h.now);
    const max = Number.MAX_SAFE_INTEGER;
    const widest = { generation: max, cleaned: { [legacy]: h.now() + 60_000 }, disconnectDeadline: max, cleanupPending: true };
    assert.equal(await lifecycle.admissionBytes(), size(widest) + size({ [DEADLINES_KEY]: { "agent-cleanup": max } }) + RECORD_FENCE_BYTES);
    const reserve = async () => {
      const response = await h.namespace.get(h.name).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
        method: "POST", body: JSON.stringify({ action: "reserve", workspace: workspaceKey(workspace), id: legacy,
          generation: 1, sessionId: h.sessionId, bytes: 100, expiresAt: h.input.expiresAt }),
      }));
      return (await response.json()) as { allowed: boolean; reason?: string };
    };
    assert.equal((await reserve()).reason, "cleaned");
    h.advance(60_001);
    assert.equal((await reserve()).allowed, true);
    assert.deepEqual((await h.record())!.cleaned, {});
  } finally { await h.dispose(); }
});

test("a removal an earlier version fenced but did not finish is finished once: record, hub entry and ledger entry go", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  try {
    // State the old grace left after a failed deletion: ledger entry "cleaned", tombstone, claim and a 30 s retry.
    const ledger = (await h.ledger())!;
    ledger.entries[0].state = "cleaned";
    await h.relayStorage.put(METADATA_KEY, ledger);
    await h.relayStorage.put(LIFECYCLE_KEY, { generation: 2, cleaned: { [h.grant.id]: h.input.expiresAt }, cleanupPending: true });
    await h.relayStorage.put(DEADLINES_KEY, { "agent-cleanup": h.now() });
    h.restoreEditors(h.name, []); // The new version wakes on the old retry with no tab.
    let failing = true;
    h.namespace.get = name => ({ fetch: request => failing && name === `agent:${h.grant.id}`
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    assert.deepEqual((await h.ledger())!.entries.map(entry => entry.state), ["cleaned"], "an unknown outcome stays counted");
    assert.equal(await h.relayStorage.getAlarm(), h.now() + 30_000);
    failing = false; h.advance(30_000); await h.alarm(h.name);
    await assert.rejects(getGrant(h.env, h.grant.id), { status: 401 });
    assert.deepEqual((await getHub(h.env, h.sessionId))?.grants ?? [], []);
    assert.deepEqual((await h.ledger())?.entries ?? [], [], "the slot is free for a new connection");
    assert.equal((await h.record())!.cleanupPending, undefined);
    assert.equal(await h.relayStorage.getAlarm(), null);
  } finally { h.namespace.get = get; await h.dispose(); }
});

test("an earlier version's fenced entry for a grant since rebound away is only released: record, hub entry and destination count stay", async () => {
  const h = await fixture();
  try {
    const source = (await h.ledger())!.entries.find(entry => entry.id === h.grant.id)!;
    await rebindGrant(h.env, h.grant.id, await getGrant(h.env, h.grant.id), { repoId: repo.id, repo: repo.full_name, branch: "other" });
    // The old grace fenced the source entry just as the rebind landed, then the deploy came.
    const ledger = (await h.ledger()) ?? { workspace: workspaceKey(workspace), entries: [] };
    await h.relayStorage.put(METADATA_KEY, { ...ledger, entries: [...ledger.entries.filter(entry => entry.id !== source.id), { ...source, state: "cleaned" }] });
    await h.relayStorage.put(LIFECYCLE_KEY, { generation: 2, cleaned: { [source.id]: source.expiresAt }, cleanupPending: true });
    await h.relayStorage.put(DEADLINES_KEY, { "agent-cleanup": h.now() });
    h.restoreEditors(h.name, []);
    await h.alarm(h.name);
    assert.deepEqual((await h.ledger())!.entries, [], "the source entry is released");
    assert.deepEqual((await getHub(h.env, h.sessionId))!.grants.map(grant => [grant.id, grant.branch]), [[h.grant.id, "other"]]);
    const destination = await h.storage(await relayObjectName({ ...workspace, branch: "other" })).get<Ledger>(METADATA_KEY);
    assert.ok(destination!.entries.some(entry => entry.id === h.grant.id), "the destination still counts it");
    assert.equal((await getGrant(h.env, h.grant.id)).branch, "other");
    assert.equal((await h.tool("read_file", { path: "index.html" })).status, 200, "the token still authenticates");
    assert.equal((await h.record())!.cleanupPending, undefined);
  } finally { await h.dispose(); }
});

test("one grace both finishes an earlier version's removal and clears a live connection's temporary data; the claim ends only when both succeed", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  try {
    const legacy = await createGrant(h.env, h.input);
    const ledger = (await h.ledger())!;
    ledger.entries.find(entry => entry.id === legacy.id)!.state = "cleaned";
    await h.relayStorage.put(METADATA_KEY, ledger);
    const record = (await h.record()) ?? { generation: 0, cleaned: {} };
    await h.relayStorage.put(LIFECYCLE_KEY, { ...record, cleaned: { [legacy.id]: h.input.expiresAt } });
    h.restoreEditors(h.name, h.editors); // A later wake reads the stored state.
    await h.seedTemporary();
    await h.close(h.name, h.editors[0]);
    h.advance(DISCONNECT_GRACE);
    let failing = true;
    h.namespace.get = name => ({ fetch: request => failing && name === `agent:${legacy.id}`
      ? Promise.resolve(new Response(null, { status: 503 })) : get(name).fetch(request) });
    await assert.rejects(h.alarm(h.name), /incomplete/);
    assert.deepEqual(await h.leftovers(), { present: [], inline: [] }, "the live connection's temporary data is cleared");
    const states = async () => Object.fromEntries((await h.ledger())!.entries.map(entry => [entry.id, entry.state]));
    assert.deepEqual(await states(), { [h.grant.id]: "final", [legacy.id]: "cleaned" });
    assert.equal((await h.record())!.cleanupPending, true, "the claim stays while the earlier removal is unfinished");
    assert.equal((await h.tool("read_file", { path: "index.html" })).status, 200, "the live permission still authenticates");
    failing = false; h.advance(30_000); await h.alarm(h.name);
    assert.deepEqual(await states(), { [h.grant.id]: "final" }, "the earlier entry is released");
    await assert.rejects(getGrant(h.env, legacy.id), { status: 401 });
    assert.deepEqual((await getHub(h.env, h.sessionId))!.grants.map(grant => grant.id), [h.grant.id]);
    assert.ok(await getGrant(h.env, h.grant.id));
    assert.equal((await h.record())!.cleanupPending, undefined);
    assert.equal(await h.relayStorage.getAlarm(), null);
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
    assert.ok(await getGrant(h.env, h.grant.id), "the grace leaves the permission");
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

test("a workspace filled to exactly 64 KiB stays within it after the grace writes its lifecycle record and deadline", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const reserve = async (id: string, bytes: number) => {
      const response = await h.namespace.get(h.name).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
        method: "POST", body: JSON.stringify({ action: "reserve", workspace: workspaceKey(workspace), id, generation: 1,
          sessionId: h.sessionId, bytes, expiresAt: h.input.expiresAt }) }));
      return ((await response.json()) as { allowed: boolean }).allowed;
    };
    const probe = "e".repeat(64);
    const releaseProbe = () => h.namespace.get(h.name).fetch(new Request(`https://session.internal${METADATA_ROUTE}`, {
      method: "POST", body: JSON.stringify({ action: "release", workspace: workspaceKey(workspace), id: probe, generation: 1 }) }));
    for (const id of ["a", "b", "c"].map(letter => letter.repeat(64))) assert.ok(await reserve(id, 15_000));
    let low = 1, high = 64 * 1024;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (await reserve(probe, mid)) { await releaseProbe(); low = mid; } else high = mid - 1;
    }
    assert.equal(await reserve(probe, low + 1), false, "one byte more is refused for its size");
    assert.ok(await reserve("d".repeat(64), low), "the last reservation lands exactly on the boundary");
    h.namespace.get = name => ({ async fetch(request) {
      if (new URL(request.url).pathname === TEMPORARY_ROUTE) { entered(); await held; }
      return get(name).fetch(request);
    } });
    await h.close(h.name, h.editors[0]); h.advance(DISCONNECT_GRACE);
    const alarm = h.alarm(h.name).catch(() => undefined);
    await started;
    const ledger = (await h.ledger())!;
    assert.ok(ledger.entries.every(entry => entry.state !== "cleaned"), "the grace never fences a permission");
    const record = (await h.record())!;
    assert.equal(record.cleanupPending, true);
    const grantEntry = ledger.entries.find(entry => entry.id === h.grant.id)!;
    const external = 3 * 15_000 + low + grantEntry.bytes;
    const deadlines = size({ [DEADLINES_KEY]: await h.relayStorage.get(DEADLINES_KEY) });
    const physical = size(ledger) + external + size(record) + deadlines;
    assert.ok(physical <= 64 * 1024, `retained agent metadata ${physical} bytes stays within 64 KiB`);
    release(); await alarm;
  } finally { release(); h.namespace.get = get; await h.dispose(); }
});

test("rebind whose final source check goes unanswered compensates instead of leaving the token authorized", async () => {
  const h = await fixture();
  const get = h.namespace.get;
  const destination = await relayObjectName({ ...workspace, branch: "other" });
  let release!: () => void, entered!: () => void, sourceDown = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const previous = await getGrant(h.env, h.grant.id);
    h.namespace.get = name => ({ async fetch(request) {
      const path = new URL(request.url).pathname;
      if (String(name) === destination && path === METADATA_ROUTE && (await request.clone().json() as { action?: string }).action === "finalize") { entered(); await held; }
      if (sourceDown && String(name) === h.name && path === METADATA_ROUTE) return new Response(null, { status: 503 });
      return get(name).fetch(request);
    } });
    const rebinding = rebindGrant(h.env, h.grant.id, previous, { repoId: repo.id, repo: repo.full_name, branch: "other" });
    const rejected = assert.rejects(rebinding);
    await started;
    sourceDown = true;
    release(); await rejected;
    const rpc = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: {
      Authorization: `Bearer ${h.grant.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    assert.equal(rpc.status, 401, "an unanswered final check never leaves the destination generation authorized");
    assert.equal((await getHub(h.env, h.sessionId))!.grants.some(grant => grant.id === h.grant.id), false);
  } finally { release(); h.namespace.get = get; await h.dispose(); }
});
