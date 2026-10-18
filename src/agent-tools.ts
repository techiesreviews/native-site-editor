import type { AgentRead, AgentReadResult } from "../shared/agent-read";

export type AgentToolExecutor = (args: AgentRead["args"]) => Promise<AgentReadResult>;

/** Browser-local tools. Transports and future local adapters use the same registry. */
export function createAgentTools<Args = AgentRead["args"]>(executors: Record<string, (args: Args) => Promise<AgentReadResult>>) {
  return {
    async run(name: string, args: Args): Promise<AgentReadResult> {
      if (!Object.hasOwn(executors, name)) return { ok: false, message: `Unknown browser tool: ${name}.` };
      return executors[name](args);
    },
  };
}
