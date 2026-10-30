// The long-job wait (ticket am-17): a client that declares the MCP tasks extension gets wait_for_requests as a
// job whose result is the pin; every other client keeps the 25-second wait; no pin is stored anywhere.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from "@modelcontextprotocol/server";
import type { AgentRequest } from "../shared/agent";
import { AgentRelay, relayObjectName, type RelaySocket } from "../worker/agent-relay";
import { LIFECYCLE_KEY } from "../worker/agent-lifecycle";
import { AGENTS_PAUSED, WATCH_PAUSED } from "../worker/agent-controls";
import type { Env } from "../worker/app";
import { JOB_HOLD_MS, TASKS_EXTENSION } from "../worker/mcp";
import { startCountedWorker } from "./fakes/counted-agent";
import { editorTab, origin, payload, repo, signIn, startWorker } from "./mcp-harness";

const workspace = { account: "lex", repoId: repo.id, branch: "main" };
const scope = { workspace, tabId: "owner", generation: 1 };
const pinText = "Make the welcome warmer, pin-secret-7f3a";

/** A 2026-07-28 JSON-RPC message; `tasks` declares the tasks extension. */
function modernRequest(token: string, method: string, params: Record<string, unknown>, tasks: boolean, id: number | string = 1, signal?: AbortSignal): RequestInit {
  const meta = { [PROTOCOL_VERSION_META_KEY]: "2026-07-28", [CLIENT_INFO_META_KEY]: { name: "long-job", version: "1" },
    [CLIENT_CAPABILITIES_META_KEY]: tasks ? { extensions: { [TASKS_EXTENSION]: {} } } : {} };
  const named = method === "tools/call" ? params.name : params.taskId;
  return { method: "POST", signal, headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method, ...(typeof named === "string" ? { "Mcp-Name": named } : {}),
  }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: meta } }) };
}

/**
 * A connected agent and an editor tab whose commands answer at once with the pins it holds. `editor: false`: no tab
 * is open. `hold`: the tab keeps each command unanswered until `release()`. `refuse`: the tab refuses each command
 * with this message. `cleaned`: the relay's lifecycle cleaned this connection, so it must connect again.
 * `answerBytes`: the tab pads its first pin's html until its answer is exactly this long. A second connection
 * (`otherToken`) shares the site.
 */
