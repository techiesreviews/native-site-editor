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

  constructor(private account: () => string | undefined, private limit = 32 * 1024 * 1024) {
    const cache = this;
    this.base = new class extends Map<string, string> {
      override set(path: string, text: string) {
        const previous = this.get(path);
        if (previous !== undefined) cache.count(previous, -1);
        super.set(path, text);
        cache.count(text, 1);
        cache.trim();
        return this;
      }
      override delete(path: string) {
        const text = this.get(path);
        if (text !== undefined) cache.count(text, -1);
        return super.delete(path);
      }
      override clear() {
        for (const text of this.values()) cache.count(text, -1);
        super.clear();
      }
    }();
  }

  clear() {
    this.epoch++;
    for (const text of this.entries.values()) this.count(text, -1);
    this.entries.clear();
    this.pending.clear();
  }

  get(repo: string, revision: string, path = ""): Promise<string> | undefined {
    const key = this.key(repo, revision, path), text = this.entries.get(key);
    if (text === undefined) return this.pending.get(key);
    this.entries.delete(key);
    this.entries.set(key, text);
    return Promise.resolve(text);
  }

  load(repo: string, revision: string, read: () => Promise<string>, path = "", live = () => true): Promise<string> {
    const held = this.get(repo, revision, path);
    if (held) return held;
    const key = this.key(repo, revision, path), epoch = this.epoch, owner = this.owner;
    const requested = read().then(text => {
      if (epoch === this.epoch && this.account() === owner && live()) {
        this.entries.set(key, text);
        this.count(text, 1);
        this.trim();
      }
      return text;
    });
    this.pending.set(key, requested);
    const forget = () => { if (this.pending.get(key) === requested) this.pending.delete(key); };
    void requested.then(forget, forget);
    return requested;
  }

  private key(repo: string, revision: string, path: string) {
    const account = this.account();
    if (account !== this.owner) { this.clear(); this.owner = account; }
    return `${account}\n${repo}\n${revision}\n${path}`;
  }

  private count(text: string, delta: number) {
    const before = this.texts.get(text) ?? 0, after = before + delta;
    this.bytes += ((after > 0 ? 1 : 0) - (before > 0 ? 1 : 0)) * text.length * 2;
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
