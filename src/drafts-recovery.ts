import type { DraftDatabase, DraftStore, SavedDraft } from "./drafts";

/**
 * The rare half of DraftStore (src/drafts.ts): drafts still in localStorage
 * (from before the database, or written while it was unavailable) and
 * records that cannot be read. The store's `load` fetches this module only
 * when localStorage holds a draft or cannot be listed, so a normal start
 * pays nothing for it.
 */
export interface DraftRecovery extends Omit<DraftDatabase, "pair"> {
  /**
   * The localStorage draft keys a listing must still read: every key it can
   * list (one it cannot list shows the notice), and none once the database
   * holds them all.
   */
  keys(): string[];
  /**
   * The database's `load`, with recovery around it: first reads every
   * discard record and moves every readable localStorage draft (all
   * accounts) into the database, and after the load removes the legacy
   * bytes the database now holds. Damaged records stay stored, and a
   * discarded draft is left out of the result. Discard records are only
   * read here: one with no copy left to hide stays stored until its draft
   * is saved again.
   */
  load(from: string): Promise<[string, unknown][]>;
  /**
   * The draft at `key`, read with its discard record in one transaction: a
   * record its discard hides (a copy another tab was moving when the draft
   * was discarded) is not returned. While localStorage copies are still
   * read, the discard is also known here before the copy it guards can be
   * read.
   */
  get(key: string): Promise<unknown>;
  /**
   * The database's `write`, with each draft's discard record in the same
   * transaction: a removal that must survive retained legacy bytes puts the
   * record, and a save deletes it. The store writes through here (also when
   * it tries a failed batch again one change at a time), so a removal never
   * commits without its record. Once the transaction has committed, the
   * legacy bytes of its drafts are removed; a removal that fails is the
   * store's error until a later write leaves none behind.
   */
  write(changes: [string, SavedDraft | null][]): Promise<void>;
  /**
   * The draft at `key`, which this tab has not changed. `kept` is the
   * store's own copy: it is the answer once the database holds every legacy
   * draft, and otherwise wins over the localStorage copy when newer.
   */
  read(key: string, kept: SavedDraft | undefined): SavedDraft | undefined;
  /**
   * A change was queued. A removal that must survive retained legacy bytes
   * (localStorage copies are still read, or holds one at this key right
   * now) takes its discard time now, not when it is written: a copy another
   * tab saves in between is newer and stays. A save ends its draft's discard.
   */
  save(key: string, value: SavedDraft | null): void;
}

const RECOVERY_INCOMPLETE = "Some drafts could not be recovered.";
/** The change itself is committed, with its discard record: the copy left behind never comes back as the draft. */
const CLEANUP_FAILED = "Browser storage could not be updated. An old copy of a draft is still stored in this browser.";

/**
 * `store` shows the notice and a failed cleanup. Without a `database`, drafts stay in localStorage and nothing is read from or written to one.
 * `discardChange` is the store's discard record for a draft key (src/drafts.ts), as a database change.
 */
