// The agents the user stopped in the MCP menu (ticket am-12), kept in this browser so every tab (the
// one receiving agents' calls included) and a reload hold them. An agent is its connection and name; a
// connection belongs to one site and branch, so the list needs no workspace. A stop lasts until Disconnect
// MCP ends its connection (`forget`); the oldest entries make room past STOPS_LIMIT. A stop the browser
// refuses to store holds only in the tab that made it: when another tab receives the agent's calls, they go on.

import { AGENT_STOPPED, type AgentWho } from "../shared/agent";
import type { AgentReadResult } from "../shared/agent-read";

export const STOPPED_AGENTS_KEY = "native-site-editor:agents-stopped";
const STOPS_LIMIT = 100;

const keyOf = (who: AgentWho) => JSON.stringify([who.grant, who.name]);
function stored(): AgentWho[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(STOPPED_AGENTS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((who): who is AgentWho => typeof who?.grant === "string" && typeof who?.name === "string") : [];
  } catch { return []; }
}
// Stops made in this tab: they hold here even when the browser refuses to store them.
const here = new Set<string>();
// The stored list as last read: read again after this tab's own stop and on another tab's (`reread`).
let read: Set<string> | undefined;

/** This browser's stopped agents. */
export const agentStops = {
  has: (who: AgentWho) => here.has(keyOf(who)) || (read ??= new Set(stored().map(keyOf))).has(keyOf(who)),
  add(who: AgentWho) {
    here.add(keyOf(who));
    const list = [...stored().filter(each => keyOf(each) !== keyOf(who)), { grant: who.grant, name: who.name }];
    try { localStorage.setItem(STOPPED_AGENTS_KEY, JSON.stringify(list.slice(-STOPS_LIMIT))); }
    catch { /* Storage full or blocked: the stop holds in this tab until a reload. */ }
    read = undefined;
  },
  /** Disconnect MCP ended the connections `grants`: their agents' stops go, for this browser's tabs too. */
  forget(grants: readonly string[]) {
    if (!grants.length) return;
    const ended = new Set(grants);
    for (const key of here) if (ended.has((JSON.parse(key) as [string, string])[0])) here.delete(key);
    const list = stored(), kept = list.filter(each => !ended.has(each.grant));
    if (kept.length !== list.length) {
      try { localStorage.setItem(STOPPED_AGENTS_KEY, JSON.stringify(kept)); } catch { /* Storage blocked: the connections are gone anyway. */ }
    }
    read = undefined;
  },
  /** Another tab stopped an agent (its `storage` event, heard in src/main.ts): the list is read again. */
  reread() { read = undefined; },
};

/**
 * What a held wait_for_requests of an agent stopped meanwhile answers: the stop's refusal, unless the wait was
 * already handed requests (marked delivered to it): those come back, so none is lost. So does an answer an
 * ask_user call took (ticket am-15).
 */
export function afterStoppedWait(result: AgentReadResult): AgentReadResult {
  const value = result.ok ? result.value : undefined;
  const handed = value && typeof value === "object" && !Array.isArray(value) && (Array.isArray(value.requests) && value.requests.length > 0 || typeof value.answer === "string");
  return handed ? result : { ok: false, message: AGENT_STOPPED };
}
