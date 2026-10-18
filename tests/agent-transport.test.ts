import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentCommand } from "../shared/agent.ts";
import { payloadIdentity, type AgentWorkspace, type JsonValue } from "../shared/agent-command.ts";
import { createLiveTransport } from "../src/agent-transport.ts";
import { AgentRecordsError, indexedDbAgentRecords } from "../src/agent-records.ts";
import { createAgentRecovery, recordFailure } from "../src/agent-recovery.ts";
import { draftKey } from "../src/drafts.ts";
import { forEachAwait } from "./support/await-race.ts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb.ts";

type Options = Parameters<typeof createLiveTransport>[0];
const workspace = { account: "Lex", repoId: 1, branch: "main" };
const command = (id = "operation-1"): AgentCommand => ({ id, operation: "write_file", path: "index.html", content: "new", commit: "sha", branch: "main", repoId: 1, grantId: "grant", state: "pending", createdAt: 100_000 });
const drain = async () => { for (let i = 0; i < 65; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) { if (check()) return; await drain(); }
  assert.ok(check(), "observable transport state did not arrive");
}
class FakeSocket extends EventTarget {
  readyState = 0;
  sent: string[] = [];
  autoReady = true;
  autoPong = true;
  constructor(fail = false) {
    super();
    queueMicrotask(() => {
      if (fail) { this.close(); return; }
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(text: string) {
    assert.equal(this.readyState, 1);
    this.sent.push(text);
    if (text === "ping") { if (this.autoPong) queueMicrotask(() => this.receive("pong")); return; }
    const value = JSON.parse(text);
    if (value.type === "handshake" && this.autoReady) queueMicrotask(() => this.receive({ ...value, type: "ready" }));
  }
  receive(value: unknown) { this.dispatchEvent(new MessageEvent("message", { data: typeof value === "string" ? value : JSON.stringify(value) })); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event("close")); }
  messages(type: string) { return this.sent.filter(text => text !== "ping").map(text => JSON.parse(text)).filter(value => value.type === type); }
}
function fixture() {
  let now = 100_000, sequence = 0, http = 0, commits = 0, runs = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock = {
    setTimeout(callback: () => void, delay: number) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const fake = fakeIndexedDB(), records = indexedDbAgentRecords("transport", fake.factory, () => now);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const locks = new Set<number>(), events: EventTarget[] = [], channels = new Map<string, () => void>();
  let hint: { tabId: string; generation: number } | undefined;
  const broadcast = () => { for (const event of events) event.dispatchEvent(new Event("storage")); };
  function tab(id: string, overrides: Partial<Options> = {}) {
    const window = new EventTarget(), document = new EventTarget();
    events.push(window);
    let current: AgentWorkspace | undefined = { ...workspace };
    const sockets: FakeSocket[] = [];
    let fail = false;
    const registry = {
      read: () => hint,
      write: (owner: { tabId: string; generation: number }) => { hint = owner; queueMicrotask(broadcast); },
      clear: (owner: { tabId: string; generation: number }) => { if (hint?.tabId === owner.tabId && hint.generation === owner.generation) { hint = undefined; queueMicrotask(broadcast); } },
      held: (generation: number) => Promise.resolve(locks.has(generation)),
      hold: (generation: number) => {
        if (locks.has(generation)) return Promise.resolve(undefined);
        locks.add(generation); return Promise.resolve(() => { locks.delete(generation); });
      },
    } satisfies NonNullable<Options["registry"]>;
    const transport = createLiveTransport({
      workspace, repo: "Lex/site", tabId: id, records, clock, registry,
      current: () => current, events: { window, document }, reload: async () => {}, listen: () => {},
      socket: () => { const socket = new FakeSocket(fail); sockets.push(socket); return socket; },
      probe: () => { http++; return Promise.resolve(400); },
      recovery: reconnect => createAgentRecovery({
        workspace, tabId: id, storage, ...clock, now: () => now, random: () => 0.5, reconnect,
        exclusive: run => run(),
        channel: {
          subscribe(listener) { channels.set(id, listener); return () => { channels.delete(id); }; },
          post() { queueMicrotask(() => { for (const [other, listen] of channels) if (other !== id) listen(); }); },
        },
      }),
      run: async (incoming, generation) => {
        runs++;
        const stored = await records.workspace(workspace);
        const outcome = { message: "Kept once.", result: { path: incoming.path } };
        const result = await records.commit({ workspace, generation, expectedRevision: stored.revision, expectedDrafts: [], drafts: [],
          receipt: { operationId: incoming.id, authorizationId: incoming.grantId!, payloadIdentity: payloadIdentity({ content: incoming.content }),
            outcome, issuedAt: incoming.createdAt, createdAt: now } });
        if (!result.duplicate) commits++;
        return result.receipt.outcome as typeof outcome;
      }, ...overrides,
    });
    const deliver = (incoming: unknown = command(), patch: object = {}, source = sockets.at(-1)!) => {
      const scope = source.messages("handshake").at(-1);
      source.receive({ ...scope, type: "command", id: `call-${++sequence}`, command: incoming, ...patch });
    };
    return { transport, sockets, window, document, deliver,
      change: (next?: AgentWorkspace) => { current = next; transport.changed(); }, fail: () => { fail = true; } };
  }
  async function tick(ms: number) {
    const end = now + ms;
    await drain();
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback(); await drain();
    }
    now = end; await drain();
  }
  return { tab, tick, timers, records, fake, broadcast, recoveryChanged: () => { for (const listen of channels.values()) listen(); }, storage, now: () => now, counts: () => ({ http, commits, runs }) };
}

test("duplicate delivery joins in-flight work; durable receipt returns the same outcome after commit", async () => {
  const f = fixture(), a = f.tab("a");
  await a.transport.start();
  a.deliver(); a.deliver();
  await until(() => a.sockets[0].messages("result").length === 2);
  assert.deepEqual(f.counts(), { http: 0, commits: 1, runs: 1 });
  a.deliver();
  await until(() => a.sockets[0].messages("result").length === 3);
  const results = a.sockets[0].messages("result");
  assert.deepEqual(results.map(value => value.result), Array(3).fill(results[0].result));
  assert.equal(f.counts().commits, 1);
  a.deliver({ ...command(), content: "different" });
  await until(() => a.sockets[0].messages("result").length === 4);
  assert.equal(a.sockets[0].messages("result")[3].result.state, "conflict");
  a.transport.stop(); assert.equal(f.timers.size, 0);
});

test("wrong generation, tab, workspace and malformed commands refuse without running", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start();
  for (const patch of [{ generation: 99 }, { tabId: "b" }, { workspace: { ...workspace, branch: "other" } }]) a.deliver(command(), patch);
  for (const patch of [{ repoId: 2 }, { branch: "other" }, { grantId: "" }, { operation: "invented" }, { createdAt: "bad" }]) a.deliver({ ...command(), ...patch });
  await until(() => a.sockets[0].messages("result").length === 8);
  assert.ok(a.sockets[0].messages("result").every(value => value.result.state === "conflict"));
  assert.equal(f.counts().runs, 0); a.transport.stop();
});

test("second tab is other-owner; focus keeps background owner; explicit takeover fences old late commit and resume", async () => {
  const f = fixture();
  let release!: () => void, admitted = false, lateCommits = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const a = f.tab("a", { run: async (incoming, generation) => {
    admitted = true; await held;
    const stored = await f.records.workspace(workspace);
    await f.records.commit({ workspace, generation, expectedRevision: stored.revision, expectedDrafts: [], drafts: [],
      receipt: { operationId: incoming.id, authorizationId: "grant", payloadIdentity: "identity", outcome: {}, issuedAt: incoming.createdAt, createdAt: f.now() } });
    lateCommits++;
  } });
  await a.transport.start(); a.deliver(); await until(() => admitted);
  const b = f.tab("b"); await b.transport.start();
  assert.equal(b.transport.state().mode, "other-owner"); assert.equal(b.sockets.length, 0);
  b.window.dispatchEvent(new Event("focus")); b.document.dispatchEvent(new Event("visibilitychange")); await drain();
  assert.equal(a.transport.state().mode, "live"); assert.equal(b.sockets.length, 0);
  a.document.dispatchEvent(new Event("freeze"));
  await b.transport.takeover(); await drain(); release(); await drain();
  assert.equal(a.transport.state().mode, "taken-over"); assert.equal(b.transport.state().mode, "live");
  a.deliver(command("late"));
  a.document.dispatchEvent(new Event("resume")); a.window.dispatchEvent(new Event("pageshow"));
  await f.tick(120_000);
  assert.equal(lateCommits, 0); assert.equal(a.sockets.length, 1); assert.equal(a.sockets[0].messages("result").length, 0);
  a.transport.stop(); b.transport.stop();
});

test("owner closing offers Take over and never promotes the second tab", async () => {
  const f = fixture(), a = f.tab("a"), b = f.tab("b");
  await a.transport.start(); await b.transport.start(); a.transport.stop(); await drain();
  assert.deepEqual(b.transport.state(), { mode: "other-owner", closed: true });
  await f.tick(180_000); assert.equal(b.sockets.length, 0);
  await b.transport.takeover(); assert.equal(b.transport.state().mode, "live"); b.transport.stop();
});

test("reset handshakes on the same socket without replay; pre-reset results are dropped", async () => {
  const f = fixture(); let release!: () => void, running = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  const a = f.tab("a", { run: async () => { running = true; await held; return { message: "Kept" }; } });
  await a.transport.start(); a.deliver(); await until(() => running);
  const socket = a.sockets[0]; socket.receive({ type: "reset", code: "unknown-outcome", handshakeRequired: true });
  await until(() => socket.messages("handshake").length === 2 && a.transport.state().mode === "live");
  release(); await drain(); assert.equal(socket.messages("result").length, 0); assert.equal(a.sockets.length, 1);
  assert.equal(f.counts().http, 0); a.transport.stop();
});

test("server close reconnects through bounded recovery, drops old results and pauses after five attempts", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start(); a.fail(); a.sockets[0].close();
  await f.tick(120_000);
  assert.equal(a.sockets.length, 6); assert.equal(a.transport.state().mode, "paused");
  assert.equal(f.counts().http, 0); assert.equal(f.counts().runs, 0); a.transport.stop();
});

