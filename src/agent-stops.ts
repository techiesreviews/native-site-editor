// The agents the user stopped in the MCP menu (ticket am-12), kept in this browser so every tab (the
// one receiving agents' calls included) and a reload hold them. An agent is its connection and name; a
// connection belongs to one site and branch, so the list needs no workspace. Disconnect MCP ends the
// connections themselves; the oldest entries make room past STOPS_LIMIT.

import type { AgentWho } from "../shared/agent";

export const STOPPED_AGENTS_KEY = "native-site-editor:agents-stopped";
const STOPS_LIMIT = 100;

const same = (a: AgentWho, b: AgentWho) => a.grant === b.grant && a.name === b.name;
function stored(): AgentWho[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(STOPPED_AGENTS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((who): who is AgentWho => typeof who?.grant === "string" && typeof who?.name === "string") : [];
  } catch { return []; }
}
// Stops made in this tab: they hold here even when the browser refuses to store them.
const here: AgentWho[] = [];

/** This browser's stopped agents, read fresh each time (another tab may have stopped one). */
export const agentStops = {
  has: (who: AgentWho) => here.some(each => same(each, who)) || stored().some(each => same(each, who)),
  add(who: AgentWho) {
    here.push({ grant: who.grant, name: who.name });
    const list = [...stored().filter(each => !same(each, who)), { grant: who.grant, name: who.name }];
    try { localStorage.setItem(STOPPED_AGENTS_KEY, JSON.stringify(list.slice(-STOPS_LIMIT))); }
    catch { /* Storage full or blocked: the stop holds in this tab until a reload. */ }
  },
};
