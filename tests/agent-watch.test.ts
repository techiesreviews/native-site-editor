import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRequest } from "../shared/agent";
import type { AgentRequests } from "../shared/agent-requests";
import { WAIT_MS, answerRequest, createRequestTools } from "../src/agent-watch";
import { connectionPrompt } from "../src/agent-prompts";
import { AgentRelay, WAITS_PER_SITE, relayObjectName, type RelayClock, type RelayScope, type RelaySocket } from "../worker/agent-relay";
import { countedSocket, startCountedWorker } from "./fakes/counted-agent";
import { indexedDbAgentRecords } from "../src/agent-records";
import { draftDatabaseName } from "../src/drafts";
import { fakeIndexedDB } from "./support/fake-agent-indexeddb";
import { editorTab, origin, payload, repo, signIn } from "./mcp-harness";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };

function manualClock(start = 1_000_000) {
  let now = start, next = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  return {
    now: () => now, timers,
    setTimeout(run: () => void, delay: number) { const id = ++next; timers.set(id, { at: now + delay, run }); return id; },
    clearTimeout(id: unknown) { timers.delete(id as number); },
    advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } },
  };
}
const asked = (id: string, extra: Partial<AgentRequest> = {}): AgentRequest => ({
  id, text: `Change ${id}`, createdAt: 1, repoId: repo.id, repository: repo.full_name, branch: "main", state: "open",
  element: { file: "index.html", id: "1.0", tag: "h1", text: "Hi", html: "<h1>Hi</h1>" }, thread: [{ from: "user", text: `Change ${id}`, at: 1 }], ...extra,
});
/** This browser's requests in memory, with the menu's in-transaction accept and a write count. */
function browser(clock = manualClock()) {
  const kept = new Map<string, AgentRequest>();
  let writes = 0, reads = 0;
  const tools = createRequestTools({
    workspace, now: clock.now, clock,
    list: async () => { reads++; return [...kept.values()].map(item => structuredClone(item)); },
    save: async (request, accept) => {
      if (!accept(kept.get(request.id))) return false;
      writes++; kept.set(request.id, structuredClone(request)); return true;
    },
  });
  const run = (tool: AgentRequests["tool"], args: AgentRequests["args"] = {}, waitMs?: number, deadline = clock.now() + 24_000, grantId = "grant-a") =>
    tools.run({ operation: "requests", tool, args, grantId, ...(waitMs === undefined ? {} : { waitMs }) }, () => true, deadline);
  const value = async (pending: ReturnType<typeof run>) => { const result = await pending; assert.equal(result.ok, true, JSON.stringify(result)); return (result as { value: any }).value; };
  const ask = (request: AgentRequest) => { kept.set(request.id, request); tools.notify(); };
  return { clock, kept, tools, run, value, ask, writes: () => writes, reads: () => reads };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("waitMs 0 (the site owner's switch) answers at once and takes each request once per connection", async () => {
  const b = browser();
  let empty = await b.value(b.run("wait_for_requests", {}, 0));
  assert.deepEqual(empty, { requests: [] });
  assert.equal(b.clock.timers.size, 0, "nothing held, no timer");
  assert.equal(b.tools.holding, 0);
  b.ask(asked("req-one"));
  const first = await b.value(b.run("wait_for_requests", {}, 25_000));
  assert.deepEqual(first.requests.map((item: AgentRequest) => [item.id, item.state, item.element.html]), [["req-one", "seen", "<h1>Hi</h1>"]]);
  assert.equal("returnedTo" in first.requests[0], false);
  assert.deepEqual(b.kept.get("req-one")!.returnedTo, ["grant-a"]);
  empty = await b.value(b.run("wait_for_requests", {}, 0));
  assert.deepEqual(empty.requests, []);
  assert.equal((await b.value(b.run("wait_for_requests", { all: true }, 0))).requests.length, 1);
  // A request another tab dismissed meanwhile is not handed out.
  b.kept.set("req-two", asked("req-two"));
  const list = createRequestTools({ workspace, list: async () => [asked("req-two")], save: async (request, accept) => accept({ ...request, state: "dismissed" }) });
  assert.deepEqual((await list.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "g", waitMs: 0 }, () => true, Date.now() + 9000) as { value: any }).value.requests, []);
});

