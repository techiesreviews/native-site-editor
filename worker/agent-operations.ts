import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { isMediaUploadWrite, OUTSIDE_MEDIA_REFUSED, agentResultLimit, type AgentCommand } from "../shared/agent";
import type { AgentHub, HubGrant } from "./agent-context";
import type { EditorContext } from "../shared/types";
import { HttpError } from "./github";
import { touchesGithubConfig, GITHUB_CONFIG_REFUSED, touchesMediaRecords, MEDIA_RECORDS_REFUSED } from "../shared/protected-paths";

import { contextMaxAge } from "../shared/agent-read";
const tabId = (value: unknown) =>
  typeof value === "string" && /^[\w-]{8,64}$/.test(value) ? value : undefined;

export const staleConnection = "The connection moved to another workspace or was rebound or removed. Connect the agent again and read the site again.";
/** Whether the hub no longer lists the grant with this workspace and generation (a command's, or an agent's request action). */
export function staleGrant(hub: AgentHub, command: Pick<AgentCommand, "grantId" | "repoId" | "branch" | "generation">) {
  return !hub.grants.some((grant) => grant.id === command.grantId && grant.repoId === command.repoId &&
    grant.branch === command.branch && grant.generation === command.generation && typeof grant.branch === "string" &&
    Number.isInteger(grant.generation));
}
function failPending(hub: AgentHub, id: string) {
  for (const command of hub.commands ?? []) {
    if (command.grantId === id && command.state === "pending" && staleGrant(hub, command)) {
      command.state = "failed";
      command.message = staleConnection;
    }
  }
}

