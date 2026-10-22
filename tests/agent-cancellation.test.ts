import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import type { Env } from "../worker/app";
import { CountedStorage, UsageCounters } from "./fakes/counted-agent";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from "@modelcontextprotocol/server";
import { createAgentRecovery } from "../src/agent-recovery";
import { createLiveTransport } from "../src/agent-transport";
import { createAgentMediaTools } from "../src/agent-tools-media";
import { createAgentEditTools } from "../src/agent-tools-edit";
import { indexedDbAgentRecords, type AgentCommit, type AgentRecords } from "../src/agent-records";
import type { AgentReadPorts } from "../src/agent-tools-read";
import { draftKey } from "../src/drafts";
import { AgentRelay, type RelayScope, type RelaySocket } from "../worker/agent-relay";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";
import { forEachAwait } from "./support/await-race";
import { editorTab, origin, payload, repo, signIn, siteContext, startWorker, workerFetch } from "./mcp-harness";

const workspace = { account: "lex", repoId: 1, branch: "main" };
const scope: RelayScope = { workspace, tabId: "owner", generation: 1 };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 4000;
  while (!await check()) { assert.ok(Date.now() < end, "observable cancellation state did not arrive"); await delay(5); }
}

// The SDK's legacy stateless fallback emits SSE even with the outer responseMode set to json.
async function rpc(response: Response): Promise<any> {
  const text = await response.text();
  return JSON.parse(text.startsWith("event:") ? text.split("\n").find(line => line.startsWith("data: "))!.slice(6) : text);
}

/** A browser socket adapter: the real Miniflare socket supplies frames, the real tab transport executes them. */
class BrowserSocket extends EventTarget {
  readyState = 1;
  constructor(private sendFrame: (text: string) => void, private closeFrame: () => void) { super(); }
  send(text: string) { this.sendFrame(text); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.closeFrame(); this.dispatchEvent(new Event("close")); }
  receive(text: string) { this.dispatchEvent(new MessageEvent("message", { data: text })); }
}

async function browser(socketFactory: (receive: (text: string) => void) => BrowserSocket) {
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("cancellation", fake.factory);
  const context = await siteContext(); context.drafts = [];
  const snapshot = { branch: "main", commit: context.commit, entries: [], tree: [] };
  const ports = { stamp: () => ({ holds: () => true, changed: () => undefined }), files: () => ({ repo, snapshot,
    api: async <T>() => ({ entries: [] }) as T, read: async () => "", batch: async () => ({}), has: () => false }),
    context: async () => ({ context, texts: new Map<string, string>() }) } satisfies AgentReadPorts;
  let runs = 0, history = 0;
  const entered = deferred(), before = deferred(), after = deferred(), finished = deferred();
  const tools = createAgentEditTools({ workspace, records, ports, run: async command => {
    runs++; entered.resolve();
    try {
      await before.promise;
    const stored = await records.workspace(workspace);
    const draft = { ...workspace, repo: repo.full_name, version: 1 as const, path: command.path, baseSha: null, content: command.content, original: "", updatedAt: Date.now() };
    const result = await records.commit({ workspace, generation: command.ownerGeneration!, expectedRevision: stored.revision,
      expectedDrafts: [[draftKey(draft, draft.path), null]], drafts: [[draftKey(draft, draft.path), draft]],
      receipt: { operationId: command.id, authorizationId: command.grantId!, payloadIdentity: command.requestIdentity!,
        outcome: { message: "Applied once." }, issuedAt: command.createdAt, createdAt: Date.now() } });
    if (!result.duplicate) history++;
    await after.promise;
      return { message: "Applied once." };
    } finally { finished.resolve(); }
  } });
  let mediaRuns = 0;
  const media = createAgentMediaTools({ workspace, records, ports, run: async () => { mediaRuns++; } });
  let socket!: BrowserSocket;
  const recoveryStorage = new Map<string, string>();
  const transport = createLiveTransport({ workspace, repo: repo.full_name, tabId: scope.tabId, records,
    recovery: reconnect => createAgentRecovery({ workspace, tabId: scope.tabId, reconnect, now: () => Date.now(), random: () => 0.5,
      storage: { getItem: key => recoveryStorage.get(key) ?? null, setItem: (key, value) => { recoveryStorage.set(key, value); } },
      exclusive: run => run(), channel: { subscribe: () => () => {}, post: () => {} },
      setTimeout: (callback, ms) => Number(setTimeout(callback, ms)), clearTimeout: timer => clearTimeout(timer) }),
    current: () => workspace, reload: async () => {}, listen: () => {},
    registry: { read: () => undefined, write: () => {}, clear: () => {}, held: async () => false, hold: async () => () => {},
      focus: () => {}, focused: () => undefined, elect: work => work() },
    events: { window: new EventTarget(), document: new EventTarget() },
    clock: { setTimeout: (callback, ms) => Number(setTimeout(callback, ms)), clearTimeout: timer => clearTimeout(timer) },
    socket: () => { socket = socketFactory(text => socket.receive(text)); queueMicrotask(() => socket.dispatchEvent(new Event("open"))); return socket; },
    edit: (request, generation, current, signal) => tools.run(request, generation, current, signal), run: async () => {},
    media: (request, generation, current, deadline, seen, signal) => media.run(request, generation, current, deadline, seen, signal),
  });
  await transport.start();
  assert.equal(transport.state().mode, "live");
  return { fake, records, transport, socket, tools, entered, before, after, finished, counts: () => ({ runs, history }), mediaRuns: () => mediaRuns,
    status: (id: string, grant: string) => records.status(workspace, id, grant),
    close() { before.resolve(); after.resolve(); transport.stop(); } };
}

