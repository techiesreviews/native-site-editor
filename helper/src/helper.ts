// The pin loop (ticket am-16). The helper is an MCP client of the editor's /mcp on the connection Connect to
// MCP made: it keeps calling wait_for_requests, and for each pin starts the agent chosen in "Pins go to"
// through ACP, which works through the same MCP connection under its own name. A pin's later messages (the
// answer to its question, a follow-up) go back to the agent already on it while it runs. A tool outside the
// allowed list is asked on the pin, and runs only on a yes. It stops when the connection ends.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { acpConnection, choose, PROTOCOL_VERSION, type AcpConnection, type PermissionOutcome, type PermissionRequest } from "./acp.ts";
import {
  approvalQuestion, approves, followUpPrompt, refuses, HELPER_AGENT, pinAgent, pinPrompt, PIN_AGENTS, SAFE_MODES, SERVER, sessionMeta,
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
  /** The name every agent works under, in place of the "Pins go to" choice's (a custom command's program). */
  agentName?: string;
  log?(line: string): void;
  signal?: AbortSignal;
  sleep?(ms: number, signal?: AbortSignal): Promise<void>;
}

interface Request { id: string; thread?: { from: string; text: string }[] }
type PinStatus = "question" | "answered";

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
const unauthorized = (error: unknown) => {
  const value = error as { status?: unknown; data?: { status?: unknown }; message?: unknown } | undefined;
  return value?.status === 401 || value?.data?.status === 401 || /\b401\b/.test(String(value?.message ?? ""));
};
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
export async function runHelper(options: HelperOptions): Promise<string> {
  const log = options.log ?? (() => {});
  const sleep = options.sleep ?? sleeping;
  const maxAgents = options.maxAgents ?? 3, idleMs = options.idleMs ?? 15 * 60_000, approvalMs = options.approvalMs ?? 10 * 60_000;
  const work = new Map<string, Work>();
  const queue: { request: Request; program: PinAgent }[] = [];
  // Set once the helper ends: no queued pin starts after it.
  let stopping = false;
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

  /** Sends one prompt after the turns before it; once nothing runs, the agent is stopped after idleMs. */
  function turn(job: Work, text: string) {
    clearTimeout(job.idle);
    job.busy++;
    job.turns = job.turns.then(async () => {
      if (job.closed) return;
      try {
        await job.acp!.request("session/prompt", { sessionId: job.session, prompt: [{ type: "text", text }] });
      } catch (error) {
        if (job.closed) return;
        log(`${job.name} stopped on ${job.request}: ${error instanceof Error ? error.message : error}`);
        // Gone first, then said: a message the user sends after reading it starts a new agent.
        close(job);
        await sayOnPin(job, "answered", `${job.name} stopped before it finished. Send again to retry.`).catch(() => {});
      } finally {
        if (--job.busy === 0 && !job.closed) job.idle = setTimeout(() => close(job), idleMs);
      }
    });
  }

  /** A free name: the program's (or `agentName`), numbered when it already works on another pin. */
  function nameFor(program: PinAgent) {
    const base = options.agentName ?? program, taken = new Set([...work.values()].map(job => job.name));
    for (let n = 1; ; n++) { const name = n === 1 ? base : `${base} ${n}`; if (!taken.has(name)) return name; }
  }

  function start(request: Request, program: PinAgent) {
    if (work.size >= maxAgents) { queue.push({ request, program }); return; }
    const job: Work = { request: request.id, name: nameFor(program), program, turns: Promise.resolve(), busy: 0, approvals: Promise.resolve(), closed: false };
    work.set(request.id, job);
    log(`${job.name} takes ${request.id}.`);
    job.turns = (async () => {
      try {
        job.agent = options.launch(program);
        job.acp = acpConnection({ input: job.agent.input, output: job.agent.output }, { permission: asked => permission(job, asked) });
        void job.acp.closed.then(() => { if (!job.busy) close(job); });
        const ready = await job.acp.request<{ agentCapabilities?: { mcpCapabilities?: { http?: boolean } } }>("initialize", {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
          clientInfo: { name: HELPER_NAME, version: HELPER_VERSION },
        });
        if (ready.agentCapabilities?.mcpCapabilities?.http !== true) throw new Error(`${job.name} cannot reach the editor over MCP.`);
        job.folder = await mkdtemp(join(tmpdir(), "editor-helper-"));
        const session = await job.acp.request<{ sessionId: string; modes?: { currentModeId?: string; availableModes?: { id: string }[] } }>("session/new", {
          cwd: job.folder,
          mcpServers: [{ type: "http", name: SERVER, url: options.url, headers: [{ name: "Authorization", value: `Bearer ${options.token}` }] }],
          ...sessionMeta(program),
        });
        job.session = session.sessionId;
        const mode = SAFE_MODES.find(id => session.modes?.availableModes?.some(each => each.id === id));
        if (mode && mode !== session.modes?.currentModeId) await job.acp.request("session/set_mode", { sessionId: job.session, modeId: mode });
      } catch (error) {
        log(`${job.name} could not start for ${request.id}: ${error instanceof Error ? error.message : error}`);
        close(job);
        await sayOnPin(job, "answered", `${job.name} could not start on this computer.`).catch(() => {});
      }
    })();
    turn(job, pinPrompt(job.name, request.id));
  }

  function dispatch(request: Request, choice: unknown) {
    const job = work.get(request.id);
    const answer = job?.approval && answerTo(request, job.approval.question);
    if (job?.approval && answer !== undefined) {
      const plain = approves(answer) || refuses(answer);
      job.approval.settle(answer);
      // A plain yes or no is the helper's: read as the agent's, so the agent's own reply is not held up by it.
      // Anything more ("no, but make it blue") also goes to the agent, as a follow-up.
      if (plain) { void call("get_selection", { request: request.id, agent: job.name }).catch(() => {}); return; }
    }
    if (job) { log(`${request.id} goes back to ${job.name}.`); turn(job, followUpPrompt(job.name, request.id)); return; }
    if (queue.some(item => item.request.id === request.id)) return;
    start(request, pinAgent(choice) ?? PIN_AGENTS[0]);
  }

  /** Ends every agent and drops the queue. Asked to stop (not a dead connection: `answer`), it first says so on each
   * pin it took and has not finished (an agent at work, or waiting its turn), so none stays taken by nobody. */
  async function stop(why: string, answer = false) {
    stopping = true;
    const waiting = queue.splice(0).map(item => ({ request: item.request.id, name: options.agentName ?? item.program }));
    const working = [...work.values()].filter(job => job.busy > 0).map(job => ({ request: job.request, name: job.name }));
    for (const job of [...work.values()]) close(job);
    if (answer) await Promise.all([...working, ...waiting].map(pin =>
      sayAs(pin.request, pin.name, "answered", `${pin.name} stopped: the helper on this computer was closed. Send again to retry.`).catch(() => {})));
    log(why);
    return why;
  }
  try {
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(options.url), {
        requestInit: { headers: { Authorization: `Bearer ${options.token}` } },
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }));
    } catch (error) {
      if (unauthorized(error)) return await stop("The editor refused the token: choose Connect to MCP again for a new one.");
      throw error;
    }
    log("Waiting for pins.");
    while (!options.signal?.aborted) {
      let answer: { error: boolean; text: string };
      try {
        answer = await call("wait_for_requests", { agent: HELPER_AGENT, waitSeconds: options.waitSeconds ?? 25 }, options.signal);
      } catch (error) {
        if (options.signal?.aborted) break;
        if (unauthorized(error)) return await stop("The editor ended this connection (Disconnect MCP, or signed out).");
        log(`The editor did not answer (${error instanceof Error ? error.message : error}); trying again in 10 seconds.`);
        await sleep(10_000, options.signal);
        continue;
      }
      if (answer.error) {
        if (/stopped you/.test(answer.text)) return await stop("The editor's user stopped the helper.");
        log(`The editor refused the wait: ${answer.text}`);
        await sleep(10_000, options.signal);
        continue;
      }
      let value: { requests?: Request[]; pinsGoTo?: unknown; hint?: string };
      try { value = JSON.parse(answer.text); } catch { value = {}; }
      if (value.hint?.includes("Stop the watchdog")) return await stop("Waiting for requests is paused by the site owner.", true);
      for (const request of value.requests ?? []) dispatch(request, value.pinsGoTo);
      if (value.requests?.length) continue;
      const later = /Wait about (a minute|(\d+) seconds)/.exec(value.hint ?? "");
      if (later) await sleep(later[2] ? Number(later[2]) * 1000 : 60_000, options.signal);
      else if (options.pollMs) await sleep(options.pollMs, options.signal);
    }
    return await stop("Stopped.", true);
  } finally {
    await client.close().catch(() => {});
  }
}
