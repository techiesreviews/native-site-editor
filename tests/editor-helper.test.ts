// The helper (helper/, ticket am-16) against the real Worker in Miniflare and a receiving tab, with a fake ACP
// agent in place of Claude Code: a pin starts one agent, its question comes back to the pin, its change lands,
// a tool outside the allowed list is asked on the pin, and Disconnect MCP ends the helper.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { HELPER_AGENT as EDITOR_HELPER_AGENT, PIN_AGENTS as EDITOR_PIN_AGENTS, type AgentRequest } from "../shared/agent";
import { requestOperation } from "../shared/agent-requests";
import { acpConnection, choose, type PermissionRequest } from "../helper/src/acp";
import {
  ALLOWED_TOOLS, approvalQuestion, approves, commandName, editorTool, HELPER_AGENT, PIN_AGENTS, refuses, sessionMeta, toolAllowed,
} from "../helper/src/agents";
import { answerTo, HELPER_VERSION, runHelper, type AgentProcess } from "../helper/src/helper";
import { HELPER_PACKAGE } from "../src/agent-prompts";
import { launchAgent, TOKEN_VARIABLE } from "../helper/src/launch";
import { files, origin, payload, repo, signIn, siteContext, startWorker, workerFetch } from "./mcp-harness";
import { receivingTab } from "./support/receiving-tab";

const OPTIONS = [
  { optionId: "yes", name: "Allow", kind: "allow_once" as const },
  { optionId: "always", name: "Always allow", kind: "allow_always" as const },
  { optionId: "no", name: "Reject", kind: "reject_once" as const },
];

test("the helper's names, agents and version are the editor's", () => {
  assert.equal(HELPER_AGENT, EDITOR_HELPER_AGENT);
  assert.deepEqual(PIN_AGENTS, EDITOR_PIN_AGENTS);
  // The copied start command names the version the package is.
  const helper = JSON.parse(readFileSync(new URL("../helper/package.json", import.meta.url), "utf8"));
  assert.equal(HELPER_PACKAGE, `${helper.name}@${helper.version}`);
  assert.equal(HELPER_VERSION, helper.version);
});

