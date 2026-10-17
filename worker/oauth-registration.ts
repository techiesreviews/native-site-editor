// Cross-isolate rate limits for anonymous dynamic client registration
// (RFC 7591, worker/oauth.ts). Every accepted registration creates a client
// Durable Object kept for the client lifetime, so an unlimited anonymous POST
// is a storage-exhaustion vector. All budgets live in one fixed-name
// SessionStore instance (worker/index.ts wires the route), checked and updated
// in a single blockConcurrencyWhile so counts stay exact across isolates.
//
// Only accepted registrations count, so the number of distinct per-IP entries
// is bounded by the global daily budget; no unique Durable Object is created
// per requester. Denied requests never grow budget state. Retained occupancy
// covers only registrations admitted since this change; legacy is unknown until
// ticket 27 inventories it. Ordinary OAuth and MCP traffic never updates it.

/** The fixed-name SessionStore instance that holds the registration budgets. */
export const REGISTRATION_BUDGET = "oauth-registration-budget";
/** The internal route on SessionStore that checks and updates the budgets. */
export const REGISTRATION_ROUTE = "/oauth-registration";
/** The storage key for the budget state, separate from sessions, hubs and OAuth records. */
const KEY = "oauth-registration-budget";

/** The bucket key for a request with no CF-Connecting-IP header. */
export const NO_IP_BUCKET = "no-cf-ip";
/** A valid budget key: a SHA-256 hash of CF-Connecting-IP, or the fallback bucket. */
export const isBudgetKey = (value: unknown): value is string =>
  value === NO_IP_BUCKET || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PER_IP_HOUR = 10;
const GLOBAL_HOUR = 100;
const GLOBAL_DAY = 1000;
export const REGISTRATION_CAP = 10_000;
export const REGISTRATION_BYTES = 16 * 1024;
const PENDING_LIFETIME = 10 * 60 * 1000;
const PREFIX = "registration:";
const clientKey = (id: string) => `registration-client:${id}`;
const expiryKey = (id: string, expiresAt: number) => `${PREFIX}${String(expiresAt).padStart(16, "0")}:${id}`;

interface Reservation {
  clientId: string;
  expiresAt: number;
}
interface Pending {
  expiresAt: number;
  createdAt: number;
}

interface Window {
  start: number;
  count: number;
}
interface BudgetState {
  hour: Window;
  day: Window;
  // Per-IP hourly windows, keyed by a hash of CF-Connecting-IP (or a single
  // fallback bucket when the header is absent). Pruned once their hour passes.
  ips: Record<string, Window>;
  /** Includes pending reservations; excludes uninventoried legacy records. */
  retained?: number;
  pending?: Record<string, Pending>;
  legacy?: "uninventoried";
}

/** The minimal storage surface the limiter needs; a Durable Object's storage satisfies it. */
export interface BudgetStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  getAlarm?(): Promise<number | null>;
  deleteAlarm?(): Promise<void>;
  list?<T = unknown>(options: { prefix: string; end: string; limit: number }): Promise<Map<string, T>>;
  transaction?<T>(callback: (storage: BudgetStorage) => Promise<T>): Promise<T>;
}

export interface BudgetResult {
  allowed: boolean;
  /** Seconds to wait before retrying, for the Retry-After header on a denial. */
  retryAfter: number;
  reason?: "capacity";
}

function fresh(now: number): BudgetState {
  return { hour: { start: now, count: 0 }, day: { start: now, count: 0 }, ips: {} };
}
function roll(window: Window, now: number, span: number): Window {
  return now - window.start >= span ? { start: now, count: 0 } : window;
}
function prune(state: BudgetState, now: number) {
  state.hour = roll(state.hour, now, HOUR);
  state.day = roll(state.day, now, DAY);
  for (const [hash, window] of Object.entries(state.ips))
    if (now - window.start >= HOUR) delete state.ips[hash];
}

/**
 * Atomically decide whether one registration from `ipHash` fits the budgets and,
 * if so, record it. Callers serialize all limiter operations through one
 * blockConcurrencyWhile; storage transactions also protect against partial writes.
 * Global limits are checked before any new per-IP state is allocated. State is
 * persisted only when a registration is accepted, so denials never grow storage.
 */
export async function admitRegistration(
  storage: BudgetStorage,
  ipHash: string,
  now: number,
  setAlarm?: (at: number) => void | Promise<void>,
  reservation?: Reservation,
): Promise<BudgetResult> {
  // Preserve the old rate-only API for test fixtures. Production always reserves.
  if (reservation) {
    const at = now + PENDING_LIFETIME;
    // Neither accepted traffic nor a stream of denials may postpone cleanup.
    if (((await storage.getAlarm?.()) ?? Infinity) > at) await setAlarm?.(at);
    return atomic(storage, async (transaction) => {
      const state = (await transaction.get<BudgetState>(KEY)) ?? fresh(now);
      if (state.pending?.[reservation.clientId] || (await transaction.get(clientKey(reservation.clientId))) !== undefined)
        return { allowed: true, retryAfter: 0 };
      if ((state.retained ?? 0) >= REGISTRATION_CAP)
        return { allowed: false, retryAfter: 0, reason: "capacity" };
      const result = rateAdmission(state, ipHash, now);
      if (!result.allowed) return result;
      state.retained = (state.retained ?? 0) + 1;
      state.legacy = "uninventoried";
      state.pending ??= {};
      state.pending[reservation.clientId] = { expiresAt: reservation.expiresAt, createdAt: now };
      await transaction.put(KEY, state);
      return result;
    });
  }
  const state = (await storage.get<BudgetState>(KEY)) ?? fresh(now);
  const result = rateAdmission(state, ipHash, now);
  if (!result.allowed) return result;
  await storage.put(KEY, state);
  await setAlarm?.(now + DAY);
  return result;
}