test("requests are delivered oldest first even when storage returns request ID order", async () => {
  const b = browser();
  b.ask(asked("req-a-later", { createdAt: 200 }));
  b.ask(asked("req-z-first", { createdAt: 100 }));
  const ids = (result: { requests: AgentRequest[] }) => result.requests.map(request => request.id);
  assert.deepEqual(ids(await b.value(b.run("wait_for_requests", {}, 0))), ["req-z-first", "req-a-later"]);
  assert.deepEqual(ids(await b.value(b.run("wait_for_requests", {}, 0))), []);
  assert.deepEqual(ids(await b.value(b.run("wait_for_requests", { all: true }, 0))), ["req-z-first", "req-a-later"]);
});

test("watching is automatic: a wait is held until a request arrives here (an in-memory wake, no reads), at most 25 s and within the relay's budget", async () => {
  const b = browser();
  const pending = b.run("wait_for_requests", {}, 25_000);
  await settle();
  assert.equal(b.tools.holding, 1);
  const before = b.reads();
  b.clock.advance(5_000);
  await settle();
  assert.equal(b.tools.holding, 1);
  assert.equal(b.reads(), before, "no re-reads while held");
  const writes = b.writes();
  b.ask(asked("req-live"));
  const answer = await b.value(pending);
  assert.deepEqual(answer, { requests: [answer.requests[0]] });
  assert.equal(answer.requests[0].id, "req-live");
  assert.equal(b.writes(), writes + 1, "one write: the taken request");
  assert.equal(b.reads(), before + 1, "one read after the wake");
  // Nothing asked: any number of waits in a row, each held its full time (no Watch count or end).
  for (let wait = 0; wait < 30; wait++) {
    const held = b.run("wait_for_requests", {}, 60_000, b.clock.now() + 30_000);
    await settle();
    const [timer] = [...b.clock.timers.values()];
    assert.equal(timer.at - b.clock.now(), WAIT_MS, "clipped to 25 s");
    b.clock.advance(WAIT_MS);
    assert.deepEqual(await b.value(held), { requests: [] });
  }
  // The relay's remaining budget clips a hold too; agents turned off release it at once.
  const short = b.run("wait_for_requests", {}, 25_000, b.clock.now() + 4_000);
  await settle();
  assert.equal([...b.clock.timers.values()][0].at - b.clock.now(), 4_000);
  b.tools.notify();
  assert.deepEqual(await b.value(short), { requests: [] });
  assert.equal(b.clock.timers.size, 0);
});

test("several agents on one connection each hold a wait; a request reaches exactly one of them", async () => {
  const b = browser();
  const first = b.run("wait_for_requests", {}, 25_000), second = b.run("wait_for_requests", {}, 25_000);
  await settle();
  assert.equal(b.tools.holding, 2);
  b.ask(asked("req-shared"));
  const answers = [await b.value(first), await b.value(second)];
  assert.deepEqual(answers.map(answer => answer.requests.map((item: AgentRequest) => item.id)).flat(), ["req-shared"]);
  assert.deepEqual(b.kept.get("req-shared")!.returnedTo, ["grant-a"]);
  assert.equal(b.tools.holding, 0);
});

test("a request changed after the wait read it (a reply, an answer) keeps that change; a stale connection writes nothing", async () => {
  const b = browser();
  b.ask(asked("req-race"));
  const replied = { ...asked("req-race"), state: "done" as const, reply: { status: "done" as const, message: "Done by another agent.", at: 5 } };
  const racing = createRequestTools({ workspace, now: b.clock.now, clock: b.clock,
    // The read sees it open; a reply commits before the take's write.
    list: async () => { const read = [...b.kept.values()].map(item => structuredClone(item)); b.kept.set("req-race", structuredClone(replied)); return read; },
    save: async (request, accept) => { if (!accept(b.kept.get(request.id))) return false; b.kept.set(request.id, structuredClone(request)); return true; } });
  const result = await racing.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "grant-a", waitMs: 0 }, () => true, b.clock.now() + 9_000);
  assert.deepEqual((result as { value: any }).value.requests, []);
  assert.deepEqual(b.kept.get("req-race"), replied, "the reply and its thread survive");
  // A reply on a copy the user answered meanwhile is refused, never overwriting it.
  b.kept.set("req-race", { ...asked("req-race"), state: "seen" });
  const late = await racing.run({ operation: "requests", tool: "reply_to_request", args: { request: "req-race", status: "done", message: "Late." }, grantId: "grant-a" }, () => true, b.clock.now() + 9_000);
  assert.equal(late.ok, false);
  assert.match((late as { message: string }).message, /changed meanwhile/);
  // Turned off (or the socket lost) while the read was pending: no reply and no take is written.
  const c = browser();
  c.ask(asked("req-off"));
  const writes = c.writes();
  let live = true;
  const off = createRequestTools({ workspace, now: c.clock.now, clock: c.clock,
    list: async () => { live = false; return [...c.kept.values()].map(item => structuredClone(item)); },
    save: async (request, accept) => { if (!accept(c.kept.get(request.id))) return false; c.kept.set(request.id, structuredClone(request)); return true; } });
  assert.deepEqual(((await off.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "g" }, () => live, c.clock.now() + 9_000)) as { value: any }).value.requests, []);
  live = true;
  assert.equal((await off.run({ operation: "requests", tool: "reply_to_request", args: { request: "req-off", status: "done", message: "x" }, grantId: "g" }, () => live, c.clock.now() + 9_000)).ok, false);
  assert.equal(c.kept.get("req-off")!.state, "open");
  assert.equal(c.writes(), writes);
});

