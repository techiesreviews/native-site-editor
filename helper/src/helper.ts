// The pin loop (ticket am-16). The helper is an MCP client of the editor's /mcp on the connection Connect to
// MCP made: it keeps calling wait_for_requests, and for each pin starts its agent (Claude Code unless its start
// command names another) through ACP, which works through the same MCP connection under its own name. A pin's later messages (the
// answer to its question, a follow-up) go back to the agent already on it while it runs. A tool outside the
// allowed list is asked on the pin, and runs only on a yes. It stops when the connection ends.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { acpConnection, choose, PROTOCOL_VERSION, type AcpConnection, type NewSessionParams, type PermissionOutcome, type PermissionRequest } from "./acp.ts";
import {
  approvalQuestion, approves, followUpPrompt, LOCKED_DOWN, notLockedDown, refuses, HELPER_AGENT, pinPrompt, PIN_AGENTS, SAFE_MODES, SERVER, sessionMeta,
  toolAllowed, type PinAgent,
} from "./agents.ts";

export const HELPER_NAME = "editor-helper";
export const HELPER_VERSION = "0.1.0";

/** A started agent program. */
export interface AgentProcess { input: Readable; output: Writable; stop(): void }

export interface HelperOptions {
  /** The editor's MCP address, e.g. https://editor.techies.tools/mcp. */
  url: string;
  /** The connection's token, from Connect to MCP. */
  token: string;
  /** The agent each pin starts (default Claude Code); the start command's `--agent`. */
  agent?: PinAgent;
  /** Starts `agent`'s ACP program. */
  launch(agent: PinAgent): AgentProcess;
  fetch?: typeof fetch;
  /** Each wait's hold (default and most 25 s). */
  waitSeconds?: number;
  /** The pause after an empty wait (default none: the wait itself holds). */
  pollMs?: number;
  /** At most this many agents at once (default 3); more pins wait their turn. */
  maxAgents?: number;
  /** An agent with nothing to do is stopped after this long (default 15 min). */
  idleMs?: number;
  /** An approval with no answer is refused after this long (default 10 min). */
  approvalMs?: number;
  /** The name every agent works under, in place of its program's (a custom command's program). */
  agentName?: string;
  log?(line: string): void;
  signal?: AbortSignal;
  sleep?(ms: number, signal?: AbortSignal): Promise<void>;
}

interface Request { id: string; thread?: { from: string; text: string }[] }
type PinStatus = "question" | "answered";
/** Why the helper ended, and whether that is a failure (the start command's exit status). */
export interface HelperEnd { why: string; failed: boolean }

/** One agent on one pin. */
interface Work {
  request: string;
  name: string;
  program: PinAgent;
  agent?: AgentProcess;
  acp?: AcpConnection;
  session?: string;
  folder?: string;
  /** The turns, one after another. */
  turns: Promise<void>;
  busy: number;
  idle?: ReturnType<typeof setTimeout>;
  /** The approval the pin is asked for now: its question, and its answer's resolver. */
  approval?: { question: string; settle(answer: string | undefined): void };
  approvals: Promise<unknown>;
  closed: boolean;
}

const sleeping = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  if (signal?.aborted) { resolve(); return; }
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); }
  signal?.addEventListener("abort", done, { once: true });
});
/** A 401 from the editor (the SDK's HTTP error carries the status): the connection is over. Nothing else counts. */
const unauthorized = (error: unknown) => {
  const value = error as { status?: unknown; data?: { status?: unknown } } | undefined;
  return value?.status === 401 || value?.data?.status === 401;
};
const said = (error: unknown) => error instanceof Error ? error.message : String(error);
/** What a call of an agent the user stopped in the editor gets (shared/agent.ts AGENT_STOPPED). */
const STOPPED = /stopped you/;
/** How many of the user's messages a request carries: one more than the helper heard is something new. */
const userMessages = (request: Request) => (request.thread ?? []).filter(item => item.from === "user").length;
const textOf = (result: unknown) => {
  const content = (result as { content?: { type?: string; text?: string }[] }).content ?? [];
  return content.find(item => item.type === "text")?.text ?? "";
};
/** The user's answer to `question` on the pin: their messages after the agent's last asking of it; none yet, undefined.
 * A message from before the question (a follow-up meanwhile) is no answer to it. */
