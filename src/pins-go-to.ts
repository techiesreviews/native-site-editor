// "Pins go to" (ticket am-12): the agent the helper starts for a site's pins, remembered per site (account and
// repository, every branch) in this browser; Claude Code until the user picks another. The helper (ticket am-16)
// reads it through `pinAgent`.

import { PIN_AGENTS, type PinAgent } from "../shared/agent";
import type { AgentWorkspace } from "../shared/agent-command";

const pinAgentKey = (workspace: Pick<AgentWorkspace, "account" | "repoId">) =>
  `native-site-editor:pins-go-to:${JSON.stringify([workspace.account.toLowerCase(), workspace.repoId])}`;

/** The site's choice: an unknown or unreadable one counts as the default. */
export function pinAgent(workspace: Pick<AgentWorkspace, "account" | "repoId">): PinAgent {
  try {
    const kept = localStorage.getItem(pinAgentKey(workspace));
    return PIN_AGENTS.find(name => name === kept) ?? PIN_AGENTS[0];
  } catch { return PIN_AGENTS[0]; }
}
/** Keeps `agent` as the site's choice; storage refused, the menu shows it until a reload. */
export function choosePinAgent(workspace: Pick<AgentWorkspace, "account" | "repoId">, agent: string) {
  try { localStorage.setItem(pinAgentKey(workspace), agent); } catch { /* Storage blocked: nothing kept. */ }
}
