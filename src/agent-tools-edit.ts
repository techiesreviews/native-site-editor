import { textHash, type AgentCommand } from "../shared/agent";
import { payloadIdentity, type AgentWorkspace, type JsonValue } from "../shared/agent-command";
import { prepareAgentEdit, type AgentEdit, type AgentStatus } from "../shared/agent-edit";
import type { AgentReadResult } from "../shared/agent-read";
import { SiteFiles } from "../shared/site-files";
import { AgentRecordsError, type AgentRecords } from "./agent-records";
import { agentCommandFiles, agentCommandSignals, createAgentTools, siteCommandPins } from "./agent-tools";
import { agentFileReader, type AgentReadPorts } from "./agent-tools-read";

interface Options {
  workspace: AgentWorkspace;
  ports: AgentReadPorts;
  records: AgentRecords;
  run: (command: AgentCommand) => Promise<{ message?: string; result?: AgentCommand["result"] } | void>;
}
type Request = AgentEdit | AgentStatus;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonValue;

/**
 * What an edit holds of the workspace it arrived in, taken before any wait (ticket 23): its files, its
 * repository stamp, and its pin. `pinned` is false when no pin could be taken (nothing open as it
 * arrived): then the edit cannot finish elsewhere, and the stamp must hold.
 */
export interface Held {
  source: ReturnType<AgentReadPorts["files"]>;
  stamp: ReturnType<AgentReadPorts["stamp"]>;
  pin: NonNullable<ReturnType<NonNullable<AgentReadPorts["pin"]>>>;
  pinned: boolean;
}
/** The workspace shown now, as an edit holds it. */
function holdWorkspace(ports: AgentReadPorts): Held {
  const pin = ports.pin?.();
  return { source: ports.files(), stamp: ports.stamp(), pin: pin ?? { away: () => false, context: () => ports.context() }, pinned: Boolean(pin) };
}

