// Automatic watching (Lex, 2026-10-23; ticket 18 before it). Loaded lazily with the agent menu.
//
// With the live relay, the receiving tab is where requests to agents live (src/agent-records.ts
// conversations), so it answers the request tools over the socket with the hub's own rules
// (shared/agent-requests.ts). While agents are connected the tab holds each wait until a request
// arrives here (an in-memory wake, never a storage read) or its time runs out: at most 25 s,
// clipped to the relay's budget. Agents keep watching (a watchdog subagent calling
// wait_for_requests again) until the user chooses Disconnect MCP.
//
// An agent's own question (ask_user, ticket am-15) is held the same way: its pin is kept here, and the call
// waits for the user's answer, which goes to it rather than to a watchdog's wait.
import { agentName, agentWho, QUESTION_TEXT_LIMIT, type AgentElement, type AgentRequest, type AgentWho } from "../shared/agent";
import type { AgentReadResult } from "../shared/agent-read";
import { agentQuestion, requestForAgent, requestOperation, type AgentRequests } from "../shared/agent-requests";
import { HttpError } from "../shared/http-error";
import type { AgentWorkspace, JsonValue } from "../shared/agent-command";

export const WAIT_MS = 25_000;
/** Reads of one take, when a save lost a race to another agent's wait. */
export const TAKE_TRIES = 3;

export interface RequestPorts {
  workspace: AgentWorkspace;
  /** This browser's requests of the workspace, read fresh. */
  list(): Promise<AgentRequest[]>;
  /** Keeps one request when `accept` sees the stored copy in the writing transaction, and (with `owner`)
   * that owner generation still holds the workspace unpaused in the same transaction. */
  save(request: AgentRequest, accept: (stored: AgentRequest | undefined) => boolean, owner?: number): Promise<boolean>;
  now?: () => number;
  clock?: { setTimeout(callback: () => void, delay: number): unknown; clearTimeout(timer: unknown): void };
  /** ask_user's element: `element` (get_page's id) on `page` (the page shown when none), with the repository's name; or why not. */
  place?(page: string | undefined, element: string): Promise<{ element: AgentElement; repository: string } | { refuse: string }>;
  /** A new id for an agent's question. */
  newId?: () => string;
}

/** A change made on a copy read before an await is kept only over that same stored copy: a reply,
 * answer or dismissal committed meanwhile wins, and this change is dropped (never overwrites it). */
const unchangedSince = (read: AgentRequest, current: () => boolean = () => true) => {
  const seen = JSON.stringify(read);
  // Checked inside the writing transaction: the connection (or the user's tab) must still hold then.
  return (stored: AgentRequest | undefined) => current() && Boolean(stored && stored.state !== "dismissed" && JSON.stringify(stored) === seen);
};

/** The user's answer or follow-up from a request's card (the hub's rule), kept only over the copy it was made from:
 * an answer from another tab meanwhile is never overwritten. */
export function answerRequest(list: AgentRequest[], id: string, text: string, now = Date.now()) {
  const read = structuredClone(list.find(request => request.id === id));
  const { result } = requestOperation(list, { type: "answer", id, text, now }) as { result: AgentRequest };
  return { request: result, accept: unchangedSince(read!) };
}
const ok = (value: unknown): AgentReadResult => ({ ok: true, value: JSON.parse(JSON.stringify(value)) as { [key: string]: JsonValue } });

