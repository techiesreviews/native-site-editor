import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { AgentRelay, relayObjectName, type RelayClock, type RelayScope, type RelaySocket } from "../worker/agent-relay";
import { CountedStorage, FakeClock, UsageCounters, countedSocket, startCountedWorker } from "./fakes/counted-agent";
import { origin, repo, signIn, startWorker } from "./mcp-harness";
import type { Env } from "../worker/app";

const scope: RelayScope = { workspace: { account: "lex", repoId: 1, branch: "main" }, tabId: "owner-tab", generation: 1 };
const handshake = (identity = scope) => JSON.stringify({ type: "handshake", ...identity, owner: true });
const reply = (id: string, identity = scope, result: unknown = { applied: true }) => JSON.stringify({ type: "result", id, ...identity, result });

function socket(identity = scope) {
  const counted = countedSocket();
  let attachment: unknown = { ...identity, role: "editor", handshaken: true };
  return {
    ...counted,
    readyState: 1,
    sent: [] as string[],
    send(message: string) { counted.send(message); this.sent.push(message); },
    close(_code?: number, _reason?: string) { this.readyState = 3; },
    serializeAttachment(value: unknown) { attachment = structuredClone(value); },
    deserializeAttachment() { return structuredClone(attachment); },
  } satisfies RelaySocket;
}
function fixture() {
  const counters = new UsageCounters();
  let now = 0, next = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const clock = {
    now: () => now,
    setTimeout(run: () => void, delay: number) { const id = ++next; timers.set(id, { at: now + delay, run }); return id; },
    clearTimeout(id: unknown) { timers.delete(id as number); },
  } satisfies RelayClock;
  const editor = socket();
  const relay = new AgentRelay([], clock);
  assert.equal(relay.connect(editor, scope), true);
  assert.equal(relay.message(editor, handshake()), true);
  editor.sent.length = 0;
  return { counters, clock, timers, editor, relay,
    advance(ms: number) {
      now += ms; counters.waitedMs += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.run(); }
    },
    /** Moves time without delivering timers (a delayed timer event). */
    skip(ms: number) { now += ms; },
    id() { return (JSON.parse(editor.sent.at(-1)!) as { id: string }).id; },
    idle() { assert.equal(relay.pendingCount, 0); assert.equal(relay.bufferedBytes, 0); assert.equal(timers.size, 0); },
  };
}

test("relay names use account/repository id/branch, with no ambiguous concatenation", async () => {
  const name = await relayObjectName(scope.workspace);
  assert.match(name, /^agent-relay:[a-f0-9]{64}$/);
  assert.equal(await relayObjectName({ ...scope.workspace, account: "LEX" }), name);
  for (const workspace of [{ ...scope.workspace, account: "other" }, { ...scope.workspace, repoId: 2 }, { ...scope.workspace, branch: "main:other" }])
    assert.notEqual(await relayObjectName(workspace), name);
});

test("sixth pending command is busy before any send, timer or entry allocation", async () => {
  const h = fixture();
  const pending = Array.from({ length: 5 }, () => h.relay.dispatch(scope, { edit: "draft" }));
  assert.equal(h.relay.pendingCount, 5);
  assert.equal(h.timers.size, 5);
  const bytes = h.relay.bufferedBytes, sent = h.editor.counters.sent;
  assert.deepEqual(await h.relay.dispatch(scope, "sixth"), { ok: false, code: "busy", outcome: "not-sent" });
  assert.equal(h.relay.pendingCount, 5);
  assert.equal(h.relay.bufferedBytes, bytes);
  assert.equal(h.editor.counters.sent, sent);
  assert.equal(h.timers.size, 5);
  assert.equal(new Set(h.editor.sent.map(message => (JSON.parse(message) as { id: string }).id)).size, 5);
  h.relay.disconnect(h.editor);
  assert.ok((await Promise.all(pending)).every(outcome => !outcome.ok && outcome.code === "unknown-outcome"));
  h.idle();
});

