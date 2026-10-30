// Agent requests: what the user asks agents to do about an element, from
// the edit bar's Ask agent (src/components/agent-menu.ts). With the live relay
// the receiving browser tab keeps them (src/agent-records.ts conversations) and
// answers the request tools over the socket (src/agent-watch.ts). Agents
// fetch them with wait_for_requests and answer them with
// reply_to_request (worker/mcp.ts), and the tab shows each one as a pin on
// its element until the user dismisses it. The user adds to any request
// from its pin (ticket am-13): an answer to an agent's question, or a
// follow-up on one waiting, being worked on or done. It joins the request's
// thread and the request waits again, returned first to the agent on it
// (the first to take it, then whoever replied), and to every connection once
// FOLLOW_UP_HOLD_MS pass without that agent taking it.
// An agent may ask first (ask_user, ticket am-15): its question is a request
// of its own on an element, its thread opening with the question, which the
// pin shows orange; Lex's answer goes back to the asking call, which waits
// for it, and the agent then answers the pin as any other.
// A request belongs to the repository and branch it was asked on: a
// connection sees only the ones of the workspace it is pinned to.
const inWorkspace = (request: AgentRequest, action: Workspace) =>
  request.repoId === action.repoId && request.branch !== undefined && request.branch === action.branch;
import {
  OPEN_REQUESTS_LIMIT,
  REQUEST_TEXT_LIMIT,
  requestThread,
  type AgentRequest,
  type AgentRequestMessage,
  type AgentWho,
} from "./agent";
import { agentToolsOn, type AgentToolOn } from "./agent-tool-table";
import { HttpError } from "./http-error";

/** The messages and text a request's thread keeps (here, out of the boot bundle's shared/agent.ts). */
export const THREAD_LIMIT = 20;
export const THREAD_TEXT_LIMIT = 8000;

// Requests kept in all, answered and dismissed ones included; the oldest
// closed ones go first.
const KEPT = 100;
const RETURNED_TO = 20;
/** How long a reopened request waits for the agent on it before any connection gets it. */
export const FOLLOW_UP_HOLD_MS = 60_000;
export const requestIdPattern = /^req-[\w-]{1,64}$/;

/** The workspace a connection's request action is pinned to. */
interface Workspace { repoId?: number; branch?: string }
/** What the tab does to its requests: the user asks, answers or dismisses; an agent takes, reads or replies. */
type RequestAction =
  | { type: "ask"; request: AgentRequest }
  | { type: "take-requests"; grantId?: string; all?: boolean; by?: AgentWho; now?: number; except?: ReadonlySet<string> } & Workspace
  | { type: "request"; id?: string; by?: AgentWho } & Workspace
  | { type: "reply"; id?: string; status?: string; message?: string; requestIds?: unknown; by?: AgentWho } & Workspace
  | { type: "answer"; id?: string; text?: string; now?: number }
  | { type: "asked"; id?: string; grantId?: string; by?: AgentWho; now?: number } & Workspace
  | { type: "dismiss"; id?: string };

// A message added to a request's thread, which keeps its first message (what
// was asked) and the latest ones, within THREAD_LIMIT and THREAD_TEXT_LIMIT.
function addMessage(request: AgentRequest, message: AgentRequestMessage) {
  const [first, ...rest] = [...requestThread(request), message];
  const kept: AgentRequestMessage[] = [];
  let size = first.text.length;
  for (let at = rest.length - 1; at >= 0 && kept.length < THREAD_LIMIT - 1; at--) {
    size += rest[at].text.length;
    if (size > THREAD_TEXT_LIMIT && kept.length) break;
    kept.unshift(rest[at]);
  }
  request.thread = [first, ...kept];
}

const waiting = (request: AgentRequest) => request.state === "open" || request.state === "seen";
const whoKey = (who: AgentWho | undefined) => JSON.stringify([who?.grant ?? "", who?.name ?? ""]);
// `who` has read the user's latest message (by a take, or by the request's id).
function read(request: AgentRequest, who: AgentWho | undefined) {
  if (request.readBy && !request.readBy.includes(whoKey(who))) request.readBy = [...request.readBy, whoKey(who)].slice(-RETURNED_TO);
}
/** A reply from an agent that has not read the user's latest message: nothing is recorded. */
const FOLLOWED_UP =
  "The user added to this request since you last read it (their message is last in its thread). Nothing was recorded: read it with get_selection (request) and reply to all of it.";
// Reopened for another connection's agent, which has it to itself a while yet.
const heldFromOthers = (request: AgentRequest, grantId: string, now: number) =>
  request.heldUntil !== undefined && now < request.heldUntil && request.agent !== undefined && request.agent.grant !== grantId;