export function recoverDrafts(
  store: Pick<DraftStore, "error" | "onError" | "notice">,
  storage: Pick<Storage, "getItem" | "removeItem" | "key" | "length">,
  database: DraftDatabase | undefined,
  validDraft: (key: string, value: unknown) => SavedDraft | undefined,
  draftPrefix: string,
  discardChange: (key: string, discardedAt?: number) => [string, SavedDraft | null],
): DraftRecovery {
  const discardKey = (key: string) => discardChange(key)[0];
  const discardPrefix = discardKey(draftPrefix);
  /** Durable discard times keep retained legacy bytes from reviving a discarded draft. */
  const discards = new Map<string, number>();
  /** A discard record read from the database: the latest discard time known for its draft stays. */
  const learn = (key: string, record: unknown) => {
    const discard = validDraft(key, record);
    if (discard && discard.updatedAt > (discards.get(key) ?? -Infinity)) discards.set(key, discard.updatedAt);
    return discard;
  };
  /** Reads every discard record (all accounts), whatever localStorage shows right now. */
  const readDiscards = async (from: DraftDatabase) => {
    for (const [name, record] of await from.load(discardPrefix)) learn(draftPrefix + name.slice(discardPrefix.length), record);
  };
  /** Key prefix of the loaded account's drafts; empty until the database has loaded them. */
  let account = "";
  /** Unreadable or newer legacy keys remain: reads consult localStorage alongside the database. */
  let active = false;
  /** The store's error is a legacy copy this module could not remove: the next clean write clears it. */
  let uncleaned = false;
  const incomplete = () => { store.notice = RECOVERY_INCOMPLETE; };
  /** localStorage holds a copy at `key` (another tab's, written since this tab loaded), or cannot say. */
  const retained = (key: string) => { try { return storage.getItem(key) !== null; } catch { return true; } };
  /** A record no newer than its draft's discard: it must not come back. */
  const discarded = (key: string, draft: SavedDraft) => draft.updatedAt <= (discards.get(key) ?? -Infinity);
  /** One key that cannot be listed never hides the others. */
  const scan = () => {
    const keys: string[] = [];
    let complete = true;
    try {
      const length = storage.length;
      for (let i = 0; i < length; i++) {
        try {
          const key = storage.key(i);
          if (key?.startsWith(draftPrefix)) keys.push(key);
        } catch { complete = false; }
      }
    } catch { complete = false; }
    if (!complete) incomplete();
    return { keys, complete };
  };
  return {
    keys: () => account && !active ? [] : scan().keys,
    async load(from) {
      if (!database) return [];
      /** Readable legacy drafts as [key, record, stored bytes]. */
      const legacy: [string, SavedDraft, string][] = [];
      const found = scan();
      active = !found.complete;
      for (const key of found.keys) {
        let raw: string | null;
        try { raw = storage.getItem(key); }
        catch { active = true; incomplete(); continue; }
        if (raw === null) continue;
        try {
          const value = validDraft(key, JSON.parse(raw));
          if (value) legacy.push([key, value, raw]);
          else incomplete();
        } catch { incomplete(); }
      }
      // Known before anything moves: a copy localStorage gives back, now or later, must not revive a discarded draft.
      await readDiscards(database);
      const newer: [string, SavedDraft, string][] = [];
      for (const [key, value, raw] of legacy) {
        if (discarded(key, value)) continue;
        // A copy written while the database was unavailable may be the newer one.
        const kept = validDraft(key, await database.get(key));
        if (!kept || kept.updatedAt <= value.updatedAt) newer.push([key, value, raw]);
      }
      // Only a copy localStorage still holds moves, checked as the write's transaction starts (no
      // await in between). One that is gone was moved by another tab, and a discard there leaves no
      // record once no copy is stored: writing it now would bring the discarded draft back. A copy
      // that cannot be read again stays where it is.
      const moved = newer.filter(([key, , raw]) => { try { return storage.getItem(key) === raw; } catch { return false; } })
        .map(([key, value]): [string, SavedDraft] => [key, value]);
      if (moved.length) await database.write(moved);
      const records = await database.load(from);
      for (const [key, , raw] of legacy) {
        try {
          const current = storage.getItem(key);
          if (current === raw) storage.removeItem(key);
          else if (current !== null) active = true;
        } catch { active = true; incomplete(); }
      }
      // Read again as the last step: the store cannot take another tab's announcement until this load has
      // ended, so a discard committed meanwhile is learned here, after the drafts it removed were read.
      // When this read fails, the discards read before the move still hold.
      // No discard record is deleted here, not even one with no copy left to hide: only its draft's own
      // save or removal writes it, in one transaction. A delete decided on this load's reads could
      // remove the record of a save and discard another tab committed since.
      await readDiscards(database).catch(() => {});
      account = from;
      return records.filter(([key, value]) => {
        const draft = validDraft(key, value);
        return !draft || !discarded(key, draft);
      });
    },
    read(key, kept) {
      if (account && !(active && key.startsWith(account))) return kept;
      try {
        const raw = storage.getItem(key);
        const value = validDraft(key, JSON.parse(raw ?? "null"));
        if (raw !== null && !value) incomplete();
        if (value && discarded(key, value)) return kept;
        return value && (!kept || kept.updatedAt <= value.updatedAt) ? value : kept;
      } catch {
        incomplete();
        return kept;
      }
    },
    async get(key) {
      if (!database) return;
      // Both as one transaction left them: no save or discard in another tab falls between the two reads.
      const [record, stored] = await database.pair(key, discardKey(key));
      const discard = (active ? learn : validDraft)(key, stored);
      const draft = validDraft(key, record);
      return draft && discard && draft.updatedAt <= discard.updatedAt ? undefined : record;
    },
    async write(changes) {
      const all = [...changes];
      /** Legacy bytes no newer than their change: removed once it has committed. */
      const before = new Map<string, string>();
      for (const [key, value] of changes) {
        const discardedAt = discards.get(key);
        if (value || discardedAt !== undefined) all.push(discardChange(key, value ? undefined : discardedAt));
        if (active) try {
          const raw = storage.getItem(key);
          const stored = validDraft(key, JSON.parse(raw ?? "null"));
          const updatedAt = value?.updatedAt ?? discardedAt;
          if (raw !== null && stored && updatedAt !== undefined && stored.updatedAt <= updatedAt) before.set(key, raw);
        } catch {}
      }
      // The transaction starts before the first await, so it is queued when this returns.
      await database?.write(all);
      let failed = false;
      for (const [key, raw] of before) try {
        if (storage.getItem(key) === raw) storage.removeItem(key);
      } catch { failed = true; }
      if (!failed) {
        if (uncleaned) store.error = null;
        uncleaned = false;
      } else if (!store.error) {
        uncleaned = true;
        store.error = CLEANUP_FAILED;
        store.onError?.(CLEANUP_FAILED);
      }
    },
    save(key, value) {
      if (value) discards.delete(key);
      else if (active || retained(key)) discards.set(key, Date.now());
    },
  };
}