test("quota recorded by another tab closes live socket, zero automatic attempts; manual Retry is single-flight and respects cooldown", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start();
  recordFailure(f.storage, workspace, { kind: "quota", retryAt: f.now() + 60_000 }, f.now());
  f.recoveryChanged();
  assert.equal(a.transport.state().mode, "quota");
  await a.transport.retry(); assert.equal(a.sockets.length, 1);
  await f.tick(120_000); assert.equal(a.sockets.length, 1);
  await Promise.all([a.transport.retry(), a.transport.retry()]);
  assert.equal(a.sockets.length, 2); assert.equal(a.transport.state().mode, "live"); a.transport.stop();
});

test("failed takeover stays durably paused after Turn off; Try again can recover", async () => {
  const f = fixture(), a = f.tab("a", { reload: () => Promise.reject(new Error("load failed")) });
  await a.transport.start(); assert.equal(a.transport.state().mode, "takeover-failed");
  assert.equal((await f.records.workspace(workspace)).paused, true); a.transport.stop();
  const b = f.tab("b"); await b.transport.start(); assert.equal(b.transport.state().mode, "takeover-failed");
  assert.equal(b.sockets.length, 0); await b.transport.takeover(); assert.equal(b.transport.state().mode, "live"); b.transport.stop();
});