/** A request as the tab polls it: without its element's source, with its thread. */
export function requestSummary(request: AgentRequest) {
  const { html: _html, htmlClipped: _clipped, lines: _lines, ...element } = request.element;
  const { returnedTo: _returned, ...rest } = request;
  return { ...rest, element, thread: requestThread(request) };
}

/** A request as an agent reads it: with its whole thread, the user's answers included. */
export function requestForAgent(request: AgentRequest) {
  const { returnedTo: _returned, repoId: _repoId, branch: _branch, agent: _agent, agentTook: _took, heldUntil: _held, readBy: _readBy, ...rest } = request;
  // Who replied is the editor's (the replying agent's presence): agents read the reply alone.
  const reply = request.reply && (({ by: _by, ...told }) => told)(request.reply);
  return { ...rest, ...(reply ? { reply } : {}), thread: requestThread(request) };
}

/**
 * One request action on the browser's list. Returns the list to store
 * (unchanged when nothing changed) and the answer.
 */
export function requestOperation(list: AgentRequest[], action: RequestAction): { list: AgentRequest[]; changed: boolean; result: unknown } {
  const { type } = action;
  if (type === "ask") {
    const { request } = action;
    if (list.filter(waiting).length >= OPEN_REQUESTS_LIMIT)
      throw new HttpError(429, `${OPEN_REQUESTS_LIMIT} requests are waiting for an agent already. Dismiss some first.`);
    const next = [...list, request];
    while (next.length > KEPT) {
      const closed = next.findIndex((item) => !waiting(item));
      next.splice(closed < 0 ? 0 : closed, 1);
    }
    return { list: next, changed: true, result: request };
  }
  if (type === "take-requests") {
    // The waiting requests of this repository this connection has not had
    // yet (all of them with `all`), oldest first; each is seen from now. The
    // first to take one waiting is on it until an agent reads it by its id
    // (a watchdog takes requests for the agents that do the work), unless it
    // was reopened for this connection's agent (who keeps it).
    const grantId = String(action.grantId ?? "");
    const now = action.now ?? Date.now();
    const taken: AgentRequest[] = [];
    // The earliest end of a hold that kept one from this connection: it may take it then.
    let heldUntil: number | undefined;
    // IndexedDB returns request ID order, so delivery must restore creation order.
    for (const request of [...list].sort((a, b) => a.createdAt - b.createdAt)) {
      if (!inWorkspace(request, action) || !waiting(request)) continue;
      // An answer an agent's own ask_user waits for goes to that call, not to a watchdog.
      if (action.except?.has(request.id)) continue;
      if (!action.all && request.returnedTo?.includes(grantId)) continue;
      if (heldFromOthers(request, grantId, now)) {
        heldUntil = Math.min(heldUntil ?? Infinity, request.heldUntil!);
        continue;
      }
      if (request.state === "open" && action.by && request.agent?.grant !== grantId) {
        request.agent = action.by;
        request.agentTook = true;
      }
      read(request, action.by);
      delete request.heldUntil;
      request.state = "seen";
      request.seenAt ??= now;
      if (!request.returnedTo?.includes(grantId)) request.returnedTo = [...(request.returnedTo ?? []), grantId].slice(-RETURNED_TO);
      taken.push(request);
    }
    return { list, changed: taken.length > 0, result: { requests: taken, ...(heldUntil !== undefined ? { heldUntil } : {}) } };
  }
  const request = list.find((item) => item.id === action.id);
  if (type === "request") {
    if (!request || !inWorkspace(request, action)) throw new HttpError(404, "No such request in the site and branch this connection works on.");
    // An agent reading it by its id works on it: it is on it (the first to, after a take), and has read the user's latest.
    const was = JSON.stringify(request);
    if (action.by && request.state === "seen" && request.agentTook) {
      request.agent = action.by;
      delete request.agentTook;
    }
    read(request, action.by);
    return { list, changed: JSON.stringify(request) !== was, result: request };
  }
  if (type === "reply") {
    if (!request || !inWorkspace(request, action)) throw new HttpError(404, "No such request in the site and branch this connection works on.");
    if (request.state === "dismissed") throw new HttpError(409, "The user dismissed this request.");
    if (action.status !== "done" && action.status !== "answered" && action.status !== "question")
      throw new HttpError(400, "Reply with done, answered or question.");
    // The user added to it since this agent last read it (a follow-up while it worked, taken since by
    // another of its connection's agents, or not taken yet): a reply to what came before would close
    // it with their message unread, so the agent reads it first.
    if (request.readBy && !request.readBy.includes(whoKey(action.by))) throw new HttpError(409, FOLLOWED_UP);
    const now = Date.now();
    request.state = action.status;
    request.seenAt ??= now;
    const requestIds = Array.isArray(action.requestIds) ? action.requestIds.filter((id: unknown) => typeof id === "string").slice(0, 20) : [];
    request.reply = {
      status: action.status,
      message: String(action.message ?? "").slice(0, REQUEST_TEXT_LIMIT),
      at: now,
      ...(requestIds.length ? { requestIds } : {}),
      ...(action.by ? { by: action.by } : {}),
    };
    if (action.by) request.agent = action.by;
    delete request.agentTook;
    delete request.readBy;
    delete request.heldUntil;
    addMessage(request, {
      from: "agent", text: request.reply.message, at: now, status: action.status,
      ...(requestIds.length ? { requestIds } : {}), ...(action.by?.name ? { name: action.by.name } : {}),
    });
    return { list, changed: true, result: request };
  }
  if (type === "answer") {
    // The user's answer or follow-up, on any request not dismissed: it waits
    // again, thread and all, for the agent on it first, then for every
    // connection.
    if (!request) throw new HttpError(404, "No such request.");
    if (request.state === "dismissed") throw new HttpError(409, "This request was dismissed.");
    if (!waiting(request) && list.filter(waiting).length >= OPEN_REQUESTS_LIMIT)
      throw new HttpError(429, `${OPEN_REQUESTS_LIMIT} requests are waiting for an agent already. Dismiss some first.`);
    const now = action.now ?? Date.now();
    addMessage(request, { from: "user", text: String(action.text ?? "").slice(0, REQUEST_TEXT_LIMIT), at: now });
    request.state = "open";
    delete request.reply;
    delete request.seenAt;
    delete request.returnedTo;
    request.readBy = [];
    if (request.agent) request.heldUntil = now + FOLLOW_UP_HOLD_MS;
    return { list, changed: true, result: request };
  }
  if (type === "asked") {
    // An agent's question (ask_user): once the user's answer is last in its thread, the asking agent takes it,
    // as a take would (read, worked on by it, returned to its connection); before that, nothing changes.
    if (!request || !inWorkspace(request, action)) throw new HttpError(404, "No such request in the site and branch this connection works on.");
    if (request.state === "dismissed") throw new HttpError(409, DISMISSED_QUESTION);
    const last = requestThread(request).at(-1)!;
    if (request.state === "question" || last.from !== "user") {
      if (request.state !== "question") throw new HttpError(409, "This request waits for no answer of the user's. Read it with get_selection (request).");
      return { list, changed: false, result: { request } };
    }
    const now = action.now ?? Date.now(), grantId = String(action.grantId ?? "");
    read(request, action.by);
    if (action.by) request.agent = action.by;
    delete request.agentTook;
    delete request.heldUntil;
    request.state = "seen";
    request.seenAt ??= now;
    if (!request.returnedTo?.includes(grantId)) request.returnedTo = [...(request.returnedTo ?? []), grantId].slice(-RETURNED_TO);
    return { list, changed: true, result: { request, answer: last.text } };
  }
  if (type === "dismiss") {
    if (!request) return { list, changed: false, result: { ok: true } };
    request.state = "dismissed";
    return { list, changed: true, result: { ok: true } };
  }
  throw new HttpError(400, "Invalid agent action.");
}

