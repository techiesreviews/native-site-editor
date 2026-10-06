import { test } from "node:test";
import assert from "node:assert/strict";
import { CHUNK_RELOAD_KEY, createChunkRecovery, guardChunkReload, hasEditableRecoveryState, installChunkRecovery, isChunkLoadError } from "../src/chunk-recovery.ts";
const failure = new TypeError("Failed to fetch dynamically imported module: https://example.com/assets/old.js");
function fixture() {
  const values = new Map<string, string>();
  let reloads = 0, notices = 0, flushes = 0, unsafe = false, error = false;
  const options = {
    storage: () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }),
    unsafe: () => unsafe,
    flush: async () => { flushes++; },
    persistenceError: () => error,
    reload: () => { reloads++; },
    notice: () => { notices++; },
  };
  return { options, values, setUnsafe: (value: boolean) => { unsafe = value; }, setError: (value: boolean) => { error = value; }, counts: () => ({ reloads, notices, flushes }) };
}
test("reloads once across handler instances after draft writes settle", async () => {
  const f = fixture();
  let commit!: () => void;
  f.options.flush = () => new Promise<void>((resolve) => { commit = resolve; });
  const recover = createChunkRecovery(f.options);
  const first = recover(failure), duplicate = recover(failure);
  assert.equal(first, duplicate);
  assert.equal(f.counts().reloads, 0);
  commit(); await first;
  assert.equal(f.counts().reloads, 1);
  assert.equal(f.values.get(CHUNK_RELOAD_KEY), "1");
  await createChunkRecovery(f.options)(failure);
  assert.equal(f.counts().reloads, 1);
  assert.equal(f.counts().notices, 1);
});
test("only recognizes chunk fetch failures, never arbitrary runtime errors", async () => {
  for (const message of ["Importing a module script failed.", "error loading dynamically imported module", "Unable to preload CSS for /assets/a.css", "Loading chunk 42 failed."]) assert.equal(isChunkLoadError(new Error(message)), true);
  const f = fixture();
  assert.equal(createChunkRecovery(f.options)(new Error("Cannot read properties of undefined")), undefined);
  assert.deepEqual(f.counts(), { reloads: 0, notices: 0, flushes: 0 });
});
test("memory-only edits block recovery, including hidden registered answers", async () => {
  const f = fixture(), recover = createChunkRecovery(f.options);
  f.setUnsafe(true); await recover(failure);
  assert.equal(f.counts().reloads, 0);
  f.setUnsafe(false);
  const release = guardChunkReload(() => true);
  try { await recover(failure); assert.equal(f.counts().reloads, 0); } finally { release(); }
  await recover(failure);
  assert.equal(f.counts().reloads, 1);
});
test("a resolved flush with a persistence error does not reload", async () => {
  const f = fixture(); f.setError(true);
  await createChunkRecovery(f.options)(failure);
  assert.deepEqual(f.counts(), { reloads: 0, notices: 1, flushes: 1 });
  assert.equal(f.values.has(CHUNK_RELOAD_KEY), false);
});
test("edits started during flush block reload", async () => {
  const f = fixture(); f.options.flush = async () => { f.setUnsafe(true); };
  await createChunkRecovery(f.options)(failure);
  assert.equal(f.counts().reloads, 0);
});
test("unavailable session storage never causes a reload loop", async () => {
  const f = fixture(); f.options.storage = () => { throw new Error("Storage blocked"); };
  await createChunkRecovery(f.options)(failure);
  assert.deepEqual(f.counts(), { reloads: 0, notices: 1, flushes: 0 });
});

function editableDocument({ dialog = false, fields = [], frames = [], activeElement = null }: {
  dialog?: boolean;
  fields?: Partial<HTMLInputElement>[];
  frames?: { contentDocument: Document | null }[];
  activeElement?: unknown;
} = {}): Document {
  return {
    activeElement,
    querySelector: () => dialog ? {} : null,
    querySelectorAll: (selector: string) => selector === "iframe" ? frames : fields,
  } as unknown as Document;
}
test("open forms, focused fields, inline edits and inaccessible previews block reload", () => {
  assert.equal(hasEditableRecoveryState(editableDocument()), false);
  assert.equal(hasEditableRecoveryState(editableDocument({ dialog: true })), true);
  const field = { value: "answer", type: "text", getClientRects: () => ({ length: 1 }) } as HTMLInputElement;
  assert.equal(hasEditableRecoveryState(editableDocument({ fields: [field] })), true);
  field.value = "";
  assert.equal(hasEditableRecoveryState(editableDocument({ fields: [field], activeElement: field })), true);
  assert.equal(hasEditableRecoveryState(editableDocument({ fields: [field] })), false);
  assert.equal(hasEditableRecoveryState(editableDocument({ frames: [{ contentDocument: null }] })), true);
  assert.equal(hasEditableRecoveryState(editableDocument({ frames: [{ contentDocument: editableDocument({ dialog: true }) }] })), true);
});
test("session guard write failures and rejected draft flushes keep current edits", async () => {
  const f = fixture();
  f.options.storage = () => ({ getItem: () => null, setItem: () => { throw new Error("Storage blocked"); } });
  await createChunkRecovery(f.options)(failure);
  assert.equal(f.counts().reloads, 0);
  const rejected = fixture();
  rejected.options.flush = async () => { throw new Error("Database failed"); };
  await createChunkRecovery(rejected.options)(failure);
  assert.equal(rejected.counts().reloads, 0);
});

test("Vite preload errors preserve import rejection and allow a fresh attempt", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const window = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  try {
    const f = fixture(); f.setUnsafe(true);
    installChunkRecovery(f.options);
    let loading: Promise<unknown> | undefined;
    let attempts = 0;
    const viteImport = async () => {
      attempts++;
      const event = new Event("vite:preloadError", { cancelable: true });
      Object.assign(event, { payload: failure });
      window.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false);
      // Vite only rethrows when the preload event is not prevented.
      if (!event.defaultPrevented) throw failure;
    };
    const load = () => loading ??= viteImport().catch((error) => {
      loading = undefined;
      throw error;
    });
    await assert.rejects(load(), failure);
    assert.equal(loading, undefined);
    await assert.rejects(load(), failure);
    assert.equal(attempts, 2);
    assert.equal(f.counts().reloads, 0);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
