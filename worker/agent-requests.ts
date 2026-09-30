// Agent requests: what the user asks agents to do about an element, from
// the edit bar's Ask agent (src/components/agent-menu.ts). Each session's hub
// keeps them under "requests" (worker/agent-store.ts), apart from the hub
// itself; agents fetch them with wait_for_requests and answer them with
// reply_to_request (worker/mcp.ts), and the tab shows each one as a pin on
// its element until the user dismisses it. A request belongs to the
// repository it was asked in: a connection sees only the ones of the
// repository the tab shows.
import { z } from "zod";
import {
  OPEN_REQUESTS_LIMIT,
  REQUEST_HTML_LIMIT,
  REQUEST_TEXT_LIMIT,
  type AgentRequest,
} from "../shared/agent";
import { elementSchema } from "./agent-context";
import { HttpError } from "./github";

// Requests kept in all, answered and dismissed ones included; the oldest
// closed ones go first.
const KEPT = 100;
const RETURNED_TO = 20;
export const requestIdPattern = /^req-[\w-]{1,64}$/;

const askSchema = z.object({
  repository: z.object({ id: z.number().int().positive(), fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/) }),
  text: z.string().trim().min(1).max(REQUEST_TEXT_LIMIT),
  element: elementSchema,
});

/** A request the tab sends, checked; the hub gives it its id and time. */
export function validateAsk(value: unknown): AgentRequest {
  const result = askSchema.safeParse(value);
  if (!result.success)
    throw new HttpError(400, `A request needs text (up to ${REQUEST_TEXT_LIMIT} characters) and the element it is about.`);
  const { repository, text, element } = result.data;
  const html = element.html && element.html.length > REQUEST_HTML_LIMIT ? element.html.slice(0, REQUEST_HTML_LIMIT) : element.html;
  return {
    id: `req-${crypto.randomUUID()}`,
    text,
    createdAt: Date.now(),
    repoId: repository.id,
    repository: repository.fullName,
    state: "open",
    element: { ...element, ...(html !== undefined ? { html } : {}), ...(html !== element.html ? { htmlClipped: true } : {}) },
  };
}

const waiting = (request: AgentRequest) => request.state === "open" || request.state === "seen";

/** A request as the tab polls it: without its element's source. */
export function requestSummary(request: AgentRequest) {
  const { html: _html, htmlClipped: _clipped, lines: _lines, ...element } = request.element;
  const { returnedTo: _returned, ...rest } = request;
  return { ...rest, element };
}

/** A request as an agent reads it. */
export function requestForAgent(request: AgentRequest) {
  const { returnedTo: _returned, repoId: _repoId, ...rest } = request;
  return rest;
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
    if (action.status !== "done" && action.status !== "answered") throw new HttpError(400, "Reply with done or answered.");
    request.state = action.status;
    request.seenAt ??= Date.now();
    const requestIds = Array.isArray(action.requestIds) ? action.requestIds.filter((id: unknown) => typeof id === "string").slice(0, 20) : [];
    request.reply = {
      status: action.status,
      message: String(action.message ?? "").slice(0, REQUEST_TEXT_LIMIT),
      at: Date.now(),
      ...(requestIds.length ? { requestIds } : {}),
    };
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
  type === "ask" || type === "take-requests" || type === "request" || type === "reply" || type === "dismiss";