test("only the editor's MCP tools run unasked: no shell, files, web or the helper's own waiting", () => {
  assert.deepEqual(ALLOWED_TOOLS, ["mcp__native-site-editor"]);
  const claude = (toolName: string, kind = "other") => ({ title: toolName, kind, _meta: { claudeCode: { toolName } } });
  for (const call of [claude("mcp__native-site-editor__edit_file"), claude("mcp__native-site-editor__reply_to_request"),
    { title: "native-site-editor.get_site" }, { title: "native-site-editor/screenshot_preview", kind: "read" }, { title: "native_site_editor_get_page" }])
    assert.equal(toolAllowed(call), true, JSON.stringify(call));
  for (const call of [claude("Bash", "execute"), claude("Read", "read"), claude("Edit", "edit"), claude("WebFetch", "fetch"),
    claude("mcp__other-server__run"), claude("mcp__native-site-editor__wait_for_requests"),
    // A shell command that names an editor tool is still a shell command.
    { title: "mcp__native-site-editor__get_site", kind: "execute" }, { title: "echo mcp__native-site-editor__get_site" },
    // Claude's own name wins over a title made to look like an editor tool.
    { title: "mcp__native-site-editor__get_site", _meta: { claudeCode: { toolName: "Bash" } } }, {}])
    assert.equal(toolAllowed(call), false, JSON.stringify(call));
  assert.equal(editorTool(claude("mcp__native-site-editor__get_site")), "get_site");
  // Claude Code gets no built-in tools, the editor's allowed, and none of the user's settings, hooks or servers.
  assert.deepEqual(sessionMeta("Claude Code"), { _meta: { claudeCode: { options: {
    tools: [], allowedTools: ["mcp__native-site-editor"], disallowedTools: ["mcp__native-site-editor__wait_for_requests"], settingSources: [],
  } } } });
  assert.deepEqual(sessionMeta("Codex"), {});
  // An allow is once only; a refusal takes reject_once, else reject_always, else a cancel.
  assert.deepEqual(choose(OPTIONS, "allow"), { outcome: "selected", optionId: "yes" });
  assert.deepEqual(choose(OPTIONS, "reject"), { outcome: "selected", optionId: "no" });
  assert.deepEqual(choose([OPTIONS[1]], "allow"), { outcome: "cancelled" });
  // The pin's question fits its 60 characters; only a plain yes allows.
  assert.equal(approvalQuestion({ title: "npm install" }), "Allow npm install?");
  assert.ok(approvalQuestion({ title: "x".repeat(100) }).length <= 60);
  assert.equal(approvalQuestion({}), "Allow a tool?");
  for (const answer of ["yes", "Yes.", " ok! ", "allow", "Sure"]) assert.equal(approves(answer), true, answer);
  for (const answer of ["no", "not yes", "", undefined, "nope", "ok, no", "sure not", "yes but don't", "Yes please"]) assert.equal(approves(answer), false, String(answer));
  for (const answer of ["no", "No.", "nope", "don't"]) assert.equal(refuses(answer), true, answer);
  for (const answer of ["no, also make it blue", "yes", "not now"]) assert.equal(refuses(answer), false, answer);
  // The answer is what the user wrote after the question; a follow-up from before it is none.
  const thread = (...items: [string, string][]) => ({ id: "req-x", thread: items.map(([from, text]) => ({ from, text })) });
  assert.equal(answerTo(thread(["user", "Fix it"], ["user", "Also blue"]), "Allow npm install?"), undefined);
  assert.equal(answerTo(thread(["user", "Fix it"], ["agent", "Allow npm install?"]), "Allow npm install?"), undefined);
  assert.equal(answerTo(thread(["user", "Fix it"], ["agent", "Allow npm install?"], ["user", "no"]), "Allow npm install?"), "no");
  assert.equal(answerTo(thread(["agent", "Allow npm install?"], ["user", "no"], ["agent", "Allow npm install?"]), "Allow npm install?"), undefined);
  // A custom command's agent works under its program's name.
  assert.equal(commandName(["npx", "-y", "@agentclientprotocol/claude-agent-acp@0.99.1"]), "claude-agent-acp");
  assert.equal(commandName(["/usr/local/bin/opencode", "acp"]), "opencode");
  assert.equal(commandName(["npx", "-y"]), "Custom agent");
});

test("an agent program runs over its own stdin and stdout, without the helper's token in its environment", async () => {
  // A one-line ACP agent: it asks before a shell command and an editor tool, and reports the answers.
  const script = `
    const lines = require("node:readline").createInterface({ input: process.stdin });
    const send = message => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\\n");
    const asked = new Map(); let prompt;
    lines.on("line", line => {
      const message = JSON.parse(line);
      if (message.method === "initialize") send({ id: message.id, result: { protocolVersion: 1, token: process.env.${TOKEN_VARIABLE} ?? null } });
      else if (message.method === "session/prompt") {
        prompt = message.id;
        for (const [id, toolName, kind] of [["a", "Bash", "execute"], ["b", "mcp__native-site-editor__get_site", "other"]])
          send({ id, method: "session/request_permission", params: { sessionId: "s", toolCall: { toolCallId: id, title: toolName, kind, _meta: { claudeCode: { toolName } } },
            options: ${JSON.stringify(OPTIONS)} } });
      } else if (message.id === "a" || message.id === "b") {
        asked.set(message.id, message.result.outcome);
        if (asked.size === 2) send({ id: prompt, result: { stopReason: "end_turn", outcomes: Object.fromEntries(asked) } });
      } else if (message.method) send({ id: message.id, error: { code: -32601, message: "no" } });
    });`;
  process.env[TOKEN_VARIABLE] = "ase_secret";
  let agent: AgentProcess | undefined;
  try {
    agent = launchAgent([process.execPath, "-e", script]);
    const permissions: PermissionRequest[] = [];
    const acp = acpConnection(agent, { permission: async asked => { permissions.push(asked); return choose(asked.options, toolAllowed(asked.toolCall) ? "allow" : "reject"); } });
    assert.deepEqual(await acp.request("initialize", { protocolVersion: 1 }), { protocolVersion: 1, token: null });
    const turn = await acp.request<{ outcomes: Record<string, unknown> }>("session/prompt", { sessionId: "s", prompt: [] });
    assert.deepEqual(turn.outcomes, { a: { outcome: "selected", optionId: "no" }, b: { outcome: "selected", optionId: "yes" } });
    assert.equal(permissions.length, 2);
    agent.stop();
    await acp.closed;
    await assert.rejects(acp.request("session/prompt", {}), /The agent stopped/);
  } finally {
    delete process.env[TOKEN_VARIABLE];
    agent?.stop();
  }
  // A program that ends at once (or never starts) refuses the request; writing to it raises no uncaught EPIPE.
  for (const command of [[process.execPath, "-e", "process.exit(0)"], ["/nonexistent/editor-helper-agent"]]) {
    const gone = launchAgent(command);
    const acp = acpConnection(gone, { permission: async () => ({ outcome: "cancelled" }) });
    await new Promise(resolve => setTimeout(resolve, 200));
    await assert.rejects(acp.request("initialize", { protocolVersion: 1, padding: "x".repeat(1 << 20) }), /The agent stopped/);
    gone.stop();
  }
});

