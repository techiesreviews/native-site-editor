// Agent requests: what the user asks agents to do about an element, from
// the edit bar's Ask agent (src/components/agent-menu.ts). Each session's hub
// keeps them under "requests" (worker/agent-store.ts), apart from the hub
// itself; agents fetch them with wait_for_requests and answer them with
// reply_to_request (worker/mcp.ts), and the tab shows each one as a pin on
// its element until the user dismisses it. An agent's question the user
// answers from the pin: the answer joins the request's thread and the
// request waits for agents again, returned once more to every connection.
// A request belongs to the repository it was asked in: a connection sees
// only the ones of the repository the tab shows.
import {
  OPEN_REQUESTS_LIMIT,
  REQUEST_TEXT_LIMIT,
  THREAD_LIMIT,
  THREAD_TEXT_LIMIT,
  requestThread,
  type AgentRequest,
  type AgentRequestMessage,
} from "../shared/agent";
import { HttpError } from "./github";

// Requests kept in all, answered and dismissed ones included; the oldest
// closed ones go first.
const KEPT = 100;
const RETURNED_TO = 20;
export const requestIdPattern = /^req-[\w-]{1,64}$/;


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
  const { returnedTo: _returned, repoId: _repoId, ...rest } = request;
  return { ...rest, thread: requestThread(request) };
}

/**
 * One request action on the hub's list, inside the Durable Object's
 * concurrency block. Returns the list to store (unchanged when nothing
 * changed) and the answer.
 */
export function requestOperation(list: AgentRequest[], action: any): { list: AgentRequest[]; changed: boolean; result: unknown } {
  const type = action?.type;
  if (type === "ask") {
    const request = action.request as AgentRequest;
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
    for (const request of list) {
      if (request.repoId !== action.repoId || !waiting(request)) continue;
      if (!action.all && request.returnedTo?.includes(grantId)) continue;
      request.state = "seen";
      request.seenAt ??= now;
      if (!request.returnedTo?.includes(grantId)) request.returnedTo = [...(request.returnedTo ?? []), grantId].slice(-RETURNED_TO);
      taken.push(request);
    }
    return { list, changed: taken.length > 0, result: { requests: taken } };
  }
  const request = list.find((item) => item.id === action?.id);
  if (type === "request") {
    if (!request || request.repoId !== action.repoId) throw new HttpError(404, "No such request in the site the editor shows.");
    return { list, changed: false, result: request };
  }
  if (type === "reply") {
    if (!request || request.repoId !== action.repoId) throw new HttpError(404, "No such request in the site the editor shows.");
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

export const isRequestAction = (type: unknown) =>
  type === "ask" || type === "take-requests" || type === "request" || type === "reply" || type === "answer" || type === "dismiss";