test("workspace change drops socket and refuses late commands without reconnecting when switched back", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start();
  a.change({ ...workspace, branch: "other" }); a.deliver(); await drain();
  assert.equal(a.transport.state().mode, "workspace-changed"); assert.equal(f.counts().runs, 0);
  a.change(workspace); a.document.dispatchEvent(new Event("resume")); await f.tick(180_000);
  assert.equal(a.sockets.length, 1); a.transport.stop();
});

test("live idle sends only ping/pong over simulated minutes, no HTTP or recovery timers", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start(); await f.tick(360_000);
  assert.equal(f.counts().http, 0); assert.equal(f.counts().runs, 0);
  assert.equal(a.sockets.length, 1); assert.equal(a.sockets[0].sent.filter(value => value === "ping").length, 8);
  assert.equal(f.timers.size, 1); a.transport.stop();
});

test("missing pong closes socket and reconnects; freeze/resume restores heartbeat", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start();
  a.document.dispatchEvent(new Event("freeze")); assert.equal(f.timers.size, 0);
  a.document.dispatchEvent(new Event("resume")); await drain(); assert.equal(f.timers.size, 1);
  a.sockets[0].autoPong = false; await f.tick(56_000);
  assert.equal(a.sockets[0].readyState, 3); assert.equal(a.sockets.length, 2); a.transport.stop();
});

test("every failed relay probe enters recovery with one probe and no fallback", async () => {
  for (const status of [404, 400, 401, 429, 503]) {
    const f = fixture(); let probes = 0;
    const a = f.tab("a", { socket: () => new FakeSocket(true), probe: () => { probes++; return Promise.resolve(status); } });
    await a.transport.start();
    assert.equal(a.transport.state().mode, "reconnecting");
    await f.tick(120_000); assert.equal(probes, 1); a.transport.stop();
  }
});

