/**
 * Disposable text only; drafts and uploaded bytes keep their own recovery stores.
 * UTF-16 text.length * 2 estimates payload bytes, excluding keys/Map overhead.
 * Equal immutable strings share one payload charge across blobs and base paths,
 * tracked by string-value reference counts. Bases are pinned:
 * they can exceed the budget alone, but then no evictable text survives.
 */
export class CleanSourceCache {
  readonly base: Map<string, string>;
  bytes = 0;
  private texts = new Map<string, number>();
  private entries = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private epoch = 0;
  private owner: string | undefined;
  private account: () => string | undefined;
  private limit: number;

  constructor(account: () => string | undefined, limit = 32 * 1024 * 1024) {
    this.account = account;
    this.limit = limit;
    const cache = this;
    this.base = new class extends Map<string, string> {
      override set(path: string, text: string) {
        cache.count(this.get(path), -1);
        cache.count(text, 1);
        cache.trim();
        return super.set(path, text);
      }
      override delete(path: string) {
        cache.count(this.get(path), -1);
        return super.delete(path);
      }
      override clear() {
        this.forEach(text => cache.count(text, -1));
        super.clear();
      }
    }();
  }

  clear() {
    this.epoch++;
    this.entries.forEach(text => this.count(text, -1));
    this.entries.clear();
    this.pending.clear();
  }

  get(repo: string, revision: string, path = ""): Promise<string> | undefined {
    const key = this.key(repo, revision, path), text = this.peekKey(key);
    return text === undefined ? this.pending.get(key) : Promise.resolve(text);
  }

  /** Settled text, synchronously; a miss is read again through `load`. */
  peek(repo: string, revision: string, path = "") {
    return this.peekKey(this.key(repo, revision, path));
  }

  put(repo: string, revision: string, path: string, text: string) {
    this.set(this.key(repo, revision, path), text);
  }

  load(repo: string, revision: string, read: () => Promise<string>, path = ""): Promise<string> {
    const key = this.key(repo, revision, path), epoch = this.epoch, owner = this.owner;
    const held = this.get(repo, revision, path);
    if (held) return held;
    const requested = read().then(text => {
      if (epoch === this.epoch && this.account() === owner) this.set(key, text);
      return text;
    });
    this.pending.set(key, requested);
    const forget = () => { if (this.pending.get(key) === requested) this.pending.delete(key); };
    void requested.then(forget, forget);
    return requested;
  }

  private peekKey(key: string) {
    const text = this.entries.get(key);
    if (text !== undefined) this.set(key, text);
    return text;
  }

  private set(key: string, text: string) {
    this.count(this.entries.get(key), -1);
    this.entries.delete(key);
    this.entries.set(key, text);
    this.count(text, 1);
    this.trim();
  }

  private key(repo: string, revision: string, path: string) {
    const account = this.account();
    if (account !== this.owner) { this.clear(); this.owner = account; }
    return `${account}\n${repo}\n${revision}\n${path}`;
  }

  private count(text: string | undefined, delta: number) {
    if (text === undefined) return;
    const before = this.texts.get(text) ?? 0, after = before + delta;
    if (!before !== !after) this.bytes += (after ? 2 : -2) * text.length;
    if (after) this.texts.set(text, after);
    else this.texts.delete(text);
  }

  private trim() {
    for (const [key, text] of this.entries) {
      if (this.bytes <= this.limit) break;
      this.entries.delete(key);
      this.count(text, -1);
    }
  }
}