/** The tab's side of wait_for_requests, reply_to_request and get_selection(request). */
export function createRequestTools(ports: RequestPorts) {
  const now = ports.now ?? Date.now;
  const clock = ports.clock ?? { setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay), clearTimeout: (timer: unknown) => clearTimeout(timer as number) };
  const waiters = new Set<() => void>();
  // Bumped by every notify: a wake that came while a wait was still reading is not lost.
  let version = 0;
  const scope = { repoId: ports.workspace.repoId, branch: ports.workspace.branch };
  // The questions an ask_user call waits on now: a watchdog's take leaves their answers to it.
  const asking = new Map<string, number>();
  /** Takes this grant's requests. A save that loses a race (another agent's wait took the same
   * request at the same wake) reads again, at most TAKE_TRIES times, so each grant still gets it. */
  async function take(grantId: string, all: boolean, current: () => boolean, owner?: number, by?: AgentWho) {
    const taken: ReturnType<typeof requestForAgent>[] = [], ids = new Set<string>();
    // When a hold for another connection's agent ends, the earliest (none: no request held from this one).
    let heldUntil: number | undefined;
    for (let attempt = 0; attempt < TAKE_TRIES; attempt++) {
      const list = await ports.list();
      const read = new Map(list.map(request => [request.id, structuredClone(request)]));
      const { result } = requestOperation(list, { type: "take-requests", grantId, all, ...(by ? { by } : {}), now: now(), except: new Set(asking.keys()), ...scope }) as
        { result: { requests: AgentRequest[]; heldUntil?: number } };
      heldUntil = result.heldUntil;
      let lost = false;
      for (const request of result.requests) {
        if (ids.has(request.id)) continue;
        // A connection gone stale (turned off, lost, taken over) marks nothing delivered.
        if (!current()) return { taken, heldUntil };
        // One changed since the read (replied, answered, dismissed, or taken by another agent) is
        // looked at again; one that no longer qualifies is not handed out.
        if (await ports.save(request, unchangedSince(read.get(request.id)!, current), owner)) { ids.add(request.id); taken.push(requestForAgent(request)); }
        else lost = true;
      }
      if (!lost) break;
    }
    return { taken, heldUntil };
  }
  /** Ends at a wake (a request arrived or changed) or after `ms`. */
  function hold(ms: number, signal?: AbortSignal) {
    return new Promise<void>(resolve => {
      const done = () => { waiters.delete(done); clock.clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
      const timer = clock.setTimeout(done, ms);
      waiters.add(done);
      signal?.addEventListener("abort", done, { once: true });
      if (signal?.aborted) done();
    });
  }
  async function wait(command: AgentRequests, current: () => boolean, deadline: number, owner?: number, signal?: AbortSignal) {
    const all = command.args.all === true, started = now();
    const seen = version;
    const first = await take(command.grantId, all, current, owner, agentWho(command));
    let requests = first.taken;
    const wanted = typeof command.waitMs === "number" && Number.isFinite(command.waitMs) ? Math.min(WAIT_MS, command.waitMs) : WAIT_MS;
    // The site owner's switch (waitMs 0) answers at once.
    if (requests.length || !current() || wanted <= 0) return ok({ requests });
    // A request during the read: look again at once instead of holding.
    // A request held for another connection's agent: this wait looks again as the hold ends.
    const ms = version !== seen ? 0 : Math.min(deadline, started + wanted, first.heldUntil ?? Infinity) - now();
    if (ms > 0) await hold(ms, signal);
    // The relay gave up or the socket went: take nothing it could not deliver.
    if (current()) requests = (await take(command.grantId, all, current, owner, agentWho(command))).taken;
    return ok({ requests });
  }
  async function reply(command: AgentRequests, current: () => boolean, owner?: number) {
    const { request: id, status, message, requestIds } = command.args;
    const list = await ports.list(), read = structuredClone(list.find(request => request.id === id));
    // Who asks a question is drawn on the request's element while it waits (ticket am-11): its name, else "Agent".
    const by = { grant: command.grantId, name: agentName(command.agent) };
    const { result } = requestOperation(list, { type: "reply", id, status, message, requestIds, by, ...scope }) as { result: AgentRequest };
    if (!current()) throw new HttpError(409, "The editor stopped receiving for this connection. Nothing was changed; reply again when it is on.");
    if (!await ports.save(result, unchangedSince(read!, current), owner))
      throw new HttpError(409, "The request changed meanwhile (the user answered or dismissed it). Read it again with get_selection before replying.");
    return ok({ id: result.id, state: result.state });
  }
  /** Who reads it by its id is on it (after a take), and has read the user's latest. A save that loses a race
   * (another agent read or took it at once) reads again, at most TAKE_TRIES times, as a take does; still lost, or
   * the connection gone stale, nothing is kept, and a reply to a follow-up asks this agent to read it again. */
  async function find(command: AgentRequests, current: () => boolean, owner?: number) {
    let result!: AgentRequest;
    for (let attempt = 0; attempt < TAKE_TRIES; attempt++) {
      const list = await ports.list(), read = structuredClone(list.find(request => request.id === command.args.request));
      const outcome = requestOperation(list, { type: "request", id: command.args.request, by: agentWho(command), ...scope }) as
        { changed: boolean; result: AgentRequest };
      result = outcome.result;
      if (!outcome.changed || !current() || await ports.save(result, unchangedSince(read!, current), owner)) break;
    }
    return ok(requestForAgent(result));
  }
  /**
   * ask_user: a new question pinned on its element, or (with `request`) one asked before; held until the user's
   * answer arrives here or the wait ends. Answered, the asking agent takes it (as a take does) and gets the answer.
   */
  async function ask(command: AgentRequests, current: () => boolean, deadline: number, owner?: number, signal?: AbortSignal) {
    const { request: asked, question, page, element } = command.args, by = agentWho(command);
    let id = asked;
    if (!id) {
      const text = String(question ?? "").trim();
      if (!text || text.length > QUESTION_TEXT_LIMIT) throw new HttpError(400, `A question takes 1 to ${QUESTION_TEXT_LIMIT} characters.`);
      const placed = await ports.place?.(page, String(element ?? "")) ?? { refuse: "The editor cannot place a question here. Refresh the editor." };
      if ("refuse" in placed) throw new HttpError(409, placed.refuse);
      if (!current()) throw new HttpError(409, "The editor stopped receiving for this connection. Nothing was asked; ask again when it is on.");
      const request = agentQuestion({ id: ports.newId?.() ?? `req-${crypto.randomUUID()}`, question: text, element: placed.element,
        repoId: scope.repoId, repository: placed.repository, branch: scope.branch, by, now: now() });
      if (!await ports.save(request, stored => current() && stored === undefined, owner))
        throw new HttpError(409, "The editor could not keep your question. Nothing was asked; ask again.");
      id = request.id;
    }
    asking.set(id, (asking.get(id) ?? 0) + 1);
    try {
      const wanted = typeof command.waitMs === "number" && Number.isFinite(command.waitMs) ? Math.min(WAIT_MS, command.waitMs) : WAIT_MS;
      const end = Math.min(deadline, now() + Math.max(0, wanted));
      for (let lost = 0; lost < TAKE_TRIES;) {
        const seen = version;
        const list = await ports.list(), read = structuredClone(list.find(request => request.id === id));
        const outcome = requestOperation(list, { type: "asked", id, grantId: command.grantId, by, now: now(), ...scope }) as
          { changed: boolean; result: { request: AgentRequest; answer?: string } };
        const { request, answer } = outcome.result;
        if (answer !== undefined) {
          // Lost to another write meanwhile (a dismissal, another of its waits): read it again.
          if (!current()) break;
          if (await ports.save(request, unchangedSince(read!, current), owner)) return ok({ request: requestForAgent(request), answer });
          lost++;
          continue;
        }
        // Its time or the connection ended (this read was the last look); a wake during the read looks again at once.
        const ms = end - now();
        if (ms <= 0 || !current()) break;
        if (version !== seen) continue;
        await hold(ms, signal);
      }
      return ok({ request: id, state: "question", answer: null });
    } finally {
      const left = (asking.get(id) ?? 1) - 1;
      if (left > 0) asking.set(id, left); else asking.delete(id);
    }
  }
  return {
    /** `owner`: the receiving tab's ownership generation, proved again in every write's transaction. */
    async run(command: AgentRequests, current: () => boolean, deadline: number, owner?: number, signal?: AbortSignal): Promise<AgentReadResult> {
      const live = () => !signal?.aborted && current();
      try {
        signal?.throwIfAborted();
        if (command.tool === "wait_for_requests") return await wait(command, live, deadline, owner, signal);
        if (command.tool === "reply_to_request") return await reply(command, live, owner);
        if (command.tool === "get_request") return await find(command, live, owner);
        if (command.tool === "ask_user") return await ask(command, live, deadline, owner, signal);
        return { ok: false, message: "Unknown request tool." };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "The editor could not read its requests." };
      }
    },
    /** A request arrived or changed here, or agents were turned off: every held wait looks again. */
    notify() { version++; for (const wake of [...waiters]) wake(); },
    get holding() { return waiters.size; },
  };
}
