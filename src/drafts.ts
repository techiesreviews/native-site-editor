export interface DraftScope {
  account: string;
  repoId: number;
  repo: string;
  branch: string;
}
export interface SavedDraft extends DraftScope {
  version: 1;
  path: string;
  baseSha: string | null;
  original: string;
  content: string;
  updatedAt: number;
  /**
   * The path is removed on the branch: `baseSha` is the blob removed,
   * `original` its text when known, and `content` what it held when it was
   * deleted (its draft's text), which Restore brings back.
   */
  deleted?: true;
  /** On a deletion: the file was renamed or moved to this path. */
  movedTo?: string;
  /** On a new path: the file renamed or moved here from this path; `original` is its text there. */
  movedFrom?: string;
  /**
   * The blob the content came from (a renamed, moved or duplicated file):
   * saved as that blob while `content` equals `original`, or always when
   * the content is `opaque` (a binary or large file whose text is not held).
   */
  sourceSha?: string;
  opaque?: true;
  /**
   * An uploaded file (src/uploads.ts): `sourceSha` is the blob of its bytes,
   * which this browser keeps (IndexedDB) until Save makes them a GitHub blob.
   */
  upload?: { size: number; type: string };
  mode?: "100755";
}
const prefix = "astro-site-editor:draft:v1:";
export const draftKey = (scope: DraftScope, path: string) =>
  prefix +
  JSON.stringify([
    scope.account.toLowerCase(),
    scope.repoId,
    scope.branch,
    path,
  ]);
const valid = (key: string, value: unknown): SavedDraft | undefined => {
  const draft = value as SavedDraft | null | undefined;
  if (
    draft?.version === 1 &&
    typeof draft.account === "string" &&
    typeof draft.repoId === "number" &&
    typeof draft.repo === "string" &&
    typeof draft.branch === "string" &&
    typeof draft.path === "string" &&
    typeof draft.original === "string" &&
    typeof draft.content === "string" &&
    (draft.baseSha === null || /^[a-f0-9]{40}$/.test(draft.baseSha)) &&
    key === draftKey(draft, draft.path)
  )
    return draft;
};
const SAVE_FAILED = "Draft could not be saved in this browser. Download it before leaving.";
const REMOVE_FAILED = "Browser storage could not be updated. An older draft may reappear after reload.";
/** Pending writes wait at most this long, so a burst of typing is one transaction. */
const FLUSH_DELAY = 200;

/**
 * Where drafts persist once loaded: IndexedDB in the browser (a map in
 * tests), which holds far more than localStorage's 5 MB for everything.
 */
export interface DraftDatabase {
  /** Every record whose key starts with `from`, as [key, record]. */
  load(from: string): Promise<[string, unknown][]>;
  get(key: string): Promise<unknown>;
  /** Puts (a record) and deletes (null) in one transaction; resolves once it commits. */
  write(changes: [string, SavedDraft | null][]): Promise<void>;
}

/**
 * Credentials never enter storage. Scope private drafts by signed-in account and repository ID.
 *
 * Reads are synchronous. With a DraftDatabase, `load(account)` (awaited at
 * boot, before anything reads drafts) moves localStorage drafts into it and
 * fills memory with the account's drafts; from then on memory is the truth
 * and writes go through to the database shortly after (`flush`). Without
 * one, or when it cannot open, drafts live in localStorage as before.
 */