/** One turn of a fake agent: its prompt, its pin and name, its MCP calls, and its asking and dying. */
interface Turn { text: string; request: string; name: string; call(tool: string, args?: Record<string, unknown>): Promise<any>; ask(toolCall: object): Promise<unknown>; die(): Promise<never> }

/** A fake ACP agent in this process: it works on its pin through the MCP server its session was given, as `script`
 * says (by default: asks the user's word, then asks before an editor tool and a shell command, edits and is done). */
function fakeAgent(worker: Parameters<typeof workerFetch>[0], script?: (turn: Turn) => Promise<void>) {
  const toAgent = new PassThrough(), fromAgent = new PassThrough();
  const seen = { methods: [] as string[], sessions: [] as Record<string, any>[], modes: [] as string[], prompts: [] as string[], outcomes: [] as unknown[], stopped: 0 };
  const send = (message: object) => { if (!fromAgent.writableEnded) fromAgent.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`); };
  let asks = 0;
  const waiting = new Map<string, (outcome: unknown) => void>();
  const ask = (toolCall: object) => new Promise(resolve => {
    const id = `ask-${asks++}`;
    waiting.set(id, resolve);
    send({ id, method: "session/request_permission", params: { sessionId: "session-1", toolCall: { toolCallId: id, ...toolCall }, options: OPTIONS } });
  });
  let client: Client | undefined;
  async function work(text: string) {
    const name = /You are "([^"]+)"|agent: "([^"]+)"/.exec(text)!.slice(1).find(Boolean)!;
    const request = /request[: ]+"?(req-[\w-]+)/.exec(text)![1];
    if (!client) {
      const server = seen.sessions[0].mcpServers[0];
      client = new Client({ name: "fake-agent", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: Object.fromEntries(server.headers.map((header: any) => [header.name, header.value])) }, fetch: workerFetch(worker),
      }));
    }
    const call = async (tool: string, args: Record<string, unknown> = {}) => payload(await client!.callTool({ name: tool, arguments: { ...args, agent: name } }));
    if (script) return script({ text, request, name, call, ask, die: () => { fromAgent.end(); return new Promise<never>(() => {}); } });
    const pin = await call("get_selection", { request });
    const answer = pin.thread.filter((item: any) => item.from === "user").slice(1).at(-1)?.text;
    // First turn: the agent needs the user's word first.
    if (!answer) { await call("reply_to_request", { request, status: "question", message: "Which word?" }); return; }
    // An editor tool runs unasked; a shell command waits for the pin's answer.
    seen.outcomes.push(await ask({ title: "mcp__native-site-editor__edit_file", kind: "edit", _meta: { claudeCode: { toolName: "mcp__native-site-editor__edit_file" } } }));
    seen.outcomes.push(await ask({ title: "npm install", kind: "execute", _meta: { claudeCode: { toolName: "Bash" } } }));
    const read = await call("read_file", { path: "index.html" });
    const edit = await call("edit_file", { path: "index.html", expectedHash: read.hash, edits: [{ oldText: "<h1>Welcome</h1>", newText: `<h1>${answer}</h1>` }], requestId: "pin-edit-1", waitSeconds: 0 });
    assert.equal(edit.state, "applied");
    await call("get_selection", { request });
    await call("reply_to_request", { request, status: "done", message: `The heading says ${answer}.`, requestIds: ["pin-edit-1"] });
  }
  createInterface({ input: toAgent }).on("line", line => {
    const message = JSON.parse(line);
    if (message.method) seen.methods.push(message.method);
    if (message.method === "initialize") send({ id: message.id, result: { protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } } } });
    else if (message.method === "session/new") {
      seen.sessions.push(message.params);
      send({ id: message.id, result: { sessionId: "session-1", modes: { currentModeId: "bypassPermissions", availableModes: [{ id: "bypassPermissions" }, { id: "default" }] } } });
    } else if (message.method === "session/set_mode") { seen.modes.push(message.params.modeId); send({ id: message.id, result: {} }); }
    else if (message.method === "session/prompt") {
      const text = message.params.prompt[0].text;
      seen.prompts.push(text);
      work(text).then(() => send({ id: message.id, result: { stopReason: "end_turn" } }),
        error => send({ id: message.id, error: { code: -32603, message: String(error) } }));
    } else if (!message.method && waiting.has(message.id)) { waiting.get(message.id)!(message.result.outcome); waiting.delete(message.id); }
  });
  const agent: AgentProcess = { input: fromAgent, output: toAgent, stop: () => { seen.stopped++; if (!fromAgent.writableEnded) fromAgent.end(); void client?.close(); } };
  return { agent, seen };
}

async function until<T>(what: string, check: () => T | undefined | false, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test("a pin starts one agent through the local Worker: its question returns to the pin, its change lands, and Disconnect ends the helper", async () => {
  const { worker, github } = await startWorker();
  const stopping = new AbortController();
  try {
    const { cookie } = await signIn(worker);
    let choice = "Codex";
    const tab = await receivingTab(worker, cookie, github, { pinsGoTo: () => choice });
    const { id: grant, token } = await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json();
    await tab.show(await siteContext());
    const element = { file: "index.html", id: "1.0.0", tag: "h1", text: "Welcome", html: "<h1>Welcome</h1>" };
    const pin: AgentRequest = { id: "req-helper", text: "Make this friendlier", createdAt: Date.now(), repoId: repo.id,
      repository: repo.full_name, branch: "main", state: "open", element, thread: [{ from: "user", text: "Make this friendlier", at: Date.now() }] };
    tab.conversations.set(pin.id, pin);
    const answer = (text: string) => {
      const { list } = requestOperation([...tab.conversations.values()], { type: "answer", id: pin.id, text }) as { list: AgentRequest[] };
      tab.conversations.set(pin.id, list.find(item => item.id === pin.id)!);
    };

    // Only the helper's waits are told "Pins go to" (on another connection, which leaves this one's pin untaken).
    const probe = new Client({ name: "probe", version: "1" });
    const other = (await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json()).token;
    await probe.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${other}` } }, fetch: workerFetch(worker) }));
    const agent = payload(await probe.callTool({ name: "wait_for_requests", arguments: { waitSeconds: 0, agent: "Copy editor" } }));
    assert.deepEqual([agent.requests.length, "pinsGoTo" in agent], [1, false]);
    const helper = payload(await probe.callTool({ name: "wait_for_requests", arguments: { all: true, waitSeconds: 0, agent: HELPER_AGENT } }));
    assert.deepEqual([helper.requests.length, helper.pinsGoTo], [1, "Codex"]);
    await probe.close();
    choice = "Claude Code";

    const fake = fakeAgent(worker), launched: string[] = [], lines: string[] = [];
    const url = `${origin}/mcp`;
    const running = runHelper({ url, token, fetch: workerFetch(worker), waitSeconds: 0, pollMs: 20, signal: stopping.signal,
      launch: agent => { launched.push(agent); return fake.agent; }, log: line => lines.push(line) });

    // The agent's question is on the pin, under its name.
    const asked = await until("the agent's question", () => { const now = tab.conversations.get(pin.id)!; return now.state === "question" && now; });
    assert.equal(asked.thread!.at(-1)!.text, "Which word?");
    assert.equal(asked.agent?.name, "Claude Code");
    // Its session reaches the editor's MCP server on this connection, in an empty folder, ready to ask before anything else.
    const session = fake.seen.sessions[0];
    assert.deepEqual(session.mcpServers, [{ type: "http", name: "native-site-editor", url, headers: [{ name: "Authorization", value: `Bearer ${token}` }] }]);
    assert.match(session.cwd, /editor-helper-/);
    assert.deepEqual(session._meta, sessionMeta("Claude Code")._meta);
    assert.deepEqual(fake.seen.modes, ["default"]);
    assert.match(fake.seen.prompts[0], /You are "Claude Code"[\s\S]*get_selection \(request: "req-helper", agent: "Claude Code"\)/);

    // The user's answer goes back to the same agent, which asks before a shell command: the pin asks the user.
    answer("Hello");
    const approval = await until("the approval question", () => { const now = tab.conversations.get(pin.id)!; return now.state === "question" && now.thread!.at(-1)!.text.startsWith("Allow") && now; });
    assert.equal(approval.thread!.at(-1)!.text, "Allow npm install?");
    answer("no");
    const done = await until("the done reply", () => { const now = tab.conversations.get(pin.id)!; return now.state === "done" && now; });
    assert.equal(done.thread!.at(-1)!.text, "The heading says Hello.");
    assert.equal(done.agent?.name, "Claude Code");
    // The editor tool ran unasked; the shell command was refused.
    assert.deepEqual(fake.seen.outcomes, [{ outcome: "selected", optionId: "yes" }, { outcome: "selected", optionId: "no" }]);
    // One agent, one session, two turns: the pin and the user's answer.
    assert.deepEqual(launched, ["Claude Code"]);
    assert.equal(fake.seen.methods.filter(method => method === "session/new").length, 1);
    assert.equal(fake.seen.prompts.length, 2);
    assert.match(fake.seen.prompts[1], /The user added to request req-helper/);
    // The change landed in the tab as a draft write of the page.
    const writes = tab.commands.filter(command => command.operation === "write_file");
    assert.equal(writes.length, 1);
    assert.equal((writes[0] as any).path, "index.html");
    assert.equal((writes[0] as any).content, files["index.html"].replace("<h1>Welcome</h1>", "<h1>Hello</h1>"));
    // The helper waited under its own name; the agent worked under its own.
    assert.ok(tab.received.some(command => command.tool === "wait_for_requests" && command.agent === HELPER_AGENT));
    assert.ok(tab.received.some(command => command.tool === "edit_file" && command.agent === "Claude Code"));

    // Ctrl+C ends a helper during its 25-second wait at once.
    const quit = new AbortController(), started = Date.now();
    const second = runHelper({ url, token, fetch: workerFetch(worker), signal: quit.signal, launch: () => { throw new Error("no pin"); } });
    await until("the second helper's wait", () => tab.received.filter(command => command.tool === "wait_for_requests").length > 0 && Date.now() - started > 300);
    quit.abort();
    assert.equal(await second, "Stopped.");
    assert.ok(Date.now() - started < 5_000);

    // Disconnect MCP: the helper's next wait is refused, and it stops its agent and ends.
    assert.equal((await tab.post("/api/agent/revoke", { id: grant })).status, 200);
    assert.match(await running, /ended this connection/);
    assert.equal(fake.seen.stopped, 1);
    assert.ok(lines.includes("Claude Code takes req-helper."), lines.join("\n"));
  } finally {
    stopping.abort();
    await worker.dispose();
  }
});

