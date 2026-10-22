/** Local-only lifecycle rules. Call mutations under the object's concurrency gate. */
export const DEADLINES_KEY = "alarm-deadlines";
export const LIFECYCLE_KEY = "agent-lifecycle";
/** After the last editor tab's live connection ends, temporary agent data waits this long. */
export const DISCONNECT_GRACE = 5 * 60_000;
/** An agent permission lasts this long from when the agent connected, tab or no tab
 * (or less, when the editor sign-in it belongs to ends sooner). */
export const AGENT_PERMISSION_LIFETIME = 8 * 60 * 60_000;
const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
/** A grant object's record fence, measured at its widest; charged per live tombstone. */
export const RECORD_FENCE_BYTES = utf8Bytes({ "agent-cleaned-until": Number.MAX_SAFE_INTEGER, "alarm-deadlines": { session: Number.MAX_SAFE_INTEGER } });
export type Deadlines = Partial<Record<"session" | "registration" | "agent-cleanup", number>>;
export interface LifecycleRecord {
  generation: number;
  disconnectDeadline?: number;
  cleanupPending?: boolean;
  /** Tombstones of grants the grace removed before permissions lasted 8 hours (ticket 98). None
   * are written now; they still refuse their id until the grant's absolute expiry. */
  cleaned: Record<string, number>;
}
interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(at: number): Promise<void>;
  getAlarm(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
}
export class AlarmDeadlines {
  constructor(private storage: Storage) {}
  async read(): Promise<Deadlines> {
    const table = await this.storage.get<Deadlines>(DEADLINES_KEY);
    if (table) return table;
    // Migration is lazy: construction never changes an existing alarm.
    const session = await this.storage.get<{ expiresAt: number }>("session");
    const registration = await this.storage.get("oauth-registration-budget");
    const alarm = await this.storage.getAlarm();
    return { ...(session ? { session: session.expiresAt } : {}),
      ...(registration && alarm !== null ? { registration: alarm } : {}) };
  }
  async set(purpose: keyof Deadlines, at?: number) {
    const table = await this.read();
    if (at === undefined) delete table[purpose];
    else table[purpose] = at;
    if (Object.keys(table).length) await this.storage.put(DEADLINES_KEY, table);
    else await this.storage.delete(DEADLINES_KEY);
    await this.schedule(table);
  }
  async schedule(table: Deadlines) {
    const next = Math.min(...Object.values(table));
    if (Number.isFinite(next)) await this.storage.setAlarm(next);
    else await this.storage.deleteAlarm();
  }
}
export class AgentLifecycle {
  private loaded?: Promise<LifecycleRecord>;
  constructor(private storage: Storage, private deadlines: AlarmDeadlines, private now = () => Date.now()) {}
  /** One key read per wake; dispatch uses this in-memory fence without writes. */
  load() { return this.loaded ??= this.storage.get<LifecycleRecord>(LIFECYCLE_KEY).then(value => value ?? { generation: 0, cleaned: {} }); }
  async denied(id: string) { return ((await this.load()).cleaned[id] ?? 0) > this.now(); }
  async presence(eligible: number, handshake = false, detectedAt = this.now()) {
    const current = await this.load();
    if (eligible > 0) {
      if (!handshake || current.disconnectDeadline === undefined) return;
      const next = { ...current, generation: current.generation + 1, disconnectDeadline: undefined };
      await this.save(next);
      if (!current.cleanupPending) await this.deadlines.set("agent-cleanup");
    } else if (current.disconnectDeadline === undefined) {
      const next = { ...current, generation: current.generation + 1, disconnectDeadline: detectedAt + DISCONNECT_GRACE };
      await this.save(next);
      const retry = (await this.deadlines.read())["agent-cleanup"] ?? Infinity;
      await this.deadlines.set("agent-cleanup", Math.min(retry, next.disconnectDeadline));
    }
  }
  /** The grace ended with no editor present: claim this generation's temporary-data cleanup.
   * Permissions are not touched; a reconnect or a newer grace makes the claim fail. */
  async begin(generation: number, eligible: number) {
    const current = await this.load();
    if (eligible || current.generation !== generation || current.disconnectDeadline === undefined || this.now() < current.disconnectDeadline) return false;
    await this.save({ ...current, disconnectDeadline: undefined, cleanupPending: true });
    return true;
  }
  /** Persistent lifecycle bytes, charged against the workspace's 64 KiB metadata budget.
   * Expired tombstones are pruned here (lazily, like the ledger) before they are counted. */
  async admissionBytes() {
    const current = await this.load();
    const live = Object.fromEntries(Object.entries(current.cleaned).filter(([, expiry]) => expiry > this.now()));
    if (Object.keys(live).length !== Object.keys(current.cleaned).length) await this.save({ ...current, cleaned: live });
    // Reserve the record at its widest (a pending deadline, a cleanup claim) and the
    // agent-cleanup deadline table, whether or not they exist yet: presence() may write
    // them after this admission.
    const max = Number.MAX_SAFE_INTEGER;
    const widest = { ...current, cleaned: live, generation: max, disconnectDeadline: max, cleanupPending: true };
    return utf8Bytes(widest) + utf8Bytes({ [DEADLINES_KEY]: { "agent-cleanup": max } }) + Object.keys(live).length * RECORD_FENCE_BYTES;
  }
  async complete(generation: number) {
    const loaded = await this.load();
    const cleaned = Object.fromEntries(Object.entries(loaded.cleaned).filter(([, expiry]) => expiry > this.now()));
    const current = { ...loaded, cleaned };
    if (current.disconnectDeadline !== undefined && (current.generation !== generation || current.disconnectDeadline > this.now())) {
      await this.save({ ...current, cleanupPending: undefined });
      await this.deadlines.set("agent-cleanup", current.disconnectDeadline);
      return;
    }
    await this.save({ ...current, cleanupPending: undefined, disconnectDeadline: undefined });
    await this.deadlines.set("agent-cleanup");
  }
  private async save(value: LifecycleRecord) {
    await this.storage.put(LIFECYCLE_KEY, value);
    this.loaded = Promise.resolve(value);
  }
}