export class DraftStore {
  private memory = new Map<string, SavedDraft>();
  private deleted = new Set<string>();
  private db?: DraftDatabase;
  /** Key prefix of the loaded account's drafts. */
  private from = "";
  private pending = new Map<string, SavedDraft | null>();
  private timer?: ReturnType<typeof setTimeout>;
  private writing: Promise<void> = Promise.resolve();
  private failed = false;
  error: string | null = null;
  /** A write-through failed after its save returned (the message is `error`). */
  onError?: (message: string) => void;
  /**
   * A record was saved or removed through this store (by any writer in this
   * tab): src/components/source-editor.ts takes a host's write for an open
   * file's very text as the draft store's own.
   */
  onWrite?: (scope: DraftScope, path: string) => void;
  /** Keys this tab committed, for other tabs to read again (a BroadcastChannel). */
  announce?: (keys: string[]) => void;
  /**
   * GitHub's text of `path` at the branch's current commit, when this tab
   * holds it: a draft saved with exactly that text is no change, whatever
   * blob it began from, and is dropped.
   */
  baseline?: (scope: DraftScope, path: string) => string | undefined;
  constructor(
    private storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem" | "key" | "length"
    >,
    private database?: DraftDatabase,
  ) {}
  private legacyKeys() {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }
  /**
   * Moves every localStorage draft (all accounts) into the database, then
   * loads `account`'s drafts into memory. localStorage keys go only after
   * the database committed them. Stays on localStorage when it fails.
   */
  async load(account: string) {
    const database = this.database;
    if (!database) return;
    try {
      const legacy: [string, SavedDraft][] = [];
      try {
        for (const key of this.legacyKeys()) {
          const value = valid(key, JSON.parse(this.storage.getItem(key) ?? "null"));
          if (value) legacy.push([key, value]);
        }
      } catch {}
      const moved: [string, SavedDraft][] = [];
      for (const [key, value] of legacy) {
        // A copy written while the database was unavailable may be the newer one.
        const kept = valid(key, await database.get(key));
        if (!kept || kept.updatedAt <= value.updatedAt) moved.push([key, value]);
      }
      if (moved.length) await database.write(moved);
      const from = prefix + JSON.stringify([account.toLowerCase()]).slice(0, -1) + ",";
      const records = await database.load(from);
      for (const [key] of legacy) try { this.storage.removeItem(key); } catch {}
      for (const [key, value] of records) {
        const draft = valid(key, value);
        if (draft && !this.memory.has(key) && !this.deleted.has(key)) this.memory.set(key, draft);
      }
      this.from = from;
      this.db = database;
      for (const key of this.deleted) this.queue(key, null);
      this.deleted.clear();
    } catch {}
  }
  private read(key: string): SavedDraft | undefined {
    if (this.db) return this.memory.get(key);
    if (this.deleted.has(key)) return undefined;
    if (this.memory.has(key)) return this.memory.get(key);
    try {
      return valid(key, JSON.parse(this.storage.getItem(key) ?? "null"));
    } catch {
      this.error =
        "Browser draft storage is unavailable or damaged. Download your draft to keep a copy.";
    }
  }
  get(scope: DraftScope, path: string) {
    return this.read(draftKey(scope, path));
  }
  list(scope: DraftScope) {
    const keys = new Set(this.memory.keys());
    if (!this.db)
      try {
        for (const key of this.legacyKeys()) keys.add(key);
      } catch {
        this.error =
          "Browser draft storage is unavailable. Download your draft to keep a copy.";
      }
    return [...keys]
      .map((key) => this.read(key))
      .filter(
        (value): value is SavedDraft =>
          !!value &&
          value.account.toLowerCase() === scope.account.toLowerCase() &&
          value.repoId === scope.repoId &&
          value.branch === scope.branch,
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  }
  save(value: SavedDraft) {
    const saved = this.put(value);
    this.onWrite?.(value, value.path);
    return saved;
  }
  private put(value: SavedDraft) {
    if (!value.deleted && ((value.baseSha !== null && value.content === value.original) ||
        (!value.opaque && !value.upload && this.baseline?.(value, value.path) === value.content)))
      return this.drop(value, value.path);
    const key = draftKey(value, value.path);
    this.deleted.delete(key);
    this.memory.set(key, value);
    if (this.db) {
      this.queue(key, { ...value });
      return !this.failed;
    }
    try {
      this.storage.setItem(key, JSON.stringify(value));
      this.error = null;
      return true;
    } catch {
      this.error = SAVE_FAILED;
      return false;
    }
  }
  remove(scope: DraftScope, path: string) {
    const removed = this.drop(scope, path);
    this.onWrite?.(scope, path);
    return removed;
  }
  private drop(scope: DraftScope, path: string) {
    const key = draftKey(scope, path);
    this.memory.delete(key);
    if (this.db) {
      this.queue(key, null);
      return true;
    }
    this.deleted.add(key);
    try {
      this.storage.removeItem(key);
      this.error = null;
      return true;
    } catch {
      this.error = REMOVE_FAILED;
      return false;
    }
  }
  private queue(key: string, value: SavedDraft | null) {
    this.pending.set(key, value);
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_DELAY);
  }
  /** Writes pending changes now (the page is hidden or leaving); resolves once they committed or failed. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const db = this.db;
    if (!db || !this.pending.size) return this.writing;
    const batch = [...this.pending];
    this.pending.clear();
    // The transaction starts now, so a later read (another tab, a reload) sees it.
    const written = db.write(batch);
    return (this.writing = this.settle(db, batch, written));
  }
  private async settle(db: DraftDatabase, batch: [string, SavedDraft | null][], written: Promise<void>) {
    const failed: [string, SavedDraft | null][] = [];
    try {
      await written;
    } catch {
      // A transaction is all or nothing: one at a time, the rest may still fit.
      if (batch.length === 1) failed.push(batch[0]);
      else for (const change of batch) await db.write([change]).catch(() => failed.push(change));
    }
    const done = batch.filter((change) => !failed.includes(change)).map(([key]) => key);
    if (done.length) this.announce?.(done);
    if (!failed.length) {
      if (this.failed) this.error = null;
      this.failed = false;
      return;
    }
    // Kept for the next write to try again, unless something newer is pending.
    for (const [key, value] of failed) if (!this.pending.has(key)) this.pending.set(key, value);
    this.failed = true;
    this.error = failed.some(([, value]) => value) ? SAVE_FAILED : REMOVE_FAILED;
    this.onError?.(this.error);
  }
  /** Another tab committed `keys`: reads them again from the database. */
  async refresh(keys: string[]) {
    const db = this.db;
    if (!db || !this.from) return;
    for (const key of keys) {
      if (!key.startsWith(this.from) || this.pending.has(key)) continue;
      const value = valid(key, await db.get(key).catch(() => undefined));
      // Changed here meanwhile, or signed out: this tab's own state wins.
      if (this.pending.has(key) || !key.startsWith(this.from || "\0")) continue;
      if (value) this.memory.set(key, value);
      else this.memory.delete(key);
    }
  }
  /** Release private in-memory source on logout; persisted drafts stay scoped to their owner. */
  release() {
    void this.flush();
    this.memory.clear();
    this.deleted.clear();
    this.from = "";
    this.error = null;
    this.failed = false;
  }
}

