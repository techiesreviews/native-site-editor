/** Local-only lifecycle rules. Call mutations under the object's concurrency gate. */
export const DEADLINES_KEY = "alarm-deadlines";
export const LIFECYCLE_KEY = "agent-lifecycle";
export const DISCONNECT_GRACE = 5 * 60_000;
export type Deadlines = Partial<Record<"session" | "registration" | "agent-cleanup", number>>;
export interface LifecycleRecord {
  generation: number;
  disconnectDeadline?: number;
  cleanedGeneration?: number;
  cleanupPending?: boolean;
  /** Tombstones survive physical ledger release, until the grant's absolute expiry. */
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
  /** Fence locally before any external deletion; an interrupted deletion stays denied. */
  async fence(generation: number, eligible: number, entries: { id: string; expiresAt: number }[], commit?: (record: LifecycleRecord) => Promise<void>) {
    const current = await this.load();
    if (eligible || current.generation !== generation || current.disconnectDeadline === undefined || this.now() < current.disconnectDeadline) return false;
    const cleaned = Object.fromEntries(Object.entries(current.cleaned).filter(([, expiry]) => expiry > this.now()));
    for (const entry of entries) cleaned[entry.id] = Math.max(cleaned[entry.id] ?? 0, entry.expiresAt);
    const next = { ...current, disconnectDeadline: undefined, cleanedGeneration: generation, cleanupPending: true, cleaned };
    if (commit) { await commit(next); this.loaded = Promise.resolve(next); }
    else await this.save(next);
    return true;
  }
  async complete(generation: number) {
    const current = await this.load();
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