/** A new hub for `add-grant` when the session has none yet. */
export function newHub(action: any): AgentHub | undefined {
  if (action?.type !== "add-grant") return undefined;
  const login = String(action.hub?.login ?? "");
  const expiresAt = Number(action.hub?.expiresAt);
  if (!login || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
  return { kind: "agent-hub", login, expiresAt, grants: [] };
}

/** Called inside the hub Durable Object's concurrency block. */
export function agentOperation(hub: AgentHub, action: any) {
  if (action.type === "add-grant") {
    const grant = action.grant as HubGrant;
    hub.grants = [...hub.grants.filter((item) => item.id !== grant.id), grant].slice(-20);
  } else if (action.type === "use-grant") {
    const grant = hub.grants.find((item) => item.id === action.id);
    if (grant) {
      grant.usedAt ??= Number(action.usedAt) || Date.now();
      if (!grant.client && typeof action.client === "string" && action.client)
        grant.client = action.client.slice(0, 100);
    }
  } else if (action.type === "rebind-grant") {
    const grant = hub.grants.find((item) => item.id === action.id);
    if (!grant || (grant.generation ?? 1) !== action.previous || action.generation !== action.previous + 1)
      throw new HttpError(409, staleConnection);
    // A change a tab claimed may be applying now, out of the hub's reach: rebind
    // only once the tab answered it. Elapsed time proves nothing about a paused tab.
    if (hub.commands?.some((item) => item.grantId === action.id && item.state === "pending" && item.claimedBy))
      throw new HttpError(409, "A change from this connection is still being applied in the editor. Try again once it finishes, or connect the agent again.");
    Object.assign(grant, { repoId: action.repoId, repo: action.repo, branch: action.branch, generation: action.generation });
    // An approval names its original workspace; it cannot opt another tab in after a rebind.
    delete grant.approval;
    failPending(hub, action.id);
  } else if (action.type === "remove-grant") {
    hub.grants = hub.grants.filter((item) => item.id !== action.id);
    failPending(hub, action.id);
  } else if (action.type === "pause") {
    if (!hub.tabId || hub.tabId === tabId(action.tabId)) {
      hub.context = undefined;
      hub.updatedAt = Date.now();
    }
  } else if (action.type === "context") {
    const tab = tabId(action.tabId);
    if (!tab) throw new HttpError(400, "Invalid editor tab.");
    // Checked by hubOperation (worker/agent-store.ts), which can load zod.
    hub.context = action.context as EditorContext;
    hub.updatedAt = Date.now();
    hub.tabId = tab;
  } else if (action.type === "queue") {
    const command = action.command as AgentCommand;
    if (staleGrant(hub, command)) throw new HttpError(409, staleConnection);
    // Whatever the tool, an agent's change never reaches the workflows.
    if ([command.path, ...(command.operation === "change_collection" ? [] : [command.args?.to]), command.args?.parent, command.args?.file, command.args?.with, command.args?.page, ...command.args?.files ?? []].some((path) => typeof path === "string" && touchesGithubConfig(path)))
      throw new HttpError(403, GITHUB_CONFIG_REFUSED);
    // edit_file queues write_file after applying its replacements.
    if (["write_file", "move_file", "delete_file"].includes(command.operation) &&
      [command.path, command.args?.to, command.args?.parent].some((path) => typeof path === "string" && touchesMediaRecords(path)))
      throw new HttpError(403, MEDIA_RECORDS_REFUSED);
    const problem = agentMediaArgsProblem(command.operation, command.args ?? {}, command.path);
    if (problem) throw new HttpError(400, problem);
    if (command.operation === "write_file" && isMediaUploadWrite(command.path)) throw new HttpError(403, OUTSIDE_MEDIA_REFUSED);
    if ([command.args?.file, command.args?.with, ...command.args?.files ?? []].some(path => typeof path === "string" && touchesMediaRecords(path))) throw new HttpError(403, MEDIA_RECORDS_REFUSED);
    const commands = (hub.commands ??= []);
    const existing = commands.find(
      (item) => item.id === command.id && item.grantId === command.grantId,
    );
    if (existing) {
      if (
        existing.path !== command.path ||
        existing.operation !== command.operation ||
        existing.content !== command.content ||
        existing.contentHash !== command.contentHash ||
        existing.expectedHash !== command.expectedHash ||
        JSON.stringify(existing.args ?? {}) !== JSON.stringify(command.args ?? {}) ||
        existing.branch !== command.branch ||
        existing.commit !== command.commit ||
        existing.generation !== command.generation ||
        existing.repoId !== command.repoId
      )
        throw new HttpError(
          409,
          "This request ID was already used for a different change.",
        );
      return existing;
    }
    if (commands.some((item) => item.id === command.id))
      throw new HttpError(409, "This request ID is taken. Choose another.");
    const context = hub.context;
    if (!context || !hub.updatedAt || Date.now() - hub.updatedAt > contextMaxAge)
      throw new HttpError(
        409,
        "The editor tab is not sharing a current context. Open the site in the editor (keep the tab visible) and try again.",
      );
    if (context.repository.id !== command.repoId)
      throw new HttpError(
        409,
        "The editor tab switched to another repository. Read the site again.",
      );
    if (context.branch !== command.branch || context.commit !== command.commit)
      throw new HttpError(
        409,
        "The editor switched branch or revision. Read the site again.",
      );
    if (
      commands.some(
        (item) => item.path === command.path && item.state === "pending",
      )
    )
      throw new HttpError(
        409,
        "A change to this file is already waiting for the editor. Wait for it to apply.",
      );
    if (commands.filter((item) => item.state === "pending").length >= 10)
      throw new HttpError(
        429,
        "Too many pending changes. Wait for the editor to apply them.",
      );
    // Every pending change stays (a claimed one fences rebind); recent
    // answered ones fill the rest of 29, oldest dropped first.
    const answered = commands.filter((item) => item.state !== "pending" && Date.now() - item.createdAt < 300_000);
    const dropped = new Set(answered.slice(0, Math.max(0, answered.length - Math.max(0, 29 - commands.filter((item) => item.state === "pending").length))));
    const nextCommands = [
      ...commands.filter((item) => (item.state === "pending" || answered.includes(item)) && !dropped.has(item)),
      command,
    ];
    while (
      new TextEncoder().encode(JSON.stringify(nextCommands)).length >
      512 * 1024
    ) {
      const completed = nextCommands.findIndex(
        (item) => item.state !== "pending",
      );
      if (completed < 0)
        throw new HttpError(
          413,
          "Pending changes are too large. Wait for the editor to apply them before sending more.",
        );
      nextCommands.splice(completed, 1);
    }
    hub.commands = nextCommands;
    return command;
  } else if (action.type === "claim") {
    // One tab applies a change: the first to claim it.
    const tab = tabId(action.tabId);
    const command = hub.commands?.find((item) => item.id === action.id && item.grantId === action.grantId);
    if (!command || !tab) throw new HttpError(404, "Change not found.");
    if (staleGrant(hub, command)) {
      failPending(hub, command.grantId!);
      throw new HttpError(409, staleConnection);
    }
    if (command.state !== "pending" || (command.claimedBy && command.claimedBy !== tab))
      throw new HttpError(409, "Another editor tab is applying this change.");
    command.claimedBy = tab;
    return command;
  } else if (action.type === "ack") {
    const command = hub.commands?.find((item) => item.id === action.id && item.grantId === action.grantId);
    if (!command) throw new HttpError(404, "Change not found.");
    if (command.claimedBy && command.claimedBy !== tabId(action.tabId))
      throw new HttpError(409, "Another editor tab is applying this change.");
    if (!["applied", "conflict", "failed"].includes(action.state))
      throw new HttpError(400, "Invalid change status.");
    if (command.state === "pending") {
      command.state = action.state;
      command.message = String(action.message ?? "").slice(0, 500);
      const result = action.result;
      const limit = agentResultLimit(command.operation);
      if (result && typeof result === "object" && JSON.stringify(result).length <= limit) {
        command.result = Object.fromEntries(
          Object.entries(result).filter(([, value]) =>
            value === null || ["string", "number", "boolean"].includes(typeof value),
          ),
        ) as AgentCommand["result"];
      }
    }
    return command;
  } else throw new HttpError(400, "Invalid agent action.");
  return { ok: true };
}