/** What an agent whose question the user dismissed is told. */
export const DISMISSED_QUESTION = "The user dismissed your question without answering it. Go on without it, or stop and say why.";

/**
 * An agent's question on an element (ask_user, ticket am-15), as the tab keeps it: a request of its own, the
 * question first in its thread and as its reply, so its pin is orange with the question, the agent on it.
 */
export function agentQuestion(input: { id: string; question: string; element: AgentRequest["element"]; repoId: number; repository: string; branch: string; by: AgentWho; now: number }): AgentRequest {
  const { id, question, element, repoId, repository, branch, by, now } = input;
  return {
    id, text: question, createdAt: now, repoId, repository, branch, state: "question", element, agent: by, seenAt: now,
    reply: { status: "question", message: question, at: now, by },
    thread: [{ from: "agent", text: question, at: now, status: "question", ...(by.name ? { name: by.name } : {}) }],
  };
}

/** The request tools as one relay command to the receiving tab. `waitMs` (wait only) is
 * how long the agent will wait (0 answers at once); the tab holds it until a request arrives. */
export type AgentRequestTool = AgentToolOn<"requests">;
export interface AgentRequests {
  operation: "requests";
  tool: AgentRequestTool;
  args: { all?: boolean; request?: string; status?: string; message?: string; requestIds?: string[];
    /** ask_user: the question, and the element it is about (a page and get_page's id; the page shown when none). */
    question?: string; page?: string; element?: string };
  grantId: string;
  /** Who calls on that connection (shared/agent.ts AgentWho). */
  agent?: string;
  generation?: number;
  waitMs?: number;
}
export const requestTools: readonly AgentRequestTool[] = agentToolsOn("requests");