test("unproven storage outcomes remain unknown", async () => {
  for (const error of [new AgentRecordsError("unknown", "Unproven outcome"), new Error("This browser could not confirm whether the change was kept")]) {
    const f = fixture(), a = f.tab("a", { run: () => Promise.reject(error) }); await a.transport.start(); a.deliver();
    await until(() => a.sockets[0].messages("result").length === 1);
    assert.equal(a.sockets[0].messages("result")[0].result.state, "unknown"); a.transport.stop();
  }
});

test("fenced command carries its live generation even when the owner is built after another takeover", async () => {
  const f = fixture(); let release!: () => void, admitted = false, late = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const a = f.tab("a", { run: async incoming => {
    admitted = true; await held;
    const snapshot = await f.records.snapshot(workspace);
    const draft = { ...workspace, repo: "Lex/site", path: "index.html", content: "new", base: "old", updatedAt: f.now() };
    await f.records.commit({ workspace, generation: incoming.ownerGeneration!, expectedRevision: snapshot.revision,
      expectedDrafts: [[draftKey(draft, draft.path), null]], drafts: [[draftKey(draft, draft.path), draft]],
      receipt: { operationId: incoming.id, authorizationId: "grant", payloadIdentity: payloadIdentity(JSON.parse(JSON.stringify(incoming)) as JsonValue), outcome: {}, issuedAt: incoming.createdAt, createdAt: f.now() } });
    late++;
  } });
  await a.transport.start(); a.deliver(); await until(() => admitted);
  const b = f.tab("b"); await b.transport.start(); await b.transport.takeover(); release(); await drain();
  assert.equal(late, 0); assert.deepEqual((await f.records.snapshot(workspace)).drafts, []);
  a.transport.stop(); b.transport.stop();
});


test("a result for a dead socket is never resent on a replacement socket", async () => {
  const f = fixture(); let release!: () => void, running = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  const a = f.tab("a", { run: async () => { running = true; await held; return { message: "Kept" }; } });
  await a.transport.start(); a.deliver(); await until(() => running);
  a.sockets[0].close(); await f.tick(1000);
  assert.equal(a.sockets.length, 2); assert.equal(a.transport.state().mode, "live");
  release(); await drain();
  assert.ok(a.sockets.every(socket => socket.messages("result").length === 0)); a.transport.stop();
});

test("in-flight operation id reused for different work is refused without joining or running again", async () => {
  const f = fixture(); let release!: () => void, runs = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  const a = f.tab("a", { run: async () => { runs++; await held; } });
  await a.transport.start(); a.deliver(); await until(() => runs === 1);
  a.deliver({ ...command(), content: "different" });
  await until(() => a.sockets[0].messages("result").length === 1);
  assert.equal(a.sockets[0].messages("result")[0].result.state, "conflict");
  release(); await drain(); assert.equal(runs, 1); a.transport.stop();
});


test("workspace changes at every ownership await never open a stale socket", async () => {
  const points = await forEachAwait(race => {
    const f = fixture();
    const records = { ...f.records,
      workspace: race.port("workspace", (...args) => f.records.workspace(...args)),
      pause: race.port("pause", (...args) => f.records.pause(...args)),
      reconcile: race.port("reconcile", (...args) => f.records.reconcile(...args)),
      snapshot: race.port("snapshot", (...args) => f.records.snapshot(...args)),
      setGeneration: race.port("generation", (...args) => f.records.setGeneration(...args)),
    } satisfies Options["records"];
    const a = f.tab("a", { records, reload: race.port("reload", async () => {}) });
    const done = a.transport.start().then(() => { a.transport.stop(); });
    return { a, done, opened: 0 };
  }, run => { run.opened = run.a.sockets.length; run.a.change({ ...workspace, branch: "other" }); }, ({ a, opened }) => {
    assert.equal(a.sockets.length, opened);
    assert.ok(a.sockets.every(socket => socket.readyState === 3));
  });
  assert.ok(points >= 7);
});


test("missing WebSocket stays unavailable without a route probe or ownership claim", async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: undefined });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "WebSocket", descriptor); else Reflect.deleteProperty(globalThis, "WebSocket"); });
  const f = fixture(), a = f.tab("a", { socket: undefined }); await a.transport.start();
  assert.equal(a.transport.state().mode, "unavailable"); assert.equal(a.sockets.length, 0);
  assert.equal(f.counts().http, 0); assert.equal((await f.records.workspace(workspace)).generation, 0); a.transport.stop();
});