test("a wait whose socket went takes nothing it could not deliver", async () => {
  const b = browser();
  let live = true;
  const pending = b.tools.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "grant-a", waitMs: 25_000 }, () => live, b.clock.now() + 24_000);
  await settle();
  live = false;
  b.ask(asked("req-later"));
  assert.deepEqual(((await pending) as { value: any }).value.requests, []);
  assert.equal(b.kept.get("req-later")!.state, "open", "still waiting for the next call");
});

test("reply_to_request and get_selection(request) run the hub's rules on this browser's copy", async () => {
  const b = browser();
  b.ask(asked("req-a"));
  await b.value(b.run("wait_for_requests", {}, 0));
  assert.deepEqual(await b.value(b.run("reply_to_request", { request: "req-a", status: "question", message: "Bold?", requestIds: ["e-1"] })), { id: "req-a", state: "question" });
  const found = await b.value(b.run("get_request", { request: "req-a" }));
  assert.deepEqual(found.thread.map((item: { from: string; text: string }) => [item.from, item.text]), [["user", "Change req-a"], ["agent", "Bold?"]]);
  assert.equal(found.element.html, "<h1>Hi</h1>");
  b.kept.set("req-a", { ...b.kept.get("req-a")!, state: "dismissed" });
  const refused = await b.run("reply_to_request", { request: "req-a", status: "done", message: "Done." });
  assert.equal(refused.ok, false);
  assert.match((refused as { message: string }).message, /dismissed/);
  assert.equal((await b.run("get_request", { request: "req-none" })).ok, false);
  b.kept.set("req-other", asked("req-other", { branch: "other" }));
  assert.equal((await b.run("get_request", { request: "req-other" })).ok, false, "another branch's request");
});

function relayFixture() {
  let now = 0, next = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  const clock = {
    now: () => now,
    setTimeout(run: () => void, delay: number) { const id = ++next; timers.set(id, { at: now + delay, run }); return id; },
    clearTimeout(id: unknown) { timers.delete(id as number); },
  } satisfies RelayClock;
  const scope: RelayScope = { workspace, tabId: "owner-tab", generation: 1 };
  let attachment: unknown;
  const editor = { readyState: 1, sent: [] as string[], send(message: string) { this.sent.push(message); }, close() {},
    serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment } satisfies RelaySocket & { sent: string[] };
  const relay = new AgentRelay([], clock);
  relay.connect(editor, scope);
  relay.message(editor, JSON.stringify({ type: "handshake", ...scope, owner: true }));
  editor.sent.length = 0;
  const wait = (waitMs?: number) => relay.dispatch({ workspace }, { operation: "requests", tool: "wait_for_requests", args: {}, grantId: "g", ...(waitMs === undefined ? {} : { waitMs }) });
  return { relay, editor, timers, scope, wait, advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } } };
}