async function runtime(requestSignal = true) {
  const { worker } = await startWorker({ requestSignal, streaming: true });
  try {
    const { cookie } = await signIn(worker), tab = editorTab(worker, cookie);
    const grant = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { id: string; token: string };
    const other = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { id: string; token: string };
    const upgrade = await worker.dispatchFetch(`${origin}/api/agent/relay?repo=lex%2Fstarter&branch=main&tabId=owner&generation=1`, { headers: { Origin: origin, Cookie: cookie, Upgrade: "websocket" } });
    const ws = upgrade.webSocket!; ws.accept();
    const frames: Record<string, any>[] = [];
    const tabSide = await browser(receive => {
      ws.addEventListener("message", event => { const text = String(event.data); if (text !== "pong") frames.push(JSON.parse(text)); receive(text); });
      return new BrowserSocket(text => ws.send(text), () => ws.close(1000));
    });
    const liveFetch = workerFetch(worker, { streaming: true });
    const raw = (body: object, modern = false, signal?: AbortSignal, token = grant.token, tool = "write_file") => liveFetch(`${origin}/mcp`, { method: "POST", signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": modern ? "2026-07-28" : "2025-11-25", ...(modern ? { "Mcp-Method": "tools/call", "Mcp-Name": tool } : {}) }, body: JSON.stringify(body) });
    const call = (id: string, modern: boolean, signal?: AbortSignal, tool = "write_file", args: object = { path: "fresh.txt", content: "new", requestId: id }) => raw({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args,
      ...(modern ? { _meta: { [PROTOCOL_VERSION_META_KEY]: "2026-07-28", [CLIENT_INFO_META_KEY]: { name: "test", version: "1" }, [CLIENT_CAPABILITIES_META_KEY]: {} } } : {}) } }, modern, signal, grant.token, tool);
    const cancel = (id: string, token = grant.token) => raw({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id } }, false, undefined, token);
    return { ...tabSide, worker, grant, other, frames, call, cancel, async dispose() { tabSide.close(); await worker.dispose(); } };
  } catch (error) { await worker.dispose(); throw error; }
}

