import assert from "node:assert/strict";
import { draftKey, type SavedDraft } from "../../src/drafts.ts";

// Deliberately partial DOM implementation of the IDB surface used by draft storage.
const partial = <T>(value: Partial<T>): T => value as T;
type Rows = Map<string, unknown>;
export function fakeIndexedDB(legacy?: SavedDraft, beforeOpen?: () => Promise<void>) {
  const stores = new Map<string, Rows>(legacy ? [["drafts", new Map([[draftKey(legacy, legacy.path), structuredClone(legacy)]])]] : []);
  const state = { version: legacy ? 1 : 0, openError: false, blocked: false, failPutAt: 0, failure: "AbortError", closed: 0,
    /** Every put into this store fails with `failure` while set (a storage that stays full). */
    failPutsInto: undefined as string | undefined, refusedPuts: 0,
    /** The next readwrite transaction commits, then reports an abort with this error (an uncertain outcome). */
    abortAfterCommit: undefined as string | undefined, abortAfterCommitSkip: 0,
    /** Read-only transactions cannot start (a receipt that cannot be read). */
    failReadonly: false };
  const connections: IDBDatabase[] = [];
  const transactions: (() => void)[] = [];
  let busy = false;
  const start = () => { if (!busy && transactions.length) { busy = true; transactions.shift()!(); } };
  const event = new Event("success");
  const factory = partial<IDBFactory>({
    open(_name, version) {
      const request = partial<IDBOpenDBRequest>({ error: null });
      const opened = () => {
        if (state.openError || (version !== undefined && version < state.version)) {
          Object.assign(request, { error: new DOMException("Cannot open", "VersionError") });
          request.onerror?.call(request, event); return;
        }
        const db = partial<IDBDatabase>({
          get version() { return state.version; },
          get objectStoreNames() { return partial<DOMStringList>({ contains: (name) => stores.has(name) }); },
          createObjectStore(name) {
            assert.equal(stores.has(name), false, "upgrade must not recreate a store");
            stores.set(name, new Map()); return partial<IDBObjectStore>({});
          },
          close() { state.closed++; },
          transaction(names, mode) {
            if (state.failReadonly && mode !== "readwrite") throw new DOMException("Injected read failure", "UnknownError");
            const scope = typeof names === "string" ? [names] : [...names];
            for (const name of scope) assert.ok(stores.has(name));
            let local: Map<string, Rows>, ended = false;
            const pending: (() => void)[] = [];
            const tx = partial<IDBTransaction>({ error: null, mode });
            const finish = () => { busy = false; start(); };
            tx.abort = () => {
              if (ended) throw new DOMException("Inactive", "InvalidStateError");
              ended = true;
              setImmediate(() => { tx.onabort?.call(tx, event); finish(); });
            };
            const step = () => {
              if (ended) return;
              const next = pending.shift();
              if (next) { next(); if (!ended) setImmediate(step); return; }
              ended = true;
              if (mode === "readwrite") for (const [name, rows] of local) stores.set(name, rows);
              if (mode === "readwrite" && state.abortAfterCommit && state.abortAfterCommitSkip > 0) state.abortAfterCommitSkip--;
              else if (mode === "readwrite" && state.abortAfterCommit) {
                Object.assign(tx, { error: new DOMException("Reported after commit", state.abortAfterCommit) });
                state.abortAfterCommit = undefined;
                tx.onabort?.call(tx, event); finish(); return;
              }
              tx.oncomplete?.call(tx, event); finish();
            };
            const enqueue = <T>(action: () => T) => {
              if (ended) throw new DOMException("Inactive", "TransactionInactiveError");
              const request = partial<IDBRequest<T>>({ error: null });
              pending.push(() => {
                try { Object.assign(request, { result: structuredClone(action()) }); }
                catch (error) {
                  Object.assign(request, { error }); Object.assign(tx, { error });
                  request.onerror?.call(request, event); tx.abort(); return;
                }
                request.onsuccess?.call(request, event);
              });
              return request;
            };
            tx.objectStore = (name) => {
              assert.ok(scope.includes(name));
              const entries = (range?: IDBValidKey | IDBKeyRange | null) => [...local.get(name)!].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).filter(([key]) => {
                if (!range) return true;
                const bound = range as IDBKeyRange;
                return key >= String(bound.lower) && key <= String(bound.upper);
              });
              return partial<IDBObjectStore>({
                get: (key) => enqueue(() => local.get(name)!.get(String(key))),
                put(value, key) {
                  const copy: unknown = structuredClone(value);
                  return enqueue(() => {
                    if (state.failPutAt && --state.failPutAt === 0) throw new DOMException("Injected storage failure", state.failure);
                    if (state.failPutsInto === name) { state.refusedPuts++; throw new DOMException("Injected full storage", state.failure); }
                    local.get(name)!.set(String(key), copy); return key!;
                  });
                },
                delete: (key) => enqueue(() => { local.get(name)!.delete(String(key)); }),
                getAll: (range) => enqueue(() => entries(range).map(([, value]) => value)),
                getAllKeys: (range) => enqueue(() => entries(range).map(([key]) => key)),
              });
            };
            transactions.push(() => { local = new Map(scope.map((name) => [name, structuredClone(stores.get(name)!)])); setImmediate(step); });
            setImmediate(start);
            return tx;
          },
        });
        connections.push(db);
        Object.assign(request, { result: db });
        if (state.blocked) {
          state.blocked = false;
          // Real requests throw if error is read while the blocked open is still pending.
          Object.defineProperty(request, "error", { configurable: true, get() { throw new DOMException("Pending", "InvalidStateError"); } });
          request.onblocked?.call(request, partial<IDBVersionChangeEvent>({ oldVersion: state.version }));
          Object.defineProperty(request, "error", { value: null });
        }
        if ((version ?? 1) > state.version) {
          const oldVersion = state.version; state.version = version ?? 1;
          request.onupgradeneeded?.call(request, partial<IDBVersionChangeEvent>({ oldVersion }));
        }
        request.onsuccess?.call(request, event);
      };
      if (beforeOpen) beforeOpen().then(opened).catch((error: unknown) => { Object.assign(request, { error }); request.onerror?.call(request, event); });
      else queueMicrotask(opened);
      return request;
    },
  });
  return { factory, state, stores, versionChange() { for (const db of connections) db.onversionchange?.call(db, partial<IDBVersionChangeEvent>({})); } };
}