function rateAdmission(state: BudgetState, ipHash: string, now: number): BudgetResult {
  prune(state, now);
  const deny = (retryAfter: number): BudgetResult => ({ allowed: false, retryAfter: Math.max(1, retryAfter) });
  if (state.day.count >= GLOBAL_DAY) return deny(Math.ceil((DAY - (now - state.day.start)) / 1000));
  if (state.hour.count >= GLOBAL_HOUR) return deny(Math.ceil((HOUR - (now - state.hour.start)) / 1000));
  const ip = state.ips[ipHash];
  if (ip && ip.count >= PER_IP_HOUR) return deny(Math.ceil((HOUR - (now - ip.start)) / 1000));
  state.hour.count++;
  state.day.count++;
  state.ips[ipHash] = ip ? { start: ip.start, count: ip.count + 1 } : { start: now, count: 1 };
  return { allowed: true, retryAfter: 0 };
}

/** Multi-key accounting commits atomically, including on deletion/write failure. */
function atomic<T>(storage: BudgetStorage, callback: (transaction: BudgetStorage) => Promise<T>) {
  if (!storage.transaction) throw new Error("Registration accounting requires transactional storage");
  return storage.transaction(callback);
}

async function finalize(storage: BudgetStorage, state: BudgetState, clientId: string) {
  const pending = state.pending?.[clientId];
  if (!pending) return;
  await storage.put(clientKey(clientId), pending.expiresAt);
  await storage.put(expiryKey(clientId, pending.expiresAt), clientId);
  delete state.pending![clientId];
}

/** Finalization does not change occupancy; an unknown or repeated id is a no-op. */
export async function finalizeRegistration(storage: BudgetStorage, clientId: string) {
  await atomic(storage, async (transaction) => {
    const state = await transaction.get<BudgetState>(KEY);
    if (!state?.pending?.[clientId]) return;
    await finalize(transaction, state, clientId);
    await transaction.put(KEY, state);
  });
}

/** Caller must establish that no usable client record exists before releasing. */
export async function releaseRegistration(storage: BudgetStorage, clientId: string) {
  await atomic(storage, async (transaction) => {
    const state = await transaction.get<BudgetState>(KEY);
    if (!state) return;
    const expiresAt = await transaction.get<number>(clientKey(clientId));
    if (!state.pending?.[clientId] && expiresAt === undefined) return;
    if (expiresAt !== undefined) {
      await transaction.delete(expiryKey(clientId, expiresAt));
      await transaction.delete(clientKey(clientId));
    }
    delete state.pending?.[clientId];
    state.retained = (state.retained ?? 0) - 1;
    await transaction.put(KEY, state);
  });
}

/** Alarm cleanup promotes ambiguous allocations, then expires in bounded batches. */
export async function pruneRegistration(
  storage: BudgetStorage,
  now: number,
  setAlarm?: (at: number) => void | Promise<void>,
) {
  const state = await storage.get<BudgetState>(KEY);
  if (!state) return;
  if (state.retained !== undefined) {
    // Keep a retry scheduled even if a transaction or an expiry batch fails.
    await setAlarm?.(now + DAY);
    await atomic(storage, async (transaction) => {
      const current = (await transaction.get<BudgetState>(KEY))!;
      for (const [id, pending] of Object.entries(current.pending ?? {}))
        if (now - pending.createdAt >= PENDING_LIFETIME) await finalize(transaction, current, id);
      prune(current, now);
      await transaction.put(KEY, current);
    });
    let removed: number;
    do {
      removed = await atomic(storage, async (transaction) => {
        if (!transaction.list) throw new Error("Registration accounting requires indexed storage");
        const entries = await transaction.list<string>({ prefix: PREFIX, end: `${PREFIX}${String(now).padStart(16, "0")}:\uffff`, limit: 128 });
        if (!entries.size) return 0;
        const current = (await transaction.get<BudgetState>(KEY))!;
        for (const [key, id] of entries) {
          await transaction.delete(key);
          await transaction.delete(clientKey(id));
        }
        current.retained = current.retained! - entries.size;
        await transaction.put(KEY, current);
        return entries.size;
      });
    } while (removed === 128);
    // Preserve the explicit legacy marker when new occupancy is empty, without
    // keeping an idle object on a perpetual daily alarm.
    const remaining = (await storage.get<BudgetState>(KEY))!;
    if (remaining.retained === 0 && Object.keys(remaining.pending ?? {}).length === 0 &&
        remaining.hour.count === 0 && remaining.day.count === 0 && Object.keys(remaining.ips).length === 0)
      await storage.deleteAlarm?.();
    return;
  }
  prune(state, now);
  if (state.hour.count === 0 && state.day.count === 0 && Object.keys(state.ips).length === 0) {
    await storage.delete(KEY);
    return;
  }
  await storage.put(KEY, state);
  await setAlarm?.(now + DAY);
}