/** The browser's database: one IndexedDB object store of records by draftKey. */
export function indexedDbDrafts(name = "native-site-editor-drafts"): DraftDatabase {
  let db: IDBDatabase | undefined;
  let opening: Promise<IDBDatabase> | undefined;
  const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => {
      const opened = (db = request.result);
      // Another tab upgrading: close, and open again on the next use.
      opened.onversionchange = () => { opened.close(); db = opening = undefined; };
      resolve(opened);
    };
    request.onerror = () => { opening = undefined; reject(request.error ?? new Error("Browser draft storage is unavailable.")); };
  });
  const request = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser draft storage failed."));
  });
  const write = (into: IDBDatabase, changes: [string, SavedDraft | null][]) => {
    const tx = into.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    for (const [key, value] of changes) value ? store.put(value, key) : store.delete(key);
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Browser draft storage failed."));
    });
    tx.commit?.();
    return committed;
  };
  return {
    async load(from) {
      const store = (await open()).transaction("drafts", "readonly").objectStore("drafts");
      const range = IDBKeyRange.bound(from, from + "￿");
      const [keys, values] = await Promise.all([request(store.getAllKeys(range)), request(store.getAll(range))]);
      return keys.map((key, i) => [String(key), values[i]]);
    },
    async get(key) {
      return request((await open()).transaction("drafts", "readonly").objectStore("drafts").get(key));
    },
    // Synchronous when open, so the transaction is queued before this returns.
    write(changes) {
      if (db)
        try { return write(db, changes); } catch (error) { return Promise.reject(error); }
      return open().then((into) => write(into, changes));
    },
  };
}

/** A DraftDatabase in memory, for tests. */
export function memoryDrafts(): DraftDatabase & { map: Map<string, SavedDraft> } {
  const map = new Map<string, SavedDraft>();
  return {
    map,
    async load(from) { return [...map].filter(([key]) => key.startsWith(from)).map(([key, value]) => [key, structuredClone(value)]); },
    async get(key) { return structuredClone(map.get(key)); },
    async write(changes) { for (const [key, value] of changes) value ? map.set(key, structuredClone(value)) : map.delete(key); },
  };
}

let instance: DraftStore | undefined;
export function draftStore() {
  if (!instance) {
    // Access to localStorage itself can fail when browser storage is disabled.
    let storage: Storage;
    try {
      storage = localStorage;
    } catch {
      storage = new Proxy({} as Storage, {
        get() {
          throw new Error("Storage unavailable");
        },
      });
    }
    let database: DraftDatabase | undefined;
    try {
      if (typeof indexedDB !== "undefined") database = indexedDbDrafts();
    } catch {}
    const store = (instance = new DraftStore(storage, database));
    // Pending writes go before the page may be gone.
    const flush = () => void store.flush();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    // Another tab's committed drafts are read again here.
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("native-site-editor-drafts");
      channel.onmessage = (event) => void store.refresh(event.data as string[]);
      store.announce = (keys) => channel.postMessage(keys);
    }
  }
  return instance;
}