for (const modern of [true, false]) for (const committed of [false, true]) test(`runtime JSON ${modern ? "modern abort" : "legacy explicit cancel"} ${committed ? "after" : "before"} commit`, async () => {
  const f = await runtime();
  const stop = new AbortController(), id = `change-${modern}-${committed}`;
  try {
    const pending = f.call(id, modern, stop.signal).catch(error => error as Error);
    await until(() => f.counts().runs > 0);
    if (committed) { f.before.resolve(); await until(async () => (await f.status(id, f.grant.id)).status === "applied"); }
    if (modern) stop.abort();
    else assert.equal((await f.cancel(id)).status, 202);
    await until(() => f.frames.some(frame => frame.type === "cancel"));
    await until(async () => (await f.status(id, f.grant.id)).status === (committed ? "applied" : "cancelled"));
    f.before.resolve(); f.after.resolve(); await f.finished.promise; await pending;
    assert.deepEqual(f.counts(), { runs: 1, history: committed ? 1 : 0 });
    assert.equal(f.fake.stores.get("drafts")!.size, committed ? 1 : 0);
    assert.equal(f.fake.stores.get("receipts")!.size, committed ? 1 : 0);
    const lookup = await f.call("lookup", false, undefined, "get_command_status", { requestId: id });
    assert.equal(payload((await rpc(lookup)).result).state, committed ? "applied" : "cancelled");
    const duplicate = await f.call(`${id}-duplicate`, false, undefined, "write_file", { path: "fresh.txt", content: "new", requestId: id });
    assert.equal(payload((await rpc(duplicate)).result).state, committed ? "applied" : "cancelled");
    assert.equal(f.counts().runs, 1, "no replay after cancellation, duplicate or status");
  } finally { await f.dispose(); }
});

test("runtime legacy disconnect alone keeps the tab command alive; another grant cannot cancel it", async () => {
  const f = await runtime(), stop = new AbortController(), id = "legacy-disconnect";
  try {
    const pending = f.call(id, false, stop.signal).catch(error => error as Error);
    await until(() => f.counts().runs > 0); stop.abort(); await pending;
    assert.equal((await f.cancel(id, f.other.token)).status, 202);
    assert.equal(f.frames.filter(frame => frame.type === "cancel").length, 0);
    f.before.resolve(); f.after.resolve();
    await until(async () => (await f.status(id, f.grant.id)).status === "applied");
    assert.deepEqual(f.counts(), { runs: 1, history: 1 });
  } finally { await f.dispose(); }
});

test("runtime media change cancelled before commit stays cancelled through MCP (never relabelled applied)", async () => {
  const f = await runtime(), id = "media-cancelled";
  try {
    await f.records.cancel(workspace, id, f.grant.id, { live: true });
    for (const modern of [true, false]) {
      const body = await rpc(await f.call(id, modern, undefined, "adding_settings", { image: "smaller", requestId: id }));
      assert.equal(body.result.isError, true);
      assert.equal(payload(body.result).state, "cancelled");
    }
    assert.equal(f.mediaRuns(), 0, "a cancelled media change never runs");
    assert.equal(f.fake.stores.get("receipts")!.size, 0);
  } finally { await f.dispose(); }
});

function relayFixture() {
  let now = 0, next = 0, attachment: unknown;
  const timers = new Map<number, () => void>(), frames: string[] = [];
  const socket: RelaySocket = { readyState: 1, send: text => { frames.push(text); }, close: () => {},
    serializeAttachment: value => { attachment = value; }, deserializeAttachment: () => attachment };
  const relay = new AgentRelay([], { now: () => now, setTimeout: callback => { timers.set(++next, callback); return next; }, clearTimeout: timer => { timers.delete(Number(timer)); } });
  relay.connect(socket, scope); relay.message(socket, JSON.stringify({ type: "handshake", owner: true, ...scope })); frames.length = 0;
  return { relay, socket, timers, frames,
    advance(ms: number) { now += ms; },
    expire() { now += 10_001; for (const callback of [...timers.values()]) callback(); },
    idle() { assert.equal(relay.pendingCount, 0); assert.equal(relay.reservedCount, 0); assert.equal(relay.reservedBytes, 0); assert.equal(relay.bufferedBytes, 0); assert.equal(timers.size, 0); assert.equal(relay.waiting, false); } };
}