/** A signed-in tab on the real Worker with its own connection, and a way to pin and answer requests there. */
async function site(worker: Awaited<ReturnType<typeof startWorker>>["worker"], github: Awaited<ReturnType<typeof startWorker>>["github"]) {
  const { cookie } = await signIn(worker);
  const tab = await receivingTab(worker, cookie, github, { pinsGoTo: () => "Claude Code" });
  await tab.show(await siteContext());
  const connect = async () => (await (await tab.post("/api/agent/connect", { repo: repo.full_name, repoId: repo.id, branch: "main" })).json()) as { id: string; token: string };
  const element = { file: "index.html", id: "1.0.0", tag: "h1", text: "Welcome", html: "<h1>Welcome</h1>" };
  const add = (id: string, text: string) => tab.conversations.set(id, { id, text, createdAt: Date.now(), repoId: repo.id, repository: repo.full_name, branch: "main",
    state: "open", element, thread: [{ from: "user", text, at: Date.now() }] });
  const answer = (id: string, text: string) => {
    const { list } = requestOperation([...tab.conversations.values()], { type: "answer", id, text }) as { list: AgentRequest[] };
    tab.conversations.set(id, list.find(item => item.id === id)!);
  };
  const pin = (id: string) => tab.conversations.get(id)!;
  return { tab, connect, add, answer, pin };
}
const said = (request: AgentRequest | undefined) => request?.thread?.at(-1)?.text;

