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
  payloadIdentity: string;
  generation: number;
  revision: number;
  outcome: JsonValue;
  createdAt: number;
}
