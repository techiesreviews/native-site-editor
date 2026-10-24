import { textHash, WAITING_MESSAGE, type AgentCommand } from "../shared/agent";
import { applyReplacements } from "../shared/agent-replacements";
import { payloadIdentity, workspaceKey, type AgentWorkspace, type JsonValue } from "../shared/agent-command";
import { prepareAgentEdit, type AgentEdit, type AgentStatus } from "../shared/agent-edit";
import { agentToolsOn } from "../shared/agent-tool-table";
import type { AgentReadResult } from "../shared/agent-read";
import { SiteFiles } from "../shared/site-files";
import { AgentRecordsError, type AgentRecords } from "./agent-records";
import { agentCommandFiles, agentCommandSignals, createAgentTools, siteCommandPins } from "./agent-tools";
import { agentFileReader, type AgentReadPorts } from "./agent-tools-read";
import { changesWork } from "./agent-site";
import { workingPart } from "./working-part";

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

/**
 * The edits under way in this tab, by workspace and id, whichever connection's tools took them (a
 * reconnect makes new ones while a change still waits). `waiting`: held for the part the user works in
 * (ticket 52), so a duplicate or a status lookup is told so at once; `waited`: it was, and it runs now.
 */
const flights = new Map<string, { identity: string; authorizationId: string; promise: Promise<AgentReadResult>; waiting: boolean; waited: boolean }>();
/** A waiting change's record whose tab is gone: it never landed (AgentRecords.wait). */
const WAIT_LOST = "The editor tab was reloaded or closed while this change waited for the user. Nothing was changed; read the site again and send the change anew.";

