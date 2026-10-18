import type { AgentCommand } from "../shared/agent";
import type { AgentHub, HubGrant } from "./agent-context";
import { HttpError } from "./github";

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
    // Legacy commands cannot be acknowledged after cutover; rebind never waits for them.
    Object.assign(grant, { repoId: action.repoId, repo: action.repo, branch: action.branch, generation: action.generation });
    // An approval names its original workspace; it cannot opt another tab in after a rebind.
    delete grant.approval;
    failPending(hub, action.id);
  } else if (action.type === "remove-grant") {
    hub.grants = hub.grants.filter((item) => item.id !== action.id);
    failPending(hub, action.id);
  } else {
    throw new HttpError(400, "Unknown agent operation.");
  }
  return { ok: true };
}