async function connected(options: { editor?: boolean; hold?: boolean; refuse?: string; cleaned?: boolean; answerBytes?: number } = {}) {
  const h = await startCountedWorker();
  const { cookie } = await signIn(h.worker);
  const tab = editorTab(h.worker, cookie);
  const { id: grantId, token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { id: string; token: string };
  const { token: otherToken } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { token: string };
  const name = await relayObjectName(workspace);
  // Every frame the tab received (commands and cancels).
  const frames: { type: string; id: string }[] = [];
  const pins: AgentRequest[] = [];
  // Every command the tab received, as the relay framed it.
  const commands: { id: string; remainingMs: number; command: { tool: string; args: { all?: boolean }; waitMs?: number; agent?: string } }[] = [];
  let attachment: unknown = { ...scope, role: "editor", owner: { tabId: scope.tabId, generation: 1 } };
  const socket = {
    readyState: 1, close() {}, deserializeAttachment: () => attachment, serializeAttachment(value: unknown) { attachment = value; },
    send(message: string) {
      const frame = JSON.parse(message);
      frames.push(frame);
      if (frame.type !== "command") return;
      commands.push(frame);
      if (options.hold) { held.push(frame); return; }
      answer(frame);
    },
  } satisfies RelaySocket;
  const held: { id: string }[] = [];
  function answer(frame: { id: string }) {
    const requests = pins.splice(0).map(pin => ({ ...pin, state: "seen" }));
    const result = options.refuse ? { ok: false, message: options.refuse } : { ok: true, value: { requests } };
    let message = JSON.stringify({ type: "result", id: frame.id, ...scope, result });
    if (options.answerBytes && requests[0]) {
      requests[0].element = { ...requests[0].element!, html: "x".repeat(options.answerBytes - Buffer.byteLength(message)) };
      message = JSON.stringify({ type: "result", id: frame.id, ...scope, result });
    }
    h.message(name, socket, message);
  }
  if (options.cleaned) {
    // Connecting woke the relay's object and read its lifecycle: a fresh one reads the cleaned connection.
    await h.storage(name).put(LIFECYCLE_KEY, { generation: 0, cleaned: { [grantId]: Date.now() + 86_400_000 } });
    h.restoreEditors(name, [socket]);
    await h.handshake(name, socket, JSON.stringify({ type: "handshake", ...scope, owner: true }));
  } else if (options.editor !== false) {
    h.attach(name, socket, JSON.stringify({ type: "handshake", ...scope, owner: true }));
    await h.settle(name);
  }
  /** One JSON-RPC message, as a 2026-07-28 client sends it; `tasks` declares the tasks extension. */
  async function modern(method: string, params: Record<string, unknown>, tasks: boolean, id: number | string = 1, as = token) {
    const response = await h.dispatchFetch(origin + "/mcp", modernRequest(as, method, params, tasks, id));
    assert.equal(response.status, 200);
    return JSON.parse(await response.text()) as { result?: any; error?: { code: number; message: string } };
  }
  /** Answers every command the tab holds. */
  const release = () => { for (const frame of held.splice(0)) answer(frame); };
  const pin = (id: string): AgentRequest => ({ id, text: pinText, createdAt: Date.now(), repoId: repo.id, repository: repo.full_name, branch: "main",
    state: "open", element: { file: "index.html", id: "1.0.0", tag: "h1", text: "Welcome", html: "<h1>Welcome</h1>" },
    thread: [{ from: "user", text: pinText, at: Date.now() }] });
  /** Answers one command the tab holds. */
  const answerOne = (id: string) => answer(held.splice(held.findIndex(frame => frame.id === id), 1)[0]);
  return { ...h, name, token, otherToken, pins, pin, frames, commands, held, release, answerOne, modern };
}

test("a tasks-capable client gets wait_for_requests as a job whose result is the pin, and no storage holds the pin", async () => {
  const h = await connected();
  try {
    const discovered = await h.modern("server/discover", {}, true);
    assert.deepEqual(discovered.result.capabilities.extensions?.[TASKS_EXTENSION], {});
    h.counters.reset();
    const started = (await h.modern("tools/call", { name: "wait_for_requests", arguments: { agent: "Watcher" } }, true)).result;
    assert.equal(started.resultType, "task");
    assert.equal(started.status, "working");
    assert.equal(started.ttlMs, null);
    assert.equal(typeof started.taskId, "string");
    assert.equal(h.commands.length, 0, "starting a job sends nothing to the tab");
    assert.equal(h.counters.byCategory.control.calls, 0, "nor to the relay");

    // Nothing waiting: a look holds one ordinary wait in the tab, under the agent's name, and the job keeps working.
    const quiet = (await h.modern("tasks/get", { taskId: started.taskId }, true)).result;
    assert.equal(quiet.resultType, "complete");
    assert.equal(quiet.status, "working");
    assert.equal(quiet.taskId, started.taskId);
    assert.equal(quiet.pollIntervalMs, 1_000);
    assert.equal(h.commands.length, 1);
    assert.equal(h.commands[0].command.tool, "wait_for_requests");
    assert.equal(h.commands[0].command.waitMs, JOB_HOLD_MS);
    assert.equal(h.commands[0].command.agent, "Watcher");

    // A pin comes: the next look completes the job with the pin as wait_for_requests' own result.
    h.pins.push(h.pin("req-job"));
    const done = (await h.modern("tasks/get", { taskId: started.taskId }, true)).result;
    assert.equal(done.status, "completed");
    assert.equal(done.result.resultType, "complete");
    const result = payload(done.result);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].id, "req-job");
    assert.equal(result.requests[0].text, pinText);

    // The relay held only the wait: no Durable Object wrote a key, and none holds the pin.
    assert.equal(Object.values(h.counters.byCategory).reduce((sum, count) => sum + count.keysWritten, 0), 0);
    const objects = [...new Set(h.counters.log.map(row => row.name))];
    assert.ok(objects.includes(h.name));
    for (const object of objects) assert.doesNotMatch(JSON.stringify([...(await h.storage(object).list()).entries()]), /pin-secret-7f3a|req-job/, object);
  } finally { await h.worker.dispose(); }
});

