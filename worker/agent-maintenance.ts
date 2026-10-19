// Restricted maintenance: never use the ordinary session read, which may consume
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
// Per-invocation bounds; past them the object is deferred as oversized.
const maxKeys = 2048;
const maxReadBytes = 16 * 1024 * 1024;
/** The SQLite-backed Durable Object storage maximum for one value. */
const maxValueBytes = 2 * 1024 * 1024;
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

/** Both maintenance routes authenticate before parsing or touching the namespace. */
async function authorize(request: Request, token: string | undefined) {
  if (!token || token.length < 32) return response({ error: "Not found" }, 404);
  const supplied = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const digests = await Promise.all([token, supplied].map(async (value) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))));
  let difference = 0;
  for (let index = 0; index < 32; index++) difference |= digests[0][index] ^ digests[1][index];
  if (!supplied || difference !== 0) return response({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return response({ error: "Use POST" }, 405);
}
const hex = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);
function cleanupInput(value: unknown) {
  const input = object(value);
  const wakeDay = input?.wakeDay;
  const validDay = wakeDay === undefined || (typeof wakeDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wakeDay) &&
    Number.isFinite(Date.parse(wakeDay)) && utcDay(Date.parse(wakeDay)) === wakeDay);
  return input && hex(input.expected) && number(input.allowance) && input.allowance >= 1 && validDay
    ? { expected: input.expected, allowance: input.allowance, wakeDay: wakeDay as string | undefined } : undefined;
}
async function maintenanceRoute(request: Request, sessions: Env["SESSIONS"], token: string | undefined, cleanup: boolean) {
  const denied = await authorize(request, token);
  if (denied) return denied;
  let input: unknown;
  try { input = await request.json(); } catch { return response({ error: "Invalid body" }, 400); }
  const id = object(input)?.id;
  const deletion = cleanup ? cleanupInput(input) : undefined;
  if (!hex(id) || (cleanup && !deletion)) return response({ error: "Invalid body" }, 400);
  try {
    const result = await sessions.get(sessions.idFromString(id)).fetch(
      new Request(`https://session.internal/maintenance/${cleanup ? "cleanup" : "inventory"}`, {
        method: "POST", ...(cleanup ? { body: JSON.stringify(deletion) } : {}),
      }),
    );
    // Internal failures must not forward runtime text supplied by the platform.
    if (cleanup && !result.ok) {
      const failed = response({ error: "Cleanup unavailable" }, 503);
      const retry = result.headers.get("Retry-After");
      if (retry) failed.headers.set("Retry-After", retry);
      return failed;
    }
    const headers = new Headers(result.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(result.body, { status: result.status, headers });
  } catch {
    return response({ error: cleanup ? "Cleanup unavailable" : "Inventory unavailable" }, 503);
  }
}
export function inventoryRoute(request: Request, env: Pick<Env, "SESSIONS" | "MAINTENANCE_INVENTORY_TOKEN">) {
  return maintenanceRoute(request, env.SESSIONS, env.MAINTENANCE_INVENTORY_TOKEN, false);
}
export function cleanupRoute(request: Request, env: Pick<Env, "SESSIONS" | "MAINTENANCE_CLEANUP_TOKEN">) {
  return maintenanceRoute(request, env.SESSIONS, env.MAINTENANCE_CLEANUP_TOKEN, true);
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
  } else if (key === "agent-cleaned-until") {
    summary.kind = "record-fence";
    if (expiry(value)) summary.eligibility = (value as number) <= now ? "expired" : "preserve";
  } else if (key === "agent-metadata") {
    summary.kind = "workspace-ledger";
    if (record && typeof record.workspace === "string" && Array.isArray(record.entries)) summary.eligibility = "preserve";
  } else if (key === "alarm-deadlines") {
    summary.kind = "alarm-deadlines";
    if (record && Object.entries(record).every(([purpose, at]) =>
      ["session", "registration", "agent-cleanup"].includes(purpose) && expiry(at))) summary.eligibility = "preserve";
  } else if (key === "agent-lifecycle") {
    summary.kind = "agent-lifecycle";
    if (record && number(record.generation) && object(record.cleaned) && Object.values(object(record.cleaned)!).every(number) &&
        (record.disconnectDeadline === undefined || expiry(record.disconnectDeadline))) {
      summary.generation = record.generation;
      for (const at of Object.values(object(record.cleaned)!)) expiry(at);
      summary.eligibility = "preserve";
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

/** One bounded classifier shared by inventory and deletion under the concurrency gate. */
async function classify(storage: InventoryStorage, now: number) {
  let totalKeys = 0, totalBytes = 0, startAfter: string | undefined, oversized = false;
  const entries: { key: string; value: unknown; item: RecordSummary }[] = [];
  for (;;) {
    // list() loads every value it returns: size each page by the read bytes
    // left and the largest value SQLite storage holds, so one page cannot
    // materialize more than the cap (plus at most one value past it).
    const limit = Math.min(128, Math.max(1, Math.floor((maxReadBytes - totalBytes) / maxValueBytes)));
    const page = await storage.list({ startAfter, limit });
    for (const [key, value] of page) {
      const item = describe(key, value, now);
      entries.push({ key, value, item });
      totalKeys++;
      totalBytes += item.bytes;
      startAfter = key;
      if (totalKeys >= maxKeys || totalBytes >= maxReadBytes) { oversized = true; break; }
    }
    if (oversized || page.size < limit) break;
  }
  const items = entries.map(entry => entry.item);
  const storedSession = entries.find(entry => entry.key === "session");
  const session = items.find(item => item.kind === "sign-in-session");
  const hub = entries.find(entry => entry.item.kind === "legacy-agent-hub");
  const hubValue = object(hub?.value);
  const legacy = entries.filter(entry => ["legacy-context", "legacy-drafts", "legacy-requests"].includes(entry.item.kind));
  const hasContent = legacy.length > 0 || hubValue?.context !== undefined ||
    (Array.isArray(hubValue?.commands) && hubValue.commands.length > 0);
  if (!oversized) {
    for (const item of items) if (item.kind === "repository-cache") {
      if (session?.eligibility === "preserve") item.eligibility = "preserve";
      else if (item.eligibility === "review") item.eligibility = session && session.eligibility !== "review" ? session.eligibility : "expired";
    }
    // The pending authorization ledger lives with its sign-in session: ordinary
    // session expiry removes it (worker/index.ts alarm), so an expired session
    // takes it along. Under a live session its own entry expiries decide.
    if (session?.eligibility === "expired")
      for (const item of items) if (item.kind === "oauth-pending" && item.eligibility !== "review") item.eligibility = "expired";
    // No signed browser acknowledgement exists in this slice. Old server content
    // is never recovery proof: only absolute expiry plus the clock margin is.
    // Hub grants (HubGrant) are objects with a string id; an expiry, when a
    // grant carries one, must be valid. Anything else is an unknown schema, so
    // the hub needs review instead of an expiry guess.
    if (hub && Array.isArray(hubValue?.grants) && hubValue.grants.some(grant => {
      const entry = object(grant);
      return !entry || typeof entry.id !== "string" || (entry.expiresAt !== undefined && !number(entry.expiresAt));
    })) hub.item.eligibility = "review";
    if (hub && hub.item.eligibility !== "review") {
      const expiries = [hub.item.latestExpiresAt!, ...(Array.isArray(hubValue?.grants)
        ? hubValue.grants.map(grant => object(grant)?.expiresAt).filter(number) : [])];
      const expiresAt = Math.max(...expiries) + (hasContent ? 5 * 60_000 : 0);
      if (number(hubValue?.generation)) hub.item.generation = hubValue.generation;
      hub.item.eligibility = expiresAt <= now ? "expired" : hasContent ? "legacy-candidate" : "preserve";
    }
    for (const entry of legacy) if (entry.item.eligibility !== "review") {
      if (hub) entry.item.eligibility = hub.item.eligibility === "expired" ? "expired" : "legacy-candidate";
      else if (!storedSession) entry.item.eligibility = "expired";
    }
    const metadata = items.filter(item => ["alarm-deadlines", "agent-lifecycle"].includes(item.kind));
    if (items.filter(item => !metadata.includes(item)).every(item => item.eligibility === "expired") &&
        metadata.every(item => item.eligibility !== "review" &&
          !(item.kind === "agent-lifecycle" && (item.latestExpiresAt ?? 0) > now)))
      for (const item of metadata) item.eligibility = "expired";
  }
  const tuples = [...entries].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(({ key, value, item }) => {
    const record = object(value);
    const grants = Array.isArray(record?.grants) ? record.grants.map(grant => {
      const entry = object(grant);
      return [entry?.id ?? null, entry?.generation ?? null, entry?.expiresAt ?? null];
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : null;
    return [key, item.kind, item.eligibility, item.bytes, [item.generation ?? null, grants],
      [item.earliestExpiresAt ?? null, item.latestExpiresAt ?? null,
        item.kind === "alarm-deadlines" ? Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b)) :
          item.kind === "agent-lifecycle" ? Object.entries(object(record?.cleaned) ?? {}).sort(([a], [b]) => a.localeCompare(b)) : null]];
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(tuples)));
  const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const summaries = new Map<string, RecordSummary>();
  for (const item of items) {
    const group = `${item.kind}:${item.eligibility}:${item.generation ?? ""}`;
    const previous = summaries.get(group);
    if (!previous) summaries.set(group, { ...item });
    else {
      previous.count += item.count;
      previous.bytes += item.bytes;
      if (item.earliestExpiresAt !== undefined) previous.earliestExpiresAt = Math.min(previous.earliestExpiresAt ?? Infinity, item.earliestExpiresAt);
      if (item.latestExpiresAt !== undefined) previous.latestExpiresAt = Math.max(previous.latestExpiresAt ?? 0, item.latestExpiresAt);
    }
  }
  const records = [...summaries.values()];
  return { entries, oversized, fingerprint, inventory: {
    schema: "durable-inventory", version: 1, fingerprint,
    status: oversized ? "deferred" : records.length && records.every((record) => record.kind === "unknown") ? "unknown" : "classified",
    ...(oversized ? { reason: "oversized" } : {}), totalKeys, totalBytes,
    alarm: (await storage.getAlarm?.()) ?? null, records,
  } };
}

/** Read-only: never consumes ordinary session records. */
export async function inventoryObject(request: Request, storage: InventoryStorage, now = Date.now()) {
  if (request.method !== "POST") return response({ error: "Use POST" }, 405);
  return response((await classify(storage, now)).inventory);
}

interface CleanupStorage extends InventoryStorage {
  deleteAll(): Promise<void>;
  delete(keys: string[]): Promise<number>;
  deleteAlarm(): Promise<void>;
  setAlarm(at: number): Promise<void>;
  put(key: string, value: unknown): Promise<void>;
}
/** Caller holds blockConcurrencyWhile throughout. No namespace or browser calls. */
export async function cleanupObject(request: Request, storage: CleanupStorage, options: { sockets: number; now?: number }) {
  if (request.method !== "POST") return response({ error: "Use POST" }, 405);
  let input;
  try { input = cleanupInput(await request.json()); } catch { /* Invalid JSON has no storage effects. */ }
  if (!input) return response({ error: "Invalid body" }, 400);
  const now = options.now ?? Date.now();
  const current = await classify(storage, now);
  const { entries, fingerprint } = current;
  const unresolvedCommands = entries.reduce((sum, entry) => sum +
    (entry.item.commandsByState?.pending ?? 0) + (entry.item.commandsByState?.unknown ?? 0), 0);
  let keptKeys = entries.length;
  const answer = (status: string, reason?: string, method?: string, deletedKeys = 0, invocations = 1) => response({
    schema: "durable-cleanup", version: 1, status, ...(reason ? { reason } : {}), ...(method ? { method } : {}),
    deletedKeys, keptKeys: keptKeys - deletedKeys, unresolvedCommands, invocations, fingerprint,
  });
  if (current.oversized) return answer("deferred", "oversized");
  if (entries.some(({ item }) => item.kind === "unknown" || item.eligibility === "review")) return answer("review");
  if (!entries.length) return options.sockets > 0 ? answer("deferred", "present") : answer("kept");
  if (fingerprint !== input.expected) return answer("deferred", "changed");
  if (options.sockets > 0) return answer("deferred", "present");
  if (entries.some(({ item }) => item.eligibility === "legacy-candidate")) return answer("deferred", "awaiting-browser-recovery");
  const expired = entries.filter(({ item }) => item.eligibility === "expired");
  if (!expired.length) return answer("kept");
  if (expired.length === entries.length) {
    await storage.deleteAlarm();
    await storage.deleteAll();
    return answer("deleted", undefined, "deleteAll", expired.length);
  }
  const remaining = entries.filter(({ item }) => item.eligibility !== "expired");
  const deadlines = object(remaining.find(entry => entry.key === "alarm-deadlines")?.value);
  // Lifecycle/registration retry chains have no finite invocation bound here.
  // Leave their records and alarms to normal lifecycle ownership, without writes.
  if (deadlines?.["agent-cleanup"] !== undefined || deadlines?.registration !== undefined ||
      remaining.some(entry => entry.item.kind === "registration-limiter") ||
      remaining.some(entry => entry.item.kind === "agent-lifecycle" &&
        (object(entry.value)?.disconnectDeadline !== undefined || object(entry.value)?.cleanupPending === true)))
    return answer("deferred", "budget");
  const session = remaining.find(entry => entry.key === "session");
  const fence = remaining.find(entry => entry.key === "agent-cleaned-until");
  // Each record enforces its own absolute expiry. A single wake at the latest
  // expiry can clear both; an earlier wake would reschedule itself for the session.
  // An orphan pending ledger (no session) keeps its entries' own expiry; the
  // same wake removes it, since the session alarm clears it without a session.
  const pending = remaining.find(entry => entry.key === "oauth-pending")?.item.latestExpiresAt;
  const times = [object(session?.value)?.expiresAt, fence?.value, pending].filter(number);
  const deadline = times.length ? Math.max(...times) : Infinity;
  const invocations = Number.isFinite(deadline) ? 2 : 1;
  if (invocations > input.allowance || (Number.isFinite(deadline) && utcDay(deadline) !== input.wakeDay))
    return answer("deferred", "budget");
  // Remove stale purposes before deleting their data. A surviving session/fence
  // needs one local alarm wake; no alarm points at the removed legacy content.
  if (Number.isFinite(deadline)) {
    if (!deadlines) keptKeys++;
    await storage.put("alarm-deadlines", { session: deadline });
    await storage.setAlarm(deadline);
  } else {
    await storage.deleteAlarm();
  }
  const keys = expired.map(entry => entry.key);
  for (let offset = 0; offset < keys.length; offset += 128) await storage.delete(keys.slice(offset, offset + 128));
  return answer("deleted", undefined, "keys", keys.length, invocations);
}
