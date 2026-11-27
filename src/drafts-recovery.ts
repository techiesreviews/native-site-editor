import { draftKey, type DraftDatabase, type DraftStore, type SavedDraft } from "./drafts";
import { gitBlobSha } from "./uploads";

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
   * bytes the database now holds. A damaged record of the account loaded
   * resolves itself where that provably loses nothing (`resolve`); every
   * other one stays stored and sets the notice. A
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
   * store's notice (never its error: the change itself was saved) until a
   * later write removes every copy it tries to.
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
  /** The store signed out: a write still running no longer changes its notice, which is the next session's. */
  release(): void;
}

const RECOVERY_INCOMPLETE = "Some drafts could not be recovered.";
/**
 * Only the removal of the legacy bytes failed. The change itself committed (a removal puts its discard
 * record, a save deletes it), and the copy left behind is no newer than that change, so it never comes
 * back as the draft. Nothing failed to save: this is the store's notice, never its error.
 */
const CLEANUP_FAILED = "Browser storage could not be updated. An old copy of a draft is still stored in this browser.";
/** The fields of a plain text edit: a copy with any other (a deletion, a move, an upload, bytes) holds more than its text. */
const EDIT_FIELDS = new Set(["version", "account", "repoId", "repo", "branch", "path", "baseSha", "original", "content", "updatedAt"]);
type Fields = Record<string, unknown>;
/** A git blob SHA in any case, as the editor writes it; undefined for anything else. */
const blobName = (value: unknown) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : undefined;
/** The draft key of the file `fields` name, or undefined when they name none. */
const keyOf = (fields: Fields) => typeof fields.account === "string" && typeof fields.repoId === "number" &&
  typeof fields.branch === "string" && typeof fields.path === "string"
  ? draftKey({ account: fields.account, repoId: fields.repoId, repo: "", branch: fields.branch }, fields.path) : undefined;

/**
 * `store` shows the notice, a failed cleanup included. Without a `database`, drafts stay in localStorage and nothing is read from or written to one.
 * `discardChange` is the store's discard record for a draft key (src/drafts.ts), as a database change.
 */
export function recoverDrafts(
  store: Pick<DraftStore, "notice" | "onNotice">,
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
  /** The store signed out: its notice belongs to the next session. */
  let released = false;
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
  /** The draft key of the file a localStorage key names, as the editor spells it; undefined when it names none. */
  const named = (key: string) => {
    try {
      const [account, repoId, branch, path] = JSON.parse(key.slice(draftPrefix.length)) as unknown[];
      return keyOf({ account, repoId, branch, path });
    } catch { return undefined; }
  };
  /**
   * A damaged localStorage copy of the account `mine` (a key prefix), resolved only where nothing can be
   * lost. Mended (a key spelled another way, a SHA in capitals), it becomes its file's draft while the
   * file has no record and no discard made after it. A plain text edit whose text is already held (its
   * file's healthy draft has the same text, or the text is a GitHub blob it or that draft began from) is
   * removed. Either way the copy leaves localStorage only while it still holds the bytes judged here, so
   * a copy another tab rewrote meanwhile stays. True once the copy is gone.
   */
  const resolve = async (from: DraftDatabase, mine: string, key: string, raw: string, fields: Fields) => {
    const names = [named(key), keyOf(fields)].filter((name) => name !== undefined);
    if (!names.length || names.some((name) => !name.startsWith(mine))) return false;
    const mended = { ...fields, baseSha: blobName(fields.baseSha) ?? fields.baseSha };
    const draft = validDraft(keyOf(mended) ?? "", mended);
    const file = draft ? draftKey(draft, draft.path) : names[0];
    const [record, discard] = await from.pair(file, discardKey(file));
    const discardedAt = validDraft(file, discard)?.updatedAt ?? -Infinity;
    const current = validDraft(file, record);
    const held = current && current.updatedAt > discardedAt && !current.opaque && !current.upload ? current : undefined;
    const text = fields.content;
    const safe = typeof text === "string" && Object.keys(fields).every((field) => EDIT_FIELDS.has(field)) &&
      ((held && !held.deleted && held.content === text) ||
        [blobName(fields.baseSha), blobName(held?.baseSha)].includes(await gitBlobSha(new TextEncoder().encode(text))));
    /** What localStorage holds at the copy's key now; undefined when it cannot say. */
    const stored = () => { try { return storage.getItem(key); } catch { return undefined; } };
    // Gone (another tab resolved it) is resolved; other bytes are judged on a later load.
    let now = stored();
    if (!safe) {
      if (!draft || record !== undefined || draft.updatedAt <= discardedAt) return false;
      // Checked as the write's transaction starts (no await in between), like the move of a readable copy.
      if (now !== raw) return now === null;
      await from.write([[file, draft], discardChange(file)]);
      now = stored();
    }
    if (now !== raw) return now === null;
    try { storage.removeItem(key); return true; } catch { return false; }
  };
  return {
    keys: () => account && !active ? [] : scan().keys,
    async load(from) {
      if (!database) return [];
      /** Readable legacy drafts as [key, record, stored bytes]. */
      const legacy: [string, SavedDraft, string][] = [];
      /** Records that parse but are no draft the editor can read, as [key, stored bytes, fields]. */
      const damaged: [string, string, Fields][] = [];
      const found = scan();
      active = !found.complete;
      for (const key of found.keys) {
        let raw: string | null;
        try { raw = storage.getItem(key); }
        catch { active = true; incomplete(); continue; }
        if (raw === null) continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          const value = validDraft(key, parsed);
          if (value) legacy.push([key, value, raw]);
          else if (parsed && typeof parsed === "object") damaged.push([key, raw, parsed as Fields]);
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
      // After the move, so a readable copy of the same file counts as its draft; one at a time, so a
      // second damaged copy of a file sees the draft the first became. The rest keep the notice.
      for (const [key, raw, fields] of damaged)
        if (!await resolve(database, from, key, raw, fields).catch(() => false)) incomplete();
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
      if (released) return;
      // A notice already shown (incomplete recovery) stays; the next clean write clears only this one.
      const shown = store.notice;
      if (!failed) {
        if (shown === CLEANUP_FAILED) store.notice = null;
      } else store.notice ??= CLEANUP_FAILED;
      if (store.notice !== shown) store.onNotice?.();
    },
    save(key, value) {
      if (value) discards.delete(key);
      else if (active || retained(key)) discards.set(key, Date.now());
    },
    release() { released = true; },
  };
}