test("a command immediately behind ready waits for the durable handshake proof", async () => {
  const f = fixture(); let source!: FakeSocket;
  const a = f.tab("a", { socket: () => {
    source = new FakeSocket();
    const send = source.send.bind(source);
    source.send = text => {
      send(text);
      if (text === "ping") return;
      const value = JSON.parse(text);
      if (value.type === "handshake") queueMicrotask(() => source.receive({ ...value, type: "command", id: "immediate", command: command() }));
    };
    return source;
  } });
  await a.transport.start();
  await until(() => source.messages("result").length === 1);
  assert.equal(source.messages("result")[0].result.state, "applied");
  assert.equal(f.counts().commits, 1); a.transport.stop();
});

test("manual quota retry may await ready beyond a recovery lease renewal", async () => {
  const f = fixture(); const sockets: FakeSocket[] = [];
  const a = f.tab("a", { socket: () => {
    const source = new FakeSocket();
    if (sockets.length) source.autoReady = false;
    sockets.push(source); return source;
  } });
  await a.transport.start(); a.transport.report({ kind: "quota" });
  const retry = a.transport.retry();
  await until(() => sockets.length === 2 && sockets[1].messages("handshake").length === 1);
  await f.tick(6000);
  assert.equal(sockets[1].readyState, 1, "lease renewal must not close the explicitly requested retry");
  sockets[1].receive({ ...sockets[1].messages("handshake")[0], type: "ready" });
  await retry; assert.equal(a.transport.state().mode, "live"); a.transport.stop();
});

test("a fresh quota report cancels a pending manual handshake with no automatic retry", async () => {
  const f = fixture(); const sockets: FakeSocket[] = [];
  const a = f.tab("a", { socket: () => {
    const source = new FakeSocket();
    if (sockets.length) source.autoReady = false;
    sockets.push(source); return source;
  } });
  await a.transport.start(); a.transport.report({ kind: "quota" });
  const retry = a.transport.retry();
  await until(() => sockets.length === 2 && sockets[1].messages("handshake").length === 1);
  a.transport.report({ kind: "quota" }); await retry; await f.tick(120_000);
  assert.equal(sockets[1].readyState, 3); assert.equal(sockets.length, 2);
  assert.equal(a.transport.state().mode, "quota"); a.transport.stop();
});

test("reset with no fresh ready times out into coordinated reconnect without replay", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start();
  a.sockets[0].autoReady = false;
  a.sockets[0].receive({ type: "reset", code: "unknown-outcome", handshakeRequired: true });
  await f.tick(11_000);
  assert.equal(a.sockets[0].readyState, 3); assert.equal(a.sockets.length, 2);
  assert.equal(a.transport.state().mode, "live"); assert.equal(f.counts().http, 0); a.transport.stop();
});

test("back-forward cache pagehide preserves opt-in and pageshow resumes the owner", async () => {
  const f = fixture(), a = f.tab("a"); await a.transport.start();
  a.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
  assert.equal(a.transport.state().mode, "live"); assert.equal(f.timers.size, 0);
  a.window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })); await drain();
  await f.tick(45_000);
  assert.equal(a.sockets.length, 1); assert.equal(a.sockets[0].sent.filter(value => value === "ping").length, 1);
  a.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
  assert.equal(a.transport.state().mode, "off"); assert.equal(f.timers.size, 0);
});

test("a media dispatch's deadline is the relay's remaining budget from arrival, never a fresh 10 s", async () => {
  const deadlines: number[] = [];
  const f = fixture(), a = f.tab("a", { media: async (_request, _generation, _current, deadline) => { deadlines.push(deadline); return { ok: true, value: {} }; } });
  await a.transport.start();
  const media = { operation: "media", tool: "adding_settings", path: "", args: {}, id: "budget", grantId: "grant-1", createdAt: 0 };
  for (const [index, remainingMs] of [1_000, undefined, 60_000, -5].entries()) {
    const before = Date.now();
    a.deliver(media, remainingMs === undefined ? {} : { remainingMs });
    await until(() => a.sockets[0].messages("result").length === index + 1);
    const deadline = deadlines.at(-1)!, budget = remainingMs === undefined ? 10_000 : Math.min(10_000, Math.max(0, remainingMs));
    assert.ok(deadline <= Date.now() + budget - 1_000 && deadline >= before + budget - 1_000, `remainingMs ${remainingMs} gave ${deadline - before} ms`);
  }
  a.transport.stop();
});