test("at most maxAgents run: a queued pin starts once one closes, and none starts as the helper ends", async () => {
  const { worker, github } = await startWorker();
  const quit = new AbortController();
  try {
    const { tab, connect, add, pin } = await site(worker, github);
    const { id, token } = await connect();
    const events: string[] = [], fakes: ReturnType<typeof fakeAgent>[] = [];
    // A pin saying "hang" keeps its agent at work; any other is done at once.
    const script = async (turn: Turn) => {
      events.push(`work ${turn.request}`);
      if (/hang/.test((await turn.call("get_selection", { request: turn.request })).text)) return new Promise<void>(() => {});
      await turn.call("reply_to_request", { request: turn.request, status: "done", message: "Done." });
    };
    const running = runHelper({ url: `${origin}/mcp`, token, fetch: workerFetch(worker), waitSeconds: 0, pollMs: 20, maxAgents: 1, idleMs: 100, signal: quit.signal,
      launch: () => { const fake = fakeAgent(worker, script); fakes.push(fake);
        events.push(`launch ${fakes.length}`); return { ...fake.agent, stop: () => { events.push(`stop ${fakes.indexOf(fake) + 1}`); fake.agent.stop(); } }; } });
    add("req-a", "Fix a"); add("req-b", "Fix b");
    await until("both pins done", () => pin("req-a").state === "done" && pin("req-b").state === "done");
    // The second agent started only once the first had closed (done, then idle).
    assert.deepEqual(events.filter(event => !event.startsWith("work")).slice(0, 3), ["launch 1", "stop 1", "launch 2"]);
    add("req-c", "hang"); add("req-d", "Fix d");
    await until("the hanging agent at work", () => events.includes("work req-c"));
    await until("the fourth pin taken and queued", () => pin("req-d").state === "seen");
    // Disconnect with req-d still queued: nothing new starts, every agent is stopped, and the helper ends.
    assert.equal((await tab.post("/api/agent/revoke", { id })).status, 200);
    assert.match(await running, /ended this connection/);
    assert.equal(fakes.length, 3);
    assert.ok(fakes.every(fake => fake.seen.stopped > 0));
    assert.ok(!events.includes("work req-d"));
  } finally { quit.abort(); await worker.dispose(); }
});