test("a cancelled job says so, an unknown task is refused, and arguments the tool refuses get the SDK's answer", async () => {
  const h = await connected();
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: { all: true } }, true)).result;
    assert.deepEqual((await h.modern("tasks/update", { taskId, inputResponses: {} }, true)).result, { resultType: "complete" });
    const answered = (await h.modern("tasks/cancel", { taskId }, true)).result;
    assert.equal(answered.resultType, "complete");
    assert.equal(answered.status, "cancelled");
    assert.equal((await h.modern("tasks/get", { taskId }, true)).result.status, "cancelled");
    // It stays cancelled long after a call's 10-second cancel fence, however rarely its client looks.
    h.clock.install();
    await new Promise(resolve => setTimeout(resolve, 10 * 60_000));
    const later = (await h.modern("tasks/get", { taskId }, true)).result;
    assert.equal(later.status, "cancelled");
    assert.equal(h.commands.length, 0, "a cancelled job's look waits for nothing");
    for (const method of ["tasks/get", "tasks/cancel", "tasks/update"]) {
      const refused = await h.modern(method, { taskId: "task-of-another-server" }, true);
      assert.equal(refused.error?.code, -32602, method);
    }
    const invalid = await h.modern("tools/call", { name: "wait_for_requests", arguments: { waitSeconds: 99 } }, true);
    assert.equal(invalid.result?.resultType, "complete");
    assert.equal(invalid.result?.isError, true);
    assert.equal(h.commands.length, 0);
  } finally { await h.worker.dispose(); }
});

test("a client without the tasks extension keeps the 25-second wait", async () => {
  const h = await connected();
  try {
    h.pins.push(h.pin("req-plain"));
    const answered = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, false)).result;
    assert.equal(answered.resultType, "complete");
    assert.equal(answered.taskId, undefined);
    assert.equal(payload(answered).requests[0].id, "req-plain");
    assert.equal(h.commands.length, 1);
    assert.equal(h.commands[0].command.waitMs, 25_000);
    assert.ok(h.commands[0].remainingMs > 24_000, "the relay holds it for the full 25 seconds");
    const empty = payload((await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, false)).result);
    assert.deepEqual(empty.requests, []);
    assert.match(empty.hint, /Call wait_for_requests again now/);
  } finally { await h.worker.dispose(); }
});

