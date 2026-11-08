// Who changed each file, for the commit that saves it (ticket am-26, ADR 0003 decision 6). Whoever presses Save to
// GitHub saves everyone's changes in those files, and the commit names every author besides the one saving: other
// people whose changes reached this tab's shared copy (src/live-text.ts), and agents whose changes this tab wrote into
// its drafts (src/live-author.ts).
//
// - Kept by draft key, as the drafts are: in this browser (memory, then IndexedDB), so a reload or a new sign-in still
//   names them. Each name is kept with the blob its file's draft began from (`base`): once the draft is over another
//   version (someone saved it, here or in another tab), names noted over the old one are not this draft's.
// - Settled after a save (`settle`): only the names the save sent, and not noted again since (typed while it was on
//   its way), go. A file whose draft goes, or is back to its saved text, has no authors (`forget`).
// - Names are what each participant says of itself (the relay vouches for none), so no address is ever made from one:
//   they go into the commit message by name (worker/publish.ts `commitMessage`).

import type { SaveAuthor } from "../shared/types";

/** A name noted for a file, with the blob its draft began from then (null: a new file). */
export interface NotedAuthor extends SaveAuthor { base: string | null }
/** Where noted names live; the default is this browser's IndexedDB. */
export interface AuthorKeeper {
  read(key: string): Promise<NotedAuthor[] | undefined>;
  write(key: string, authors: NotedAuthor[] | undefined): void;
}
/** What one save sent: per draft key, the blob its draft began from and each name with the note it was sent at. */
export type SentAuthors = Map<string, { base: string | null; times: Map<string, number> }>;
export interface SaveAuthors {
  /** `author` changed the file under `key`, whose draft began from blob `base`. */
  note(key: string, base: string | null, author: SaveAuthor): void;
  /** The file under `key` has no unsaved change: its names go. */
  forget(key: string): void;
  /** Everyone who changed `drafts` over the versions they began from, each once, in the order first noted, but `account` (the one saving); and what to `settle` once saved. */
  collect(drafts: readonly { key: string; baseSha: string | null }[], account: string): Promise<{ authors: SaveAuthor[]; sent: SentAuthors }>;
  /**
   * A save carrying `sent` went through, leaving each file at the blob `saved` names: those names go, unless noted again
   * since (typed while the save was on its way), and those count over the saved blob now, as the draft left does.
   */
  settle(sent: SentAuthors, saved: ReadonlyMap<string, string>): void;
}

/** The most names one file keeps: names past it are dropped, not the earliest. */
const FILE_LIMIT = 50;
const id = (author: SaveAuthor) => `${author.agent ? "agent" : "person"}:${author.name.toLowerCase()}`;
const isNoted = (value: unknown): value is NotedAuthor => {
  const author = value as Partial<NotedAuthor> | null;
  return !!author && typeof author.name === "string" && (author.base === null || typeof author.base === "string")
    && (author.agent === undefined || author.agent === true);
};

/** This browser's IndexedDB, best effort: without it the names live in memory only. */
export function browserAuthorKeeper(): AuthorKeeper {
  let opened: Promise<IDBDatabase | undefined> | undefined;
  const open = () => opened ??= new Promise<IDBDatabase | undefined>(resolve => {
    if (typeof indexedDB === "undefined") { resolve(undefined); return; }
    try {
      const request = indexedDB.open("native-site-editor-authors", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("authors");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
  return {
    async read(key) {
      const db = await open();
      return db && new Promise<NotedAuthor[] | undefined>(resolve => {
        try {
          const request = db.transaction("authors").objectStore("authors").get(key);
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.filter(isNoted) : undefined);
          request.onerror = () => resolve(undefined);
        } catch { resolve(undefined); }
      });
    },
    write(key, authors) {
      void open().then(db => {
        try {
          const store = db?.transaction("authors", "readwrite").objectStore("authors");
          if (authors) store?.put(authors, key); else store?.delete(key);
        } catch { /* Kept in memory only. */ }
      });
    },
  };
}

/** Noted names over `keeper` (memory only without one). */
export function createSaveAuthors(keeper?: AuthorKeeper): SaveAuthors {
  /** Each file's names, read once from the keeper; every change to a file waits for the one before it. */
  const files = new Map<string, Promise<NotedAuthor[]>>();
  /** When each name was last noted in this tab, for `settle`. */
  const notes = new Map<string, Map<string, number>>();
  let clock = 0;
  const change = (key: string, update: (authors: NotedAuthor[]) => boolean) => {
    const before = files.get(key) ?? (keeper ? keeper.read(key).catch(() => undefined).then(found => found ?? []) : Promise.resolve([]));
    const after = before.then(authors => {
      if (update(authors)) keeper?.write(key, authors.length ? authors.map(author => ({ ...author })) : undefined);
      return authors;
    });
    files.set(key, after);
    return after;
  };
  return {
    note(key, base, author) {
      const name = author.name.trim();
      if (!name) return;
      const entry: NotedAuthor = { name, base, ...(author.agent ? { agent: true as const } : {}) };
      const tag = id(entry);
      let times = notes.get(key);
      if (!times) notes.set(key, times = new Map());
      times.set(tag, ++clock);
      void change(key, authors => {
        const at = authors.findIndex(known => id(known) === tag);
        if (at >= 0 && authors[at].base === base) return false;
        // Noted over another version before: it counts over this one now.
        if (at >= 0) { authors[at] = entry; return true; }
        if (authors.length >= FILE_LIMIT) return false;
        authors.push(entry);
        return true;
      });
    },
    forget(key) {
      notes.delete(key);
      void change(key, authors => { if (!authors.length) return false; authors.length = 0; return true; });
    },
    async collect(drafts, account) {
      const self = `person:${account.toLowerCase()}`, out: SaveAuthor[] = [], seen = new Set<string>(), sent: SentAuthors = new Map();
      for (const draft of drafts) {
        const authors = await (files.get(draft.key) ?? change(draft.key, () => false));
        const times = new Map<string, number>();
        for (const author of authors) {
          if (author.base !== draft.baseSha) continue;
          const tag = id(author);
          times.set(tag, notes.get(draft.key)?.get(tag) ?? 0);
          if (tag === self || seen.has(tag)) continue;
          seen.add(tag);
          out.push({ name: author.name, ...(author.agent ? { agent: true as const } : {}) });
        }
        sent.set(draft.key, { base: draft.baseSha, times });
      }
      return { authors: out, sent };
    },
    settle(sent, saved) {
      for (const [key, { base, times }] of sent) {
        const now = notes.get(key), to = saved.get(key);
        const settled = [...times].filter(([tag, at]) => (now?.get(tag) ?? 0) === at).map(([tag]) => tag);
        for (const tag of settled) now?.delete(tag);
        void change(key, authors => {
          const left = authors.filter(author => !settled.includes(id(author)))
            .map(author => (to !== undefined && author.base === base ? { ...author, base: to } : author));
          if (left.length === authors.length && left.every((author, index) => author === authors[index])) return false;
          authors.splice(0, authors.length, ...left);
          return true;
        });
      }
    },
  };
}

let page: SaveAuthors | undefined;
/** This page's noted names, in this browser's IndexedDB. */
export const saveAuthors = () => page ??= createSaveAuthors(browserAuthorKeeper());
