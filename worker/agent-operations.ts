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

/** The grant operations the hub Durable Object takes (worker/agent-context.ts sends them). */
export type HubAction =
  | { type: "add-grant"; grant: HubGrant; hub?: { login?: unknown; expiresAt?: unknown }; deadline?: number }
  | { type: "use-grant"; id: string; usedAt?: number; client?: unknown }
  | { type: "rebind-grant"; id: string; previous: number; generation: number; repoId: number; repo: string; branch: string; deadline?: number }
  | { type: "remove-grant"; id: string; generation?: number };

/** A new hub for `add-grant` when the session has none yet. */
export function newHub(action: HubAction): AgentHub | undefined {
  if (action.type !== "add-grant") return undefined;
  const login = String(action.hub?.login ?? "");
  const expiresAt = Number(action.hub?.expiresAt);
  if (!login || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
  return { kind: "agent-hub", login, expiresAt, grants: [] };
}

export const lateConnection = "Saving the connection took too long. Connect the agent again.";
/** Called inside the hub Durable Object's concurrency block. */
export function agentOperation(hub: AgentHub, action: HubAction) {
  // A reservation's deadline: after it, reconciliation may have reclaimed the
  // reservation, so a late add or rebind must not publish uncounted metadata.
  if ((action.type === "add-grant" || action.type === "rebind-grant") && action.deadline !== undefined &&
      !(Date.now() < Number(action.deadline)))
    throw new HttpError(409, lateConnection);
  if (action.type === "add-grant") {
    const { grant } = action;
    if (!hub.grants.some(item => item.id === grant.id) && hub.grants.length >= 20)
      throw new HttpError(409, "This editor session already has 20 agent connections. Disconnect one in the editor's agent menu first.");
    hub.grants = [...hub.grants.filter((item) => item.id !== grant.id), grant];
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
    const grant = hub.grants.find((item) => item.id === action.id);
    if (grant && action.generation !== undefined && grant.generation !== action.generation)
      throw new HttpError(409, staleConnection);
    hub.grants = hub.grants.filter((item) => item.id !== action.id);
    failPending(hub, action.id);
  } else {
    throw new HttpError(400, "Unknown agent operation.");
  }
  return { ok: true };
}