test("a job keeps working through a closed editor, full waits and a busy editor, and ends on a wait the tab never answered", async () => {
  const closed = await connected({ editor: false });
  try {
    const { taskId } = (await closed.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const look = (await closed.modern("tasks/get", { taskId }, true)).result;
    assert.equal(look.status, "working");
    assert.equal(look.pollIntervalMs, 60_000);
    assert.match(look.statusMessage, /isn't open .* This job keeps waiting/);
  } finally { await closed.worker.dispose(); }

  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const until = async (count: number) => { while (h.commands.length < count) await new Promise(resolve => setImmediate(resolve)); };
    // Other agents' waits (WAITS_PER_SITE) hold the site's waits; a look is asked to look again in 30 s.
    const holding = [1, 2, 3].map(id => h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, false, id, id === 1 ? h.token : h.otherToken));
    await until(3);
    const full = (await h.modern("tasks/get", { taskId }, true, 4)).result;
    assert.equal(full.status, "working");
    assert.equal(full.pollIntervalMs, 30_000);
    // Two held reads fill the editor's five places: a look finds it busy and comes back in 10 s.
    const reads = [5, 6].map(id => h.modern("tools/call", { name: "read_file", arguments: { path: "index.html" } }, false, id));
    await until(5);
    const busy = (await h.modern("tasks/get", { taskId }, true, 7)).result;
    assert.equal(busy.status, "working");
    assert.equal(busy.pollIntervalMs, 10_000);
    h.release();
    await Promise.all([...holding, ...reads]);
    // A wait the tab got but never answered may have taken requests: the job ends, and its answer's hint brings
    // them back (all: true), where a working job's status message would never reach the model.
    h.clock.install();
    const lost = h.modern("tasks/get", { taskId }, true, 8);
    await until(6);
    const after = (await lost).result;
    assert.equal(after.status, "completed");
    const hint = payload(after.result);
    assert.deepEqual(hint.requests, []);
    assert.match(hint.hint, /did not answer this wait \(timeout\).*come back with all: true/);
    h.held.splice(0);
  } finally { await h.worker.dispose(); }
});

test("a look whose caller leaves ends only that look: the job's next look waits again", async () => {
  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const leave = new AbortController();
    const left = h.dispatchFetch(origin + "/mcp", modernRequest(h.token, "tasks/get", { taskId }, true, 1, leave.signal))
      .then(response => response.text()).catch(() => undefined);
    while (h.commands.length < 1) await new Promise(resolve => setImmediate(resolve));
    leave.abort();
    await left;
    const next = h.modern("tasks/get", { taskId }, true, 2);
    while (h.commands.length < 2) await new Promise(resolve => setImmediate(resolve));
    // The left look's wait was ended in the tab (the relay sent it a cancel); only the new one is answered.
    h.held.shift();
    h.pins.push(h.pin("req-after"));
    h.release();
    const done = (await next).result;
    assert.equal(done.status, "completed");
    assert.equal(payload(done.result).requests[0].id, "req-after");
  } finally { await h.worker.dispose(); }
});

