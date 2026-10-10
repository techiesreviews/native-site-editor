import type { AgentSiteInput, SharedContext } from "./agent-site";
import type { createConfirmDialog } from "./components/confirm-dialog";
import type { Stamp } from "./guarded-edit";

type Dialog = ReturnType<typeof createConfirmDialog>;
export interface AgentSiteHostPorts {
  stamp(): Stamp;
  load(): Promise<Pick<typeof import("./agent-site"), "buildAgentContext" | "agentAnswers">>;
  input(): AgentSiteInput | undefined;
  dialog(): Dialog | undefined;
  setDialog(dialog: Dialog | undefined): void;
}

/** Agent waits belong to the repository they began on; the host supplies live inputs after loading. */
export function createAgentSiteHost(ports: AgentSiteHostPorts) {
  async function context(): Promise<SharedContext | undefined> {
    const stamp = ports.stamp();
    const { buildAgentContext } = await ports.load();
    if (!stamp.holds()) return undefined;
    const input = ports.input();
    if (!input) return undefined;
    const context = await buildAgentContext(input);
    return stamp.holds() ? context : undefined;
  }
  async function withAnswers<T>(answers: { option?: boolean }, run: () => Promise<T>) {
    const stamp = ports.stamp();
    const { agentAnswers } = await ports.load();
    if (!stamp.holds()) throw new Error("The editor changed branch or revision.");
    const real = ports.dialog();
    ports.setDialog(real && agentAnswers(real, answers));
    try {
      return await run();
    } finally {
      ports.setDialog(real);
    }
  }
  return { context, withAnswers };
}