/** Receipts precede preparation: replacements must never run twice against their own output. */
export function createAgentEditTools(options: Options) {
  const flights = new Map<string, { identity: string; authorizationId: string; promise: Promise<AgentReadResult> }>();
  const { records, workspace, ports } = options;
  async function execute(request: Request, fence: number, current: () => boolean, signal?: AbortSignal, held?: Held): Promise<AgentReadResult> {
    const { source, pin, pinned, stamp } = held ?? holdWorkspace(ports);
    const commit = source?.snapshot.commit;
    let ran = false, identity: string | undefined;
    // Once the executor ran, its own commit decided the outcome: a later revision change or lost
    // socket must never relabel committed work as a conflict (the transport drops a reply it cannot send).
    // Another site or branch shown meanwhile stops nothing (ticket 23): the edit reads its own
    // workspace (`source`, the pin's context) and the editor writes it there; on show, a save moves
    // the commit. Without a pin (no host to finish elsewhere) the arrival stamp must still hold.
    const check = () => {
      if (ran) return;
      signal?.throwIfAborted();
      if (!current() || !pin.away() && (ports.files()?.snapshot.commit !== commit || !pinned && !stamp.holds()))
        throw new Error("The editor changed branch or revision. Read the site again.");
    };
    const reply = (outcome: JsonValue): AgentReadResult => {
      const body = outcome && typeof outcome === "object" && !Array.isArray(outcome) ? outcome : {};
      return { ok: true, value: { requestId: request.id, state: "applied", message: null, ...body } };
    };
    try {
      check();
      identity = request.operation === "edit" ? await textHash(payloadIdentity(json({ tool: request.tool, args: request.args, branch: workspace.branch }))) : "";
      check();
      const running = request.operation === "edit" ? flights.get(request.id) : undefined;
      if (running) {
        // Joining work still checks this grant's authorization before revealing its outcome.
        await records.receipt(workspace, request.id, request.grantId);
        check();
        return running.identity === identity && running.authorizationId === request.grantId ? await running.promise
          : { ok: false, message: "This change's id is already running with different work or authorization." };
      }
      // Reserve the flight before the receipt read: even a delayed lookup cannot start a second preparation.
      const promise = (async (): Promise<AgentReadResult> => {
        const receipt = await records.receipt(workspace, request.id, request.grantId);
        check();
        if (receipt) {
          if (request.operation === "edit" && receipt.payloadIdentity !== identity)
            return { ok: false, message: "This change's id was already used for different work. Nothing was changed." };
          return reply(receipt.outcome);
        }
        const status = await records.status(workspace, request.id, request.grantId);
        check();
        if (status.status === "applied") return request.operation === "edit" && status.receipt.payloadIdentity !== identity
          ? { ok: false, message: "This change's id was already used for different work. Nothing was changed." } : reply(status.receipt.outcome);
        if (status.status === "cancelled") return { ok: true, value: { requestId: request.id, state: "cancelled", message: "This delivery was cancelled before it committed. Nothing was changed by it." } };
        if (request.operation === "status") return { ok: true, value: { requestId: request.id, state: "unknown",
          message: "Change not found, or its receipt expired. The outcome is unknown; do not replay the change." } };
        if (!source) throw new Error("The editor is unavailable. Open the connected site and branch.");
        // The revision proof is taken before preparation and carried into an unchanged receipt: an agent
        // commit landing meanwhile refuses it. Such a receipt writes no drafts, so no manual work is touched.
        const before = await records.workspace(workspace);
        check();
        const shared = await pin.context();
        check();
        if (!shared) throw new Error("The editor is unavailable. Open the connected site and branch.");
        const files = new SiteFiles(agentFileReader(source, shared.context, signal), source.repo, shared.context, async hash => {
          check(); return shared.texts.get(hash);
        });
        const prepared = await prepareAgentEdit(request, shared.context, files);
        check();
        // Unchanged requests and UI-only open_page also receive an owner-fenced receipt, so their id stays
        // reserved for this work and grant (reuse for different work is refused like any other).
        const record = async (outcome: JsonValue, revision?: number) => {
          const expectedRevision = revision ?? (await records.workspace(workspace)).revision;
          check();
          const result = await records.commit({ workspace, fence, expectedRevision, expectedDrafts: [], drafts: [],
            receipt: { operationId: request.id, authorizationId: request.grantId, payloadIdentity: identity!, outcome,
              createdAt: Date.now(), issuedAt: request.createdAt } });
          check();
          return reply(result.receipt.outcome);
        };
        if ("unchanged" in prepared) return record(json(prepared.unchanged), before.revision);
        const { input, operation } = prepared;
        const command: AgentCommand = { id: request.id, operation, content: input.content ?? "",
          branch: shared.context.branch, commit: shared.context.commit, ...input, repoId: workspace.repoId,
          grantId: request.grantId, generation: request.generation, ownerGeneration: fence, requestIdentity: identity!,
          state: "pending", createdAt: request.createdAt };
        if (signal) agentCommandSignals.set(command, signal);
        agentCommandFiles.set(command, source);
        if (pin.media) siteCommandPins.set(command, { pin: pin.media, opened: pin.opened });
        signal?.throwIfAborted();
        ran = true;
        const outcome = await options.run(command);
        check();
        if (operation === "open_page") return record(json(outcome ?? {}));
        if (operation === "inspect_preview") {
          let report: JsonValue = json(outcome?.result ?? {});
          if (typeof outcome?.result?.report === "string") {
            try { report = JSON.parse(outcome.result.report) as JsonValue; } catch { /* Keep the original report when it is not JSON. */ }
          }
          return reply(json({ ...outcome, result: report }));
        }
        return reply(json(outcome ?? {}));
      })();
      if (request.operation === "status") return await promise;
      const flight = { identity, authorizationId: request.grantId, promise };
      flights.set(request.id, flight);
      try { return await promise; }
      finally { if (flights.get(request.id) === flight) flights.delete(request.id); }
    } catch (error) {
      // A commit may have won just before abort or a lost reply. Never relabel or undo that receipt.
      const settled = await records.status(workspace, request.id, request.grantId).catch(() => undefined);
      if (settled?.status === "applied") return request.operation === "edit" && settled.receipt.payloadIdentity !== identity
        ? { ok: false, message: "This change's id was already used for different work. Nothing was changed." } : reply(settled.receipt.outcome);
      if (settled?.status === "cancelled") return { ok: true, value: { requestId: request.id, state: "cancelled", message: "This delivery was cancelled before it committed. Nothing was changed by it." } };
      const message = error instanceof Error ? error.message : "The browser edit failed.";
      const unknown = error instanceof AgentRecordsError && error.code === "unknown" || /unproven|outcome.*unknown|could not prove|could not confirm whether/i.test(message);
      return { ok: true, value: { requestId: request.id, state: unknown ? "unknown" : "conflict", message: unknown
        ? `${message} Check get_command_status; do not replay the change.` : message } };
    }
  }
  type Input = { request: Request; fence: number; current: () => boolean; signal?: AbortSignal; held?: Held };
  const executor = ({ request, fence, current, signal, held }: Input) => execute(request, fence, current, signal, held);
  const registry = createAgentTools<Input>({ edit_file: executor, write_file: executor, move_file: executor,
    delete_file: executor, create_page: executor, set_page_details: executor, open_page: executor,
    inspect_preview: executor, make_component: executor, add_section: executor, move_section: executor,
    remove_section: executor, get_command_status: executor });
  return {
    /** `held`: the workspace as the edit arrived, when the caller waited before this (src/components/agent-menu.ts). */
    run(request: Request, fence: number, current: () => boolean, signal?: AbortSignal, held?: Held) {
      return registry.run(request.operation === "status" ? "get_command_status" : request.tool, { request, fence, current, signal, held });
    },
  };
}