test("relay: up to WAITS_PER_SITE outstanding waits per workspace (several agents on one connection), a 10–25 s wait budget, other commands keep 10 s", async () => {
  const f = relayFixture();
  const waits = Array.from({ length: WAITS_PER_SITE }, () => f.wait(60_000));
  assert.equal(f.relay.waits, WAITS_PER_SITE);
  const frames = f.editor.sent.map(sent => JSON.parse(sent));
  assert.deepEqual(frames.map(frame => frame.remainingMs), Array(WAITS_PER_SITE).fill(25_000));
  assert.deepEqual(await f.wait(), { ok: false, code: "waiting", outcome: "not-sent" });
  assert.equal(f.editor.sent.length, WAITS_PER_SITE, "the wait over the limit was never sent");
  // Another tool still dispatches beside the waits, with its own 10 s deadline.
  const read = f.relay.dispatch({ workspace }, { operation: "requests", tool: "get_request", args: { request: "req-x" }, grantId: "g" });
  assert.equal(JSON.parse(f.editor.sent.at(-1)!).remainingMs, 10_000);
  f.advance(10_000);
  assert.deepEqual(await read, { ok: false, code: "timeout", outcome: "unknown" });
  for (const frame of frames) f.relay.message(f.editor, JSON.stringify({ type: "result", id: frame.id, ...f.scope, result: { ok: true, value: { requests: [] } } }));
  for (const wait of waits) assert.deepEqual(await wait, { ok: true, result: { ok: true, value: { requests: [] } } });
  assert.equal(f.relay.waiting, false);
  // Short waits still get 10 s (the tab answers at once with waitMs 0); expiry frees the slot.
  const short = f.wait(0);
  assert.equal(JSON.parse(f.editor.sent.at(-1)!).remainingMs, 10_000);
  f.advance(10_000);
  assert.equal((await short).ok, false);
  const long = f.wait(25_000);
  f.advance(25_000);
  assert.deepEqual(await long, { ok: false, code: "timeout", outcome: "unknown" });
  assert.equal(f.relay.waiting, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.relay.pendingCount, 0);
});

async function connected() {
  const h = await startCountedWorker(), { cookie } = await signIn(h.worker), tab = editorTab(h.worker, cookie);
  const { token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { token: string };
  const rpc = async (name: string, args: object, method = "tools/call") => {
    const response = await h.worker.dispatchFetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "tools/call" ? { name, arguments: args } : args }) });
    const responseText = await response.text();
    const value = JSON.parse(responseText.startsWith("event:") ? responseText.split("data: ")[1].split("\n")[0] : responseText) as { result: unknown; error?: unknown };
    assert.equal(value.error, undefined, responseText); return value.result;
  };
  await rpc("", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "watch-test", version: "1" } }, "initialize");
  return { ...h, tab, rpc };
}

