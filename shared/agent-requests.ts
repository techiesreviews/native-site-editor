// Agent requests: what the user asks agents to do about an element, from
// the edit bar's Ask agent (src/components/agent-menu.ts). With the live relay
// the receiving browser tab keeps them (src/agent-records.ts conversations) and
// answers the request tools over the socket (src/agent-watch.ts). Agents
// fetch them with wait_for_requests and answer them with
// reply_to_request (worker/mcp.ts), and the tab shows each one as a pin on
// its element until the user dismisses it. An agent's question the user
// answers from the pin: the answer joins the request's thread and the
// request waits for agents again, returned once more to every connection.
// A request belongs to the repository and branch it was asked on: a
// connection sees only the ones of the workspace it is pinned to.
const inWorkspace = (request: AgentRequest, action: Workspace) =>
  request.repoId === action.repoId && request.branch !== undefined && request.branch === action.branch;
import { agentToolsOn, type AgentToolOn } from "./agent-tool-table";
import {
  OPEN_REQUESTS_LIMIT,
  REQUEST_TEXT_LIMIT,
  requestThread,
  type AgentRequest,
  type AgentRequestMessage,
} from "./agent";
import { HttpError } from "./http-error";

/** The messages and text a request's thread keeps (here, out of the boot bundle's shared/agent.ts). */
export const THREAD_LIMIT = 20;
export const THREAD_TEXT_LIMIT = 8000;

// Requests kept in all, answered and dismissed ones included; the oldest
// closed ones go first.
const KEPT = 100;
const RETURNED_TO = 20;
export const requestIdPattern = /^req-[\w-]{1,64}$/;

/** The workspace a connection's request action is pinned to. */
interface Workspace { repoId?: number; branch?: string }
/** What the tab does to its requests: the user asks, answers or dismisses; an agent takes, reads or replies. */
type RequestAction =
  | { type: "ask"; request: AgentRequest }
  | { type: "take-requests"; grantId?: string; all?: boolean } & Workspace
  | { type: "request"; id?: string } & Workspace
  | { type: "reply"; id?: string; status?: string; message?: string; requestIds?: unknown } & Workspace
  | { type: "answer"; id?: string; text?: string }
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

/** A request as the tab polls it: without its element's source, with its thread. */
export function requestSummary(request: AgentRequest) {
  const { html: _html, htmlClipped: _clipped, lines: _lines, ...element } = request.element;
  const { returnedTo: _returned, ...rest } = request;
  return { ...rest, element, thread: requestThread(request) };
}

/** A request as an agent reads it: with its whole thread, the user's answers included. */
export function requestForAgent(request: AgentRequest) {
  const { returnedTo: _returned, repoId: _repoId, branch: _branch, ...rest } = request;
  return { ...rest, thread: requestThread(request) };
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
    // yet (all of them with `all`), oldest first; each is seen from now.
    const grantId = String(action.grantId ?? "");
    const now = Date.now();
    const taken: AgentRequest[] = [];
    // IndexedDB returns request ID order, so delivery must restore creation order.
    for (const request of [...list].sort((a, b) => a.createdAt - b.createdAt)) {
      if (!inWorkspace(request, action) || !waiting(request)) continue;
      if (!action.all && request.returnedTo?.includes(grantId)) continue;
      request.state = "seen";
      request.seenAt ??= now;
      if (!request.returnedTo?.includes(grantId)) request.returnedTo = [...(request.returnedTo ?? []), grantId].slice(-RETURNED_TO);
      taken.push(request);
    }
    return { list, changed: taken.length > 0, result: { requests: taken } };
  }
  const request = list.find((item) => item.id === action.id);
  if (type === "request") {
    if (!request || !inWorkspace(request, action)) throw new HttpError(404, "No such request in the site and branch this connection works on.");
    return { list, changed: false, result: request };
  }
  if (type === "reply") {
    if (!request || !inWorkspace(request, action)) throw new HttpError(404, "No such request in the site and branch this connection works on.");
    if (request.state === "dismissed") throw new HttpError(409, "The user dismissed this request.");
    if (action.status !== "done" && action.status !== "answered" && action.status !== "question")
      throw new HttpError(400, "Reply with done, answered or question.");
    const now = Date.now();
    request.state = action.status;
    request.seenAt ??= now;
    const requestIds = Array.isArray(action.requestIds) ? action.requestIds.filter((id: unknown) => typeof id === "string").slice(0, 20) : [];
    request.reply = {
      status: action.status,
      message: String(action.message ?? "").slice(0, REQUEST_TEXT_LIMIT),
      at: now,
      ...(requestIds.length ? { requestIds } : {}),
    };
    addMessage(request, { from: "agent", text: request.reply.message, at: now, status: action.status, ...(requestIds.length ? { requestIds } : {}) });
    return { list, changed: true, result: request };
  }
  if (type === "answer") {
    // The user's answer to a reply: the request waits for agents again, and
    // every connection gets it once more, thread and all.
    if (!request) throw new HttpError(404, "No such request.");
    if (request.state === "dismissed") throw new HttpError(409, "This request was dismissed.");
    if (!request.reply) throw new HttpError(409, "No agent has replied to this request yet.");
    if (!waiting(request) && list.filter(waiting).length >= OPEN_REQUESTS_LIMIT)
      throw new HttpError(429, `${OPEN_REQUESTS_LIMIT} requests are waiting for an agent already. Dismiss some first.`);
    addMessage(request, { from: "user", text: String(action.text ?? "").slice(0, REQUEST_TEXT_LIMIT), at: Date.now() });
    request.state = "open";
    delete request.reply;
    delete request.seenAt;
    delete request.returnedTo;
    return { list, changed: true, result: request };
  }
  if (type === "dismiss") {
    if (!request) return { list, changed: false, result: { ok: true } };
    request.state = "dismissed";
    return { list, changed: true, result: { ok: true } };
  }
  throw new HttpError(400, "Invalid agent action.");
}

/** The request tools as one relay command to the receiving tab. `waitMs` (wait only) is
 * how long the agent will wait (0 answers at once); the tab holds it until a request arrives. */
export type AgentRequestTool = AgentToolOn<"requests">;
export interface AgentRequests {
  operation: "requests";
  tool: AgentRequestTool;
  args: { all?: boolean; request?: string; status?: string; message?: string; requestIds?: string[] };
  grantId: string;
  generation?: number;
  waitMs?: number;
}
export const requestTools: readonly AgentRequestTool[] = agentToolsOn("requests");
