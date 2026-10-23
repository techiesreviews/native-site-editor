import type { AgentWorkspace } from "../shared/agent-command.ts";
import { AgentRecordsError, type AgentCommit, type AgentRecords } from "./agent-records.ts";
import { githubScope, same } from "./workspace-session.ts";

type Snapshot = Awaited<ReturnType<AgentRecords["snapshot"]>>;

/** A tab's admission gate. Only IndexedDB transactions decide ownership. */
export function createAgentOwner(options: {
  workspace: AgentWorkspace;
  /** The receiving tab's ownership fence (IndexedDB keeps it as `generation`). */
  fence: number;
  records: AgentRecords;
  reload: (snapshot: Snapshot) => Promise<void>;
}) {
  const workspace = structuredClone(options.workspace);
  // A command for this owner's workspace, under the workspace session's one rule (src/workspace-session.ts).
  const ours = (command: AgentCommit) => same(githubScope(command.workspace), githubScope(workspace));
  const { records, reload } = options;
  let fence = options.fence, paused = false, takingOver = false;
  const inFlight = new Set<AgentCommit>();
  const conflict = () => new AgentRecordsError("conflict", "Agent ownership changed or admission is paused.");
  return {
    get paused() { return paused; },
    get fence() { return fence; },
    async commit(command: AgentCommit) {
      const captured = structuredClone(command);
      if (paused || captured.fence !== fence || !ours(captured)) throw conflict();
      inFlight.add(captured);
      try {
        // The transaction checks this same captured fence, revision and draft proof.
        return await records.commit(captured);
      } finally { inFlight.delete(captured); }
    },
    async takeover(outstanding: AgentCommit[] = []) {
      if (takingOver) throw conflict();
      const expected = fence;
      const pending = structuredClone([...inFlight, ...outstanding]);
      if (pending.some((command) => !ours(command))) throw conflict();
      takingOver = paused = true;
      try {
        // Durable pause serializes even an unresponsive old tab against admission.
        await records.pause(workspace, expected);
        await records.reconcile(workspace, pending);
        const snapshot = await records.snapshot(workspace);
        if (snapshot.generation !== expected || !snapshot.paused) throw conflict();
        // Reload is observational; its copy cannot change the CAS proof across this await.
        await reload(structuredClone(snapshot));
        const changed = await records.setFence(workspace, expected, expected + 1, snapshot);
        fence = changed.generation;
        // Reload/CAS can suspend the tab: one transaction rechecks ownership and every
        // authorization before exposing outcomes, with no await after it. Evicted or
        // revoked receipts now remain unknown; a superseded takeover stays paused.
        const outcomes = await records.reconcile(workspace, pending, fence);
        paused = false;
        return { outcomes, snapshot, fence };
      } finally {
        takingOver = false;
        // Fail closed: a failed takeover never resumes admission under the old proof.
      }
    },
  };
}
