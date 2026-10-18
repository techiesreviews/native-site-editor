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

test("only an absent relay route activates legacy fallback, with one route probe", async () => {
  for (const status of [404, 400, 401, 429, 503]) {
    const f = fixture(); let probes = 0;
    const a = f.tab("a", { socket: () => new FakeSocket(true), probe: () => { probes++; return Promise.resolve(status); } });
    await a.transport.start();
    assert.equal(a.transport.state().mode, status === 404 ? "fallback" : "reconnecting");
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


test("missing WebSocket activates fallback without a route probe or ownership claim", async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: undefined });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "WebSocket", descriptor); else Reflect.deleteProperty(globalThis, "WebSocket"); });
  const f = fixture(), a = f.tab("a", { socket: undefined }); await a.transport.start();
  assert.equal(a.transport.state().mode, "fallback"); assert.equal(a.sockets.length, 0);
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