for (const ending of ["signal", "explicit", "timeout", "disconnect", "reset", "result"] as const) test(`relay ${ending} releases pending bytes, timer and wait slot; sends no replay`, async () => {
  const f = relayFixture(), stop = new AbortController();
  const pending = f.relay.dispatch(scope, { operation: "requests", tool: "wait_for_requests", waitMs: 10_000 }, stop.signal, undefined, { requestId: 19, grantId: "one" });
  const frame = JSON.parse(f.frames[0]) as { id: string };
  if (ending === "signal") stop.abort();
  if (ending === "explicit") {
    f.relay.cancel({ requestId: 19, grantId: "other" }); assert.equal(f.relay.pendingCount, 1);
    f.relay.cancel({ requestId: "19", grantId: "one" }); assert.equal(f.relay.pendingCount, 1, "JSON-RPC id types stay distinct");
    f.relay.cancel({ requestId: 19, grantId: "one" });
  }
  if (ending === "timeout") f.expire();
  if (ending === "disconnect") f.relay.disconnect(f.socket);
  if (ending === "reset") f.relay.reset();
  if (ending === "result") f.relay.message(f.socket, JSON.stringify({ type: "result", ...scope, id: frame.id, result: {} }));
  await pending; f.idle();
  const frames = f.frames.map(text => JSON.parse(text) as { type: string; reason?: string });
  assert.equal(frames.filter(frame => frame.type === "command").length, 1);
  assert.equal(frames.filter(frame => frame.type === "cancel").length, ["signal", "explicit", "timeout"].includes(ending) ? 1 : 0);
});

test("an unsent restored call is cancelled without sending command or cancel frames", async () => {
  const f = relayFixture(); f.relay.reset(); f.frames.length = 0;
  const pending = f.relay.dispatch(scope, {}, undefined, undefined, { requestId: 1, grantId: "one" });
  f.relay.cancel({ requestId: 1, grantId: "one" });
  assert.deepEqual(await pending, { ok: false, code: "cancelled", outcome: "not-sent" });
  f.idle(); assert.deepEqual(f.frames, []);
});

test("command delayed beyond relay deadline is followed by ordered cancel: tombstone before any executor await", async () => {
  const f = relayFixture();
  let receive!: (text: string) => void, delayed = false;
  const queued: string[] = [];
  f.socket.send = text => { if (delayed) queued.push(text); else receive(text); };
  const tab = await browser(listener => {
    receive = listener;
    return new BrowserSocket(text => { f.relay.message(f.socket, text); }, () => { f.relay.disconnect(f.socket); });
  });
  try {
    delayed = true;
    const pending = f.relay.dispatch(scope, { operation: "edit", tool: "write_file", args: { path: "fresh.txt", content: "new" },
      id: "late", grantId: "grant", createdAt: Date.now() });
    f.expire(); assert.deepEqual(await pending, { ok: false, code: "timeout", outcome: "unknown" }); f.idle();
    assert.deepEqual(queued.map(text => (JSON.parse(text) as { type: string }).type), ["command", "cancel"]);
    // Deliberate transit delay > 1 s beyond the relay's expiry; deterministic relay clock, no wall-clock wait.
    for (const text of queued) receive(text);
    await until(async () => (await tab.status("late", "grant")).status === "cancelled");
    assert.deepEqual(tab.counts(), { runs: 0, history: 0 });
    assert.equal(tab.fake.stores.get("drafts")!.size, 0); assert.equal(tab.fake.stores.get("receipts")!.size, 0);
  } finally { tab.close(); }
});

test("every preparation and commit await serializes cancellation: cancelled means no drafts; commit first remains applied", async () => {
  const context = await siteContext(); context.drafts = [];
  const count = await forEachAwait(race => {
    const fake = fakeIndexedDB(), stored = indexedDbAgentRecords("race", fake.factory), stop = new AbortController();
    const records: AgentRecords = { ...stored, receipt: race.port("receipt", (...args) => stored.receipt(...args)),
      status: race.port("status", (...args) => stored.status(...args)), workspace: race.port("workspace", (...args) => stored.workspace(...args)),
      commit: race.port("commit", (command: AgentCommit) => stored.commit(command)) };
    const ports = { stamp: () => ({ holds: () => true, changed: () => undefined }), context: race.port("context", async () => ({ context, texts: new Map<string, string>() })),
      files: () => ({ repo, snapshot: { branch: "main", commit: context.commit, entries: [], tree: [] }, api: async <T>() => ({ entries: [] }) as T,
        read: async () => "", batch: async () => ({}), has: () => false }) } satisfies AgentReadPorts;
    let runs = 0;
    const tools = createAgentEditTools({ workspace, records, ports, run: async command => {
      runs++;
      const draft = { ...workspace, repo: repo.full_name, version: 1 as const, path: "fresh.txt", content: "new", original: "", baseSha: null, updatedAt: Date.now() };
      await records.commit({ workspace, generation: 0, expectedRevision: 0, expectedDrafts: [], drafts: [[draftKey(draft, draft.path), draft]],
        receipt: { operationId: command.id, authorizationId: command.grantId!, payloadIdentity: command.requestIdentity!, outcome: {}, createdAt: Date.now(), issuedAt: command.createdAt } });
    } });
    const request = { operation: "edit" as const, tool: "write_file" as const, args: { path: "fresh.txt", content: "new" }, id: "race", grantId: "grant", createdAt: Date.now() };
    return { records, stop, fake, runs: () => runs, duplicate: () => tools.run(request, 0, () => true), done: tools.run(request, 0, () => true, stop.signal) };
  }, async f => { f.stop.abort(); await f.records.cancel(workspace, "race", "grant", { live: true }); }, async f => {
    const outcome = await f.records.status(workspace, "race", "grant");
    assert.ok(outcome.status === "applied" || outcome.status === "cancelled");
    assert.equal(f.fake.stores.get("drafts")!.size, outcome.status === "applied" ? 1 : 0);
    assert.equal(f.fake.stores.get("receipts")!.size, outcome.status === "applied" ? 1 : 0);
    const before = f.runs(); await f.duplicate(); assert.equal(f.runs(), before, "cancel + duplicate never replays");
  });
  assert.ok(count >= 5);
});

