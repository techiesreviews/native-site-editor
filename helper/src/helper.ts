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
  approvalQuestion, approves, followUpPrompt, HELPER_AGENT, pinAgent, pinPrompt, PIN_AGENTS, SAFE_MODES, SERVER, sessionMeta,
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
  log?(line: string): void;
  signal?: AbortSignal;
  sleep?(ms: number, signal?: AbortSignal): Promise<void>;
}

interface Request { id: string; thread?: { from: string; text: string }[] }

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
  /** The approval the pin is asked for now: its answer's resolver. */
  approval?: (answer: string | undefined) => void;
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
const lastUserText = (request: Request) => [...request.thread ?? []].reverse().find(item => item.from === "user")?.text;

/** Runs until the connection ends, the user stops the helper, or `signal` aborts; resolves with why it stopped. */
export async function runHelper(options: HelperOptions): Promise<string> {
  const log = options.log ?? (() => {});
  const sleep = options.sleep ?? sleeping;
  const maxAgents = options.maxAgents ?? 3, idleMs = options.idleMs ?? 15 * 60_000, approvalMs = options.approvalMs ?? 10 * 60_000;
  const work = new Map<string, Work>();
  const queue: { request: Request; program: PinAgent }[] = [];
  const client = new Client({ name: HELPER_NAME, version: HELPER_VERSION });
  const call = async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    const result = await client.callTool({ name, arguments: args }, signal ? { signal } : undefined);
    return { error: Boolean((result as { isError?: boolean }).isError), text: textOf(result) };
  };

  /** Says `message` on the pin as `job`'s agent; it reads the request first, so a reply after the user's latest is kept. */
  async function sayOnPin(job: Work, status: "question" | "answered", message: string) {
    await call("get_selection", { request: job.request, agent: job.name });
    const said = await call("reply_to_request", { request: job.request, status, message, agent: job.name });
    if (said.error) throw new Error(said.text);
  }

  async function permission(job: Work, request: PermissionRequest): Promise<PermissionOutcome> {
    if (toolAllowed(request.toolCall)) return choose(request.options, "allow");
    // One approval on the pin at a time.
    const asked = job.approvals.then(async () => {
      if (job.closed) return choose(request.options, "reject");
      const question = approvalQuestion(request.toolCall);
      log(`${job.name} asks on ${job.request}: ${question}`);
      const answer = new Promise<string | undefined>(resolve => {
        const timer = setTimeout(() => resolve(undefined), approvalMs);
        job.approval = value => { clearTimeout(timer); resolve(value); };
      });
      try { await sayOnPin(job, "question", question); } catch (error) {
        job.approval = undefined;
        log(`${job.request}: the question could not be asked (${error instanceof Error ? error.message : error}); refused.`);
        return choose(request.options, "reject");
      }
      const reply = await answer;
      job.approval = undefined;
      return choose(request.options, approves(reply) ? "allow" : "reject");
    });
    job.approvals = asked.catch(() => {});
    return asked;
  }

  function close(job: Work) {
    if (job.closed) return;
    job.closed = true;
    clearTimeout(job.idle);
    job.approval?.(undefined);
    job.agent?.stop();
    if (job.folder) void rm(job.folder, { recursive: true, force: true });
    work.delete(job.request);
    log(`${job.name} left ${job.request}.`);
    const waiting = queue.shift();
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
        await sayOnPin(job, "answered", `${job.name} stopped before it finished. Send again to retry.`).catch(() => {});
        close(job);
      } finally {
        if (--job.busy === 0 && !job.closed) job.idle = setTimeout(() => close(job), idleMs);
      }
    });
  }

  /** A free name: the program's, numbered when it already works on another pin. */
  function nameFor(program: PinAgent) {
    const taken = new Set([...work.values()].map(job => job.name));
    for (let n = 1; ; n++) { const name = n === 1 ? program : `${program} ${n}`; if (!taken.has(name)) return name; }
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
        if (ready.agentCapabilities?.mcpCapabilities?.http !== true) throw new Error(`${program} cannot reach the editor over MCP.`);
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
        log(`${program} could not start for ${request.id}: ${error instanceof Error ? error.message : error}`);
        await sayOnPin(job, "answered", `${program} could not start on this computer.`).catch(() => {});
        close(job);
      }
    })();
    turn(job, pinPrompt(job.name, request.id));
  }

  function dispatch(request: Request, choice: unknown) {
    const job = work.get(request.id);
    // The answer to an approval is the helper's: read as the agent's, so the agent's own reply is not held up by it.
    if (job?.approval) { void call("get_selection", { request: request.id, agent: job.name }).catch(() => {}); job.approval(lastUserText(request)); return; }
    if (job) { log(`${request.id} goes back to ${job.name}.`); turn(job, followUpPrompt(job.name, request.id)); return; }
    if (queue.some(item => item.request.id === request.id)) return;
    start(request, pinAgent(choice) ?? PIN_AGENTS[0]);
  }

  const stop = (why: string) => { for (const job of [...work.values()]) close(job); queue.length = 0; log(why); return why; };
  try {
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(options.url), {
        requestInit: { headers: { Authorization: `Bearer ${options.token}` } },
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }));
    } catch (error) {
      if (unauthorized(error)) return stop("The editor refused the token: choose Connect to MCP again for a new one.");
      throw error;
    }
    log("Waiting for pins.");
    while (!options.signal?.aborted) {
      let answer: { error: boolean; text: string };
      try {
        answer = await call("wait_for_requests", { agent: HELPER_AGENT, waitSeconds: options.waitSeconds ?? 25 }, options.signal);
      } catch (error) {
        if (options.signal?.aborted) break;
        if (unauthorized(error)) return stop("The editor ended this connection (Disconnect MCP, or signed out).");
        log(`The editor did not answer (${error instanceof Error ? error.message : error}); trying again in 10 seconds.`);
        await sleep(10_000, options.signal);
        continue;
      }
      if (answer.error) {
        if (/stopped you/.test(answer.text)) return stop("The editor's user stopped the helper.");
        log(`The editor refused the wait: ${answer.text}`);
        await sleep(10_000, options.signal);
        continue;
      }
      let value: { requests?: Request[]; pinsGoTo?: unknown; hint?: string };
      try { value = JSON.parse(answer.text); } catch { value = {}; }
      if (value.hint?.includes("Stop the watchdog")) return stop("Waiting for requests is paused by the site owner.");
      for (const request of value.requests ?? []) dispatch(request, value.pinsGoTo);
      if (value.requests?.length) continue;
      const later = /Wait about (a minute|(\d+) seconds)/.exec(value.hint ?? "");
      if (later) await sleep(later[2] ? Number(later[2]) * 1000 : 60_000, options.signal);
      else if (options.pollMs) await sleep(options.pollMs, options.signal);
    }
    return stop("Stopped.");
  } finally {
    await client.close().catch(() => {});
  }
}