test("8 MiB budget measures complete UTF-8 envelopes across all pending calls", async () => {
  const h = fixture();
  const first = h.relay.dispatch(scope, "é".repeat(2 * 1024 * 1024));
  const bytes = h.relay.bufferedBytes;
  assert.equal(bytes, Buffer.byteLength(h.editor.sent[0]));
  const sends = h.editor.counters.sent;
  assert.deepEqual(await h.relay.dispatch(scope, "a".repeat(4 * 1024 * 1024)), { ok: false, code: "too-large", outcome: "not-sent" });
  assert.equal(h.relay.pendingCount, 1);
  assert.equal(h.timers.size, 1);
  assert.equal(h.relay.bufferedBytes, bytes);
  assert.equal(h.editor.counters.sent, sends);
  h.relay.message(h.editor, reply(h.id()));
  assert.deepEqual(await first, { ok: true, result: { applied: true } });
  h.idle();
});

test("exact byte admission boundary and result bytes share the same budget", async () => {
  const h = fixture();
  const empty = Buffer.byteLength(JSON.stringify({ type: "command", id: "0".repeat(36), ...scope, remainingMs: 10_000, command: "" }));
  const pending = h.relay.dispatch(scope, "a".repeat(AgentRelay.maxBytes - empty));
  assert.equal(h.relay.bufferedBytes, AgentRelay.maxBytes);
  const sends = h.editor.counters.sent;
  assert.deepEqual(await h.relay.dispatch(scope, null), { ok: false, code: "too-large", outcome: "not-sent" });
  assert.equal(h.editor.counters.sent, sends);
  assert.equal(h.relay.message(h.editor, reply(h.id(), scope, "answer")), true);
  assert.deepEqual(await pending, { ok: false, code: "too-large", outcome: "unknown" });
  h.idle();
});

test("result admission counts bytes reserved for unfinished intake", async () => {
  const h = fixture();
  const pending = h.relay.dispatch(scope, "edit"), id = h.id();
  const intake = h.relay.reserve(7 * 1024 * 1024);
  assert.ok("release" in intake);
  assert.equal(h.relay.message(h.editor, reply(id, scope, "r".repeat(2 * 1024 * 1024))), true);
  assert.deepEqual(await pending, { ok: false, code: "too-large", outcome: "unknown" });
  assert.equal(h.relay.reservedCount, 1);
  intake.release(); intake.release();
  assert.equal(h.relay.reservedCount, 0);
  h.idle();
});

test("correlation, socket, tab, workspace and owner generation must all match", async () => {
  const h = fixture();
  const pending = h.relay.dispatch(scope, { read: "index.html" });
  const id = h.id();
  const wrong: RelayScope[] = [
    { ...scope, tabId: "other-tab" }, { ...scope, generation: 2 },
    ...[{ ...scope.workspace, account: "other" }, { ...scope.workspace, repoId: 2 }, { ...scope.workspace, branch: "other" }].map(workspace => ({ ...scope, workspace })),
  ];
  let settled = false;
  void pending.then(() => { settled = true; });
  for (const identity of wrong) assert.equal(h.relay.message(h.editor, reply(id, identity)), false);
  for (const message of [reply("unknown-id"), "{", "null", "[]", JSON.stringify({ type: "result", id, ...scope })])
    assert.equal(h.relay.message(h.editor, message), false);
  const duplicate = socket();
  h.relay.connect(duplicate, scope);
  assert.equal(h.relay.message(duplicate, handshake()), false);
  assert.equal(h.relay.message(duplicate, reply(id)), false);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(h.relay.pendingCount, 1);
  assert.equal(h.relay.message(h.editor, reply(id)), true);
  assert.deepEqual(await pending, { ok: true, result: { applied: true } });
  assert.equal(h.relay.message(h.editor, reply(id)), false);
  h.idle();
});

