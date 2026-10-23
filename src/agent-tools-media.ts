import { textHash, textBytes, type AgentCommand } from "../shared/agent";
import { payloadIdentity, type AgentWorkspace, type JsonValue } from "../shared/agent-command";
import { mediaChanges, mediaTools, type AgentMedia } from "../shared/agent-media";
import type { AgentReadResult } from "../shared/agent-read";
import { AgentRecordsError, type AgentRecords } from "./agent-records";
import { createAgentTools, mediaCommandPins } from "./agent-tools";
import type { AgentReadPorts } from "./agent-tools-read";
import { sameBranch } from "./workspace-session";
import type { Held } from "./agent-tools-edit";

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
  type Input = { request: AgentMedia; fence: number; current: () => boolean; deadline?: number; seen?: { page: string | undefined }; signal?: AbortSignal; held?: Held };
  const executor = async ({ request, fence, current, deadline = Date.now() + 10_000, seen, signal, held }: Input): Promise<AgentReadResult> => {
    const pin = held?.pin ?? ports.pin?.(), stamp = held?.stamp ?? ports.stamp(), source = held ? held.source : ports.files(), commit = source?.snapshot.commit;
    // Its page as it reads where it arrived: the pinned workspace's while another is shown.
    const media = pin && "media" in pin ? pin.media : undefined, pageSource = (path: string) => media && !media.here() ? media.source(path) : ports.source!(path);
    const changing = mediaChanges(request.tool, request.args);
    // A page change's element id points into the page as it was when the command arrived (src/agent-transport.ts
    // reads it before any await), else as it is on admission: that source is the proof to commit.
    const pageChange = changing && ["place_media", "frame_image", "loop_video"].includes(request.tool) && ports.source !== undefined;
    const page = pageChange ? seen ? seen.page : pageSource(request.path) : undefined;
    // The relay's total deadline as the transport measured it on arrival (src/agent-transport.ts): never a fresh 10 s.
    let applied = false, identity: string | undefined;
    const check = () => {
      if (applied) return;
      signal?.throwIfAborted();
      // The stamp holds while the same repository and branch stay open (src/workspace-session.ts); a save moves the commit within it.
      // Another site or branch shown meanwhile stops nothing (ticket 27): with a pin it finishes in its own workspace.
      if (!media && !stamp.holds()) throw new Error("The editor moved to another site or branch meanwhile. Nothing was changed.");
      if (!current() || (!(media && !media.here()) && ports.files()?.snapshot.commit !== commit))
        throw new Error("The relay disconnected or the site was saved meanwhile. Nothing was changed.");
    };
    const beforeCommit = () => {
      check();
      if (pageChange && pageSource(request.path) !== page)
        throw new Error(`${request.path} changed in the editor meanwhile. Read it again with get_page; nothing was changed.`);
      if (Date.now() >= deadline) throw new Error("The media command deadline passed. Cancelled before commit; nothing was changed.");
    };
    const reply = (outcome: JsonValue): AgentReadResult => ({ ok: true, value: { requestId: request.id, state: "applied", message: null,
      ...(outcome && typeof outcome === "object" && !Array.isArray(outcome) ? outcome : {}) } });
    try {
      check();
      identity = changing ? await textHash(payloadIdentity(json({ tool: request.tool, args: { path: request.path, ...request.args }, branch: workspace.branch }))) : "";
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
        if (changing) {
          const status = await records.status(workspace, request.id, request.grantId); check();
          if (status.status === "applied") return status.receipt.payloadIdentity === identity ? reply(status.receipt.outcome)
            : { ok: false, message: "This change's id was already used for different work. Nothing was changed." };
          if (status.status === "cancelled") return { ok: true, value: { requestId: request.id, state: "cancelled", message: "This delivery was cancelled before it committed. Nothing was changed by it." } };
        }
        check();
        if (!source || !sameBranch({ repoId: source.repo.id, branch: source.snapshot.branch }, workspace)) throw new Error("The editor is unavailable. Open the connected site and branch.");
        const command: AgentCommand = { id: request.id, operation: request.tool, args: request.args, path: request.path, content: "",
          branch: source.snapshot.branch, commit: commit!, repoId: source.repo.id, ownerGeneration: fence, grantId: request.grantId, generation: request.generation,
          requestIdentity: identity, state: "pending", createdAt: request.createdAt };
        beforeCommit();
        mediaCommandProofs.set(command, beforeCommit);
        if (media) mediaCommandPins.set(command, { pin: media, page, opened: pin && "opened" in pin ? pin.opened : undefined });
        // Cancellation races the same records transaction as commit; a committed receipt wins.
        const timer = changing && !signal ? setTimeout(() => { void records.cancel(workspace, request.id, request.grantId, { live: true }).catch(() => {}); }, Math.max(0, deadline - Date.now())) : undefined;
        try {
          const outcome = await options.run(command);
          if (changing) {
            // After the run, a failed lookup cannot prove "nothing changed": the outcome is unknown, never a conflict.
            const receipt = await records.receipt(workspace, request.id, request.grantId).catch(() => undefined);
            if (receipt) { applied = true; return reply(receipt.outcome); }
            return { ok: true, value: { requestId: request.id, state: "unknown",
              message: "The media outcome could not be proven. Check get_command_status; do not replay the change." } };
          }
          beforeCommit();
          const result = reply(json(outcome ?? {}));
          return textBytes(JSON.stringify(result)) > 8 * 1024 * 1024 - 4096 ? { ok: false, message: tooLarge } : result;
        } finally { if (timer !== undefined) clearTimeout(timer); mediaCommandProofs.delete(command); mediaCommandPins.delete(command); }
      })();
      if (!changing) return await promise;
      const flight = { identity, grantId: request.grantId, promise };
      flights.set(request.id, flight);
      try { return await promise; }
      finally { if (flights.get(request.id) === flight) flights.delete(request.id); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The browser media command failed.";
      if (!changing) return { ok: false, message };
      const settled = await records.status(workspace, request.id, request.grantId).catch(() => undefined);
      if (settled?.status === "applied") return settled.receipt.payloadIdentity === identity ? reply(settled.receipt.outcome)
        : { ok: false, message: "This change's id was already used for different work. Nothing was changed." };
      if (settled?.status === "cancelled") return { ok: true, value: { requestId: request.id, state: "cancelled", message: "This delivery was cancelled before it committed. Nothing was changed by it." } };
      const unknown = error instanceof AgentRecordsError && error.code === "unknown" || /unproven|outcome.*unknown|could not.*prov/i.test(message);
      return { ok: true, value: { requestId: request.id, state: unknown ? "unknown" : "conflict",
        message: unknown ? `${message} Check get_command_status; do not replay the change.` : message } };
    }
  };
  const registry = createAgentTools<Input>(Object.fromEntries(mediaTools.map(tool => [tool, executor])));
  return { run: (request: AgentMedia, fence: number, current: () => boolean, deadline?: number, seen?: { page: string | undefined }, signal?: AbortSignal, held?: Held) =>
    registry.run(request.tool, { request, fence, current, deadline, seen, signal, held }) };
}