test("every Wrangler config enables request.signal, which modern abort cancellation needs", () => {
  for (const file of ["wrangler.jsonc", "wrangler.preview.jsonc", "wrangler.techies.jsonc"])
    assert.match(readFileSync(file, "utf8"), /"compatibility_flags": \[[^\]]*"enable_request_signal"/, file);
});

test("runtime without enable_request_signal: a closed JSON response is not observed (why the configs set it)", async () => {
  const f = await runtime(false), stop = new AbortController(), id = "without-flag";
  try {
    const pending = f.call(id, true, stop.signal);
    await until(() => f.counts().runs > 0); await pending; stop.abort();
    // Negative observation across two whitespace writes: workerd has no request abort hook without the flag.
    await delay(600);
    assert.equal(f.frames.filter(frame => frame.type === "cancel").length, 0);
    f.before.resolve(); f.after.resolve();
    await until(async () => (await f.status(id, f.grant.id)).status === "applied");
  } finally { await f.dispose(); }
});

test("runtime modern whitespace response remains one valid JSON result", async () => {
  const f = await runtime(), id = "modern-json";
  try {
    const response = await f.call(id, true);
    assert.match(response.headers.get("Content-Type")!, /application\/json/);
    await until(() => f.counts().runs > 0);
    f.before.resolve(); f.after.resolve();
    assert.equal(payload((await response.json() as any).result).state, "applied");
    assert.deepEqual(f.counts(), { runs: 1, history: 1 });
  } finally { await f.dispose(); }
});

test("socket loss cancels a pending tab edit locally; wrong-scope cancel cannot", async () => {
  const f = relayFixture();
  let receive!: (text: string) => void;
  const sent: string[] = [];
  f.socket.send = text => { sent.push(text); receive(text); };
  const tab = await browser(listener => { receive = listener; return new BrowserSocket(text => { f.relay.message(f.socket, text); }, () => { f.relay.disconnect(f.socket); }); });
  try {
    const pending = f.relay.dispatch(scope, { operation: "edit", tool: "write_file", args: { path: "fresh.txt", content: "new" }, id: "lost", grantId: "grant", createdAt: Date.now() });
    await until(() => tab.counts().runs > 0);
    const frame = sent.map(text => JSON.parse(text) as { type: string; id: string }).find(frame => frame.type === "command")!;
    receive(JSON.stringify({ type: "cancel", ...scope, generation: 2, id: frame.id, reason: "cancelled" }));
    assert.equal((await tab.status("lost", "grant")).status, "unknown");
    tab.socket.close(); await pending; f.idle();
    await until(async () => (await tab.status("lost", "grant")).status === "cancelled");
    tab.before.resolve(); tab.after.resolve(); await tab.finished.promise;
    assert.equal(tab.fake.stores.get("drafts")!.size, 0); assert.equal(tab.fake.stores.get("receipts")!.size, 0);
  } finally { tab.close(); }
});

