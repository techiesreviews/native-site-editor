// The agents the user stopped in the MCP menu (ticket am-12), kept in this browser so every tab (the
// one receiving agents' calls included) and a reload hold them. An agent is its connection and name; a
// connection belongs to one site and branch, so the list needs no workspace. Disconnect MCP ends the
// connections themselves; the oldest entries make room past STOPS_LIMIT. A stop the browser refuses to
// store holds only in the tab that made it: when another tab receives the agent's calls, they go on.

import type { AgentWho } from "../shared/agent";

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
  /** Another tab stopped an agent (its `storage` event, heard in src/main.ts): the list is read again. */
  reread() { read = undefined; },
};