test("a media command's page is read on arrival, before readiness, ownership proof or executor loading", async () => {
  let reads = 0, page = "<p>arrival</p>";
  const seen: (string | undefined)[] = [];
  const f = fixture(), a = f.tab("a", { source: path => { reads++; return path === "index.html" ? page : undefined; },
    media: async (_request, _generation, _current, _deadline, admitted) => { seen.push(admitted.page); return { ok: true, value: {} }; } });
  await a.transport.start();
  a.deliver({ operation: "media", tool: "frame_image", path: "index.html", args: { element: "0", shape: "square" }, id: "arrival", grantId: "grant-1", createdAt: 0 });
  // A manual edit after the frame arrived, while admission still awaits.
  assert.equal(reads, 1); page = "<p>edited</p>";
  await until(() => seen.length === 1);
  assert.deepEqual(seen, ["<p>arrival</p>"]); assert.equal(reads, 1);
  a.transport.stop();
});

test("media commands reach the receipt-capable executor on the live connection", async () => {
  let runs = 0;
  const f = fixture(), a = f.tab("a", { run: async () => { runs++; return { message: "Placed." }; } });
  await a.transport.start();
  for (const operation of ["place_media", "frame_image", "loop_video"] as const)
    a.deliver({ ...command(`media-${operation}`), operation });
  await until(() => a.sockets[0].messages("result").length === 3);
  assert.deepEqual(a.sockets[0].messages("result").map(value => value.result.state), Array(3).fill("applied"));
  assert.equal(runs, 3);
  a.transport.stop();
});

test("a socket lost or reset while admission reads IndexedDB never reaches the executor", async () => {
  for (const loss of ["close", "reset"] as const) {
    const f = fixture();
    let hold: (() => void) | undefined, holding = false;
    const records = new Proxy(f.records, { get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (name !== "workspace") return value;
      return async (...args: Parameters<typeof target.workspace>) => {
        if (holding) await new Promise<void>(resolve => { hold = resolve; });
        return target.workspace(...args);
      };
    } });
    const a = f.tab("a", { records });
    await a.transport.start();
    holding = true;
    a.deliver();
    await until(() => hold !== undefined);
    holding = false;
    if (loss === "close") a.sockets[0].close();
    else a.sockets[0].receive({ type: "reset", code: "unknown-outcome", handshakeRequired: true });
    hold!();
    await f.tick(1000);
    assert.equal(f.counts().runs, 0, loss);
    assert.equal(f.counts().commits, 0, loss);
    a.transport.stop();
  }
});

test("browser storage refusing ownership stays paused even when the relay route is absent", async () => {
  for (const [status, mode] of [[404, "takeover-failed"], [400, "takeover-failed"]] as const) {
    const f = fixture();
    const records = new Proxy(f.records, { get(target, name, receiver) {
      if (name === "workspace") return async () => { throw new DOMException("The user denied permission to access the database.", "SecurityError"); };
      return Reflect.get(target, name, receiver);
    } });
    let probes = 0;
    const a = f.tab("a", { records, probe: async () => { probes++; return status; } });
    await a.transport.start();
    assert.equal(a.transport.state().mode, mode);
    assert.equal(probes, 1);
    assert.equal(a.sockets.length, 0);
    a.transport.stop();
  }
});

test("a failed first upgrade honours the probe's quota body and Retry-After", async () => {
  {
    const f = fixture();
    let opened = 0;
    const a = f.tab("a", { now: () => f.now(), socket: () => { opened++; return new FakeSocket(true); },
      probe: async () => ({ status: 429, body: { error: "Today's allowance is used up.", code: "daily-quota", resetAt: 500_000 }, text: "", retryAfter: null }) });
    await a.transport.start();
    assert.equal(a.transport.state().mode, "quota");
    await f.tick(300_000);
    assert.equal(opened, 1, "zero automatic attempts while quota-paused");
    a.transport.stop();
  }
  {
    const f = fixture(), sockets: FakeSocket[] = [];
    let failing = true;
    const a = f.tab("a", { now: () => f.now(), socket: () => { const socket = new FakeSocket(failing); sockets.push(socket); return socket; },
      probe: async () => ({ status: 503, text: "busy", retryAfter: "60" }) });
    await a.transport.start();
    assert.equal(sockets.length, 1);
    failing = false;
    await f.tick(59_000);
    assert.equal(sockets.length, 1, "no reconnect before Retry-After");
    await f.tick(10_000);
    assert.equal(sockets.length, 2);
    await until(() => a.transport.state().mode === "live");
    a.transport.stop();
  }
});