test("expired/retired application evidence stays unknown after cancellation and retention; a fresh tombstone is definite", async () => {
  let now = Date.now();
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("retention", fake.factory, () => now);
  const command: AgentCommit = { workspace, generation: 0, expectedRevision: 0, expectedDrafts: [], drafts: [],
    receipt: { operationId: "expired", authorizationId: "grant", payloadIdentity: "identity", outcome: {}, createdAt: now, issuedAt: now } };
  await records.commit(command); now += 24 * 60 * 60 * 1000;
  await records.evictReceipts(workspace);
  await records.cancel(workspace, "expired", "grant");
  assert.equal((await records.status(workspace, "expired", "grant")).status, "unknown");
  await records.cancel(workspace, "unproven", "grant");
  assert.equal((await records.status(workspace, "unproven", "grant")).status, "unknown");
  await records.cancel(workspace, "fresh", "grant", { live: true });
  assert.equal((await records.status(workspace, "fresh", "grant")).status, "cancelled");
  assert.equal((await records.status(workspace, "fresh", "other")).status, "unknown");
  assert.equal((await records.status({ ...workspace, branch: "other" }, "fresh", "grant")).status, "unknown");
});

test("the tab's own remaining-budget timer cancels and fences an executor before the relay deadline", async () => {
  const f = relayFixture();
  let receive!: (text: string) => void;
  f.socket.send = text => {
    const value = JSON.parse(text) as { type: string; remainingMs?: number };
    if (value.type === "command") value.remainingMs = 1_500;
    receive(JSON.stringify(value));
  };
  const tab = await browser(listener => { receive = listener; return new BrowserSocket(text => { f.relay.message(f.socket, text); }, () => { f.relay.disconnect(f.socket); }); });
  try {
    const pending = f.relay.dispatch(scope, { operation: "edit", tool: "write_file", args: { path: "fresh.txt", content: "new" }, id: "local-deadline", grantId: "grant", createdAt: Date.now() });
    await until(() => tab.counts().runs > 0);
    await until(async () => (await tab.status("local-deadline", "grant")).status === "cancelled");
    tab.before.resolve(); tab.after.resolve(); await tab.finished.promise;
    assert.deepEqual(tab.counts(), { runs: 1, history: 0 });
    assert.equal(tab.fake.stores.get("drafts")!.size, 0); assert.equal(tab.fake.stores.get("receipts")!.size, 0);
    f.expire(); await pending; f.idle();
  } finally { tab.close(); }
});

for (const media of [false, true]) test(`${media ? "media" : "edit"}: a receipt appearing between lookup and status still refuses a different payload`, async () => {
  const fake = fakeIndexedDB(), stored = indexedDbAgentRecords("receipt-race", fake.factory);
  await stored.commit({ workspace, generation: 0, expectedRevision: 0, expectedDrafts: [], drafts: [], receipt: {
    operationId: "reused", authorizationId: "grant", payloadIdentity: "old-payload", outcome: {}, createdAt: Date.now(), issuedAt: Date.now() } });
  // The first read saw nothing; another call's commit is visible to the status transaction.
  const records: AgentRecords = { ...stored, receipt: async () => undefined };
  let runs = 0;
  const ports = { stamp: () => ({ holds: () => true, changed: () => undefined }), files: () => undefined, context: async () => undefined } satisfies AgentReadPorts;
  const options = { workspace, records, ports, run: async () => { runs++; } };
  const result = media ? await createAgentMediaTools(options).run({ operation: "media", tool: "adding_settings", path: "", args: { image: "small" },
    id: "reused", grantId: "grant", createdAt: Date.now() }, 0, () => true)
    : await createAgentEditTools(options).run({ operation: "edit", tool: "write_file", args: { path: "fresh.txt", content: "different" },
      id: "reused", grantId: "grant", createdAt: Date.now() }, 0, () => true);
  assert.deepEqual(result, { ok: false, message: "This change's id was already used for different work. Nothing was changed." });
  assert.equal(runs, 0);
});


