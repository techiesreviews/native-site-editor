// The agents' seam at startup. Agents are opt-in, so the editor boots with only what shows that they
// exist: the menu's controller (src/controllers/agent-controller.ts), which mounts the agent menu when it
// opens, a connection is approved in this browser or this browser keeps requests for the workspace.
// The agent command path (src/agent-path.ts: an agent's commands, the context agents are shown and the
// files they read) loads with the menu, or with an Undo of an agent's change pressed before it.

import type { AgentPath, AgentPathPorts } from "./agent-path";
import { createAgentController, type AgentMenuMount, type AgentMenuPort } from "./controllers/agent-controller";
import { lazyModule } from "./lazy-module";
import type { AgentWho } from "../shared/agent";

type MenuOptions = ReturnType<AgentPath["menu"]> & AgentMenuMount;

export interface AgentHostPorts extends AgentPathPorts {
  /** The agent menu's chunk (src/lazy-loaders.ts). */
  loadAgentMenu: () => Promise<{ createAgentMenu: (options: MenuOptions) => AgentMenuPort<HTMLElement> }>;
  errorMessage: (error: unknown) => void;
  /** The command path's chunk; a test may pass its own. */
  loadPath?: () => Promise<typeof import("./agent-path")>;
}

export function createAgentHost(ports: AgentHostPorts) {
  // Kept once made: what acts and what can be undone are read without a wait once it is there.
  let path: AgentPath | undefined;
  const loadPath = lazyModule(async () => {
    const { createAgentPath } = await (ports.loadPath?.() ?? import("./agent-path"));
    return path ??= createAgentPath(ports);
  });
  // With the path there, a call runs at once: an Undo takes its workspace before any wait.
  const withPath = <T>(run: (path: AgentPath) => Promise<T>) => path ? run(path) : loadPath().then(run);

  const agentController = createAgentController<HTMLElement>({
    account: () => ports.info?.user?.login,
    host: () => document.getElementById("agent-menu") ?? undefined,
    appStore: ports.appStore,
    load: async () => {
      const [{ createAgentMenu }, made] = await Promise.all([ports.loadAgentMenu(), loadPath()]);
      return { createAgentMenu: (mount: AgentMenuMount) => createAgentMenu({ ...made.menu(), ...mount }) };
    },
    onError: ports.errorMessage,
  });

  /** The agent's commands as the editor reads them before the path loads: nothing acts, nothing can be undone yet. */
  const agentCommands = {
    acting: () => path?.commands.acting() ?? false,
    undo: (ids: readonly string[], grant: string | undefined) => withPath(made => made.commands.undo(ids, grant)),
    undoable: (ids: readonly string[] | undefined, grant: string | undefined) => path?.commands.undoable(ids, grant),
    undoLatest: (who: AgentWho, page: string, change: string) => withPath(made => made.commands.undoLatest(who, page, change)),
    latestUndoable: (who: AgentWho, page: string) => path?.commands.latestUndoable(who, page),
  };
  return { agentController, agentCommands };
}