test("a workspace briefly absent during a refresh refuses commands but keeps the live socket", async () => {
  const f = fixture(), a = f.tab("a");
  await a.transport.start();
  a.change(undefined);
  a.deliver(command("during-refresh"));
  await until(() => a.sockets[0].messages("result").length === 1);
  assert.equal(a.sockets[0].messages("result")[0].result.state, "conflict");
  a.change({ ...workspace });
  assert.equal(a.transport.state().mode, "live");
  a.deliver(command("after-refresh"));
  await until(() => a.sockets[0].messages("result").length === 2);
  assert.equal(a.sockets[0].messages("result")[1].result.state, "applied");
  assert.equal(a.sockets.length, 1);
  assert.equal(f.counts().runs, 1);
  a.transport.stop();
});

test("a socket lost while the workspace is briefly absent reconnects through the coordinator meanwhile", async () => {
  const f = fixture(), a = f.tab("a");
  await a.transport.start();
  a.change(undefined);
  a.sockets[0].close();
  await f.tick(5_000);
  assert.equal(a.sockets.length, 2);
  await until(() => a.transport.state().mode === "live");
  a.change({ ...workspace });
  a.deliver(command("after-return"));
  await until(() => a.sockets[1].messages("result").length === 1);
  assert.equal(a.sockets[1].messages("result")[0].result.state, "applied");
  a.transport.stop();
});

test("storage refusal with a quota or Retry-After probe answer records it; a later takeover opens no socket before it ends", async () => {
  for (const answer of [
    { status: 429, body: { error: "Today's allowance is used up.", code: "daily-quota", resetAt: 10_000_000 }, text: "", retryAfter: "60" },
    { status: 503, text: "busy", retryAfter: "60" },
  ]) {
    const f = fixture();
    let refusing = true;
    const records = new Proxy(f.records, { get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (name !== "workspace") return value;
      return async (...args: Parameters<typeof target.workspace>) => {
        if (refusing) throw new DOMException("The user denied permission to access the database.", "SecurityError");
        return target.workspace(...args);
      };
    } });
    const a = f.tab("a", { records, now: () => f.now(), probe: async () => answer });
    await a.transport.start();
    assert.equal(a.transport.state().mode, "takeover-failed");
    refusing = false;
    await a.transport.takeover();
    await f.tick(30_000);
    assert.equal(a.sockets.length, 0, `no socket before Retry-After (${answer.status})`);
    assert.equal(a.transport.state().mode, answer.status === 429 ? "quota" : "reconnecting");
    a.transport.stop();
  }
});

test("a first connection that fails before ready while the workspace is absent enters bounded recovery", async () => {
  const f = fixture(), a = f.tab("a");
  a.change(undefined);
  a.fail();
  await a.transport.start();
  assert.equal(a.transport.state().mode, "reconnecting");
  a.change({ ...workspace });
  await f.tick(180_000);
  assert.equal(a.transport.state().mode, "paused", "five attempts, then a pause with Retry");
  assert.equal(a.sockets.length, 6);
  a.transport.stop();
});

test("quota recorded while the workspace is absent closes the socket; nothing runs after it returns", async () => {
  const f = fixture(), a = f.tab("a");
  await a.transport.start();
  a.change(undefined);
  recordFailure(f.storage, workspace, { kind: "quota" }, f.now());
  f.recoveryChanged();
  await f.tick(1_000);
  assert.equal(a.transport.state().mode, "quota");
  assert.equal(a.sockets[0].readyState, 3);
  a.change({ ...workspace });
  await f.tick(300_000);
  assert.equal(a.sockets.length, 1, "zero automatic attempts");
  assert.equal(f.counts().runs, 0);
  a.transport.stop();
});

test("takeover reload shows the durable drafts in the open file unless the user typed during the read", async () => {
  const { reloadTakeover } = await import("../src/agent-transport.ts");
  const run = async (memory: Map<string, { content?: string; deleted?: boolean }>, stored: [string, { content: string; deleted?: boolean }][], typed = false) => {
    let editor = "old text", restored = 0;
    await reloadTakeover({ generation: 2, revision: 1, paused: true, drafts: stored } as never, {
      open: "index.html", key: path => `k:${path}`, keys: () => [...memory.keys()],
      settle: async () => {
        if (typed) editor = "typed meanwhile";
        memory.clear();
        for (const [key, value] of stored) memory.set(key, value);
      },
      draft: path => memory.get(`k:${path}`), mounted: () => editor, restore: async () => { restored++; },
    });
    return restored;
  };
  assert.equal(await run(new Map(), [["k:index.html", { content: "owner's edit" }]]), 1, "changed text");
  assert.equal(await run(new Map(), [["k:index.html", { content: "", deleted: true }]]), 1, "deleted or moved away");
  assert.equal(await run(new Map([["k:index.html", { content: "old text" }]]), []), 1, "discarded");
  assert.equal(await run(new Map(), [["k:index.html", { content: "old text" }]]), 0, "already shown");
  assert.equal(await run(new Map(), [["k:index.html", { content: "owner's edit" }]], true), 0, "typing during the read wins");
});