test("usage harness: held waits over the real relay — 3 auth + 1 dispatch each, 0 storage polling; edits still work", async t => {
  const h = await connected(), b = browser({ now: () => Date.now(), timers: new Map(), setTimeout: (run: () => void, delay: number) => setTimeout(run, delay), clearTimeout: (id: unknown) => clearTimeout(id as number), advance() {} } as never);
  const scope = { workspace, tabId: "owner-tab", generation: 1 }, name = await relayObjectName(workspace);
  const traffic = countedSocket();
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const editor = {
    readyState: 1, close() {}, serializeAttachment(value: unknown) { attachment = value; }, deserializeAttachment: () => attachment,
    send(message: string) {
      traffic.send(message);
      const value = JSON.parse(message);
      if (value.type !== "command") return;
      const deadline = Date.now() + value.remainingMs - 1_000;
      const work = value.command.operation === "requests" ? b.tools.run(value.command, () => true, deadline)
        : Promise.resolve({ ok: true, value: { requestId: value.command.id, state: "applied", message: "Applied in the editor as an unsaved draft." } });
      void work.then(result => { const reply = JSON.stringify({ type: "result", id: value.id, ...scope, result }); traffic.receive(reply); h.message(name, editor, reply); });
    },
  } satisfies RelaySocket;
  const measure = async (label: string, run: () => Promise<unknown>) => {
    h.counters.reset(); h.github.requests.length = 0;
    const sent = traffic.counters.sent;
    const result = payload(await run());
    const counts = { auth: h.counters.byCategory.auth.calls, control: h.counters.byCategory.control.calls, data: h.counters.byCategory.data.calls,
      controlKeys: h.counters.byCategory.control.keysRead + h.counters.byCategory.control.keysWritten, waitedMs: h.counters.waitedMs, frames: traffic.counters.sent - sent };
    t.diagnostic(`${label}: ${JSON.stringify(counts)}`);
    assert.equal(counts.auth, 3, label); assert.equal(counts.control, 1, label); assert.equal(counts.data, 0, label);
    assert.equal(counts.controlKeys, 0, `${label}: the relay reads and writes no storage`);
    assert.equal(h.github.requests.length, 0);
    return { result, counts };
  };
  try {
    h.attach(name, editor, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    await h.settle(name);
    h.clock.install();
    // Nothing asked: the tab holds the one wait for 24 s of virtual time (relay budget less 1 s), no
    // polls, and the hint asks the watchdog to wait again.
    const empty = await measure("wait, nothing asked", () => h.rpc("wait_for_requests", {}));
    assert.deepEqual(empty.result.requests, []);
    assert.match(empty.result.hint, /Call wait_for_requests again now: the editor keeps watching while it is connected/);
    assert.equal(empty.result.watch, undefined);
    assert.equal(empty.counts.waitedMs, 24_000);
    // A request asked 5 s in: answered at that moment (event-driven), one dispatch.
    setTimeout(() => b.ask(asked("req-watch")), 5_000);
    const woken = await measure("wait, request after 5 s", () => h.rpc("wait_for_requests", {}));
    assert.deepEqual(woken.result.requests.map((item: AgentRequest) => item.id), ["req-watch"]);
    assert.equal(woken.counts.waitedMs, 5_000);
    // waitSeconds 0 answers at once; the connection and a separate edit still work.
    const quick = await measure("wait, waitSeconds 0", () => h.rpc("wait_for_requests", { waitSeconds: 0 }));
    assert.deepEqual(quick.result.requests, []);
    assert.equal(quick.counts.waitedMs, 0);
    const edit = await measure("edit after waits", () => h.rpc("write_file", { path: "after-watch.txt", content: "still connected" }));
    assert.equal(edit.result.state, "applied");
  } finally { await h.worker.dispose(); }
});

test("the copied prompt starts a watchdog subagent that keeps waiting and reports back, until Disconnect MCP; the token rules stay", () => {
  const prompt = connectionPrompt("https://editor.example/mcp", "ase_token", "lex/site");
  assert.doesNotMatch(prompt, /while :|run this loop|curl -s|Watch/);
  assert.match(prompt, /1\. Initialize the MCP connection and call `get_site`\./);
  assert.match(prompt, /2\. Start a "watchdog" subagent that keeps calling `wait_for_requests` \(each call waits up to 25 seconds\) and reports each request it returns back to you, the main thread\./);
  assert.match(prompt, /3\. For each request the watchdog reports, make the change as an unsaved editor draft and answer it with `reply_to_request`/);
  assert.match(prompt, /Everything stops when I choose Disconnect MCP: calls then fail with 401, so stop the watchdog and discard the token\./);
  assert.match(prompt, /Keep the token in memory; never save it or repeat it in responses\./);
  assert.match(prompt, /Give it the server and token in its instructions only\./);
  assert.match(prompt, /Authorization: `Bearer ase_token`/);
  assert.match(prompt, /at least 40 seconds/);
  // A task comes before the requests, the watchdog still running.
  const task = connectionPrompt("https://editor.example/mcp", "ase_token", "lex/site", "Build the site.");
  assert.match(task, /\n3\. Build the site\.\n4\. For each request the watchdog reports/);
});

test("a wake while a wait is still reading is not lost: no hold, no timer", async () => {
  for (const during of ["notify", "ask"] as const) {
    const b = browser();
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    let first = true;
    const tools = createRequestTools({ workspace, now: b.clock.now, clock: b.clock,
      list: async () => { const read = [...b.kept.values()].map(item => structuredClone(item)); if (first) { first = false; await gate; } return read; },
      save: async (request, accept) => { if (!accept(b.kept.get(request.id))) return false; b.kept.set(request.id, structuredClone(request)); return true; } });
    const pending = tools.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "g", waitMs: 25_000 }, () => true, b.clock.now() + 24_000);
    await settle();
    if (during === "ask") b.kept.set("req-during", asked("req-during"));
    tools.notify();
    release();
    const value = ((await pending) as { value: any }).value;
    assert.equal(b.clock.timers.size, 0, during);
    assert.equal(tools.holding, 0, during);
    if (during === "notify") assert.deepEqual(value, { requests: [] });
    else assert.deepEqual(value.requests.map((item: AgentRequest) => item.id), ["req-during"]);
  }
});

