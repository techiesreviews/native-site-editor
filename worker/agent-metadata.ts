// Persistent workspace agent metadata consists of the AgentGrant record, its
// HubGrant entry (including reserved first-use growth), and this ledger. The
// relay retains only memory and editor WebSocket attachments, not agent
// connections. Watch lives in browser localStorage. Neither adds persistent DO
// metadata. Expiry is lazy; this ledger never schedules an alarm.
export const METADATA_KEY = "agent-metadata";
export const METADATA_ROUTE = "/agent-metadata";

interface Entry { id: string; state: "pending" | "final"; bytes: number; expiresAt: number; at: number }
interface Ledger { workspace: string; entries: Entry[] }
export type MetadataOperation =
  | { action: "reserve"; id: string; bytes: number; expiresAt: number }
  | { action: "finalize"; id: string }
  | { action: "release"; id: string; expected?: Entry }
;
export type MetadataAction = { workspace: string } & MetadataOperation;
export interface MetadataResult { allowed: boolean; reason?: "invalid" | "workspace" | "connections" | "bytes"; entries: Entry[] }
interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

/** bytes counts external serialized records; admission also counts the entire
 * serialized ledger, including its workspace, envelope and entries. The caller
 * supplies serialized, transactional storage. Refusal never evicts a live entry.
 */
export async function accountMetadata(storage: Storage, operation: MetadataAction, now: number,
  caps = { connections: 5, bytes: 64 * 1024 }): Promise<MetadataResult> {
  if (!operation || typeof operation.workspace !== "string" || !operation.workspace ||
      !/^[a-f0-9]{64}$/.test(operation.id) || !["reserve", "finalize", "release"].includes(operation.action) ||
      (operation.action === "reserve" && (!Number.isSafeInteger(operation.bytes) || operation.bytes <= 0 ||
        !Number.isSafeInteger(operation.expiresAt) || operation.expiresAt <= now)))
    return { allowed: false, reason: "invalid", entries: [] };
  const stored = await storage.get<Ledger>(METADATA_KEY);
  if (stored && stored.workspace !== operation.workspace)
    return { allowed: false, reason: "workspace", entries: [] };
  const ledger: Ledger = { workspace: operation.workspace, entries: (stored?.entries ?? []).filter(entry => entry.expiresAt > now) };
  let changed = Boolean(stored && ledger.entries.length !== stored.entries.length);
  const entry = ledger.entries.find(entry => entry.id === operation.id);
  let reason: MetadataResult["reason"];
  if (operation.action === "reserve" && !entry) {
    const next: Ledger = { ...ledger, entries: [...ledger.entries,
      { id: operation.id, state: "pending", bytes: operation.bytes, expiresAt: operation.expiresAt, at: now }] };
    const bytes = next.entries.reduce((sum, entry) => sum + entry.bytes, 0) + new TextEncoder().encode(JSON.stringify(next)).byteLength;
    if (next.entries.length > caps.connections) reason = "connections";
    else if (bytes > caps.bytes) reason = "bytes";
    else { ledger.entries = next.entries; changed = true; }
  } else if (operation.action === "finalize" && entry?.state === "pending") {
    entry.state = "final";
    changed = true;
  } else if (operation.action === "release" && entry &&
      (!operation.expected || JSON.stringify(entry) === JSON.stringify(operation.expected))) {
    ledger.entries = ledger.entries.filter(item => item.id !== operation.id);
    changed = true;
  }
  // Keep the workspace binding even when empty. An alarm must never clear it.
  if (changed) await storage.put(METADATA_KEY, ledger);
  return { allowed: !reason, reason, entries: ledger.entries };
}
