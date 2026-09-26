import type { AgentCommand } from "../shared/agent";
import type { AgentHub, HubGrant } from "./agent-context";
import { validateContext } from "./agent-context";
import { HttpError } from "./github";

export const contextMaxAge = 120_000;
const tabId = (value: unknown) =>
  typeof value === "string" && /^[\w-]{8,64}$/.test(value) ? value : undefined;

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
  } else if (action.type === "remove-grant") {
    hub.grants = hub.grants.filter((item) => item.id !== action.id);
    hub.commands = hub.commands?.filter(
      (item) => item.grantId !== action.id || item.state !== "pending",
    );
  } else if (action.type === "pause") {
    if (!hub.tabId || hub.tabId === tabId(action.tabId)) {
      hub.context = undefined;
      hub.updatedAt = Date.now();
    }
  } else if (action.type === "context") {
    const tab = tabId(action.tabId);
    if (!tab) throw new HttpError(400, "Invalid editor tab.");
    hub.context = validateContext(action.context);
    hub.updatedAt = Date.now();
    hub.tabId = tab;
  } else if (action.type === "queue") {
    const command = action.command as AgentCommand;
    const commands = (hub.commands ??= []);
    const existing = commands.find(
      (item) => item.id === command.id && item.grantId === command.grantId,
    );
    if (existing) {
      if (
        existing.path !== command.path ||
        existing.operation !== command.operation ||
        existing.content !== command.content ||
        existing.expectedHash !== command.expectedHash ||
        JSON.stringify(existing.args ?? {}) !== JSON.stringify(command.args ?? {}) ||
        existing.branch !== command.branch ||
        existing.commit !== command.commit
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
        "The editor tab shows another repository. Open this repository in the editor.",
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
    const nextCommands = [
      ...commands
        .filter(
          (item) =>
            item.state === "pending" || Date.now() - item.createdAt < 300_000,
        )
        .slice(-29),
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
      if (result && typeof result === "object" && JSON.stringify(result).length <= 2048) {
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