test("an agent that dies mid-turn answers its pin; approvals time out to a refusal, and an answer with more goes to the agent", async () => {
  const { worker, github } = await startWorker();
  const quits: AbortController[] = [];
  try {
    const { connect, add, answer, pin } = await site(worker, github);
    const lines: string[] = [];
    // One helper, approvals answered or not as each test says.
    const helper = async (approvalMs: number, script: (turn: Turn) => Promise<void>) => {
      const { token } = await connect(), quit = new AbortController(), fakes: ReturnType<typeof fakeAgent>[] = [];
      quits.push(quit);
      const running = runHelper({ url: `${origin}/mcp`, token, fetch: workerFetch(worker), waitSeconds: 0, pollMs: 20, approvalMs, signal: quit.signal,
        launch: () => { const fake = fakeAgent(worker, script); fakes.push(fake); return fake.agent; }, log: line => lines.push(line) });
      return { fakes, end: async () => { quit.abort(); return running; } };
    };

    // The agent's program stops during its turn: the pin says so, and the job is gone.
    const dying = await helper(60_000, turn => turn.die());
    add("req-die", "Fix it");
    await until("the stopped reply", () => pin("req-die").state === "answered" && pin("req-die"));
    assert.equal(said(pin("req-die")), "Claude Code stopped before it finished. Send again to retry.");
    assert.ok(lines.includes("Claude Code left req-die."), lines.join("\n"));
    assert.equal(await dying.end(), "Stopped.");

    // An approval nobody answers is refused when its time runs out.
    const outcomes: unknown[] = [];
    const asking = async (turn: Turn) => {
      if (/^The user added/.test(turn.text)) { await turn.call("get_selection", { request: turn.request }); await turn.call("reply_to_request", { request: turn.request, status: "done", message: "Blue." }); return; }
      outcomes.push(await turn.ask({ title: "npm install", kind: "execute" }));
      await turn.call("get_selection", { request: turn.request });
      await turn.call("reply_to_request", { request: turn.request, status: "done", message: "Done without it." });
    };
    const timing = await helper(50, asking);
    add("req-late", "Fix it");
    await until("the refusal", () => pin("req-late").state === "done");
    assert.deepEqual(outcomes, [{ outcome: "selected", optionId: "no" }]);
    await timing.end();

    // "no, also make it blue": refused, and the rest reaches the agent as a follow-up turn.
    const answering = await helper(60_000, asking);
    add("req-blue", "Fix it");
    await until("the approval question", () => said(pin("req-blue")) === "Allow npm install?");
    answer("req-blue", "no, also make it blue");
    await until("the follow-up done", () => said(pin("req-blue")) === "Blue." && pin("req-blue").state === "done");
    assert.deepEqual(outcomes.at(-1), { outcome: "selected", optionId: "no" });
    assert.equal(answering.fakes.length, 1);
    assert.equal(answering.fakes[0].seen.prompts.length, 2);
    assert.match(answering.fakes[0].seen.prompts[1], /The user added to request req-blue/);
    await answering.end();
  } finally { for (const quit of quits) quit.abort(); await worker.dispose(); }
});

