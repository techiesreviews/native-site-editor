import type { AgentCommand } from "../shared/agent";
import { textHash } from "../shared/agent";
import type { AgentGrant } from "./agent-context";
import { validateContext } from "./agent-context";
import { HttpError } from "./github";

/** Called inside the grant Durable Object's concurrency block. */
export async function agentOperation(grant: AgentGrant, action: any) {
  if (action.type === "pause") {
    grant.context = undefined;
    grant.updatedAt = Date.now();
  } else if (action.type === "context") {
    grant.context = validateContext(action.context);
    grant.updatedAt = Date.now();
  } else if (action.type === "queue") {
    const command = action.command as AgentCommand;
    const commands = (grant.commands ??= []);
    const existing = commands.find((item) => item.id === command.id);
    if (existing) {
      if (
        existing.path !== command.path ||
        existing.operation !== command.operation ||
        existing.content !== command.content ||
        existing.expectedHash !== command.expectedHash ||
        existing.branch !== command.branch ||
        existing.commit !== command.commit
      )
        throw new HttpError(
          409,
          "This request ID was already used for a different change.",
        );
      return existing;
    }
    if (
      !grant.context ||
      !grant.updatedAt ||
      Date.now() - grant.updatedAt > 120_000
    )
      throw new HttpError(
        409,
        "Editor context is stale. Open the editor and read its context again.",
      );
    if (
      command.branch !== grant.context.branch ||
      command.commit !== grant.context.commit
    )
      throw new HttpError(
        409,
        "The editor switched revisions. Read its context again.",
      );
    if (command.operation === "update_active_draft") {
      const file = grant.context.file;
      if (
        !file ||
        file.readOnly ||
        file.path !== command.path ||
        (await textHash(file.content)) !== command.expectedHash
      )
        throw new HttpError(
          409,
          "The active draft changed. Read it again before updating.",
        );
    }
    if (
      commands.some(
        (item) => item.path === command.path && item.state === "pending",
      )
    )
      throw new HttpError(
        409,
        "A change to this file is already waiting for the editor.",
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
        .slice(-19),
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
          "Pending draft changes are too large. Wait for the editor to apply them before sending more.",
        );
      nextCommands.splice(completed, 1);
    }
    grant.commands = nextCommands;
    return command;
  } else if (action.type === "ack") {
    const command = grant.commands?.find((item) => item.id === action.id);
    if (!command) throw new HttpError(404, "Change not found.");
    if (!["applied", "conflict", "failed"].includes(action.state))
      throw new HttpError(400, "Invalid change status.");
    if (command.state === "pending") {
      command.state = action.state;
      command.message = String(action.message ?? "").slice(0, 500);
    }
    return command;
  } else throw new HttpError(400, "Invalid agent action.");
  return { ok: true };
}
