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

/** Credentials never enter storage. Scope private drafts by signed-in account and repository ID. */
export class DraftStore {
  private memory = new Map<string, SavedDraft>();
  private deleted = new Set<string>();
  error: string | null = null;
  constructor(
    private storage: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem" | "key" | "length"
    >,
  ) {}
  private read(key: string): SavedDraft | undefined {
    if (this.deleted.has(key)) return undefined;
    if (this.memory.has(key)) return this.memory.get(key);
    try {
      const value = JSON.parse(
        this.storage.getItem(key) ?? "null",
      ) as SavedDraft | null;
      if (
        value?.version === 1 &&
        typeof value.account === "string" &&
        typeof value.repoId === "number" &&
        typeof value.repo === "string" &&
        typeof value.branch === "string" &&
        typeof value.path === "string" &&
        typeof value.original === "string" &&
        typeof value.content === "string" &&
        (value.baseSha === null || /^[a-f0-9]{40}$/.test(value.baseSha)) &&
        key === draftKey(value, value.path)
      )
        return value;
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
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key?.startsWith(prefix)) keys.add(key);
      }
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
    if (value.baseSha !== null && value.content === value.original && !value.deleted)
      return this.remove(value, value.path);
    const key = draftKey(value, value.path);
    this.deleted.delete(key);
    this.memory.set(key, value);
    try {
      this.storage.setItem(key, JSON.stringify(value));
      this.error = null;
      return true;
    } catch {
      this.error =
        "Draft could not be saved in this browser. Download it before leaving.";
      return false;
    }
  }
  remove(scope: DraftScope, path: string) {
    const key = draftKey(scope, path);
    this.memory.delete(key);
    this.deleted.add(key);
    try {
      this.storage.removeItem(key);
      this.error = null;
      return true;
    } catch {
      this.error =
        "Browser storage could not be updated. An older draft may reappear after reload.";
      return false;
    }
  }
  /** Release private in-memory source on logout; persisted drafts stay scoped to their owner. */
  release() {
    this.memory.clear();
    this.deleted.clear();
    this.error = null;
  }
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
    instance = new DraftStore(storage);
  }
  return instance;
}