test("recent cancels refuse intake and direct dispatch, scoped by grant and typed JSON-RPC id", async () => {
  const f = relayFixture(), key = { requestId: 19, grantId: "one" };
  f.relay.cancel(key);
  const refused = { ok: false, code: "cancelled", outcome: "not-sent" };
  assert.deepEqual(f.relay.reserve(100, key), refused);
  assert.deepEqual(await f.relay.dispatch(scope, {}, undefined, undefined, key), refused);
  for (const other of [{ ...key, grantId: "other" }, { ...key, requestId: "19" }, { ...key, requestId: 20 }]) {
    const reservation = f.relay.reserve(100, other);
    assert.ok(!("ok" in reservation)); assert.equal(reservation.cancelled, false); reservation.release();
    const pending = f.relay.dispatch(scope, {}, undefined, undefined, other);
    const frame = JSON.parse(f.frames.at(-1)!) as { id: string };
    f.relay.message(f.socket, JSON.stringify({ type: "result", ...scope, id: frame.id, result: {} }));
    assert.equal((await pending).ok, true);
  }
  f.idle();
});

test("recent cancels expire at 10 seconds and keep only 32 keys without timers", async () => {
  const f = relayFixture(), key = { requestId: 0, grantId: "one" };
  f.relay.cancel(key); f.advance(9_999);
  assert.deepEqual(f.relay.reserve(1, key), { ok: false, code: "cancelled", outcome: "not-sent" });
  f.advance(1);
  const expired = f.relay.reserve(1, key); assert.ok(!("ok" in expired)); expired.release();
  for (let requestId = 0; requestId < 33; requestId++) f.relay.cancel({ ...key, requestId });
  const oldest = f.relay.reserve(1, key); assert.ok(!("ok" in oldest)); oldest.release();
  for (let requestId = 1; requestId < 33; requestId++)
    assert.deepEqual(f.relay.reserve(1, { ...key, requestId }), { ok: false, code: "cancelled", outcome: "not-sent" });
  assert.deepEqual(f.frames, []); f.idle();
});

test("intake cancellation persists past recent memory expiry and is checked again by dispatch", async () => {
  const f = relayFixture(), key = { requestId: 19, grantId: "one" };
  const reservations = [f.relay.reserve(100, key), f.relay.reserve(100, key)];
  f.relay.cancel({ ...key, grantId: "other" }); f.relay.cancel({ ...key, requestId: "19" });
  for (const reservation of reservations) { assert.ok(!("ok" in reservation)); assert.equal(reservation.cancelled, false); }
  f.relay.cancel(key); f.advance(10_000);
  for (const reservation of reservations) {
    assert.ok(!("ok" in reservation)); assert.equal(reservation.cancelled, true);
    assert.deepEqual(await f.relay.dispatch(scope, {}, undefined, { started: 0, reservation }, key),
      { ok: false, code: "cancelled", outcome: "not-sent" });
    reservation.release();
  }
  assert.deepEqual(f.frames, []); f.idle();
});

