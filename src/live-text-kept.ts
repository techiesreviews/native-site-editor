// The kept copy and the save record (TOOLS-216, TOOLS-330): a copy this browser shared, kept to start from when the file
// opens again (memory, then IndexedDB; never the server), and the notes a save leaves in the copy, so the others take its
// commit as the copy's own text rather than as an outside change. The commit names the copy and carries its record
// (its `Live-Copy` line, shared/live-copy.ts). The overview is in src/live-text.ts.

import { draftKey } from "./drafts";
import { liveSaves } from "./live-saves";
import { MAX_LIVE_RECORD } from "../shared/live-copy";
import { copyAt, metaOf, occurrenceOn, versionsOf } from "./live-versions";
import type { LiveVersion } from "./live-text";
import { LIVE_TEXT_CATCH_UP_MS, META, type CopyContext } from "./live-text-shared";

/** A copy this browser shared, kept to start from when the file opens again: its starting-text tag, its Yjs state and
 * the draft's text when it was kept (`draft`; none in copies kept before it was added). The draft and the copy are saved
 * apart and a reload can keep one write and lose the other: `draft` tells what the draft took on after the copy's last write.
 * Only the shapes are checked on reading; a state Yjs cannot apply is dropped then (`load`). */
export interface KeptCopy {
  tag: Uint8Array; update: Uint8Array; draft?: string;
  /** The version of GitHub's text the draft was over when kept (none in copies kept before copies held their versions,
   * which are not resumed), and the client ids this browser's words carry in the copy (ticket am-59). */
  base?: string; mine?: number[];
  /** The characters this browser's typing took out of the copy, as Yjs ids (client, clock, length, ...): when the room
   * has another copy, these go out of it too (TOOLS-216). */
  took?: number[];
  /** This browser's saves made before its copy took part, as blob sha and text, one after the other: their text is the
   * draft's own, which the copy notes as that save when it starts (TOOLS-216). */
  saves?: string[];
  /** When a page wrote it to IndexedDB (ms since the epoch): `browserKeeper` reads another tab's copy only when it was kept
   * before this page began (a stamp equal to the start counts as before). */
  at?: number;
  /** The tab that wrote it to IndexedDB (`liveTabId`): its own copy is read whenever it was kept, before or after a reload. */
  by?: string;
}
/** Where kept copies live: this browser only (memory, then IndexedDB), never the server. */
export interface CopyKeeper {
  read(key: string): Promise<KeptCopy | undefined>;
  write(key: string, copy: KeptCopy | undefined): void;
}

/** A copy is kept this long after its last change, as drafts are (src/drafts.ts), and at once when the page hides or the file
 * closes: the copy kept and the draft saved must say the same, or text shared since would go in again on resuming. */
const KEEP_MS = 200;

const isKept = (value: unknown): value is KeptCopy => {
  const copy = value as Partial<KeptCopy> | null;
  return !!copy && copy.tag instanceof Uint8Array && copy.tag.length === 20 && copy.update instanceof Uint8Array
    && (copy.draft === undefined || typeof copy.draft === "string") && (copy.base === undefined || typeof copy.base === "string")
    && [copy.mine, copy.took].every(ids => ids === undefined || (Array.isArray(ids) && ids.every(id => Number.isSafeInteger(id))))
    && (copy.saves === undefined || (Array.isArray(copy.saves) && copy.saves.every(item => typeof item === "string")))
    && (copy.at === undefined || Number.isFinite(copy.at)) && (copy.by === undefined || typeof copy.by === "string");
};
/** This tab's id: the same after a reload (sessionStorage is the tab's own), so the copy its page kept as it went is its own.
 * Any other load takes a new one, as a duplicated tab copies the sessionStorage of the tab it came from (Chrome may call that
 * load back/forward, so only a reload keeps it): a page that comes back another way joins its room afresh. Called once per
 * page (the page's keeper, `pageKeeper`): a second call on a load that is no reload would store another id. */
export function liveTabId(reloaded = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload",
  storage = (): Pick<Storage, "getItem" | "setItem"> => sessionStorage) {
  try {
    const kept = reloaded ? storage().getItem("native-site-editor-live-tab") : null;
    if (kept) return kept;
    const id = crypto.randomUUID();
    storage().setItem("native-site-editor-live-tab", id);
    return id;
  } catch { return crypto.randomUUID(); }
}
/** Memory first (this page's newest), then IndexedDB (a reload); writes go to both, best effort. The database opens at once,
 * so a write when the page hides starts its transaction then, as the drafts' does. IndexedDB gives this tab's own copy (kept
 * by its page before a reload, which writes as it goes, after the new page began) and any copy kept before this page began
 * (`started`: a tab closed since). One another tab kept later is that tab's, open beside this one: its draft as kept is not
 * this tab's text, so resuming it would send this tab's older text as its typing. A tab opened after another kept its
 * copy, while that one is still open, may still read it. */