test("no receiver and MCP sockets never allocate pending work or editor presence", async () => {
  const mcp = socket();
  mcp.serializeAttachment({ ...scope, role: "mcp", handshaken: true });
  const relay = new AgentRelay([mcp]);
  assert.equal(relay.message(mcp, handshake()), false);
  assert.deepEqual(await relay.dispatch(scope, null), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  assert.equal(relay.pendingCount, 0);
  assert.equal(relay.bufferedBytes, 0);
  assert.equal(mcp.counters.sent, 0);
  const h = fixture();
  h.editor.readyState = 2;
  assert.deepEqual(await h.relay.dispatch(scope, null), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  h.idle();
});

test("restart explicitly loses pending outcomes and requires fresh scope handshake; never replays", async () => {
  const h = fixture();
  const old = h.relay.dispatch(scope, { content: "must not persist" });
  const oldId = h.id();
  assert.deepEqual(h.editor.deserializeAttachment(), { ...scope, role: "editor", handshaken: true, everHandshaken: true, owner: { tabId: scope.tabId, generation: scope.generation } });
  // An orderly host reset can settle an existing promise. Abrupt isolate loss
  // loses that promise; rebuilding only sends the same unknown-outcome reset.
  h.relay.reset();
  assert.deepEqual(await old, { ok: false, code: "unknown-outcome", outcome: "unknown" });
  h.idle();
  const restored = new AgentRelay([h.editor], h.clock);
  assert.deepEqual(JSON.parse(h.editor.sent.at(-1)!), { type: "reset", code: "unknown-outcome", handshakeRequired: true });
  assert.deepEqual(h.editor.deserializeAttachment(), { ...scope, role: "editor", handshaken: false, everHandshaken: true, owner: { tabId: scope.tabId, generation: scope.generation } });
  // A dispatch that wakes the object waits for the owner's fresh handshake
  // (inside its deadline) instead of failing or sending to an unproven socket.
  const sentBefore = h.editor.sent.length;
  const pending = restored.dispatch({ workspace: scope.workspace }, "new");
  assert.equal(h.editor.sent.length, sentBefore);
  assert.equal(restored.pendingCount, 1);
  assert.equal(restored.message(h.editor, reply(oldId)), false);
  assert.equal(restored.message(h.editor, handshake()), true);
  assert.equal(JSON.parse(h.editor.sent.at(-2)!).type, "ready");
  const newId = h.id();
  assert.equal(restored.message(h.editor, reply(oldId)), false);
  assert.notEqual(newId, oldId);
  assert.equal(restored.message(h.editor, reply(oldId)), false);
  assert.equal(restored.pendingCount, 1);
  restored.message(h.editor, reply(newId));
  assert.deepEqual(await pending, { ok: true, result: { applied: true } });
  assert.equal(restored.pendingCount, 0);
  assert.equal(restored.bufferedBytes, 0);
  assert.equal(h.timers.size, 0);
});

test("a restored owner that never handshakes times out as not sent; a tab or generation fence mismatch is unavailable", async () => {
  const h = fixture();
  assert.deepEqual(await h.relay.dispatch({ workspace: scope.workspace, tabId: "other-tab" }, null), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  assert.deepEqual(await h.relay.dispatch({ workspace: scope.workspace, generation: 2 }, null), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  const restored = new AgentRelay([h.editor], h.clock);
  const sentBefore = h.editor.sent.length;
  const waiting = restored.dispatch({ workspace: scope.workspace }, "never sent");
  h.advance(10_000);
  assert.deepEqual(await waiting, { ok: false, code: "timeout", outcome: "not-sent" });
  assert.equal(h.editor.sent.length, sentBefore);
  const closing = restored.dispatch({ workspace: scope.workspace }, "never sent");
  restored.disconnect(h.editor);
  assert.deepEqual(await closing, { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  assert.equal(restored.pendingCount, 0);
  assert.equal(restored.bufferedBytes, 0);
  assert.equal(h.timers.size, 0);
});

test("restoration keeps the explicit owner; a higher-generation socket that never handshook claims nothing", async () => {
  const h = fixture();
  const next = { ...scope, tabId: "next-tab", generation: 2 };
  const other = socket(next);
  h.relay.connect(other, next);
  const restored = new AgentRelay([h.editor, other], h.clock);
  assert.equal(restored.message(h.editor, handshake()), true);
  const pending = restored.dispatch({ workspace: scope.workspace }, "to the owner");
  assert.equal(JSON.parse(h.editor.sent.at(-1)!).tabId, scope.tabId);
  restored.message(h.editor, reply(h.id()));
  assert.deepEqual(await pending, { ok: true, result: { applied: true } });
  // With no recorded claim at all there is no owner: nothing is elected.
  const fresh = socket(next);
  fresh.serializeAttachment({ ...next, role: "editor", handshaken: false });
  assert.deepEqual(await new AgentRelay([fresh], h.clock).dispatch({ workspace: scope.workspace }, null), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
});

test("a handshake after the deadline (timer delivery delayed) never sends the queued command", async () => {
  const h = fixture();
  const restored = new AgentRelay([h.editor], h.clock);
  const sentBefore = h.editor.sent.length;
  const waiting = restored.dispatch({ workspace: scope.workspace }, "expired edit");
  h.skip(10_000);
  assert.equal(restored.message(h.editor, handshake()), true);
  assert.deepEqual(await waiting, { ok: false, code: "timeout", outcome: "not-sent" });
  assert.equal(h.editor.sent.slice(sentBefore).some(message => JSON.parse(message).type === "command"), false);
  assert.equal(restored.pendingCount, 0);
  assert.equal(h.timers.size, 0);
});

test("explicit higher-generation takeover fences old owner and its pending results", async () => {
  const h = fixture();
  const pending = h.relay.dispatch(scope, "old edit"), oldId = h.id();
  const next = { ...scope, tabId: "next-tab", generation: 2 };
  const other = socket(next);
  h.relay.connect(other, next);
  assert.deepEqual(await h.relay.dispatch(next, "not handshaken"), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  assert.equal(h.relay.message(other, handshake(next)), true);
  assert.deepEqual(await pending, { ok: false, code: "unknown-outcome", outcome: "unknown" });
  assert.equal(h.relay.message(h.editor, handshake()), false);
  assert.equal(h.relay.message(h.editor, reply(oldId)), false);
  h.relay.disconnect(other);
  assert.deepEqual(await h.relay.dispatch(scope, "no fallback"), { ok: false, code: "editor-unavailable", outcome: "not-sent" });
  const restored = new AgentRelay([h.editor], h.clock);
  assert.equal(restored.message(h.editor, handshake()), false);
  h.idle();
});

test("cancellation releases bytes and timers and ignores every late result", async () => {
  const h = fixture(), controller = new AbortController();
  const pending = h.relay.dispatch(scope, "edit", controller.signal), id = h.id();
  controller.abort();
  assert.deepEqual(await pending, { ok: false, code: "cancelled", outcome: "unknown" });
  assert.equal(h.relay.message(h.editor, reply(id)), false);
  h.idle();
  const sends = h.editor.counters.sent;
  assert.deepEqual(await h.relay.dispatch(scope, null, controller.signal), { ok: false, code: "cancelled", outcome: "not-sent" });
  assert.equal(h.editor.counters.sent, sends);
  h.idle();
});

test("10 second total deadline releases bytes and leaves zero idle timers", async () => {
  const h = fixture();
  const pending = h.relay.dispatch(scope, "edit"), id = h.id();
  h.advance(9999);
  assert.equal(h.relay.pendingCount, 1);
  h.advance(1);
  assert.deepEqual(await pending, { ok: false, code: "timeout", outcome: "unknown" });
  assert.equal(h.counters.waitedMs, 10_000);
  assert.equal(h.relay.message(h.editor, reply(id)), false);
  h.idle();
});

test("deadline includes serialization and rejects a result even if timer delivery is delayed", async () => {
  const h = fixture();
  let reads = 0;
  const clock: RelayClock = { ...h.clock, now: () => ++reads <= 2 ? 0 : 10_000 };
  const relay = new AgentRelay([], clock);
  relay.connect(h.editor, scope);
  relay.message(h.editor, handshake());
  const pending = relay.dispatch(scope, null);
  assert.equal(relay.message(h.editor, reply(h.id())), true);
  assert.deepEqual(await pending, { ok: false, code: "timeout", outcome: "unknown" });
  assert.equal(h.timers.size, 0);
  const slow: RelayClock = { ...h.clock, now: () => ++reads === 5 ? 0 : 10_000 };
  const expired = new AgentRelay([], slow);
  expired.connect(h.editor, scope); expired.message(h.editor, handshake());
  assert.deepEqual(await expired.dispatch(scope, "never sent"), { ok: false, code: "timeout", outcome: "not-sent" });
  assert.equal(expired.pendingCount, 0);
  assert.equal(h.timers.size, 0);
});

test("disconnect and send failure fail that socket's calls immediately", async () => {
  for (const brokenSend of [false, true]) {
    const h = fixture();
    if (brokenSend) h.editor.send = () => { throw new Error("closed"); };
    const pending = h.relay.dispatch(scope, "edit");
    if (!brokenSend) h.relay.disconnect(h.editor);
    assert.deepEqual(await pending, { ok: false, code: "unknown-outcome", outcome: "unknown" });
    h.idle();
  }
});

test("oversized inbound frames disconnect, release payloads and leave zero timers", async () => {
  const h = fixture();
  const pending = h.relay.dispatch(scope, "edit");
  assert.equal(h.relay.message(h.editor, "x".repeat(AgentRelay.maxBytes + 1)), false);
  assert.equal(h.editor.readyState, 3);
  assert.deepEqual(await pending, { ok: false, code: "unknown-outcome", outcome: "unknown" });
  h.idle();
});

// Bundle the real SessionStore with only Cloudflare's base class stubbed, matching
// counted-agent.ts. Its ctx has real counted storage and hibernatable sockets.
interface SessionSurface {
  fetch(request: Request): Promise<Response>;
  webSocketMessage(socket: RelaySocket, message: string): void;
  webSocketClose(socket: RelaySocket, code: number, reason: string, wasClean: boolean): void;
  webSocketError(socket: RelaySocket, error: unknown): void;
}
async function sessionClass() {
  const { outputFiles } = await build({
    stdin: { contents: 'export { SessionStore } from "./worker/index.ts";', resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", conditions: ["workerd"],
    plugins: [{ name: "cloudflare-base", setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "base", namespace: "cloudflare" }));
      builder.onLoad({ filter: /.*/, namespace: "cloudflare" }, () => ({ contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" }));
    } }],
  });
  return await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`) as {
    SessionStore: new (ctx: object, env: Env) => SessionSurface;
  };
}

test("real SessionStore dispatch/results/cancel/timeout/close/error/reset write 0 payload keys/bytes", async () => {
  const { SessionStore } = await sessionClass();
  const counters = new UsageCounters(), storage = new CountedStorage(counters), editor = socket();
  const auto: { request: string; response: string }[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "WebSocketRequestResponsePair");
  Object.defineProperty(globalThis, "WebSocketRequestResponsePair", { configurable: true, value: class {
    constructor(public request: string, public response: string) {}
  } });
  const ctx = { storage,
    getWebSockets(tag: string) { assert.equal(tag, "editor"); return [editor]; },
    setWebSocketAutoResponse(pair: { request: string; response: string }) { auto.push(pair); },
    blockConcurrencyWhile<T>(run: () => Promise<T>) { return run(); },
  };
  const env: Env = { SESSIONS: { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: 404 }) }) }, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
  const body = JSON.stringify({ content: "private draft payload" });
  const dispatch = (instance: SessionSurface, signal?: AbortSignal) => instance.fetch(new Request("https://session.internal/relay/dispatch", {
    method: "POST", signal, headers: { "Content-Type": "application/json", "Content-Length": String(body.length), [AgentRelay.identityHeader]: JSON.stringify(scope) }, body,
  }));
  // Fetch body parsing is asynchronous: flush through the real dispatch until
  // its observable command is sent, without a wall-clock wait.
  const sent = async () => {
    for (let turns = 0; turns < 50 && !editor.sent.some(message => JSON.parse(message).type === "command"); turns++) await Promise.resolve();
    const message = editor.sent.find(message => JSON.parse(message).type === "command");
    assert.ok(message, "dispatch must send before waiting for its result");
    return (JSON.parse(message) as { id: string }).id;
  };
  try {
    const instance = new SessionStore(ctx, env);
    await instance.webSocketMessage(editor, handshake());
    assert.deepEqual(auto.map(pair => [pair.request, pair.response]), [["ping", "pong"]]);
    editor.sent.length = 0;
    const result = dispatch(instance), id = await sent();
    instance.webSocketMessage(editor, reply(id));
    assert.deepEqual(await (await result).json(), { ok: true, result: { applied: true } });
    editor.sent.length = 0;
    const controller = new AbortController(), cancelled = dispatch(instance, controller.signal);
    await sent(); controller.abort();
    assert.deepEqual(await (await cancelled).json(), { ok: false, code: "cancelled", outcome: "unknown" });
    editor.sent.length = 0;
    const closed = dispatch(instance); await sent();
    await instance.webSocketClose(editor, 1000, "closed", true);
    assert.deepEqual(await (await closed).json(), { ok: false, code: "unknown-outcome", outcome: "unknown" });
    editor.readyState = 1;
    // A new object reconstructs only metadata and requires the handshake: the
    // waking dispatch is held (not sent) until the owner's fresh handshake.
    const errorInstance = new SessionStore(ctx, env);
    editor.sent.length = 0;
    const errored = dispatch(errorInstance);
    for (let turns = 0; turns < 50; turns++) await Promise.resolve();
    assert.equal(editor.sent.some(message => JSON.parse(message).type === "command"), false);
    await errorInstance.webSocketMessage(editor, handshake()); await sent();
    await errorInstance.webSocketError(editor, new Error("network"));
    assert.deepEqual(await (await errored).json(), { ok: false, code: "unknown-outcome", outcome: "unknown" });
    editor.readyState = 1;
    const timeoutInstance = new SessionStore(ctx, env);
    await timeoutInstance.webSocketMessage(editor, handshake());
    const clock = new FakeClock(counters);
    clock.install();
    try {
      assert.deepEqual(await (await dispatch(timeoutInstance)).json(), { ok: false, code: "timeout", outcome: "unknown" });
      assert.equal(counters.waitedMs, 10_000);
    } finally { clock.uninstall(); }
    const persisted = await storage.list();
    assert.deepEqual([...persisted.keys()], ["agent-lifecycle"]);
    assert.ok(!JSON.stringify([...persisted]).includes("private draft payload"));
  } finally {
    if (original) Object.defineProperty(globalThis, "WebSocketRequestResponsePair", original);
    else Reflect.deleteProperty(globalThis, "WebSocketRequestResponsePair");
  }
});

const relayUrl = `${origin}/api/agent/relay?repo=lex%2Fstarter&branch=main&tabId=owner-tab&generation=1`;
test("upgrade rejects unauthenticated, cross-origin and non-upgrade before any DO call", async () => {
  const h = await startCountedWorker();
  try {
    for (const [headers, status] of [
      [{ Origin: origin, Upgrade: "websocket" }, 401],
      [{ Origin: "https://attacker.example", Upgrade: "websocket", Cookie: `__Host-ase_session=${"a".repeat(64)}` }, 403],
      [{ Origin: origin, Cookie: `__Host-ase_session=${"a".repeat(64)}` }, 400],
      [{ Upgrade: "websocket" }, 403],
    ] as const) {
      h.counters.reset();
      const response = await h.worker.dispatchFetch(relayUrl, { headers });
      assert.equal(response.status, status);
      assert.equal(h.counters.log.length, 0);
    }
    assert.equal((await h.worker.dispatchFetch(origin + "/relay/dispatch", { method: "POST" })).status, 404);
    assert.equal(h.counters.log.length, 0);
  } finally { await h.worker.dispose(); }
});

test("upgrade authorization pins repository/branch and replaces all supplied trusted headers", async () => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker);
    const original = h.namespace.get;
    const forwarded: { name: string; request: Request }[] = [];
    h.namespace.get = name => name.startsWith("agent-relay:") ? { fetch: async request => {
      forwarded.push({ name, request }); return new Response(null, { status: 204 });
    } } : original(name);
    const response = await h.worker.dispatchFetch(relayUrl, { headers: { Origin: origin, Upgrade: "websocket", Cookie: cookie, Authorization: "Bearer forged", [AgentRelay.identityHeader]: JSON.stringify({ ...scope, workspace: { ...scope.workspace, account: "attacker" } }) } });
    assert.equal(response.status, 204);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].name, await relayObjectName(scope.workspace));
    assert.equal(new URL(forwarded[0].request.url).pathname, "/relay/connect");
    assert.deepEqual(JSON.parse(forwarded[0].request.headers.get(AgentRelay.identityHeader)!), scope);
    assert.equal(forwarded[0].request.headers.get("Cookie"), null);
    assert.equal(forwarded[0].request.headers.get("Authorization"), null);
    for (const suffix of ["&branch=other", "&repo=lex%2Fother", "&generation=0"]) {
      assert.equal((await h.worker.dispatchFetch(relayUrl + suffix, { headers: { Origin: origin, Upgrade: "websocket", Cookie: cookie } })).status, 400);
    }
    assert.equal(forwarded.length, 1);
  } finally { await h.worker.dispose(); }
});

test("an inaccessible repository never opens a relay object", async () => {
  const h = await startCountedWorker();
  try {
    const { cookie } = await signIn(h.worker);
    h.github.allowed = false; h.counters.reset();
    const response = await h.worker.dispatchFetch(relayUrl, { headers: { Origin: origin, Upgrade: "websocket", Cookie: cookie } });
    assert.equal(response.status, 403);
    assert.equal(h.counters.log.some(row => row.name.startsWith("agent-relay:")), false);
  } finally { await h.worker.dispose(); }
});

test("real runtime accepts hibernatable editor upgrade, scope handshake and ping/pong", async () => {
  const { worker } = await startWorker();
  try {
    const { cookie } = await signIn(worker);
    const response = await worker.dispatchFetch(relayUrl.replace("lex%2Fstarter", encodeURIComponent(repo.full_name)), { headers: { Origin: origin, Upgrade: "websocket", Cookie: cookie } });
    assert.equal(response.status, 101);
    const ws = response.webSocket;
    assert.ok(ws, "Worker must preserve the upgrade's WebSocket endpoint");
    ws.accept();
    const next = () => new Promise<string>(resolve => ws.addEventListener("message", event => resolve(String(event.data)), { once: true }));
    const ready = next(); ws.send(handshake());
    assert.deepEqual(JSON.parse(await ready), { type: "ready", ...scope });
    const pong = next(); ws.send("ping");
    assert.equal(await pong, "pong");
    ws.close(1000);
  } finally { await worker.dispose(); }
});

test("dispatch intake reserves capacity before reading bodies and expires a stalled body within the deadline", async () => {
  const { SessionStore } = await sessionClass();
  const editor = socket();
  const original = Object.getOwnPropertyDescriptor(globalThis, "WebSocketRequestResponsePair");
  Object.defineProperty(globalThis, "WebSocketRequestResponsePair", { configurable: true, value: class { constructor(public request: string, public response: string) {} } });
  const ctx = { storage: new CountedStorage(new UsageCounters()), getWebSockets: () => [editor], setWebSocketAutoResponse() {},
    blockConcurrencyWhile<T>(run: () => Promise<T>) { return run(); } };
  const env: Env = { SESSIONS: { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: 404 }) }) }, ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
  const pulls: number[] = [], cancelled: number[] = [];
  const stalled = (index: number, length = 1024, signal?: AbortSignal, cancel?: () => Promise<void>) => new Request("https://session.internal/relay/dispatch", {
    method: "POST", duplex: "half", signal,
    headers: { "Content-Type": "application/json", "Content-Length": String(length), [AgentRelay.identityHeader]: JSON.stringify(scope) },
    // highWaterMark 0: the stream is pulled only when someone reads the body.
    body: new ReadableStream({ pull() { pulls.push(index); return new Promise(() => {}); }, cancel() { cancelled.push(index); return cancel?.(); } }, { highWaterMark: 0 }),
  } as RequestInit);
  const instance = new SessionStore(ctx, env);
  await instance.webSocketMessage(editor, handshake());
  const clockCounters = new UsageCounters();
  const clock = new FakeClock(clockCounters);
  try {
    // Missing Content-Length is refused before any reading.
    const unsized = await instance.fetch(new Request("https://session.internal/relay/dispatch", { method: "POST", headers: { [AgentRelay.identityHeader]: JSON.stringify(scope) } }));
    assert.equal(unsized.status, 411);
    // A declared size over 8 MiB is refused before reading.
    pulls.length = 0;
    assert.deepEqual(await (await instance.fetch(stalled(99, AgentRelay.maxBytes + 1))).json(), { ok: false, code: "too-large", outcome: "not-sent" });
    assert.equal(pulls.includes(99), false);
    clock.install();
    const five = Array.from({ length: 5 }, (_, index) => instance.fetch(stalled(index)));
    for (let turns = 0; turns < 20; turns++) await Promise.resolve();
    pulls.length = 0;
    // The sixth is busy while five bodies are still arriving; its body is never read.
    assert.deepEqual(await (await instance.fetch(stalled(5))).json(), { ok: false, code: "busy", outcome: "not-sent" });
    assert.equal(pulls.includes(5), false);
    // Stalled bodies expire at the ten-second total deadline and are never sent.
    for (const response of await Promise.all(five)) assert.deepEqual(await response.json(), { ok: false, code: "timeout", outcome: "not-sent" });
    // Each stalled reader was cancelled (no consumption continues) and its reservation released.
    assert.deepEqual(cancelled.sort(), [0, 1, 2, 3, 4]);
    pulls.length = 0;
    const after = instance.fetch(stalled(6));
    for (let turns = 0; turns < 20; turns++) await Promise.resolve();
    assert.deepEqual(pulls, [6]);
    assert.deepEqual(await (await after).json(), { ok: false, code: "timeout", outcome: "not-sent" });
    // A source whose cancel never settles cannot hold the deadline or the slot.
    const never = () => new Promise<void>(() => {});
    const hung = await Promise.all(Array.from({ length: 5 }, (_, index) => instance.fetch(stalled(10 + index, 1024, undefined, never))));
    for (const response of hung) assert.deepEqual(await response.json(), { ok: false, code: "timeout", outcome: "not-sent" });
    // Abort while the body is stalled: prompt cancelled/not-sent, reader cancelled, slots free again.
    cancelled.length = 0;
    const controllers = Array.from({ length: 5 }, () => new AbortController());
    const aborted = controllers.map((controller, index) => instance.fetch(stalled(20 + index, 1024, controller.signal, never)));
    for (let turns = 0; turns < 20; turns++) await Promise.resolve();
    const waitedBefore = clockCounters.waitedMs;
    for (const controller of controllers) controller.abort();
    for (const response of await Promise.all(aborted)) assert.deepEqual(await response.json(), { ok: false, code: "cancelled", outcome: "not-sent" });
    assert.equal(clockCounters.waitedMs, waitedBefore);
    assert.deepEqual(cancelled.sort(), [20, 21, 22, 23, 24]);
    const freed = instance.fetch(stalled(30));
    for (let turns = 0; turns < 20; turns++) await Promise.resolve();
    assert.equal(pulls.includes(30), true);
    assert.deepEqual(await (await freed).json(), { ok: false, code: "timeout", outcome: "not-sent" });
    assert.equal(editor.sent.some(message => JSON.parse(message).type === "command"), false);
  } finally {
    clock.uninstall();
    if (original) Object.defineProperty(globalThis, "WebSocketRequestResponsePair", original);
    else Reflect.deleteProperty(globalThis, "WebSocketRequestResponsePair");
  }
});

test("each command frame carries only the remaining total budget, even after a delayed handshake", async () => {
  const h = fixture();
  const immediate = h.relay.dispatch(scope, "now");
  assert.equal(JSON.parse(h.editor.sent.at(-1)!).remainingMs, 10_000);
  h.relay.message(h.editor, reply(h.id()));
  assert.deepEqual(await immediate, { ok: true, result: { applied: true } });
  const restored = new AgentRelay([h.editor], h.clock);
  const waiting = restored.dispatch({ workspace: scope.workspace }, "late");
  h.advance(9_000);
  assert.equal(restored.message(h.editor, handshake()), true);
  const sent = JSON.parse(h.editor.sent.at(-1)!);
  assert.equal(sent.type, "command"); assert.equal(sent.remainingMs, 1_000);
  restored.message(h.editor, reply(sent.id));
  assert.deepEqual(await waiting, { ok: true, result: { applied: true } });
});