test("SessionStore legacy cancel during body intake or before dispatch sends nothing and releases capacity", async t => {
  // Run the real Worker ingress with only Cloudflare's base class stubbed.
  const { outputFiles } = await build({ stdin: { contents: 'export { SessionStore } from "./worker/index.ts";', resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "browser", conditions: ["workerd"],
    plugins: [{ name: "cloudflare-base", setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "base", namespace: "cloudflare" }));
      builder.onLoad({ filter: /.*/, namespace: "cloudflare" }, () => ({ contents: "export class DurableObject { constructor(ctx) { this.ctx = ctx; } }" }));
    } }] });
  const { SessionStore } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`) as {
    SessionStore: new (ctx: object, env: Env) => { fetch(request: Request): Promise<Response>; relayCore: AgentRelay; webSocketMessage(socket: RelaySocket, text: string): void };
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "WebSocketRequestResponsePair");
  Object.defineProperty(globalThis, "WebSocketRequestResponsePair", { configurable: true, value: class {} });
  t.after(() => { if (original) Object.defineProperty(globalThis, "WebSocketRequestResponsePair", original); else Reflect.deleteProperty(globalThis, "WebSocketRequestResponsePair"); });
  const frames: string[] = [];
  let receive = (_text: string) => {};
  const socket: RelaySocket = { readyState: 1, send: text => { frames.push(text); receive(text); }, close() {},
    serializeAttachment() {}, deserializeAttachment: () => ({ ...scope, role: "editor", owner: { tabId: scope.tabId, generation: scope.generation } }) };
  const counters = new UsageCounters();
  const env: Env = { SESSIONS: { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: 404 }) }) },
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
  const instance = new SessionStore({ storage: new CountedStorage(counters), getWebSockets: () => [socket], setWebSocketAutoResponse() {},
    blockConcurrencyWhile<T>(run: () => Promise<T>) { return run(); } }, env);
  const tab = await browser(listener => { receive = listener; return new BrowserSocket(text => { instance.webSocketMessage(socket, text); }, () => {}); });
  try {
    for (const before of [false, true]) {
      frames.length = 0;
      const identity = { ...scope, requestId: `intake-${before}`, grantId: "grant" };
      const headers = { [AgentRelay.identityHeader]: JSON.stringify(identity) };
      const cancel = () => instance.fetch(new Request("https://relay/relay/cancel", { method: "POST", headers }));
      if (before) assert.equal((await cancel()).status, 202);
      let body!: ReadableStreamDefaultController<Uint8Array>, readerCancelled = false;
      const text = JSON.stringify({ operation: "edit", tool: "write_file", id: identity.requestId, grantId: "grant", args: { path: "fresh.txt", content: "new" }, createdAt: Date.now() });
      const pending = instance.fetch(new Request("https://relay/relay/dispatch", { method: "POST", duplex: "half",
        headers: { ...headers, "Content-Length": String(new TextEncoder().encode(text).length) },
        body: new ReadableStream<Uint8Array>({ start(controller) { body = controller; }, cancel() { readerCancelled = true; } }, { highWaterMark: 0 }) } as RequestInit));
      // Cancelled during intake: the body never finishes, yet the dispatch settles and frees its slot at once.
      const cancelledAt = Date.now();
      if (!before) {
        // Waking the relay loads its grant fence once before intake admission.
        for (let turn = 0; turn < 50 && instance.relayCore.reservedCount === 0; turn++) await Promise.resolve();
        assert.equal(instance.relayCore.reservedCount, 1); assert.equal((await cancel()).status, 202);
      }
      else { body.enqueue(new TextEncoder().encode(text)); body.close(); }
      assert.deepEqual(await (await pending).json(), { ok: false, code: "cancelled", outcome: "not-sent" });
      if (!before) {
        assert.equal(readerCancelled, true, "the stalled body reader is cancelled");
        assert.ok(Date.now() - cancelledAt < 2_000, "the slot is freed at the cancel, not at the 10 s intake deadline");
      }
      assert.deepEqual(frames, []);
      assert.equal(instance.relayCore.pendingCount, 0); assert.equal(instance.relayCore.reservedCount, 0);
      assert.equal(instance.relayCore.reservedBytes, 0); assert.equal(instance.relayCore.bufferedBytes, 0);
      assert.deepEqual(tab.counts(), { runs: 0, history: 0 });
      assert.equal(tab.fake.stores.get("drafts")!.size, 0); assert.equal(tab.fake.stores.get("receipts")!.size, 0);
    }
    assert.equal(counters.log.length, 0, "intake and cancellation schedule no alarms");
    assert.equal(counters.byCategory.data.keysWritten, 0, "intake and cancellation written key count");
  } finally { tab.close(); }
});


test("live cancellation preserves expired application uncertainty and definite tombstones expire", async () => {
  let now = Date.now();
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("uncertain", fake.factory, () => now);
  await records.commit({ workspace, generation: 0, expectedRevision: 0, expectedDrafts: [], drafts: [],
    receipt: { operationId: "old", authorizationId: "grant", payloadIdentity: "identity", outcome: {}, createdAt: now, issuedAt: now } });
  now += 24 * 60 * 60 * 1000;
  await records.cancel(workspace, "old", "grant", { live: true });
  assert.equal((await records.status(workspace, "old", "grant")).status, "unknown");
  await records.evictReceipts(workspace);
  await records.cancel(workspace, "old", "grant", { live: true });
  assert.equal((await records.status(workspace, "old", "grant")).status, "unknown", "prior uncertainty survives receipt eviction");
  await records.cancel(workspace, "fresh", "grant", { live: true });
  assert.equal((await records.status(workspace, "fresh", "grant")).status, "cancelled");
  now += 24 * 60 * 60 * 1000;
  assert.equal((await records.status(workspace, "fresh", "grant")).status, "unknown");
});
