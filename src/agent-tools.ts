import type { AgentCommand } from "../shared/agent";
import type { AgentRead, AgentReadResult } from "../shared/agent-read";
import type { AgentReadFiles } from "./agent-tools-read";

/** Cancellation stays local; never serialized with command identity or receipts. */
export const agentCommandSignals = new WeakMap<AgentCommand, AbortSignal>();
/** The files a command was read from (ticket 23): the editor writes it there if that site is no longer shown. */
export const agentCommandFiles = new WeakMap<AgentCommand, AgentReadFiles>();

export type AgentToolExecutor = (args: AgentRead["args"], signal?: AbortSignal) => Promise<AgentReadResult>;

/** Browser-local tools. Transports and future local adapters use the same registry. */
export function createAgentTools<Args = AgentRead["args"]>(executors: Record<string, (args: Args, signal?: AbortSignal) => Promise<AgentReadResult>>) {
  return {
    async run(name: string, args: Args, signal?: AbortSignal): Promise<AgentReadResult> {
      signal?.throwIfAborted();
      if (!Object.hasOwn(executors, name)) return { ok: false, message: `Unknown browser tool: ${name}.` };
      if (!signal) return executors[name](args, signal);
      let abort = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      });
      try { return await Promise.race([executors[name](args, signal), cancelled]); }
      finally { signal.removeEventListener("abort", abort); }
    },
  };
}
