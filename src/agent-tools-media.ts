import { textHash, textBytes, type AgentCommand } from "../shared/agent";
import { payloadIdentity, type AgentWorkspace, type JsonValue } from "../shared/agent-command";
import { mediaChanges, mediaTools, type AgentMedia } from "../shared/agent-media";
import type { AgentReadResult } from "../shared/agent-read";
import { AgentRecordsError, type AgentRecords } from "./agent-records";
import { createAgentTools } from "./agent-tools";
import type { AgentReadPorts } from "./agent-tools-read";

/** Internal liveness port; never serialized into a command or receipt. */
export const mediaCommandProofs = new WeakMap<AgentCommand, () => void>();
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;
const tooLarge = "The media result is too large; narrow the folder or page with offset/limit.";

export function createAgentMediaTools(options: {
  workspace: AgentWorkspace; ports: AgentReadPorts; records: AgentRecords;
  run(command: AgentCommand): Promise<{ message?: string; result?: AgentCommand["result"] } | void>;
}) {
  const { workspace, ports, records } = options;
  const flights = new Map<string, { identity: string; grantId: string; promise: Promise<AgentReadResult> }>();
  type Input = { request: AgentMedia; generation: number; current: () => boolean };
  const executor = async ({ request, generation, current }: Input): Promise<AgentReadResult> => {
    const stamp = ports.stamp(), source = ports.files(), branch = source?.snapshot.branch, commit = source?.snapshot.commit, repoId = source?.repo.id;
    const changing = mediaChanges(request.tool, request.args);
    // The relay's 10 s deadline counted from arrival in this tab: the Worker's clock is not this browser's.
    // Arrival is later than the relay's start, so a late commit is reported unknown and reconciled by its receipt.
    const deadline = Date.now() + 10_000;
    let applied = false;
    const check = () => {
      if (applied) return;
      const now = ports.files();
      if (!current() || !stamp.holds() || now?.repo.id !== repoId || now?.snapshot.branch !== branch || now?.snapshot.commit !== commit)
        throw new Error("The editor changed branch or revision, or the relay disconnected. Nothing was changed.");
    };
    const beforeCommit = () => {
      check();
      if (Date.now() >= deadline) throw new Error("The media command deadline passed. Cancelled before commit; nothing was changed.");
    };
    const reply = (outcome: JsonValue): AgentReadResult => ({ ok: true, value: { requestId: request.id, state: "applied", message: null,
      ...(outcome && typeof outcome === "object" && !Array.isArray(outcome) ? outcome : {}) } });
    try {
      check();
      const identity = changing ? await textHash(payloadIdentity(json({ tool: request.tool, args: { path: request.path, ...request.args }, branch: workspace.branch }))) : "";
      check();
      const running = changing ? flights.get(request.id) : undefined;
      if (running) {
        await records.receipt(workspace, request.id, request.grantId); check();
        return running.identity === identity && running.grantId === request.grantId ? await running.promise
          : { ok: false, message: "This change's id is already running with different work or authorization." };
      }
      const promise = (async (): Promise<AgentReadResult> => {
        if (changing) {
          const receipt = await records.receipt(workspace, request.id, request.grantId); check();
          if (receipt) return receipt.payloadIdentity === identity ? reply(receipt.outcome)
            : { ok: false, message: "This change's id was already used for different work. Nothing was changed." };
        }
        if (!source || branch !== workspace.branch || repoId !== workspace.repoId) throw new Error("The editor is unavailable. Open the connected site and branch.");
        const command: AgentCommand = { id: request.id, operation: request.tool, args: request.args, path: request.path, content: "",
          branch, commit: commit!, repoId, ownerGeneration: generation, grantId: request.grantId, generation: request.generation,
          requestIdentity: identity, state: "pending", createdAt: request.createdAt };
        beforeCommit();
        mediaCommandProofs.set(command, beforeCommit);
        // Cancellation races the same records transaction as commit; a committed receipt wins.
        const timer = changing ? setTimeout(() => { void records.cancel(workspace, request.id, request.grantId).catch(() => {}); }, Math.max(0, deadline - Date.now())) : undefined;
        try {
          const outcome = await options.run(command);
          if (changing) {
            const receipt = await records.receipt(workspace, request.id, request.grantId);
            if (receipt) { applied = true; return reply(receipt.outcome); }
            throw new Error("The media outcome could not be proven. Check get_command_status; do not replay the change.");
          }
          beforeCommit();
          const result = reply(json(outcome ?? {}));
          return textBytes(JSON.stringify(result)) > 8 * 1024 * 1024 - 4096 ? { ok: false, message: tooLarge } : result;
        } finally { if (timer !== undefined) clearTimeout(timer); mediaCommandProofs.delete(command); }
      })();
      if (!changing) return await promise;
      const flight = { identity, grantId: request.grantId, promise };
      flights.set(request.id, flight);
      try { return await promise; }
      finally { if (flights.get(request.id) === flight) flights.delete(request.id); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The browser media command failed.";
      if (!changing) return { ok: false, message };
      const unknown = error instanceof AgentRecordsError && error.code === "unknown" || /unproven|outcome.*unknown|could not.*prov/i.test(message);
      return { ok: true, value: { requestId: request.id, state: unknown ? "unknown" : "conflict",
        message: unknown ? `${message} Check get_command_status; do not replay the change.` : message } };
    }
  };
  const registry = createAgentTools<Input>(Object.fromEntries(mediaTools.map(tool => [tool, executor])));
  return { run: (request: AgentMedia, generation: number, current: () => boolean) => registry.run(request.tool, { request, generation, current }) };
}