export function browserKeeper(started = performance.timeOrigin, tab = liveTabId()): CopyKeeper {
  const memory = new Map<string, KeptCopy | undefined>();
  let opened: Promise<IDBDatabase | undefined> | undefined, ready: IDBDatabase | undefined;
  const open = () => opened ??= new Promise<IDBDatabase | undefined>(resolve => {
    if (typeof indexedDB === "undefined") { resolve(undefined); return; }
    try {
      const request = indexedDB.open("native-site-editor-live", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("copies");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }).then(db => (ready = db));
  void open();
  const put = (db: IDBDatabase | undefined, key: string, copy: KeptCopy | undefined) => {
    try {
      const copies = db?.transaction("copies", "readwrite").objectStore("copies");
      if (copy) copies?.put({ ...copy, at: Date.now(), by: tab }, key); else copies?.delete(key);
    } catch { /* Kept in memory only: a reload starts as a joiner. */ }
  };
  return {
    async read(key) {
      if (memory.has(key)) return memory.get(key);
      const db = await open();
      return db && new Promise<KeptCopy | undefined>(resolve => {
        try {
          const request = db.transaction("copies").objectStore("copies").get(key);
          request.onsuccess = () => {
            const found: unknown = request.result;
            if (!isKept(found) || (found.by !== tab && (found.at ?? 0) > started)) { resolve(undefined); return; }
            const { at: _at, by: _by, ...copy } = found;
            resolve(copy);
          };
          request.onerror = () => resolve(undefined);
        } catch { resolve(undefined); }
      });
    },
    write(key, copy) {
      memory.set(key, copy);
      if (ready) put(ready, key, copy);
      else void open().then(db => put(db, key, copy));
    },
  };
}

export const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
/** Bytes as base64url, and back (a commit line's save record). */
const base64url = (bytes: Uint8Array) => {
  // In parts: a long snapshot spread into one call's arguments would pass the engine's limit.
  let text = "";
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
/** Whether `version`'s commit names `copy` (a `Live-Copy` entry, shared/live-copy.ts). */
export const namesCopy = (version: LiveVersion, copy: Uint8Array) => version.copies?.some(entry => entry.slice(0, 40) === hex(copy)) ?? false;
/** The record of `copy`'s save in `version`'s commit: the copy as it was saved, a Yjs snapshot; none when the line has none. */
export function recordOf(version: LiveVersion, copy: Uint8Array) {
  const entry = version.copies?.find(item => item.slice(0, 40) === hex(copy) && item.length > 41);
  try { return entry ? fromBase64url(entry.slice(41)) : undefined; } catch { return undefined; }
}
/** A quick hash of a saved text (cyrb53, as hex): a save's note in the copy is found by it, and its text checked. */
function savedKey(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}:${text.length}`;
}
/** The key of a save's note: its text saved over the copy's version `from` (a revert's save of an earlier text is
 * over another version, so its note does not take the earlier save's place). */
export const noteKey = (from: string, text: string) => savedKey(`${from}\n${text}`);

type SaveNote = { store: object; note(text: string): string | undefined; ready(): Promise<void> | undefined };
const savers = new Map<string, Set<SaveNote>>();
/** The file under draft key `key` is about to be saved as `text` (from `store`, any by default): its live copy, if it
 * has one, notes it (the publish menu asks through src/live-saves.ts). Returns the copies (as hex) the save is from: the
 * commit names them (`Live-Copy`, worker/publish.ts), so the others in the room wait for the note rather than take the
 * commit in as an outside change. */
function noteLiveSave(key: string, text: string, store?: object): string[] {
  const copies: string[] = [];
  for (const saver of savers.get(key) ?? []) {
    if (store && saver.store !== store) continue;
    try { const copy = saver.note(text); if (copy && !copies.includes(copy)) copies.push(copy); } catch { /* Best effort: the others then fold the commit in as an outside change. */ }
  }
  return copies;
}
/** Lex's choice A (2026-11-12): a save of the file under draft key `key` (from `store`, any by default) waits until each
 * page sharing it has caught up with its live room (just opened again, or catching up after a reconnect), so the room's
 * copy can note the save, at most LIVE_TEXT_CATCH_UP_MS. Undefined when no page has to wait. */
export function liveSaveReady(key: string, store?: object): Promise<void> | undefined {
  const waits = [...savers.get(key) ?? []].flatMap(saver => (store && saver.store !== store ? [] : [saver.ready()])).filter(wait => wait !== undefined);
  return waits.length ? Promise.all(waits).then(() => undefined) : undefined;
}
liveSaves.note = (scope, files, store) =>
  [...new Set(files.flatMap(file => (file.delete || file.sha ? [] : noteLiveSave(draftKey(scope, file.path), file.content, store))))];
liveSaves.ready = (scope, paths, store) => {
  const waits = paths.map(path => liveSaveReady(draftKey(scope, path), store)).filter(wait => wait !== undefined);
  return waits.length ? Promise.all(waits) : undefined;
};
/** `note` answers saves of the file under `key` in `store` while it is shared, with the copy it noted the save in;
 * `ready` says when a save can be noted (`liveSaveReady`). Returns its removal. */
export function onLiveSave(store: object, key: string, note: (text: string) => string | undefined, ready: () => Promise<void> | undefined) {
  const saver = { store, note, ready };
  let notes = savers.get(key);
  if (!notes) savers.set(key, notes = new Set());
  notes.add(saver);
  return () => { notes.delete(saver); if (!notes.size && savers.get(key) === notes) savers.delete(key); };
}
/** This tab's saves made while its copy was not taking part, per draft store and key, by blob sha (their text): kept while
 * the page is open, so the copy notes them when the file opens again (`begin`). */
export const keptSaves = new WeakMap<object, Map<string, Map<string, string>>>();

/** The copy's kept state and its save notes (part of `makeCopy`, src/live-text-copy.ts): `keep` writes the copy to keep
 * (`keepSoon` after a change), `noteSave` notes a save this tab is about to make, `saved` takes in one that landed, and
 * `noteOf` finds a save's note when its commit comes. */
export function makeNotes(c: CopyContext) {
  const { s, Y, doc, text, meta, ownClients, resume, carried } = c;
  const { store, scope, path, clock, keeper, start, savesWith } = s;
  let keeping: unknown;
  const keep = () => {
    clock.clearTimeout(keeping);
    keeping = undefined;
    const draft = store.text(scope, path);
    const tookIds = [...c.took.clients].flatMap(([client, ranges]) => ranges.flatMap(({ clock, len }) => [client, clock, len]));
    const saves = savesWith((resume ?? carried)?.saves);
    if (s.discarded) return;
    if (c.synced && !c.leaving && c.copyId && c.keptBase) keeper.write(start.key, { tag: c.copyId, update: Y.encodeStateAsUpdate(doc),
      ...(draft === undefined ? {} : { draft }), base: c.keptBase, mine: [...ownClients], took: tookIds, ...(saves.length ? { saves } : {}) });
    // Not taking part yet: the own copy, which holds what the draft took on since it was kept.
    else if (!c.synced && c.drafts.own && c.drafts.kept && c.drafts.ownBase) keeper.write(start.key, { tag: c.drafts.kept.tag, update: Y.encodeStateAsUpdate(c.drafts.own),
      ...(draft === undefined ? {} : { draft }), base: c.drafts.ownBase, mine: [...ownClients], took: tookIds, ...(saves.length ? { saves } : {}) });
  };

  /** The key of the note of a save of `version`'s text in the copy (or `of`), once its items have all arrived: the one
   * this room's save from `from` wrote, else one no version took yet (from another version, or written before notes
   * named theirs). A note a version took is that version's: a revert's save of the same text has a note of its own. */
  function noteOf(version: LiveVersion, from?: string, of = doc) {
    const notes = metaOf(of);
    const fits = (key: string) => {
      const snapshot = notes.get(`s:${key}`);
      return snapshot instanceof Uint8Array && typeof notes.get(`t:${key}`) === "string" && savedText(snapshot, of) === version.text;
    };
    const own = from === undefined ? undefined : noteKey(from, version.text);
    if (own && fits(own)) return own;
    const taken = new Set<unknown>();
    for (const [key, value] of notes.entries()) if (key.startsWith("g:")) taken.add(value);
    for (const [key, over] of notes.entries()) {
      if (!key.startsWith("t:") || typeof over !== "string") continue;
      // Only a note of this very text (its key says so) is made again to be sure.
      const note = key.slice(2);
      if (note !== own && !taken.has(note) && (note === noteKey(over, version.text) || note === savedKey(version.text)) && fits(note)) return note;
    }
    return undefined;
  }
  /** Notes `version` (over `from`) in the copy (or `into`) from its save's record (`snapshot`, the copy as it was
   * saved), when every item it names has arrived and it holds `version`'s very text. The key of the note, or none. */
  function noteRecord(version: LiveVersion, from: string, snapshot: Uint8Array, into = doc) {
    if (savedText(snapshot, into) !== version.text) return undefined;
    const key = noteKey(from, version.text), notes = metaOf(into);
    if (noteOf(version, from, into) !== key) into.transact(() => { notes.set(`s:${key}`, snapshot); notes.set(`t:${key}`, from); }, META);
    return key;
  }
  /** `noteOf`, waiting for the note (as long as a catch-up may take) while it has not come. */
  function noteFor(version: LiveVersion, from?: string) {
    const found = noteOf(version, from);
    if (found || s.stopped) return Promise.resolve(found);
    return new Promise<string | undefined>(resolve => {
      const done = (key: string | undefined) => { notesWaiting.delete(end); doc.off("update", check); clock.clearTimeout(timer); resolve(key); };
      const end = () => done(undefined);
      const check = () => { const key = s.stopped ? undefined : noteOf(version, from); if (key || s.stopped) done(key); };
      const timer = clock.setTimeout(() => done(s.stopped ? undefined : noteOf(version, from)), LIVE_TEXT_CATCH_UP_MS);
      doc.on("update", check);
      notesWaiting.add(end);
    });
  }
  /** Waits for notes that end when the copy goes. */
  const notesWaiting = new Set<() => void>();

  /** The text a save's note holds, when its items have all arrived. */
  function savedText(snapshot: Uint8Array, of = doc) {
    try {
      const { sv } = Y.decodeSnapshot(snapshot);
      for (const [client, at] of sv) if (Y.getState(of.store, client) < at) return undefined;
      const at = copyAt(Y, of, snapshot);
      try { return at.getText("source").toString(); } finally { at.destroy(); }
    } catch { return undefined; }
  }
  /** Notes the copy as it is now as holding GitHub's version `version` (a save from the room: its text is the copy's
   * text now), from `from`; with no version, only the note, for the commit to come (`noteSave`). */
  function noteCopy(from: string, version?: string) {
    const noted = noteKey(from, text.toString()), snapshot = Y.encodeSnapshot(Y.snapshot(doc));
    doc.transact(() => {
      meta.set(`s:${noted}`, snapshot);
      meta.set(`t:${noted}`, from);
      if (version) meta.set(`g:${version}`, noted);
    }, META);
    return snapshot;
  }
  /** This tab is about to save the file as `text`: when the copy holds that very text, it notes the copy as it is, so the
   * others take the commit as the copy's own text (`fold`). The commit's `Live-Copy` entry: the copy's id and the note as
   * the save's record (`recordOf`), without the characters taken out when that is too long for the line, or only the id
   * when even that is. */
  function noteSave(saving: string) {
    if (!c.synced || s.discarded || saving !== text.toString() || !c.keptBase || !c.copyId) return undefined;
    let snapshot = noteCopy(c.keptBase);
    // Too long for the commit's line (a long session's characters taken out): the record says which characters the copy
    // held, not which of them were taken out by then. A tab coming back still tells its own saved words apart by
    // their ids, and the saved text's own deletions enter as the outside participant's (`recordEdge`).
    if (Math.ceil(snapshot.length * 4 / 3) > MAX_LIVE_RECORD) snapshot = Y.encodeSnapshot(Y.createSnapshot(Y.createDeleteSet(), Y.decodeSnapshot(snapshot).sv));
    const record = base64url(snapshot);
    return record.length <= MAX_LIVE_RECORD ? `${hex(c.copyId)} ${record}` : hex(c.copyId);
  }
  /** This tab's save landed (`markSaved`): its note becomes the copy's newest version. */
  function saved() {
    const file = store.get(scope, path);
    if (!file?.baseSha) return;
    // Saved before this tab took part: its own copy, holding that very text, is noted as the save, so the copy it joins
    // takes the commit as these words, not as GitHub's words a second time.
    if (!c.synced) {
      c.drafts.noteOwn(file.baseSha, file.base);
      return;
    }
    const sha = file.baseSha, node = c.keptBase ? occurrenceOn(c.github.versions(), c.keptBase, sha) : sha;
    if (!versionsOf(c.github.versions()).has(node)) {
      const noted = noteOf({ sha, text: file.base }, c.keptBase);
      if (noted) doc.transact(() => { meta.set(`g:${node}`, noted); }, META);
      // Saved without a note (not through the publish menu), while the copy holds that very text: the copy is that version.
      else if (c.keptBase && text.toString() === file.base) noteCopy(c.keptBase, node);
    }
    if (versionsOf(c.github.versions()).has(node)) c.keptBase = node;
    c.github.settle();
    keep();
  }
  /** The copy changed: it is kept in a moment (KEEP_MS). */
  const keepSoon = () => { if (keeping === undefined) keeping = clock.setTimeout(keep, KEEP_MS); };
  /** The copy goes: whatever waits for a note stops waiting. */
  const stop = () => { for (const end of [...notesWaiting]) end(); };
  return { keep, keepSoon, noteOf, noteRecord, noteFor, noteCopy, noteSave, saved, stop };
}
export type Notes = ReturnType<typeof makeNotes>;
