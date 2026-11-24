import type { DraftDatabase, DraftStore, SavedDraft } from "./drafts";

/**
 * The rare half of DraftStore (src/drafts.ts): drafts still in localStorage
 * (from before the database, or written while it was unavailable) and
 * records that cannot be read. The store's `load` fetches this module only
 * when localStorage holds a draft or cannot be listed, so a normal start
 * pays nothing for it.
 */
export interface DraftRecovery {
  /**
   * The localStorage draft keys a listing must still read: every key it can
   * list (one it cannot list shows the notice), and none once the database
   * holds them all.
   */
  keys(): string[];
  /**
   * The database's `load`, with recovery around it: first moves every
   * readable localStorage draft (all accounts) into the database, and after
   * the load removes the legacy bytes the database now holds. Damaged
   * records stay stored, and a discarded draft is left out of the result.
   */
  load(from: string): Promise<[string, unknown][]>;
  /**
   * The draft at `key`, which this tab has not changed. `kept` is the
   * store's own copy: it is the answer once the database holds every legacy
   * draft, and otherwise wins over the localStorage copy when newer.
   */
  read(key: string, kept: SavedDraft | undefined): SavedDraft | undefined;
  /** A queued save clears its discard; a queued removal must survive retained legacy bytes. */
  save(key: string, value: SavedDraft | null): void;
  /**
   * A batch is about to commit. Returns the cleanup to run, once the store
   * has settled the batch, with the keys that did commit: it removes their
   * legacy bytes, and a removal that fails is the store's error unless the
   * write itself already left one.
   */
  flush(batch: [string, SavedDraft | null][]): (done: string[]) => void;
}

const RECOVERY_INCOMPLETE = "Some drafts could not be recovered.";
const REMOVE_FAILED = "Browser storage could not be updated. An older draft may reappear after reload.";
const discardPrefix = "astro-site-editor:discard:v1:";

/** `store` shows the notice and a failed cleanup; `queue` is its write queue. */
export function recoverDrafts(
  store: Pick<DraftStore, "error" | "onError" | "recoveryNotice">,
  storage: Pick<Storage, "getItem" | "removeItem" | "key" | "length">,
  database: DraftDatabase | undefined,
  queue: (key: string, value: SavedDraft | null) => void,
  validDraft: (key: string, value: unknown) => SavedDraft | undefined,
  draftPrefix: string,
): DraftRecovery {
  const discardKey = (key: string) => discardPrefix + key.slice(draftPrefix.length);
  /** Durable discard times keep retained legacy bytes from reviving a discarded draft. */
  const discards = new Map<string, number>();
  /** Key prefix of the loaded account's drafts; empty until the database has loaded them. */
  let account = "";
  /** Unreadable or newer legacy keys remain: reads consult localStorage alongside the database. */
  let active = false;
  const incomplete = () => { store.recoveryNotice = RECOVERY_INCOMPLETE; };
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
      const moved: [string, SavedDraft][] = [];
      for (const [key, value] of legacy) {
        const discard = validDraft(key, await database.get(discardKey(key)));
        if (discard) discards.set(key, discard.updatedAt);
        if (discard && discard.updatedAt >= value.updatedAt) continue;
        // A copy written while the database was unavailable may be the newer one.
        const kept = validDraft(key, await database.get(key));
        if (!kept || kept.updatedAt <= value.updatedAt) moved.push([key, value]);
      }
      if (moved.length) await database.write(moved);
      const records = await database.load(from);
      for (const [key, , raw] of legacy) {
        try {
          const current = storage.getItem(key);
          if (current === raw) storage.removeItem(key);
          else if (current !== null) active = true;
        } catch { active = true; incomplete(); }
      }
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
    save(key, value) {
      if (!key.startsWith(draftPrefix)) return;
      if (value) {
        if (discards.delete(key)) queue(discardKey(key), null);
      } else if (active) {
        const [account, repoId, branch, path] = JSON.parse(key.slice(draftPrefix.length)) as [string, number, string, string];
        const updatedAt = Date.now();
        discards.set(key, updatedAt);
        queue(discardKey(key), { account, repoId, branch, path, repo: "", version: 1, baseSha: null, original: "", content: "", updatedAt });
      }
    },
    flush(batch) {
      const before = new Map<string, string>();
      if (active) for (const [key, value] of batch) try {
        const raw = storage.getItem(key);
        const stored = validDraft(key, JSON.parse(raw ?? "null"));
        const updatedAt = value?.updatedAt ?? discards.get(key);
        if (raw !== null && stored && updatedAt !== undefined && stored.updatedAt <= updatedAt) before.set(key, raw);
      } catch {}
      return (done) => {
        let failed = false;
        for (const key of done) if (before.has(key)) try {
          if (storage.getItem(key) === before.get(key)) storage.removeItem(key);
        } catch { failed = true; }
        if (!failed || store.error) return;
        store.error = REMOVE_FAILED;
        store.onError?.(REMOVE_FAILED);
      };
    },
  };
}