test("with waiting paused by the owner, a tasks-capable call answers at once, with no job", async () => {
  const { worker } = await startWorker({ bindings: { AGENT_WATCH: "off" } });
  try {
    const { cookie } = await signIn(worker);
    const { token } = await (await editorTab(worker, cookie).post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json() as { token: string };
    // Miniflare types its own RequestInit (undici's), which the standard one modernRequest builds does not satisfy.
    const response = await worker.dispatchFetch(origin + "/mcp", modernRequest(token, "tools/call", { name: "wait_for_requests", arguments: {} }, true) as Parameters<typeof worker.dispatchFetch>[1]);
    const { result } = JSON.parse(await response.text()) as { result: any };
    assert.equal(result.resultType, "complete");
    assert.equal(result.taskId, undefined);
    assert.deepEqual(payload(result).requests, []);
  } finally { await worker.dispose(); }
});

test("tasks/cancel ends a look the tab holds: it answers cancelled, and the tab is told", async () => {
  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const look = h.modern("tasks/get", { taskId }, true, 1);
    while (h.commands.length < 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal((await h.modern("tasks/cancel", { taskId }, true, 2)).result.status, "cancelled");
    assert.equal((await look).result.status, "cancelled");
    assert.ok(h.frames.some(frame => frame.type === "cancel" && frame.id === h.commands[0].id), "the tab ends its wait");
  } finally { await h.worker.dispose(); }
});

test("a cancel of a look's own request id never ends the job: the look runs out its hold", async () => {
  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    let answered = false;
    const look = h.modern("tasks/get", { taskId }, true, 41).then(reply => { answered = true; return reply; });
    while (h.commands.length < 1) await new Promise(resolve => setImmediate(resolve));
    const cancelled = await h.dispatchFetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${h.token}`,
      "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 41 } }) });
    assert.equal(cancelled.status, 202);
    // The look waits under its task id, not its request id: the tab keeps its wait, and the look has not answered.
    for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.frames.some(frame => frame.type === "cancel"), false);
    assert.equal(answered, false);
    h.release();
    assert.equal((await look).result.status, "working");
  } finally { await h.worker.dispose(); }
});

test("one connection's tasks/cancel never cancels another connection's job", async () => {
  const h = await connected();
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    assert.equal((await h.modern("tasks/cancel", { taskId }, true, 1, h.otherToken)).result.status, "cancelled");
    assert.equal((await h.modern("tasks/get", { taskId }, true)).result.status, "working");
    assert.equal(h.commands.length, 1, "the job's own look still waits in the tab");
  } finally { await h.worker.dispose(); }
});

test("a look whose answer is too large, or whose relay request throws, ends the job with the all: true hint", async () => {
  const large = await connected({ answerBytes: AgentRelay.maxBytes });
  try {
    const { taskId } = (await large.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    large.pins.push(large.pin("req-large"));
    const look = (await large.modern("tasks/get", { taskId }, true)).result;
    assert.equal(look.status, "completed");
    assert.deepEqual(payload(look.result).requests, []);
    assert.match(payload(look.result).hint, /\(too-large\).*come back with all: true/);
  } finally { await large.worker.dispose(); }

  const lost = await connected();
  try {
    const { taskId } = (await lost.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const sessions = lost.env.SESSIONS;
    lost.env.SESSIONS = { ...sessions, get: id => id === lost.name ? { fetch: () => Promise.reject(new Error("Lost subrequest")) } : sessions.get(id) } satisfies Env["SESSIONS"];
    const look = (await lost.modern("tasks/get", { taskId }, true)).result;
    lost.env.SESSIONS = sessions;
    assert.equal(look.status, "completed");
    assert.match(payload(look.result).hint, /\(unknown-outcome\).*come back with all: true/);
    assert.equal(lost.commands.length, 0);
  } finally { await lost.worker.dispose(); }
});

test("a job ends without a pin on a refusal from the tab, a connection that must connect again, and paused waiting", async () => {
  const refused = await connected({ refuse: "The editor's user stopped you." });
  try {
    const { taskId } = (await refused.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const look = (await refused.modern("tasks/get", { taskId }, true)).result;
    assert.equal(look.status, "completed");
    assert.equal(look.result.isError, true);
    assert.match(JSON.stringify(look.result.content), /stopped you/);
  } finally { await refused.worker.dispose(); }

  const cleaned = await connected({ cleaned: true });
  try {
    const { taskId } = (await cleaned.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const look = (await cleaned.modern("tasks/get", { taskId }, true)).result;
    assert.equal(look.status, "completed");
    assert.deepEqual(payload(look.result).requests, []);
    assert.match(payload(look.result).hint, /connect-agent-again/);
    assert.equal(cleaned.commands.length, 0);
  } finally { await cleaned.worker.dispose(); }

  const paused = await connected();
  try {
    const { taskId } = (await paused.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    paused.env.AGENT_WATCH = "off";
    const look = (await paused.modern("tasks/get", { taskId }, true)).result;
    assert.equal(look.status, "completed");
    assert.match(payload(look.result).hint, new RegExp(WATCH_PAUSED));
    assert.equal(paused.commands[0].command.waitMs, 0, "paused, the tab answers at once");
  } finally { await paused.worker.dispose(); }
});

/** Waits until `done` holds, a turn at a time. */
const until = async (done: () => boolean) => { while (!done()) await new Promise(resolve => setImmediate(resolve)); };

test("three overlapping looks at one job hold one wait, and a pin sent during them reaches the job once", async () => {
  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const answers: any[] = [];
    const look = (id: number) => h.modern("tasks/get", { taskId }, true, id).then(reply => { answers[id] = reply.result; });
    const looks = [look(1)];
    await until(() => h.commands.length === 1);
    // Each newer look takes over the wait the tab holds: the earlier one answers at once that the job still works.
    for (const id of [2, 3]) {
      looks.push(look(id));
      await until(() => answers[id - 1] !== undefined || h.commands.length > 1);
      assert.equal(h.commands.length, 1, "the job holds one wait in the tab");
      assert.equal(answers[id - 1].status, "working");
      assert.equal(answers[id - 1].pollIntervalMs, 1_000);
    }
    h.pins.push(h.pin("req-once"));
    h.release();
    await Promise.all(looks);
    assert.equal(answers[3].status, "completed");
    assert.equal(payload(answers[3].result).requests[0].id, "req-once");
    assert.equal(answers.filter(answer => JSON.stringify(answer).includes("req-once")).length, 1, "the pin reaches the job once");
    assert.equal(h.frames.some(frame => frame.type === "cancel"), false, "the tab's one wait was never ended early");
  } finally { await h.worker.dispose(); }
});

test("while a job is looking, another agent's wait still gets its pins", async () => {
  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const looks = [1, 2, 3].map(id => h.modern("tasks/get", { taskId }, true, id));
    await until(() => h.commands.length >= 1);
    await Promise.all(looks.slice(0, 2));
    // Another connection's agent waits beside the job: it is not told that others already wait.
    const other = h.modern("tools/call", { name: "wait_for_requests", arguments: { agent: "Other" } }, false, 4, h.otherToken);
    await until(() => h.commands.length === 2);
    assert.equal(h.commands[1].command.agent, "Other");
    h.pins.push(h.pin("req-other"));
    h.answerOne(h.commands[1].id);
    assert.equal(payload((await other).result).requests[0].id, "req-other");
    h.release();
    assert.equal((await looks[2]).result.status, "working");
  } finally { await h.worker.dispose(); }
});

test("a look while the owner pauses agents is refused at once, and nothing reaches the tab", async () => {
  const h = await connected();
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    h.env.AGENT_RELAY = "off";
    const response = await h.dispatchFetch(origin + "/mcp", modernRequest(h.token, "tasks/get", { taskId }, true));
    assert.equal(response.status, 403);
    const refused = await response.json() as { error: { code: number; message: string } };
    assert.equal(refused.error.code, -32003);
    assert.equal(refused.error.message, AGENTS_PAUSED);
    assert.equal(h.commands.length, 0);
  } finally { await h.worker.dispose(); }
});

test("a job's look is answered without the tasks extension declared: its id is all it needs", async () => {
  const h = await connected();
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    h.pins.push(h.pin("req-undeclared"));
    const look = (await h.modern("tasks/get", { taskId }, false)).result;
    assert.equal(look.status, "completed");
    assert.equal(payload(look.result).requests[0].id, "req-undeclared");
  } finally { await h.worker.dispose(); }
});

test("a client's request id that looks like a job's is cancelled like any call's, for 10 seconds", async () => {
  const h = await connected({ hold: true });
  try {
    const { taskId } = (await h.modern("tools/call", { name: "wait_for_requests", arguments: {} }, true)).result;
    const look = h.modern("tasks/get", { taskId }, true, 1);
    await until(() => h.commands.length === 1);
    // notifications/cancelled names the task id as a request id: the job's look is not the request it names.
    const cancelled = await h.dispatchFetch(origin + "/mcp", { method: "POST", headers: { Authorization: `Bearer ${h.token}`,
      "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: taskId } }) });
    assert.equal(cancelled.status, 202);
    assert.equal(h.frames.some(frame => frame.type === "cancel"), false);
    h.release();
    assert.equal((await look).result.status, "working");
  } finally { await h.worker.dispose(); }
});