test("the connection is checked inside the writing transaction: lost while a write waits, nothing is kept", async () => {
  const b = browser();
  b.ask(asked("req-commit"));
  let live = true;
  const tools = createRequestTools({ workspace, now: b.clock.now, clock: b.clock,
    list: async () => [...b.kept.values()].map(item => structuredClone(item)),
    // The transaction starts after the connection went (turned off, taken over).
    save: async (request, accept) => { live = false; if (!accept(b.kept.get(request.id))) return false; b.kept.set(request.id, structuredClone(request)); return true; } });
  const run = (tool: AgentRequests["tool"], args: AgentRequests["args"]) => tools.run({ operation: "requests", tool, args, grantId: "g" }, () => live, b.clock.now() + 9_000);
  assert.deepEqual(((await run("wait_for_requests", {})) as { value: any }).value.requests, []);
  assert.equal(b.kept.get("req-commit")!.state, "open");
  b.kept.set("req-commit", { ...asked("req-commit"), state: "seen" });
  live = true;
  assert.equal((await run("reply_to_request", { request: "req-commit", status: "done", message: "Done." })).ok, false);
  assert.equal(b.kept.get("req-commit")!.state, "seen");
});

test("two answers made from the same question: the second never overwrites the first", () => {
  const question = { ...asked("req-q"), state: "question" as const, reply: { status: "question" as const, message: "Bold?", at: 2 },
    thread: [{ from: "user" as const, text: "Change req-q", at: 1 }, { from: "agent" as const, text: "Bold?", at: 2, status: "question" as const }] };
  let stored: AgentRequest = structuredClone(question);
  const first = answerRequest([structuredClone(question)], "req-q", "Yes, bold");
  const second = answerRequest([structuredClone(question)], "req-q", "No, larger");
  assert.equal(first.accept(stored), true);
  stored = first.request;
  assert.equal(second.accept(stored), false);
  assert.deepEqual(stored.thread!.map(item => item.text), ["Change req-q", "Bold?", "Yes, bold"]);
  assert.equal(stored.state, "open");
});

test("takeover fence: an old owner's take or reply after another tab's takeover writes nothing (checked in the transaction)", async () => {
  const records = indexedDbAgentRecords(draftDatabaseName, fakeIndexedDB().factory);
  await records.setFence(workspace, 0, 1);
  const put = (value: AgentRequest) => records.putConversation(workspace, { id: value.id, content: value as never, unfinished: true, updatedAt: 1 });
  await put(asked("req-fenced"));
  // Conversations hold JSON; these are the requests this test wrote.
  const request = (content: unknown) => content as AgentRequest;
  const read = async () => (await records.conversations(workspace)).map(item => request(item.content));
  const tools = createRequestTools({ workspace, list: read,
    save: (value, accept, owner) => records.putConversation(workspace, { id: value.id, content: value as never, unfinished: true, updatedAt: 2 },
      stored => accept(stored && request(stored.content)), owner) });
  // Another tab took over (generation 2) while this tab's ownership hints have not arrived: current() still says yes.
  await records.setFence(workspace, 1, 2);
  const run = (tool: AgentRequests["tool"], args: AgentRequests["args"]) => tools.run({ operation: "requests", tool, args, grantId: "g", waitMs: 0 }, () => true, Date.now() + 9_000, 1);
  assert.deepEqual(((await run("wait_for_requests", {})) as { value: any }).value.requests, []);
  assert.equal((await read())[0].state, "open");
  await put({ ...asked("req-fenced"), state: "seen" });
  assert.equal((await run("reply_to_request", { request: "req-fenced", status: "done", message: "Late." })).ok, false);
  assert.equal((await read())[0].state, "seen");
  // The current owner (generation 2) writes; a paused workspace refuses even its owner.
  const owned = await tools.run({ operation: "requests", tool: "reply_to_request", args: { request: "req-fenced", status: "done", message: "Done." }, grantId: "g" }, () => true, Date.now() + 9_000, 2);
  assert.deepEqual((owned as { value: unknown }).value, { id: "req-fenced", state: "done" });
  await records.pause(workspace, 2);
  await put({ ...asked("req-paused") });
  assert.deepEqual(((await tools.run({ operation: "requests", tool: "wait_for_requests", args: {}, grantId: "g", waitMs: 0 }, () => true, Date.now() + 9_000, 2)) as { value: any }).value.requests, []);
});