test("Ctrl+C says on each unfinished pin that its agent stopped before the helper ends; finished pins keep their answer", async () => {
  const { worker, github } = await startWorker();
  const quit = new AbortController();
  try {
    const { connect, add, pin } = await site(worker, github);
    const { token } = await connect(), working = new Set<string>();
    const script = async (turn: Turn) => {
      working.add(turn.request);
      if (turn.request === "req-done") { await turn.call("get_selection", { request: turn.request }); await turn.call("reply_to_request", { request: turn.request, status: "done", message: "Done." }); return; }
      return new Promise<void>(() => {});
    };
    const running = runHelper({ url: `${origin}/mcp`, token, fetch: workerFetch(worker), waitSeconds: 0, pollMs: 20, maxAgents: 2, signal: quit.signal,
      launch: () => fakeAgent(worker, script).agent });
    add("req-done", "Fix it");
    await until("the first pin done", () => pin("req-done").state === "done");
    add("req-busy", "Fix this"); add("req-queued", "And this");
    await until("the busy agent at work", () => working.has("req-busy") && pin("req-queued").state === "seen");
    quit.abort();
    assert.equal(await running, "Stopped.");
    // The busy pin by its agent (the first, idle after its pin, still holds "Claude Code"); the queued one by the program.
    for (const [id, name] of [["req-busy", "Claude Code 2"], ["req-queued", "Claude Code"]]) {
      assert.equal(pin(id).state, "answered", id);
      assert.equal(said(pin(id)), `${name} stopped: the helper on this computer was closed. Send again to retry.`);
    }
    assert.equal(said(pin("req-done")), "Done.");
  } finally { quit.abort(); await worker.dispose(); }
});
