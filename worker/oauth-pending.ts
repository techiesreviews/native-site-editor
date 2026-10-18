// Unfinished OAuth records share a ledger in their sign-in SessionStore.
// Only OAuth lifecycle operations touch it; expired records stop counting.
export const PENDING_KEY = "oauth-pending";
export const PENDING_ROUTE = "/oauth-pending";
const MAX_RECORDS = 20;
const MAX_BYTES = 64 * 1024;

interface Entry { bytes: number; expiresAt: number }
type Ledger = Record<string, Entry>;
export type PendingAction =
  | { action: "reserve"; id: string; bytes: number; expiresAt: number }
  | { action: "transition"; fromId: string; id: string; bytes: number; expiresAt: number }
  | { action: "release"; id: string };

interface PendingStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

/** Caller serializes operations and supplies transactional storage. */
export async function accountPending(storage: PendingStorage, operation: PendingAction, now: number) {
  const validId = (id: unknown) => typeof id === "string" && /^oauth-(request|code):[a-f0-9]{64}$/.test(id);
  if (!operation || !validId(operation.id) ||
      !["reserve", "transition", "release"].includes(operation.action) ||
      (operation.action === "transition" && (!validId(operation.fromId) || operation.fromId === operation.id)) ||
      (operation.action !== "release" && (!Number.isSafeInteger(operation.bytes) || operation.bytes <= 0 ||
        !Number.isSafeInteger(operation.expiresAt) || operation.expiresAt <= now)))
    return { allowed: false, reason: "invalid" };

  const ledger = (await storage.get<Ledger>(PENDING_KEY)) ?? {};
  let changed = false;
  const remove = (id: string) => {
    if (!ledger[id]) return;
    delete ledger[id];
    changed = true;
  };
  for (const [id, entry] of Object.entries(ledger))
    if (entry.expiresAt <= now) remove(id);

  let allowed = true;
  let reason: string | undefined;
  // A consumed request is removed even when its replacement cannot fit.
  if (operation.action === "transition") remove(operation.fromId);
  if (operation.action === "release") remove(operation.id);
  else {
    const session = await storage.get<{ kind: string; expiresAt: number }>("session");
    if (session?.kind !== "user" || session.expiresAt <= now) {
      allowed = false;
      reason = "session";
    } else if (!ledger[operation.id]) {
      const entries = Object.values(ledger);
      if (entries.length >= MAX_RECORDS || entries.reduce((sum, entry) => sum + entry.bytes, 0) + operation.bytes > MAX_BYTES) {
        allowed = false;
        reason = "capacity";
      } else {
        ledger[operation.id] = { bytes: operation.bytes, expiresAt: operation.expiresAt };
        changed = true;
      }
    }
  }
  if (changed) {
    if (Object.keys(ledger).length) await storage.put(PENDING_KEY, ledger);
    else await storage.delete(PENDING_KEY);
  }
  return { allowed, reason };
}
