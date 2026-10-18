export interface AgentWorkspace {
  account: string;
  repoId: number;
  branch: string;
}

export const workspaceKey = (workspace: AgentWorkspace) =>
  JSON.stringify([workspace.account.toLowerCase(), workspace.repoId, workspace.branch]);

export type OperationId = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Canonical JSON for plain JSON payloads: sorted object keys, ordered arrays. */
export function payloadIdentity(payload: JsonValue): string {
  if (payload === null || typeof payload === "boolean" || typeof payload === "string") return JSON.stringify(payload);
  if (typeof payload === "number" && Number.isFinite(payload)) return JSON.stringify(payload);
  if (Array.isArray(payload)) return `[${payload.map(payloadIdentity).join(",")}]`;
  if (typeof payload === "object") return `{${Object.keys(payload).sort().map((key) => `${JSON.stringify(key)}:${payloadIdentity(payload[key])}`).join(",")}}`;
  throw new TypeError("Command payload must contain only JSON values.");
}

export interface AgentReceipt {
  operationId: OperationId;
  workspace: string;
  authorizationId: string;
  payloadIdentity: string;
  generation: number;
  revision: number;
  outcome: JsonValue;
  /** When this browser committed it (its 24 hours count from here). */
  createdAt: number;
  /**
   * When the command was issued, by its issuer's clock (AgentCommand.createdAt). Once a receipt
   * is gone, a delivery issued at or before the workspace's retired horizon stays unknown.
   */
  issuedAt: number;
}

export type AgentOutcome = { operationId: OperationId; status: "unknown" } |
  { operationId: OperationId; status: "applied"; receipt: AgentReceipt };