export function answerTo(request: Request, question: string) {
  const thread = request.thread ?? [];
  let asked = thread.length - 1;
  while (asked >= 0 && !(thread[asked].from !== "user" && thread[asked].text === question)) asked--;
  const after = asked < 0 ? [] : thread.slice(asked + 1).filter(item => item.from === "user").map(item => item.text);
  return after.length ? after.join("\n") : undefined;
}

/** Runs until the connection ends, the user stops the helper, or `signal` aborts; resolves with why it stopped. */
export async function runHelper(options: HelperOptions): Promise<HelperEnd> {
  const log = options.log ?? (() => {});
  const sleep = options.sleep ?? sleeping;
  const program = options.agent ?? PIN_AGENTS[0];
  // Only an agent whose own tools the helper can limit takes pins, unless the user started it with their own command.
  if (!options.agentName && !LOCKED_DOWN.includes(program)) { log(notLockedDown(program)); return { why: notLockedDown(program), failed: true }; }
  const maxAgents = options.maxAgents ?? 3, idleMs = options.idleMs ?? 15 * 60_000, approvalMs = options.approvalMs ?? 10 * 60_000;
  const work = new Map<string, Work>();
  const queue: { request: Request; program: PinAgent }[] = [];
  // Set once the helper ends (at once when `signal` aborts): no queued pin starts after it, and an agent that stops
  // meanwhile says nothing itself; its pin is in `abandoned`, which `stop` answers with the rest.
  let stopping = false;
  const abandoned: { request: string; name: string }[] = [];
  options.signal?.addEventListener("abort", () => { stopping = true; }, { once: true });
  // The user's messages heard on each pin: a pin listed again (`all`) with nothing new is not news.
  const heard = new Map<string, number>();
  // Names the user stopped in the editor: their calls are refused, so no later agent takes them.
  const stoppedNames = new Set<string>();
  const client = new Client({ name: HELPER_NAME, version: HELPER_VERSION });
  const call = async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    const result = await client.callTool({ name, arguments: args }, signal ? { signal } : undefined);
    return { error: Boolean((result as { isError?: boolean }).isError), text: textOf(result) };
  };

  /** Says `message` on pin `request` as agent `name`; it reads the request first, so a reply after the user's latest is kept. */
  async function sayAs(request: string, name: string, status: PinStatus, message: string) {
    await call("get_selection", { request, agent: name });
    const said = await call("reply_to_request", { request, status, message, agent: name });
    if (said.error) throw new Error(said.text);
  }
  const sayOnPin = (job: Work, status: PinStatus, message: string) => sayAs(job.request, job.name, status, message);

  async function permission(job: Work, request: PermissionRequest): Promise<PermissionOutcome> {
    // An editor tool offered only as "allow always" gets a cancel from `choose` (no once-only allow); Claude Code
    // never asks for them, as its allowed list runs them unasked.
    if (toolAllowed(request.toolCall)) return choose(request.options, "allow");
    // One approval on the pin at a time.
    const asked = job.approvals.then(async () => {
      if (job.closed) return choose(request.options, "reject");
      const question = approvalQuestion(request.toolCall);
      log(`${job.name} asks on ${job.request}: ${question}`);
      // Waiting from before the question is posted (an answer is told apart by the thread, `answerTo`); its time
      // runs from then. Every settle (answer, time, close, a failed post) clears the timer and the approval.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const answer = new Promise<string | undefined>(resolve => {
        job.approval = { question, settle(value) { clearTimeout(timer); job.approval = undefined; resolve(value); } };
      });
      const settle = job.approval!.settle;
      try { await sayOnPin(job, "question", question); } catch (error) {
        settle(undefined);
        log(`${job.request}: the question could not be asked (${error instanceof Error ? error.message : error}); refused.`);
        return choose(request.options, "reject");
      }
      if (job.approval?.settle === settle) timer = setTimeout(() => settle(undefined), approvalMs);
      return choose(request.options, approves(await answer) ? "allow" : "reject");
    });
    job.approvals = asked.catch(() => {});
    return asked;
  }

  function close(job: Work) {
    if (job.closed) return;
    job.closed = true;
    clearTimeout(job.idle);
    job.approval?.settle(undefined);
    job.agent?.stop();
    if (job.folder) void rm(job.folder, { recursive: true, force: true });
    work.delete(job.request);
    log(`${job.name} left ${job.request}.`);
    const waiting = stopping ? undefined : queue.shift();
    if (waiting) start(waiting.request, waiting.program);
  }

  /** Whether the user stopped `name` in the editor: a read under it is refused. Such a name is never given again. */
  async function stoppedName(request: string, name: string) {
    const read = await call("get_selection", { request, agent: name }).catch(() => undefined);
    if (!read?.error || !STOPPED.test(read.text)) return false;
    stoppedNames.add(name);
    log(`${name} was stopped in the editor.`);
    return true;
  }

  /** Sends one prompt after the turns before it; once nothing runs, the agent is stopped after idleMs. A prompt given as
   * a function is written when its turn comes, with the name the agent has then (a start may take another). */
  function turn(job: Work, prompt: string | (() => string)) {
    clearTimeout(job.idle);
    job.busy++;
    job.turns = job.turns.then(async () => {
      if (job.closed) return;
      try {
        const text = typeof prompt === "string" ? prompt : prompt();
        await job.acp!.request("session/prompt", { sessionId: job.session, prompt: [{ type: "text", text }] });
        // Stopped in the editor meanwhile, its calls were refused and its pin is left: say so as the helper.
        if (!job.closed && !stopping && await stoppedName(job.request, job.name) && !job.closed && !stopping) {
          close(job);
          await sayAs(job.request, HELPER_AGENT, "answered", `${job.name} was stopped in the editor. Send again for another agent.`).catch(() => {});
        }
      } catch (error) {
        if (job.closed) return;
        log(`${job.name} stopped on ${job.request}: ${said(error)}`);
        // Gone first, then said: a message the user sends after reading it starts a new agent.
        close(job);
        if (stopping) { abandoned.push({ request: job.request, name: job.name }); return; }
        await sayOnPin(job, "answered", `${job.name} stopped before it finished. Send again to retry.`).catch(() => {});
      } finally {
        // Nothing to do: it waits for a follow-up a while, or makes room for a pin waiting its turn now.
        if (--job.busy === 0 && !job.closed) {
          if (queue.length) close(job);
          else job.idle = setTimeout(() => close(job), idleMs);
        }
      }
    });
  }

  /** A free name: the program's (or `agentName`), numbered when it already works on another pin or was stopped. */
  function nameFor(program: PinAgent) {
    const base = options.agentName ?? program, taken = new Set([...work.values()].map(job => job.name).concat([...stoppedNames]));
    for (let n = 1; ; n++) { const name = n === 1 ? base : `${base} ${n}`; if (!taken.has(name)) return name; }
  }

  function start(request: Request, program: PinAgent) {
    if (stopping) return;
    heard.set(request.id, Math.max(heard.get(request.id) ?? 0, userMessages(request)));
    // An agent with nothing to do (done, waiting for a follow-up) makes room; a later message starts a new one.
    const idle = work.size >= maxAgents ? [...work.values()].find(job => job.busy === 0 && !job.approval) : undefined;
    if (idle) close(idle);
    if (work.size >= maxAgents) { queue.push({ request, program }); return; }
    const job: Work = { request: request.id, name: nameFor(program), program, turns: Promise.resolve(), busy: 0, approvals: Promise.resolve(), closed: false };
    work.set(request.id, job);
    log(`${job.name} takes ${request.id}.`);
    // Each await below is followed by a look at `job.closed`: a job closed meanwhile (the helper ending, room made
    // for another pin) sends nothing more and leaves no folder behind.
    job.turns = (async () => {
      try {
        // A name the user stopped is refused at every call: take the next free one (at most a few tries).
        for (let tries = 0; tries < 3 && await stoppedName(request.id, job.name); tries++) job.name = nameFor(program);
        if (job.closed) return;
        job.agent = options.launch(program);
        job.acp = acpConnection({ input: job.agent.input, output: job.agent.output }, { permission: asked => permission(job, asked) });
        void job.acp.closed.then(() => { if (!job.busy) close(job); });
        const ready = await job.acp.request<{ agentCapabilities?: { mcpCapabilities?: { http?: boolean } } }>("initialize", {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          clientInfo: { name: HELPER_NAME, version: HELPER_VERSION },
        });
        if (job.closed) return;
        if (ready.agentCapabilities?.mcpCapabilities?.http !== true) throw new Error(`${job.name} cannot reach the editor over MCP.`);
        const folder = await mkdtemp(join(tmpdir(), "editor-helper-"));
        if (job.closed) { void rm(folder, { recursive: true, force: true }); return; }
        job.folder = folder;
        const session = await job.acp.request<{ sessionId: string; modes?: { currentModeId?: string; availableModes?: { id: string }[] } }>("session/new", {
          cwd: job.folder,
          mcpServers: [{ type: "http", name: SERVER, url: options.url, headers: [{ name: "Authorization", value: `Bearer ${options.token}` }] }],
          ...sessionMeta(program),
        } satisfies NewSessionParams);
        if (job.closed) return;
        job.session = session.sessionId;
        const mode = SAFE_MODES.find(id => session.modes?.availableModes?.some(each => each.id === id));
        if (mode && mode !== session.modes?.currentModeId) await job.acp.request("session/set_mode", { sessionId: job.session, modeId: mode });
      } catch (error) {
        // Closed meanwhile (the helper ending answers its pin itself): nothing more to say.
        if (job.closed) return;
        log(`${job.name} could not start for ${request.id}: ${said(error)}`);
        close(job);
        if (stopping) { abandoned.push({ request: job.request, name: job.name }); return; }
        await sayOnPin(job, "answered", `${job.name} could not start on this computer.`).catch(() => {});
      }
    })();
    turn(job, () => pinPrompt(job.name, request.id));
  }

  function dispatch(request: Request) {
    const job = work.get(request.id);
    // A pin listed again (a wait with `all`) with no new message from the user is already in hand.
    const known = heard.get(request.id), users = userMessages(request);
    heard.set(request.id, Math.max(known ?? 0, users));
    if (known !== undefined && users <= known) return;
    const answer = job?.approval && answerTo(request, job.approval.question);
    if (job?.approval && answer !== undefined) {
      const plain = approves(answer) || refuses(answer);
      job.approval.settle(answer);
      // A plain yes or no is the helper's: read as the agent's, so the agent's own reply is not held up by it.
      // Anything more ("no, but make it blue") also goes to the agent, as a follow-up.
      if (plain) { void call("get_selection", { request: request.id, agent: job.name }).catch(() => {}); return; }
    }
    if (job) { log(`${request.id} goes back to ${job.name}.`); turn(job, followUpPrompt(job.name, request.id)); return; }
    // A message on a pin waiting its turn: its agent reads the whole thread when it starts.
    if (queue.some(item => item.request.id === request.id)) return;
    start(request, program);
  }

  /** Ends every agent and drops the queue. Given `reason` (the connection still works), it first says so on each pin
   * it took and has not finished (an agent at work or stopped meanwhile, one waiting its turn, and `taken`: those the
   * last wait brought), so none stays taken by nobody. */
  async function stop(end: HelperEnd, reason?: string, taken: { request: Request; program: PinAgent }[] = []) {
    stopping = true;
    // Each pin once, by the agent on it if there is one.
    const pins = new Map<string, string>();
    for (const job of work.values()) if (job.busy > 0) pins.set(job.request, job.name);
    for (const pin of abandoned.splice(0)) pins.set(pin.request, pin.name);
    for (const item of [...queue.splice(0), ...taken]) if (!pins.has(item.request.id))
      pins.set(item.request.id, work.get(item.request.id)?.name ?? options.agentName ?? item.program);
    for (const job of [...work.values()]) close(job);
    if (reason) await Promise.all([...pins].map(([request, name]) =>
      sayAs(request, name, "answered", `${name} stopped: ${reason} Send again to retry.`).catch(() => {})));
    log(end.why);
    return end;
  }
  try {
    // Offline at the start: it tries again, as a failed wait does.
    for (;;) {
      if (options.signal?.aborted) return await stop({ why: "Stopped.", failed: false });
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(options.url), {
          requestInit: { headers: { Authorization: `Bearer ${options.token}` } },
          ...(options.fetch ? { fetch: options.fetch } : {}),
        }));
        break;
      } catch (error) {
        if (unauthorized(error)) return await stop({ why: "The editor refused the token: choose Connect to MCP again for a new one.", failed: true });
        log(`The editor did not answer (${said(error)}); trying again in 10 seconds.`);
        await sleep(10_000, options.signal);
      }
    }
    log("Waiting for pins.");
    // The first wait lists every pin still waiting (`all`): one this connection took before (a helper started again
    // on the same token) comes back. So does each wait after one whose pins may be lost: the editor's "did not
    // answer" hint says they "come back with all: true", and a failed call may have taken some too.
    let relist = true;
    while (!options.signal?.aborted) {
      let answer: { error: boolean; text: string };
      try {
        answer = await call("wait_for_requests", { agent: HELPER_AGENT, waitSeconds: options.waitSeconds ?? 25, ...(relist ? { all: true } : {}) }, options.signal);
      } catch (error) {
        if (options.signal?.aborted) break;
        if (unauthorized(error)) return await stop({ why: "The editor ended this connection (Disconnect MCP, or signed out).", failed: true });
        relist = true;
        log(`The editor did not answer (${said(error)}); trying again in 10 seconds.`);
        await sleep(10_000, options.signal);
        continue;
      }
      if (answer.error) {
        // Only the helper's own name is refused: its agents' pins still hear it.
        if (STOPPED.test(answer.text)) return await stop({ why: "The editor's user stopped the helper.", failed: true }, "the helper was stopped in the editor.");
        log(`The editor refused the wait: ${answer.text}`);
        await sleep(10_000, options.signal);
        continue;
      }
      let value: { requests?: Request[]; hint?: string };
      try { value = JSON.parse(answer.text); } catch { value = {}; }
      relist = Boolean(value.hint?.includes("all: true"));
      // Paused: the requests this wait took are answered too, never left taken by nobody.
      if (value.hint?.includes("Stop the watchdog"))
        return await stop({ why: "Waiting for requests is paused by the site owner.", failed: false }, "waiting for pins is paused in the editor.",
          (value.requests ?? []).map(request => ({ request, program })));
      for (const request of value.requests ?? []) dispatch(request);
      if (value.requests?.length) continue;
      const later = /Wait about (a minute|(\d+) seconds)/.exec(value.hint ?? "");
      if (later) await sleep(later[2] ? Number(later[2]) * 1000 : 60_000, options.signal);
      else if (options.pollMs) await sleep(options.pollMs, options.signal);
    }
    return await stop({ why: "Stopped.", failed: false }, "the helper on this computer was closed.");
  } finally {
    await client.close().catch(() => {});
  }
}
