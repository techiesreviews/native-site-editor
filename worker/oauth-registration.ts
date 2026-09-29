// Cross-isolate rate limits for anonymous dynamic client registration
// (RFC 7591, worker/oauth.ts). Every accepted registration creates a client
// Durable Object kept for the client lifetime, so an unlimited anonymous POST
// is a storage-exhaustion vector. All budgets live in one fixed-name
// SessionStore instance (worker/index.ts wires the route), checked and updated
// in a single blockConcurrencyWhile so counts stay exact across isolates.
//
// Only accepted registrations count, so the number of distinct per-IP entries
// is bounded by the global daily budget; no unique Durable Object is created
// per requester. Denied requests never persist state.

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
}

/** The minimal storage surface the limiter needs; a Durable Object's storage satisfies it. */
export interface BudgetStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface BudgetResult {
  allowed: boolean;
  /** Seconds to wait before retrying, for the Retry-After header on a denial. */
  retryAfter: number;
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
 * if so, record it. The caller must run this inside a single transaction
 * (blockConcurrencyWhile) so concurrent requests cannot exceed the limits.
 * Global limits are checked before any new per-IP state is allocated. State is
 * persisted only when a registration is accepted, so denials never grow storage.
 */
export async function admitRegistration(
  storage: BudgetStorage,
  ipHash: string,
  now: number,
  setAlarm?: (at: number) => void | Promise<void>,
): Promise<BudgetResult> {
  const state = (await storage.get<BudgetState>(KEY)) ?? fresh(now);
  prune(state, now);
  const deny = (retryAfter: number): BudgetResult => ({ allowed: false, retryAfter: Math.max(1, retryAfter) });
  if (state.day.count >= GLOBAL_DAY) return deny(Math.ceil((DAY - (now - state.day.start)) / 1000));
  if (state.hour.count >= GLOBAL_HOUR) return deny(Math.ceil((HOUR - (now - state.hour.start)) / 1000));
  const ip = state.ips[ipHash];
  if (ip && ip.count >= PER_IP_HOUR) return deny(Math.ceil((HOUR - (now - ip.start)) / 1000));
  state.hour.count++;
  state.day.count++;
  state.ips[ipHash] = ip ? { start: ip.start, count: ip.count + 1 } : { start: now, count: 1 };
  await storage.put(KEY, state);
  await setAlarm?.(now + DAY);
  return { allowed: true, retryAfter: 0 };
}

/**
 * Alarm-time cleanup: roll expired windows and drop stale per-IP entries so the
 * budget instance does not retain state forever. Reschedules while state remains.
 */
export async function pruneRegistration(
  storage: BudgetStorage,
  now: number,
  setAlarm?: (at: number) => void | Promise<void>,
) {
  const state = await storage.get<BudgetState>(KEY);
  if (!state) return;
  prune(state, now);
  if (state.hour.count === 0 && state.day.count === 0 && Object.keys(state.ips).length === 0) {
    await storage.delete(KEY);
    return;
  }
  await storage.put(KEY, state);
  await setAlarm?.(now + DAY);
}
