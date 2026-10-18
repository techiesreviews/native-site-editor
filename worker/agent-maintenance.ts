// Read-only maintenance: never use the ordinary session read, which may consume
// expired records or include credentials. All output is constructed explicitly.
import type { Env } from "./app";

interface InventoryStorage {
  list(options: { startAfter?: string; limit: number }): Promise<Map<string, unknown>>;
  getAlarm?(): Promise<number | null>;
}
type Eligibility = "preserve" | "expired" | "legacy-candidate" | "review";
interface RecordSummary {
  kind: string;
  count: number;
  bytes: number;
  eligibility: Eligibility;
  earliestExpiresAt?: number;
  latestExpiresAt?: number;
  generation?: number;
  grants?: number;
  commandsByState?: { pending: number; applied: number; conflict: number; failed: number; unknown: number };
  inlineContext?: boolean;
}
const internalPath = "/maintenance/inventory";
const number = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)
    ? value as Record<string, unknown> : undefined;
function bytes(value: unknown) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value.byteLength;
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value) ?? "").byteLength;
}
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(status === 405 ? { Allow: "POST" } : {}) } });
}

/** Separately authorized public ingress; authorization precedes all DO work. */
export async function inventoryRoute(request: Request, env: Pick<Env, "SESSIONS" | "MAINTENANCE_INVENTORY_TOKEN">) {
  const token = env.MAINTENANCE_INVENTORY_TOKEN;
  if (!token || token.length < 32) return response({ error: "Not found" }, 404);
  const supplied = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const digests = await Promise.all([token, supplied].map(async (value) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))));
  let difference = 0;
  for (let index = 0; index < 32; index++) difference |= digests[0][index] ^ digests[1][index];
  if (!supplied || difference !== 0) return response({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return response({ error: "Use POST" }, 405);
  let input: unknown;
  try { input = await request.json(); } catch { return response({ error: "Invalid body" }, 400); }
  const id = object(input)?.id;
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) return response({ error: "Invalid id" }, 400);
  try {
    const result = await env.SESSIONS.get(env.SESSIONS.idFromString(id)).fetch(
      new Request(`https://session.internal${internalPath}`, { method: "POST" }),
    );
    const headers = new Headers(result.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(result.body, { status: result.status, headers });
  } catch {
    // Runtime error messages may contain credentials or object identifiers.
    return response({ error: "Inventory unavailable" }, 503);
  }
}

function describe(key: string, value: unknown, now: number): RecordSummary {
  const record = object(value);
  const summary: RecordSummary = { kind: "unknown", count: 1, bytes: bytes(value), eligibility: "review" };
  const expiry = (expiresAt: unknown) => {
    if (!number(expiresAt)) return false;
    summary.earliestExpiresAt = Math.min(summary.earliestExpiresAt ?? Infinity, expiresAt);
    summary.latestExpiresAt = Math.max(summary.latestExpiresAt ?? 0, expiresAt);
    return true;
  };
  if (key === "session") {
    const kinds: Record<string, string> = {
      user: "sign-in-session", oauth: "one-time-sign-in", install: "one-time-sign-in", "owner-setup": "one-time-sign-in",
      agent: "agent-grant", "agent-hub": "legacy-agent-hub", "oauth-client": "oauth-client", "oauth-request": "oauth-request", "oauth-code": "oauth-code",
    };
    const kind = typeof record?.kind === "string" && Object.hasOwn(kinds, record.kind) ? kinds[record.kind] : undefined;
    if (!kind) return summary;
    summary.kind = kind;
    if (expiry(record!.expiresAt)) summary.eligibility = record!.expiresAt as number <= now ? "expired" : "preserve";
    if (kind === "agent-grant") {
      if (number(record!.generation)) summary.generation = record!.generation;
      else summary.eligibility = "review";
    }
    if (kind === "legacy-agent-hub") {
      if (summary.eligibility === "preserve") summary.eligibility = "legacy-candidate";
      summary.grants = Array.isArray(record!.grants) ? record!.grants.length : 0;
      summary.inlineContext = record!.context !== undefined;
      const states = { pending: 0, applied: 0, conflict: 0, failed: 0, unknown: 0 };
      for (const command of Array.isArray(record!.commands) ? record!.commands : []) {
        const state = object(command)?.state;
        if (state === "pending" || state === "applied" || state === "conflict" || state === "failed") states[state]++;
        else states.unknown++;
      }
      summary.commandsByState = states;
      if (!Array.isArray(record!.grants) || (record!.commands !== undefined && !Array.isArray(record!.commands)) || states.unknown)
        summary.eligibility = "review";
    }
  } else if (key === "config") {
    summary.kind = "app-config";
    if (record) summary.eligibility = "preserve";
  } else if (key === "context" || key === "drafts" || /^draft:[a-f0-9]{64}$/.test(key) || key === "requests") {
    summary.kind = key === "context" ? "legacy-context" : key === "requests" ? "legacy-requests" : "legacy-drafts";
    const valid = key === "requests" ? Array.isArray(value) : key.startsWith("draft:")
      ? typeof value === "string" || value instanceof ArrayBuffer || ArrayBuffer.isView(value) : !!record;
    if (valid) summary.eligibility = "legacy-candidate";
    if (key === "drafts" && record) summary.count = Object.keys(record).length;
    if (key === "requests" && Array.isArray(value)) summary.count = value.length;
  } else if (key === "oauth-pending") {
    summary.kind = "oauth-pending";
    const entries = record ? Object.values(record) : [];
    summary.count = entries.length;
    const valid = !!record && entries.map((entry) => expiry(object(entry)?.expiresAt)).every(Boolean);
    if (valid) summary.eligibility = entries.length && summary.latestExpiresAt! <= now ? "expired" : "preserve";
  } else if (key === "oauth-registration-budget" || key.startsWith("registration-client:") || key.startsWith("registration:")) {
    summary.kind = "registration-limiter";
    if (key === "oauth-registration-budget") {
      if (record && object(record.hour) && object(record.day) && object(record.ips)) summary.eligibility = "preserve";
    } else {
      // registration-client values are expiry numbers; registration: is the
      // limiter's padded expiry index (oauth-registration.ts PREFIX).
      const client = key.match(/^registration-client:mcp_[a-f0-9]{32}$/);
      const index = key.match(/^registration:(\d{16}):(mcp_[a-f0-9]{32})$/);
      const expiresAt = client ? value : index && value === index[2] ? Number(index[1]) : undefined;
      if (expiry(expiresAt)) summary.eligibility = (expiresAt as number) <= now ? "expired" : "preserve";
    }
  } else if (key === "repositoryCache" || key.startsWith("repositoryCache:") || key === "repositoryCacheGeneration") {
    summary.kind = "repository-cache";
    if (key === "repositoryCacheGeneration" && number(value)) summary.generation = value;
    else if (record) expiry(record.expiresAt);
    if (summary.latestExpiresAt !== undefined && summary.latestExpiresAt <= now) summary.eligibility = "expired";
  }
  // Relay metadata is reserved for a future schema. agent-relay.ts currently
  // stores no keys: guessed relay prefixes remain unknown and require review.
  return summary;
}

/** Internal handler uses only list/getAlarm; no writes, consumption or alarms. */
export async function inventoryObject(request: Request, storage: InventoryStorage, now = Date.now()) {
  if (request.method !== "POST") return response({ error: "Use POST" }, 405);
  let totalKeys = 0, totalBytes = 0, startAfter: string | undefined, oversized = false;
  const items: RecordSummary[] = [];
  for (;;) {
    const page = await storage.list({ startAfter, limit: 128 });
    for (const [key, value] of page) {
      const item = describe(key, value, now);
      items.push(item);
      totalKeys++;
      totalBytes += item.bytes;
      startAfter = key;
      if (totalKeys >= 2048 || totalBytes >= 8 * 1024 * 1024) { oversized = true; break; }
    }
    if (oversized || page.size < 128) break;
  }
  // The repository cache is disposable and follows its sign-in session (the
  // alarm clears it at expiry); without a session it is an orphan. A partial
  // (oversized) read may not have reached "session", so it stays for review.
  const session = items.find((item) => item.kind === "sign-in-session");
  for (const item of items) if (item.kind === "repository-cache" && item.eligibility === "review" && !oversized)
    item.eligibility = session && session.eligibility !== "review" ? session.eligibility : "expired";
  const summaries = new Map<string, RecordSummary>();
  for (const item of items) {
    const group = `${item.kind}:${item.eligibility}:${item.generation ?? ""}`;
    const previous = summaries.get(group);
    if (!previous) summaries.set(group, item);
    else {
      previous.count += item.count;
      previous.bytes += item.bytes;
      if (item.earliestExpiresAt !== undefined) previous.earliestExpiresAt = Math.min(previous.earliestExpiresAt ?? Infinity, item.earliestExpiresAt);
      if (item.latestExpiresAt !== undefined) previous.latestExpiresAt = Math.max(previous.latestExpiresAt ?? 0, item.latestExpiresAt);
    }
  }
  const records = [...summaries.values()];
  return response({
    schema: "durable-inventory", version: 1,
    status: oversized ? "deferred" : records.length && records.every((record) => record.kind === "unknown") ? "unknown" : "classified",
    ...(oversized ? { reason: "oversized" } : {}), totalKeys, totalBytes,
    alarm: (await storage.getAlarm?.()) ?? null, records,
  });
}
