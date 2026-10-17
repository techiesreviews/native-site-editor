export type AgentFailureCode = "daily-quota" | "signed-out";
/** The browser's editor session ended: only this answer asks the user to sign in again. */
export const SIGNED_OUT = "signed-out";
export interface AgentQuotaBody { error: string; code: AgentFailureCode; resetAt: number }
export type AgentFailure =
  | { kind: "quota"; resetAt?: number; retryAt?: number }
  | { kind: "auth" }
  | { kind: "transient"; retryAt?: number }
  | { kind: "other"; message?: string };

export class AgentFailureError extends Error {
  constructor(readonly failure: AgentFailure, message = "Agent connection failed.") { super(message); }
}

export function isDailyQuotaError(error: unknown): boolean {
  return error instanceof Error && /^Exceeded allowed .+ in Durable Objects free tier/i.test(error.message);
}

export function nextUtcMidnight(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function parseRetryAfter(value: string | null | undefined, now: number): number | undefined {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  const at = /^\d+(?:\.\d+)?$/.test(text) ? now + Number(text) * 1000
    : /^[A-Za-z]{3},/.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(at) && at >= now ? Math.min(at, now + 86_400_000) : undefined;
}

export function classifyAgentFailure(input: {
  status?: number; body?: unknown; text?: string; retryAfter?: string | null; networkError?: boolean; now: number;
}): AgentFailure {
  const body = input.body && typeof input.body === "object" ? input.body : {};
  const message = "error" in body && typeof body.error === "string" ? body.error : undefined;
  const retryAt = parseRetryAfter(input.retryAfter, input.now);
  const workerQuota = input.body === undefined && /error code:?\s*1027\b|Error 1027\b/i.test(input.text ?? "");
  if ("code" in body && body.code === "daily-quota" || workerQuota)
    return { kind: "quota", resetAt: "resetAt" in body && typeof body.resetAt === "number" && Number.isFinite(body.resetAt) ? body.resetAt : workerQuota ? nextUtcMidnight(input.now) : undefined, retryAt };
  // Only the Worker's signed-out answer means sign in again: an agent's expired or revoked
  // connection, an origin refusal and other 401/403 answers keep remote agents on.
  if (input.status === 401 && "code" in body && body.code === SIGNED_OUT) return { kind: "auth" };
  if (input.networkError || [408, 429, 500, 502, 503, 504].includes(input.status ?? 0)) return { kind: "transient", retryAt };
  return { kind: "other", message };
}