/** Receipts precede preparation: replacements must never run twice against their own output. */
export function createAgentEditTools(options: Options) {
  const { records, workspace, ports } = options;
  const waiting = (id: string): AgentReadResult => ({ ok: true, value: { requestId: id, state: "waiting", message: WAITING_MESSAGE } });
  const refusal = (id: string, message: string): AgentReadResult => ({ ok: true, value: { requestId: id, state: "conflict", message } });
  /**
   * Ticket 52, the stand-in until multiplayer: a change to the part the user works in waits until they
   * leave it, or its workspace is no longer shown (a workspace load leaves the part); none otherwise.
   */
  function userPart(command: AgentCommand, away: () => boolean): Promise<void> | undefined {
    const blocked = () => !away() && changesWork(workingPart.now(), command, ports.source?.(command.path));
    if (!blocked()) return undefined;
    return new Promise(resolve => {
      const stop = workingPart.subscribe(() => { if (!blocked()) { stop(); resolve(); } });
    });
  }
  /**
   * Once let go, a text change lands on what the user typed meanwhile: an edit_file's replacements again
   * on the text now, which refuses when the user changed the text they replace; a whole write is refused.
   */
  async function afterWait(request: AgentEdit, command: AgentCommand) {
    if (command.operation !== "write_file" || typeof command.expectedHash !== "string") return;
    const now = ports.source?.(command.path);
    // The command's own proof: the text it was made from.
    if (now === undefined || await textHash(now) === command.expectedHash) return;
    const again = request.tool === "edit_file" ? applyReplacements(now, request.args.edits) : undefined;
    if (!again?.ok) throw new Error(`The user changed ${command.path} where this change goes while it waited. Read it again; nothing was changed.`);
    command.content = again.text;
    command.expectedHash = await textHash(now);
  }
  async function execute(request: Request, fence: number, current: () => boolean, signal?: AbortSignal, held?: Held): Promise<AgentReadResult> {
    const { source, pin, pinned, stamp } = held ?? holdWorkspace(ports);
    const commit = source?.snapshot.commit;
    let ran = false, identity: string | undefined;
    // A change that waits is answered at once and goes on without the call: its socket, signal and
    // deadline no longer hold it; ownership and the authorization are proved when it commits.
    let attached = true;
    // Once the executor ran, its own commit decided the outcome: a later revision change or lost
    // socket must never relabel committed work as a conflict (the transport drops a reply it cannot send).
    // Another site or branch shown meanwhile stops nothing (ticket 23): the edit reads its own
    // workspace (`source`, the pin's context) and the editor writes it there; on show, a save moves
    // the commit. Without a pin (no host to finish elsewhere) the arrival stamp must still hold.
    const check = () => {
      if (ran) return;
      if (attached) signal?.throwIfAborted();
      if (attached && !current() || !pin.away() && (ports.files()?.snapshot.commit !== commit || !pinned && !stamp.holds()))
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
      const key = JSON.stringify([workspaceKey(workspace), request.id]);
      const running = request.operation === "edit" ? flights.get(key) : undefined;
      if (running) {
        // Joining work still checks this grant's authorization before revealing its outcome.
        await records.receipt(workspace, request.id, request.grantId);
        check();
        return running.identity !== identity || running.authorizationId !== request.grantId
          ? { ok: false, message: "This change's id is already running with different work or authorization." }
          : running.waiting ? waiting(request.id) : await running.promise;
      }
      // A status lookup of a change that waits, or waited and runs now, answers as a duplicate would,
      // this grant's authorization checked first.
      const waited = request.operation === "status" ? flights.get(key) : undefined;
      if (waited?.waited && waited.authorizationId === request.grantId) {
        await records.receipt(workspace, request.id, request.grantId);
        check();
        return waited.waiting ? waiting(request.id) : await waited.promise;
      }
      let answer: (result: AgentReadResult) => void = () => {};
      const answered = new Promise<AgentReadResult>(resolve => { answer = resolve; });
      const flight = { identity, authorizationId: request.grantId, promise: answered, waiting: false, waited: false };
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
        // A change that waited and did not land (refused once let go, or its tab gone; no flight holds it
        // in this tab): told so again, never prepared again.
        const kept = await records.waiting(workspace, request.id, request.grantId);
        check();
        if (kept) return request.operation === "edit" && kept.identity !== identity
          ? { ok: false, message: "This change's id was already used for different work. Nothing was changed." } : refusal(request.id, kept.refused ?? WAIT_LOST);
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
        const free = userPart(command, () => pin.away());
        if (free && request.operation === "edit") {
          flight.waiting = flight.waited = true;
          // Kept beside its receipt first, so a reload meanwhile still answers for it.
          await records.wait(workspace, request.id, request.grantId, identity!);
          check();
          attached = false;
          agentCommandSignals.delete(command);
          answer(waiting(request.id));
          await free;
          flight.waiting = false;
          check();
          if (!pin.away()) await afterWait(request, command);
          check();
        }
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
      })().catch(settle).then(async result => {
        // Refused once let go: its answer is kept beside its receipt for a duplicate or a status lookup.
        const value = result.ok ? result.value : null;
        const refused = !result.ok ? result.message : value && typeof value === "object" && !Array.isArray(value) && value.state === "conflict" ? String(value.message) : undefined;
        if (flight.waited && refused !== undefined) await records.wait(workspace, request.id, request.grantId, identity!, refused).catch(() => undefined);
        return result;
      });
      if (request.operation === "status") return await promise;
      flight.promise = promise;
      flights.set(key, flight);
      void promise.then(() => { if (flights.get(key) === flight) flights.delete(key); });
      // Settle matrix of this race. `promise` (the edit) always settles: its errors become results
      // (settle), and a change that waits goes on until the part is let go, with no time limit (the
      // user leaving it, or a workspace load leaving it; src/working-part.ts). `answered` settles only
      // when the change starts waiting, and never otherwise. So: no wait, the edit's result answers;
      // a wait, "waiting" answers at once, and the edit goes on to write its receipt or its refusal
      // (above), which a duplicate or status lookup then reads; the reply is the call's only write.
      return await Promise.race([promise, answered]);
    } catch (error) {
      return settle(error);
    }
    async function settle(error: unknown): Promise<AgentReadResult> {
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
  const registry = createAgentTools<Input>(Object.fromEntries(agentToolsOn("edit", "status").map(tool => [tool, executor])));
  return {
    /** `held`: the workspace as the edit arrived, when the caller waited before this (src/components/agent-menu.ts). */
    run(request: Request, fence: number, current: () => boolean, signal?: AbortSignal, held?: Held) {
      return registry.run(request.operation === "status" ? "get_command_status" : request.tool, { request, fence, current, signal, held });
    },
  };
}
