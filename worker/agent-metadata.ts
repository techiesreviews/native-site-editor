// Persistent workspace agent metadata consists of the AgentGrant record, its
// HubGrant entry (including reserved first-use growth), and this ledger. The
// relay's command payloads remain in memory.
// SessionStore holds lifecycle fences separately and schedules disconnect cleanup;
// this accounting function itself only expires entries lazily.
export const METADATA_KEY = "agent-metadata";
export const METADATA_ROUTE = "/agent-metadata";

export interface Entry { id: string; sessionId: string; generation: number; state: "pending" | "final" | "cleaned"; bytes: number; expiresAt: number; at: number }
export interface Ledger { workspace: string; entries: Entry[] }
export type MetadataOperation =
  | { action: "reserve"; id: string; sessionId: string; generation: number; bytes: number; expiresAt: number }
  | { action: "finalize"; id: string; generation: number }
  | { action: "release"; id: string; generation: number; expected?: Entry }
;
export type MetadataAction = { workspace: string } & MetadataOperation;
export interface MetadataResult { allowed: boolean; reason?: "invalid" | "workspace" | "connections" | "bytes" | "cleaned"; entries: Entry[] }
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
      !Number.isSafeInteger(operation.generation) || operation.generation < 1 ||
      (operation.action === "reserve" && (typeof operation.sessionId !== "string" || !operation.sessionId ||
        !Number.isSafeInteger(operation.bytes) || operation.bytes <= 0 ||
        !Number.isSafeInteger(operation.expiresAt) || operation.expiresAt <= now)))
    return { allowed: false, reason: "invalid", entries: [] };
  const stored = await storage.get<Ledger>(METADATA_KEY);
  if (stored && stored.workspace !== operation.workspace)
    return { allowed: false, reason: "workspace", entries: [] };
  const ledger: Ledger = { workspace: operation.workspace, entries: (stored?.entries ?? []).filter(entry => entry.expiresAt > now) };
  let changed = Boolean(stored && ledger.entries.length !== stored.entries.length);
  const entry = ledger.entries.find(entry => entry.id === operation.id);
  if (entry?.state === "cleaned" && operation.action !== "release")
    return { allowed: false, reason: "cleaned", entries: ledger.entries };
  let reason: MetadataResult["reason"];
  if (operation.action === "reserve" && (!entry || entry.generation < operation.generation)) {
    // Returning to a workspace establishes a newer reservation before fencing
    // the hub. Older completions must not release or finalize this generation.
    const reservation: Entry = { id: operation.id, sessionId: operation.sessionId, generation: operation.generation,
      state: "pending", bytes: Math.max(operation.bytes, entry?.bytes ?? 0), expiresAt: operation.expiresAt, at: now };
    const next: Ledger = { ...ledger, entries: entry
      ? ledger.entries.map(item => item.id === operation.id ? reservation : item)
      : [...ledger.entries, reservation] };
    const bytes = next.entries.reduce((sum, entry) => sum + entry.bytes, 0) + new TextEncoder().encode(JSON.stringify(next)).byteLength;
    if (next.entries.length > caps.connections) reason = "connections";
    else if (bytes > caps.bytes) reason = "bytes";
    else { ledger.entries = next.entries; changed = true; }
  } else if (operation.action === "finalize" && entry?.state === "pending" && entry.generation === operation.generation) {
    entry.state = "final";
    changed = true;
  } else if (operation.action === "release" && entry && entry.generation <= operation.generation &&
      (!operation.expected || JSON.stringify(entry) === JSON.stringify(operation.expected))) {
    ledger.entries = ledger.entries.filter(item => item.id !== operation.id);
    changed = true;
  }
  // Keep the workspace binding even when empty. An alarm must never clear it.
  if (changed) await storage.put(METADATA_KEY, ledger);
  return { allowed: !reason, reason, entries: ledger.entries };
}