test("a first-failure probe whose headers or body never arrive counts as a network failure after 10 s", async t => {
  for (const stall of ["headers", "body"] as const) {
    let aborted = 0;
    t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
      init.signal!.addEventListener("abort", () => { aborted++; });
      return stall === "headers" ? new Promise(() => {}) : Promise.resolve({ status: 400, headers: new Headers(), text: () => new Promise(() => {}) });
    });
    const f = fixture();
    const a = f.tab("a", { socket: () => new FakeSocket(true), probe: undefined });
    const starting = a.transport.start();
    await f.tick(10_000);
    await starting;
    assert.equal(a.transport.state().mode, "reconnecting", stall);
    assert.equal(aborted, 1, "the stalled probe is aborted");
    a.transport.stop();
    t.mock.restoreAll();
  }
});

test("live reads return JSON without a mutation run or receipt", async () => {
  const f = fixture();
  let reads = 0;
  const a = f.tab("a", { read: async read => { reads++; return { ok: true, value: { path: read.args.path, content: "browser" } }; } });
  await a.transport.start();
  a.deliver({ operation: "read", tool: "read_file", args: { path: "index.html" } });
  await until(() => a.sockets[0].messages("result").length === 1);
  assert.deepEqual(a.sockets[0].messages("result")[0].result, { ok: true, value: { path: "index.html", content: "browser" } });
  assert.equal(reads, 1);
  assert.deepEqual(f.counts(), { http: 0, commits: 0, runs: 0 });
  assert.equal(f.fake.stores.get("receipts")!.size, 0);
  a.transport.stop();
});

test("live reads refuse stale scope and malformed inputs before execution", async () => {
  const f = fixture();
  let reads = 0;
  const a = f.tab("a", { read: async () => { reads++; return { ok: true, value: null }; } });
  await a.transport.start();
  const read = { operation: "read", tool: "read_file", args: { path: "index.html" } };
  for (const patch of [{ generation: 99 }, { tabId: "b" }, { workspace: { ...workspace, branch: "other" } }]) a.deliver(read, patch);
  for (const patch of [{ tool: "invented" }, { args: [] }, { args: {} }, { args: { path: "x", source: "false" } }]) a.deliver({ ...read, ...patch });
  await until(() => a.sockets[0].messages("result").length === 7);
  assert.ok(a.sockets[0].messages("result").every(value => value.result.ok === false));
  assert.equal(reads, 0);
  a.transport.stop();
});

test("read results lost across reset or workspace move are never sent on a replacement session", async () => {
  for (const move of [false, true]) {
    const f = fixture();
    let release!: () => void, admitted = false;
    const a = f.tab("a", { read: async () => { admitted = true; await new Promise<void>(resolve => { release = resolve; }); return { ok: true, value: "old" }; } });
    await a.transport.start();
    a.deliver({ operation: "read", tool: "get_site", args: {} });
    await until(() => admitted);
    if (move) a.change({ ...workspace, branch: "other" });
    else a.sockets[0].receive({ type: "reset", handshakeRequired: true });
    release(); await drain();
    assert.equal(a.sockets[0].messages("result").length, 0);
    assert.equal(f.counts().commits, 0);
    a.transport.stop();
  }
});

test("browser edit and receipt dispatches carry the owner fence; stale scope never executes", async () => {
  const edits: { operation: string; generation: number }[] = [];
  const f = fixture(), a = f.tab("a", { edit: async (request, generation, valid) => {
    assert.equal(valid(), true);
    edits.push({ operation: request.operation, generation });
    return { ok: true, value: { requestId: request.id, state: "applied" } };
  } });
  await a.transport.start();
  const incoming = { operation: "edit", tool: "write_file", args: { path: "new.txt", content: "new" }, id: "edit", grantId: "grant", createdAt: 100_000 };
  a.deliver(incoming);
  a.deliver({ operation: "status", id: "edit", grantId: "grant" });
  a.deliver(incoming, { generation: 999 });
  a.deliver(incoming, { tabId: "other" });
  await until(() => a.sockets[0].messages("result").length === 4);
  assert.deepEqual(edits, [{ operation: "edit", generation: 1 }, { operation: "status", generation: 1 }]);
  assert.equal(a.sockets[0].messages("result").filter(value => value.result.ok === false).length, 2);
  a.transport.stop();
});
