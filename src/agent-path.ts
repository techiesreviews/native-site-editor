// The agent command path, loaded when agents are first used (src/agent-host.ts): an agent's commands,
// run through the editor's own actions (src/agent-site-host.ts), and the agent menu's options, with the
// context agents are shown and the files they read (src/agent-menu-host.ts).

import { agentMenuOptions, type AgentMenuPorts } from "./agent-menu-host";
import { createAgentCommands, type AgentCommandPorts } from "./agent-site-host";

export type AgentPathPorts = AgentCommandPorts & AgentMenuPorts;

/** What the editor asks of the path: the commands' entry points and the menu's options for each mount. */
export interface AgentPath {
  commands: Pick<ReturnType<typeof createAgentCommands>, "apply" | "reload" | "undo" | "undoable" | "undoLatest" | "latestUndoable" | "acting">;
  menu: ReturnType<typeof agentMenuOptions>;
}

export function createAgentPath(ports: AgentPathPorts): AgentPath {
  const commands = createAgentCommands(ports);
  return { commands, menu: agentMenuOptions(ports, commands) };
}
