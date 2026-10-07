// The Monaco-free draft store (lean-fast-editor ticket 03, point 4).
//
// It owns, per scope and path, a file's draft text (a plain string), its saved
// base (the text and blob GitHub has), and the visual Undo/Redo history, so
// preview selection, the edit bar, inline edits, drafts, Undo/Redo and Save to
// GitHub all work before Monaco has loaded. Persistence goes through the
// existing browser layer (src/drafts.ts `DraftStore`, IndexedDB with a
// localStorage fallback) by its `DraftAccess` surface.
//
// Wired in by src/components/source-editor.ts (handoff plan, phase 4f), the
// Monaco-free half of the code editor; src/components/code-editor.ts is the
// Monaco view over it. The API maps onto that code:
//
// - `open` is mountCodeEditor's draft lookup (saved draft or GitHub source,
//   a lost publish recognized on reopening, a conflict reported).
// - `edit` is `replaceActiveRange` / `replaceActiveRanges` / the agent apply
//   / Discard: verified range edits or a whole text, with a label, one undo
//   step each; `group` keeps an inline edit's keystrokes in one step until
//   `closeGroup`; a `companion` (another file changed with it) is undone and
//   redone with it.
// - `applyReceipt` is `prepareHistorySources` + `prepareNativeTextHistory`: a
//   multi-file step (texts and draft records, including deletions and moves)
//   that is applied, undone and redone whole or refused whole, never partly.
// - `recordAction` is `recordHistoryAction`: an opaque host step (async,
//   may refuse by returning false, optional redo, dispose).
// - `hold` is `holdHistoryRefresh`; `retain` is `retainFileModel`; `drop`,
//   `forget` and `release` are `dropDraft`, `forgetDraftModel` and the
//   clean-model eviction on dispose; `markSaved` is `reconcilePublished`;
//   `changed` / `unpersisted` are `changedFiles` / `hasUnpersistedEdits`.
// - `write` is a host-owned text change outside the journals (a multi-file
//   operation's own receipt, src/page-builder/native-operation-history.ts):
//   the steps below it stay valid, and its undo restores the exact revision.
// - `adopt` takes a draft record a host wrote for an open file with the same
//   text (an operation's own draft write) as this store's own.
//
// History. Every history (a string; code-editor.ts's `historyScope`, e.g. a
// page with its stylesheets) is one linear Undo/Redo journal. Each file has a
// revision that works like Monaco's alternative version id: an edit gives it
// a new one, Undo puts the step's earlier one back, Redo its later one. A
// step runs only while every file it touched is at the revision it left, so a
// change made outside it (another history, an external write, a receipt over
// the file) makes it refuse instead of reverting one file of several. A
// per-file Undo is a history used by one file only.
//
// The Monaco seam. Monaco becomes a view of this store: a code pane creates
// its model on demand from `get(...).text`, and owns only typing undo inside
// that pane. The pane's adapter:
//
// 1. `beginTyping(scope, path, history, { version, native })` when the pane
//    mounts, with the model's alternative version id. Each content change
//    from typing goes to `session.input(model.getValue(), version)`: the
//    store's text (and so the preview and the persisted draft) follows at
//    once, without a history step.
// 2. When typing settles (code-editor.ts's TYPING_SETTLE_MS) or the pane
//    closes, `session.commit()` records one typing step; the adapter calls
//    `model.pushStackElement()` and remembers the version as its floor.
// 3. Ctrl+Z in the pane: above the floor (uncommitted typing), Monaco's own
//    `model.undo()` runs and its result goes to `input` like typing. At the
//    floor the key runs `store.undo(history)`. A typing step keeps Monaco's
//    undo stops: while its pane is open the store routes its Undo and Redo
//    back through `native.undo/redo(expected)`, one Monaco stop per press
//    (the adapter runs `model.undo()` without reporting it to `input`), so
//    the stops stay interleaved with visual steps in one journal order.
//    After `dispose` (pane closed) the step undoes whole. The store commits
//    pending typing before its history moves, so the two never interleave.
// 4. The adapter subscribes; a `text` event for its file whose origin is not
//    "typing" and whose text differs from the model (a visual edit, Undo/Redo,
//    a receipt, Discard, another tab) is applied with
//    `model.applyEdits(event.changes)` (outside Monaco's undo stack), then
//    `session.sync(version)` and the floor move to the new version.
// 5. `retain(scope, path)` while the pane is open, released on dispose.
//
// Events are delivered after a mutation and its journal move are complete,
// so a listener that edits the store again builds on a settled history.
//
// Shared state for the main.ts split (ticket 08) will wrap `subscribe` in
// @preact/signals-core signals; the store itself needs no reactive library.

import { draftKey, type DraftScope, type SavedDraft } from "./drafts";
import type { DraftAccess } from "./file-changes";

/** The persisted-draft layer: src/drafts.ts `DraftStore` (or a test double). */
export type DraftPersistence = DraftAccess & { error?: string | null };

/** Draft record fields beyond the text: a deletion, a move, an opaque or uploaded file, the mode. */
export type FileFlags = Pick<SavedDraft, "deleted" | "movedTo" | "movedFrom" | "sourceSha" | "opaque" | "upload" | "mode">;
const FLAG_KEYS = ["deleted", "movedTo", "movedFrom", "sourceSha", "opaque", "upload", "mode"] as const;

/** What a file is in the store. `baseSha` null: a new file; undefined: unknown (not persisted). */
export interface FileState {
  text: string;
  /** The saved base: GitHub's text the draft began from (`SavedDraft.original`). */
  base: string;
  baseSha: string | null | undefined;
  flags?: FileFlags;
}
export interface DraftFile extends Readonly<FileState> {
  readonly key: string;
  readonly scope: DraftScope;
  readonly path: string;
  /** Like Monaco's alternative version id: Undo returns to an earlier one. */
  readonly revision: number;
  /** The text differs from GitHub (or the file is new or flagged). */
  readonly changed: boolean;
  /** The last write reached the persistence layer. */
  readonly persisted: boolean;
}
/** Replace `[start, end)` (UTF-16 offsets of the current text); `expected`, when given, must be what is there. */
export interface TextChange { start: number; end: number; text: string; expected?: string }
/** A change outside the edited file that belongs to an edit's undo step. */
export interface HistoryCompanion { undo(): void; redo(): void }
/** Returning false refuses the step and keeps it in place. */
export type HistoryActionCallback = () => void | boolean | Promise<void | boolean>;

export type TextOrigin = "edit" | "typing" | "undo" | "redo" | "receipt" | "discard" | "external";
export type DraftEvent =
  | { type: "text"; key: string; scope: DraftScope; path: string; text: string; revision: number; origin: TextOrigin;
      /** Ranges of the text before this change, applied as one batch; a whole-text replacement when absent. */
      changes?: { start: number; end: number; text: string }[] }
  | { type: "file"; key: string; scope: DraftScope; path: string; change: "opened" | "saved" | "dropped" | "forgotten" | "base" }
  | { type: "history"; history: string };

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };
export type StepResult = Result<{ step?: number }>;

export interface EditInput {
  scope: DraftScope;
  path: string;
  /** The Undo/Redo journal (code-editor.ts's historyScope); the file's own by default. */
  history?: string;
  label?: string;
  /** Range edits in the current text's offsets (non-overlapping), or `text` for the whole file. */
  changes?: TextChange[];
  text?: string;
  /** Keep merging into the last step while it is open (inline typing), until `closeGroup`. */
  group?: boolean;
  companion?: HistoryCompanion;
  /** False: change the text without a history step; histories touching the file are cleared. */
  record?: boolean;
  origin?: TextOrigin;
}
export interface ReceiptFile {
  scope: DraftScope;
  path: string;
  /** The text it must have now (null: no draft and not open); unchecked when undefined. */
  expected?: string | null;
  /** What it becomes (null: no draft, not open). */
  after: FileState | null;
}
export interface TypingSession {
  readonly key: string;
  /**
   * The pane's text after a keystroke, or after Monaco's own Undo/Redo of
   * typing not yet committed; `version` is the model's alternative version id.
   */
  input(text: string, version?: number): void;
  /** The model's alternative version id after the pane applied a store change to it. */
  sync(version: number): void;
  /** Closes what was typed since the last commit as one history step. */
  commit(label?: string): number | undefined;
  /** Commits and ends the session; its steps fall back to whole-text Undo. */
  dispose(): void;
}
/**
 * The pane's own undo stack, so a committed typing step keeps Monaco's undo
 * stops: the store asks for one native Undo or Redo at a time while the model
 * is at `expected` (else returns undefined), and gets the resulting text and
 * version. The pane must not report that change through `input`.
 */
export interface NativeTyping {
  undo(expected: number): { text: string; version: number } | undefined;
  redo(expected: number): { text: string; version: number } | undefined;
}
export interface TypingOptions { label?: string; version?: number; native?: NativeTyping }
export interface DraftStoreOptions {
  persistence?: DraftPersistence;
  now?: () => number;
}

export const RECEIPT_REFUSAL = "This change touched several files together and one of them has changed since, so Undo and Redo would change only some of them. Review the current drafts instead.";

interface Entry extends FileState {
  key: string;
  scope: DraftScope;
  path: string;
  revision: number;
  persisted: boolean;
  /** The record this store last wrote or read for the path: anything else there is a foreign write. */
  record: SavedDraft | undefined;
  leases: number;
}
type Snapshot = (FileState & { revision: number }) | null;
/** The persisted records on either side of a step: Undo and Redo put back these very records (their identity proves no foreign write). */
type Records = { before: SavedDraft | undefined; after: SavedDraft | undefined };
type EditStep = { kind: "edit"; id: number; label: string; key: string; changes: TextChange[]; inverse: TextChange[]; before: number; after: number; group: boolean; companions: HistoryCompanion[]; records: Records };
type ReceiptStep = { kind: "receipt"; id: number; label: string; files: { key: string; scope: DraftScope; path: string; before: Snapshot; after: Snapshot }[] };
type ActionStep = { kind: "action"; id: number; label: string; undo: HistoryActionCallback; redo?: HistoryActionCallback; dispose?: () => void };
type TypingState = { text: string; revision: number; version?: number; record?: SavedDraft };
/**
 * Typing committed from a pane. `at` is where Undo/Redo has it, from `start`
 * to `end`: one native stop at a time while its pane is open. The step is on
 * the undo stack whenever `at` is not `start`.
 */
type TypingStep = { kind: "typing"; id: number; label: string; key: string; session: Typing; start: TypingState; end: TypingState; at: TypingState; companions: HistoryCompanion[] };
type Step = EditStep | TypingStep | ReceiptStep | ActionStep;
type Journal = { undo: Step[]; redo: Step[] };
type Typing = { history: string; label: string; start?: TypingState; order?: number; version?: number; native?: NativeTyping; ended?: boolean };

/** Applies non-overlapping changes; returns the new text and the changes that undo them (in the new text's offsets). */
export function applyChanges(text: string, changes: readonly TextChange[]) {
  const sorted = [...changes].sort((a, b) => a.start - b.start);
  let out = "", at = 0, delta = 0;
  const inverse: TextChange[] = [];
  for (const change of sorted) {
    if (change.start < at || change.end < change.start || change.end > text.length) throw new RangeError("Overlapping or out-of-range text change.");
    const removed = text.slice(change.start, change.end);
    if (change.expected !== undefined && removed !== change.expected)
      throw new RangeError("The source at this location no longer matches the preview. Refresh, wait for the new build, then try again.");
    out += text.slice(at, change.start) + change.text;
    inverse.push({ start: change.start + delta, end: change.start + delta + change.text.length, text: removed });
    delta += change.text.length - removed.length;
    at = change.end;
  }
  return { text: out + text.slice(at), inverse, changes: sorted.map(({ start, end, text }) => ({ start, end, text })) };
}
/** The one range that turns `a` into `b`. */
export function diffRange(a: string, b: string): TextChange {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let tail = 0;
  while (tail < max - start && a.charCodeAt(a.length - 1 - tail) === b.charCodeAt(b.length - 1 - tail)) tail++;
  return { start, end: a.length - tail, text: b.slice(start, b.length - tail) };
}
const flagsOf = (record: SavedDraft | undefined): FileFlags | undefined => {
  if (!record) return undefined;
  const flags: Record<string, unknown> = {};
  for (const key of FLAG_KEYS) if (record[key] !== undefined) flags[key] = record[key];
  return Object.keys(flags).length ? flags as FileFlags : undefined;
};
const sameFlags = (a: FileFlags | undefined, b: FileFlags | undefined) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
function sameRecord(a: SavedDraft, b: SavedDraft) {
  const keys = Object.keys(a).filter(key => key !== "updatedAt") as (keyof SavedDraft)[];
  return keys.length === Object.keys(b).filter(key => key !== "updatedAt").length &&
    keys.every(key => a[key] === b[key] || JSON.stringify(a[key]) === JSON.stringify(b[key]));
}
const isChanged = (state: FileState) => state.baseSha === null || state.text !== state.base || Boolean(state.flags && Object.keys(state.flags).length);

export function createDraftStore(options: DraftStoreOptions = {}) {
  const persistence = options.persistence;
  const now = options.now ?? Date.now;
  const files = new Map<string, Entry>();
  const journals = new Map<string, Journal>();
  const typing = new Map<string, Typing>();
  const running = new Set<string>();
  const holds = new Map<string, number>();
  const listeners = new Set<(event: DraftEvent) => void>();
  let revisions = 0, steps = 0, typingOrder = 0;

  const deliver = (event: DraftEvent) => { for (const listener of [...listeners]) try { listener(event); } catch { /* A listener must not break a step. */ } };
  // Events wait until a mutation (and its journal move) is complete, so a
  // listener that changes the store again sees, and builds on, a settled state.
  let deferred = 0;
  const queued: DraftEvent[] = [];
  const emit = (event: DraftEvent) => { if (deferred) queued.push(event); else deliver(event); };
  function batch<T>(fn: () => T): T {
    deferred++;
    try { return fn(); }
    finally { if (--deferred === 0) while (queued.length && !deferred) deliver(queued.shift()!); }
  }
  const emitHistory = (history: string) => emit({ type: "history", history });
  const textEvent = (entry: Entry, origin: TextOrigin, changes?: { start: number; end: number; text: string }[]) =>
    emit({ type: "text", key: entry.key, scope: entry.scope, path: entry.path, text: entry.text, revision: entry.revision, origin, changes });
  const journal = (history: string) => {
    let found = journals.get(history);
    if (!found) journals.set(history, found = { undo: [], redo: [] });
    return found;
  };
  const disposeStep = (step: Step) => { if (step.kind === "action") try { step.dispose?.(); } catch { /* Cleanup must not interrupt. */ } };
  const clearRedo = (found: Journal) => { for (const step of found.redo) disposeStep(step); found.redo.length = 0; };
  const keysOf = (step: Step) => step.kind === "edit" || step.kind === "typing" ? [step.key] : step.kind === "receipt" ? step.files.map(file => file.key) : [];
  /** A new step: a partly undone typing step below it ends where it is now (the pane's redo is gone). */
  function pushStep(history: string, step: Step) {
    const found = journal(history);
    const top = found.undo.at(-1);
    if (top?.kind === "typing" && top.at !== top.end) top.end = top.at;
    found.undo.push(step);
    clearRedo(found);
    emitHistory(history);
  }
  const view = (entry: Entry): DraftFile => ({
    key: entry.key, scope: entry.scope, path: entry.path, text: entry.text, base: entry.base, baseSha: entry.baseSha,
    flags: entry.flags, revision: entry.revision, changed: isChanged(entry), persisted: entry.persisted,
  });

  let persisting = 0;
  /** Writes the entry's draft; `preferred` (a step's own record) is written itself when it says the same. */
  function persist(entry: Entry, preferred?: SavedDraft) {
    if (!persistence || entry.baseSha === undefined) { entry.persisted = false; return true; }
    persisting++;
    try { return persistEntry(entry, persistence, preferred); } finally { persisting--; }
  }
  const recordOf = (entry: Entry): SavedDraft => {
    const { account, repoId, repo, branch } = entry.scope;
    return { ...entry.flags, account, repoId, repo, branch, version: 1, path: entry.path,
      baseSha: entry.baseSha as string | null, original: entry.base, content: entry.text, updatedAt: now() };
  };
  function persistEntry(entry: Entry, persistence: DraftPersistence, preferred?: SavedDraft) {
    const draft = recordOf(entry);
    const existing = persistence.get(entry.scope, entry.path);
    // A refresh that changes nothing keeps the exact record, so its identity proves no foreign write.
    const ok = persistence.save(preferred && sameRecord(preferred, draft) ? preferred : existing && sameRecord(existing, draft) ? existing : draft);
    entry.record = persistence.get(entry.scope, entry.path);
    entry.persisted = ok;
    return ok;
  }
  function removeRecord(entry: { scope: DraftScope; path: string }) {
    if (!persistence) return true;
    persisting++;
    try { return persistence.remove(entry.scope, entry.path); } finally { persisting--; }
  }
  /** The record is still the one this store wrote or read. */
  const ownsRecord = (entry: Entry) => !persistence || entry.baseSha === undefined || persistence.get(entry.scope, entry.path) === entry.record;
  function entryFromRecord(scope: DraftScope, path: string, record: SavedDraft): Entry {
    return { key: draftKey(scope, path), scope: { ...scope }, path, text: record.content, base: record.original, baseSha: record.baseSha,
      flags: flagsOf(record), revision: ++revisions, persisted: true, record, leases: 0 };
  }
  /** The open entry, or one loaded from a persisted draft. */
  function load(scope: DraftScope, path: string) {
    const key = draftKey(scope, path);
    let entry = files.get(key);
    const record = entry ? undefined : persistence?.get(scope, path);
    if (!entry && record) files.set(key, entry = entryFromRecord(scope, path, record));
    return entry;
  }
  /** Removes `key` from every journal that holds a step over it (the file changed outside history). */
  function invalidate(key: string) {
    for (const [history, found] of journals) {
      if (![...found.undo, ...found.redo].some(step => keysOf(step).includes(key))) continue;
      for (const step of [...found.undo, ...found.redo]) disposeStep(step);
      found.undo.length = 0; found.redo.length = 0;
      emitHistory(history);
    }
  }
  const referenced = (key: string) => [...journals.values()].some(found => [...found.undo, ...found.redo].some(step => keysOf(step).includes(key)));
  function evictIfClean(entry: Entry) {
    if (entry.leases || isChanged(entry) || typing.has(entry.key) || referenced(entry.key) || files.get(entry.key) !== entry) return false;
    files.delete(entry.key);
    emit({ type: "file", key: entry.key, scope: entry.scope, path: entry.path, change: "forgotten" });
    return true;
  }

  // Typing (the Monaco seam): text follows keystrokes; a commit makes one step.
  function commitTyping(key: string, label?: string) {
    const session = typing.get(key), entry = files.get(key);
    if (!session?.start || !entry) return undefined;
    const start = session.start;
    session.start = undefined;
    if (entry.text === start.text && session.version === start.version) {
      // No text or native undo movement: the steps below stay valid.
      entry.revision = start.revision;
      return undefined;
    }
    const end: TypingState = { text: entry.text, revision: entry.revision, version: session.version, record: entry.record };
    const step: TypingStep = { kind: "typing", id: ++steps, label: label ?? session.label, key, session, start, end, at: end, companions: [] };
    pushStep(session.history, step);
    return step.id;
  }
  const commitHistoryTyping = (history: string | undefined, extraKeys: readonly string[] = []) => {
    const pending = [...typing].filter(([key, session]) => session.start && (session.history === history || extraKeys.includes(key)));
    pending.sort((a, b) => a[1].order! - b[1].order!);
    for (const [key] of pending) commitTyping(key);
  };

  function beginTyping(scope: DraftScope, path: string, history?: string, options: TypingOptions = {}): TypingSession {
    const key = draftKey(scope, path);
    if (!files.has(key)) throw new Error(`${path} is not open in the draft store.`);
    if (typing.has(key)) throw new Error(`${path} already has a typing session.`);
    const session: Typing = { history: history ?? key, label: options.label ?? "Typing", version: options.version, native: options.native };
    typing.set(key, session);
    return {
      key,
      input: (text, version) => batch(() => {
        const entry = files.get(key);
        if (session.ended || !entry) return;
        if (entry.text === text && (version === undefined || version === session.version)) return;
        // Switching panes closes the earlier pane's native undo group now,
        // rather than letting settle timers decide their journal order.
        for (const [otherKey, other] of typing) if (otherKey !== key && other.history === session.history && other.start) commitTyping(otherKey);
        const previous = entry.text;
        if (!session.start) {
          session.start = { text: entry.text, revision: entry.revision, version: session.version, record: entry.record };
          session.order = ++typingOrder;
        }
        // Monaco destroys Redo on the first new keystroke, even if later
        // keystrokes erase it. Mirror that immediately in the shared journal.
        const found = journal(session.history);
        const top = found.undo.at(-1);
        const truncated = top?.kind === "typing" && top.at !== top.end;
        if (truncated) top.end = top.at;
        if (found.redo.length || truncated) { clearRedo(found); emitHistory(session.history); }
        if (version !== undefined) session.version = version;
        entry.text = text;
        entry.revision = ++revisions;
        persist(entry);
        textEvent(entry, "typing", [diffRange(previous, text)]);
      }),
      sync(version) { if (!session.ended) session.version = version; },
      commit: (commitLabel) => session.ended ? undefined : batch(() => commitTyping(key, commitLabel)),
      dispose() {
        if (session.ended) return;
        batch(() => commitTyping(key));
        session.ended = true;
        session.native = undefined;
        if (typing.get(key) === session) typing.delete(key);
      },
    };
  }

  function open(scope: DraftScope, path: string, source: { text: string; baseSha?: string | null }) {
    const key = draftKey(scope, path);
    let entry = files.get(key);
    if (!entry) {
      const record = persistence?.get(scope, path);
      entry = record ? entryFromRecord(scope, path, record)
        : { key, scope: { ...scope }, path, text: source.text, base: source.text, baseSha: source.baseSha, flags: undefined,
            revision: ++revisions, persisted: true, record: undefined, leases: 0 };
      files.set(key, entry);
      emit({ type: "file", key, scope: entry.scope, path, change: "opened" });
    }
    // A successful publish whose response was lost is recognized on reopening.
    if (source.baseSha !== null && (entry.text === source.text || entry.base === source.text) &&
        (entry.base !== source.text || entry.baseSha !== source.baseSha)) {
      entry.base = source.text;
      entry.baseSha = source.baseSha;
      persist(entry);
      emit({ type: "file", key, scope: entry.scope, path, change: "base" });
    }
    const conflict = source.baseSha !== undefined && entry.baseSha !== source.baseSha;
    return { file: view(entry), conflict };
  }

  function edit(input: EditInput): StepResult {
    const key = draftKey(input.scope, input.path);
    const entry = files.get(key);
    if (!entry) return { ok: false, error: `${input.path} is not open in the draft store.` };
    // Typing still open anywhere in this history (or in the file) is an earlier
    // step: it is committed first, so the journal stays in the order things happened.
    commitHistoryTyping(input.history ?? key, [key]);
    let applied: ReturnType<typeof applyChanges>;
    try {
      applied = input.changes ? applyChanges(entry.text, input.changes)
        : input.text !== undefined ? applyChanges(entry.text, [diffRange(entry.text, input.text)])
        : applyChanges(entry.text, []);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (applied.text === entry.text) return { ok: true };
    const history = input.history ?? key;
    const before = entry.revision, previous = entry.text, recordBefore = entry.record;
    entry.text = applied.text;
    entry.revision = ++revisions;
    persist(entry);
    const origin = input.origin ?? "edit";
    textEvent(entry, origin, applied.changes);
    if (input.record === false) { invalidate(key); return { ok: true }; }
    const found = journal(history);
    const last = found.undo.at(-1);
    if (input.group && last?.kind === "edit" && last.group && last.key === key && last.after === before) {
      // One step for the group: from its first state to now.
      const start = applyChanges(previous, last.inverse).text;
      last.changes = [diffRange(start, entry.text)];
      last.inverse = [diffRange(entry.text, start)];
      last.after = entry.revision;
      last.records.after = entry.record;
      if (input.companion) last.companions.push(input.companion);
      clearRedo(found);
      emitHistory(history);
      return { ok: true, step: last.id };
    }
    const step: EditStep = { kind: "edit", id: ++steps, label: input.label ?? "Edit", key, changes: applied.changes, inverse: applied.inverse,
      before, after: entry.revision, group: Boolean(input.group), companions: input.companion ? [input.companion] : [],
      records: { before: recordBefore, after: entry.record } };
    pushStep(history, step);
    return { ok: true, step: step.id };
  }
  function closeGroup(history: string) {
    const last = journals.get(history)?.undo.at(-1);
    if (last?.kind === "edit") last.group = false;
  }
  /**
   * Ties `companion` to the step `step` while it is the latest of `history`
   * and its file is still where the step left it (attachHistoryCompanion).
   */
  function attachCompanion(history: string, step: number, companion: HistoryCompanion) {
    const last = journals.get(history)?.undo.at(-1);
    if (last?.kind !== "edit" && last?.kind !== "typing" || last.id !== step) return false;
    if (files.get(last.key)?.revision !== (last.kind === "edit" ? last.after : last.at === last.end ? last.end.revision : NaN)) return false;
    last.companions.push(companion);
    return true;
  }

  const snapshot = (entry: Entry | undefined): Snapshot => entry
    ? { text: entry.text, base: entry.base, baseSha: entry.baseSha, flags: entry.flags, revision: entry.revision } : null;
  const atSnapshot = ({ key, scope, path }: { key: string; scope: DraftScope; path: string }, expected: Snapshot) => {
    const entry = files.get(key);
    // Absent means no entry and no persisted draft: another writer's draft there is not ours to overwrite.
    if (!expected) return !entry && (!persistence || persistence.get(scope, path) === undefined);
    return Boolean(entry) && entry!.revision === expected.revision && entry!.text === expected.text && entry!.base === expected.base &&
      entry!.baseSha === expected.baseSha && sameFlags(entry!.flags, expected.flags) && ownsRecord(entry!);
  };
  /** Puts every file at its snapshot, persisted; all or nothing. */
  function setSnapshots(targets: { key: string; scope: DraftScope; path: string; to: Snapshot }[], origin: TextOrigin): string | undefined {
    const previous = targets.map(target => ({ ...target, to: snapshot(files.get(target.key)) }));
    const write = (list: typeof targets) => {
      let failed: string | undefined;
      for (const target of list) {
        const entry = files.get(target.key);
        if (!target.to) {
          if (entry) files.delete(target.key);
          if (!removeRecord(target)) failed ??= persistence?.error ?? `Could not update ${target.path}.`;
          continue;
        }
        const next: Entry = entry ?? { key: target.key, scope: { ...target.scope }, path: target.path, text: "", base: "", baseSha: undefined,
          revision: 0, persisted: true, record: undefined, leases: 0 };
        Object.assign(next, { text: target.to.text, base: target.to.base, baseSha: target.to.baseSha, flags: target.to.flags, revision: target.to.revision });
        files.set(target.key, next);
        if (!persist(next)) failed ??= persistence?.error ?? `Could not update ${target.path}.`;
      }
      return failed;
    };
    const failed = write(targets);
    if (failed) { write(previous); return failed; }
    previous.forEach((old, index) => {
      const entry = files.get(old.key), target = targets[index];
      if (entry) textEvent(entry, origin, old.to ? [diffRange(old.to.text, entry.text)] : undefined);
      else emit({ type: "file", key: old.key, scope: target.scope, path: target.path, change: "dropped" });
    });
    return undefined;
  }

  /**
   * A multi-file step: every file goes to its `after` state at once, or none
   * does. Recorded in `history` as one step (unless `record` is false) that
   * Undo and Redo move whole, refusing while any file has changed since.
   */
  function applyReceipt(history: string, label: string, changes: ReceiptFile[], record = true): StepResult {
    const keys = changes.map(change => draftKey(change.scope, change.path));
    if (new Set(keys).size !== keys.length) return { ok: false, error: "A file appears twice in one change." };
    commitHistoryTyping(record ? history : undefined, keys);
    const entries = changes.map(change => load(change.scope, change.path));
    for (const [index, change] of changes.entries()) {
      const entry = entries[index];
      if (change.expected !== undefined && (entry?.text ?? null) !== change.expected) return { ok: false, error: `The source for ${change.path} changed.` };
      if (entry && !ownsRecord(entry)) return { ok: false, error: `The draft for ${change.path} changed.` };
    }
    const planned = changes.map((change, index) => {
      const before = snapshot(entries[index]);
      const same = before && change.after && before.text === change.after.text && before.base === change.after.base &&
        before.baseSha === change.after.baseSha && sameFlags(before.flags, change.after.flags);
      const after: Snapshot = change.after ? { ...change.after, revision: same ? before!.revision : ++revisions } : null;
      return { key: keys[index], scope: { ...change.scope }, path: change.path, before, after };
    });
    const error = setSnapshots(planned.map(file => ({ ...file, to: file.after })), "receipt");
    if (error) return { ok: false, error };
    if (!record) { for (const key of keys) invalidate(key); return { ok: true }; }
    const step: ReceiptStep = { kind: "receipt", id: ++steps, label, files: planned };
    pushStep(history, step);
    return { ok: true, step: step.id };
  }

  /** Records a host step (recordHistoryAction): Undo runs `undo` once the steps after it are undone. */
  function recordAction(history: string, action: { label?: string; undo: HistoryActionCallback; redo?: HistoryActionCallback; dispose?: () => void }) {
    commitHistoryTyping(history);
    const step: ActionStep = { kind: "action", id: ++steps, label: action.label ?? "Change", undo: action.undo, redo: action.redo, dispose: action.dispose };
    pushStep(history, step);
    return step.id;
  }

  function stepError(step: Step, direction: "undo" | "redo"): string | undefined {
    if (step.kind === "action") return direction === "redo" && !step.redo ? "This change cannot be redone." : undefined;
    if (step.kind === "edit" || step.kind === "typing") {
      const entry = files.get(step.key);
      const expected = step.kind === "typing" ? step.at.revision : direction === "undo" ? step.after : step.before;
      if (!entry || entry.revision !== expected) return `${entry?.path ?? "The file"} changed since this step.`;
      if (!ownsRecord(entry)) return `The draft for ${entry.path} changed outside the editor.`;
      return undefined;
    }
    const changed = step.files.find(file => !atSnapshot(file, direction === "undo" ? file.after : file.before));
    return changed ? `${RECEIPT_REFUSAL} (${changed.path})` : undefined;
  }
  const blocked = (history: string) => running.has(history) || holds.has(history);
  function canRun(history: string, direction: "undo" | "redo") {
    if (blocked(history)) return false;
    const found = journals.get(history);
    if (direction === "undo" && [...typing.values()].some(session => session.history === history && session.start)) return true;
    const step = found && candidate(found, direction);
    return Boolean(step && !stepError(step, direction));
  }
  /** The step Undo or Redo moves next: Redo first finishes a partly undone typing step. */
  function candidate(found: Journal, direction: "undo" | "redo") {
    const top = found.undo.at(-1);
    if (direction === "redo" && top?.kind === "typing" && top.at !== top.end) return top;
    return found[direction].at(-1);
  }
  /** One native stop of a typing step (or all of it without its pane). */
  function moveTyping(step: TypingStep, direction: "undo" | "redo"): string | undefined {
    const entry = files.get(step.key)!;
    const target = direction === "undo" ? step.start : step.end;
    const native = step.session.ended ? undefined : step.session.native;
    let next = target;
    if (native && step.at.version !== undefined && target.version !== undefined) {
      const result = native[direction](step.at.version);
      if (!result) return `The code pane for ${entry.path} could not ${direction} this typing.`;
      step.session.version = result.version;
      if (result.version !== target.version || result.text !== target.text) next = { text: result.text, revision: ++revisions, version: result.version };
    }
    const previous = entry.text;
    entry.text = next.text;
    entry.revision = next.revision;
    step.at = next;
    persist(entry, next.record);
    if (next === target) target.record = entry.record;
    textEvent(entry, direction, [diffRange(previous, next.text)]);
    return undefined;
  }

  async function run(history: string, direction: "undo" | "redo"): Promise<Result<{ label: string }>> {
    if (blocked(history)) return { ok: false, error: "Undo and Redo wait for the current change to finish." };
    batch(() => commitHistoryTyping(history));
    const found = journal(history);
    const step = candidate(found, direction);
    if (!step) return { ok: false, error: direction === "undo" ? "Nothing to undo." : "Nothing to redo." };
    const error = stepError(step, direction);
    if (error) {
      // A stale single-file step means the file changed outside history: the journal is cleared, as Monaco's was.
      if (step.kind === "edit" || step.kind === "typing") { for (const old of [...found.undo, ...found.redo]) disposeStep(old); found.undo.length = 0; found.redo.length = 0; emitHistory(history); }
      return { ok: false, error };
    }
    /** Moves exactly `step` between the stacks; false when it is no longer on top of `from`. */
    const move = (from: Step[], to: Step[] | undefined) => {
      if (journals.get(history) !== found || from.at(-1) !== step) return false;
      from.pop();
      to?.push(step);
      return true;
    };
    if (step.kind === "action") {
      running.add(history);
      try {
        const callback = direction === "undo" ? step.undo : step.redo!;
        let accepted: void | boolean;
        try { accepted = await callback(); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The change could not be undone." }; }
        // The callback may await; only this exact journal, with the step still on top, moves.
        if (accepted === false) return { ok: false, error: "The change was refused." };
        const from = direction === "undo" ? found.undo : found.redo;
        if (!move(from, step.redo ? (direction === "undo" ? found.redo : found.undo) : undefined)) return { ok: false, error: "The history changed meanwhile." };
        if (!step.redo) { disposeStep(step); clearRedo(found); }
        return { ok: true, label: step.label };
      } finally {
        running.delete(history);
        emitHistory(history);
      }
    }
    // Text steps are synchronous: the journal moves before any event or companion runs.
    return batch((): Result<{ label: string }> => {
      running.add(history);
      try {
        if (step.kind === "typing") {
          const onUndo = found.undo.at(-1) === step;
          const failed = moveTyping(step, direction);
          if (failed) return { ok: false, error: failed };
          // On the undo stack whenever it is not back at its start.
          if (onUndo && step.at === step.start) move(found.undo, found.redo);
          else if (!onUndo) move(found.redo, found.undo);
          if (direction === "undo" && step.at === step.start) for (const companion of [...step.companions].reverse()) companion.undo();
          if (direction === "redo" && step.at === step.end) for (const companion of step.companions) companion.redo();
          return { ok: true, label: step.label };
        }
        const from = direction === "undo" ? found.undo : found.redo, to = direction === "undo" ? found.redo : found.undo;
        if (from.at(-1) !== step) return { ok: false, error: "The history changed meanwhile." };
        if (step.kind === "edit") {
          const entry = files.get(step.key)!;
          const previous = { text: entry.text, revision: entry.revision };
          const applied = applyChanges(entry.text, direction === "undo" ? step.inverse : step.changes);
          entry.text = applied.text;
          entry.revision = direction === "undo" ? step.before : step.after;
          if (!persist(entry, step.records[direction === "undo" ? "before" : "after"])) {
            entry.text = previous.text; entry.revision = previous.revision; persist(entry);
            return { ok: false, error: persistence?.error ?? `Could not update ${entry.path}.` };
          }
          move(from, to);
          step.records[direction === "undo" ? "before" : "after"] = entry.record;
          textEvent(entry, direction, applied.changes);
          const companions = direction === "undo" ? [...step.companions].reverse() : step.companions;
          for (const companion of companions) companion[direction]();
        } else {
          const failed = setSnapshots(step.files.map(file => ({ ...file, to: direction === "undo" ? file.before : file.after })), direction);
          if (failed) return { ok: false, error: failed };
          move(from, to);
        }
        return { ok: true, label: step.label };
      } finally {
        running.delete(history);
        emitHistory(history);
      }
    });
  }

  /** Keeps `history` unavailable (holdHistoryRefresh) until the returned release runs. */
  function hold(history: string) {
    holds.set(history, (holds.get(history) ?? 0) + 1);
    emitHistory(history);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (holds.get(history) ?? 1) - 1;
      if (count) holds.set(history, count); else holds.delete(history);
      emitHistory(history);
    };
  }
  /** Keeps the file's entry, even clean, until released (retainFileModel, an open pane). */
  function retain(scope: DraftScope, path: string) {
    const entry = files.get(draftKey(scope, path));
    if (!entry) return () => {};
    entry.leases++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.leases--;
      evictIfClean(entry);
    };
  }

  /** Discard: an existing file's text goes back to its base as an undoable step; a new file is dropped. */
  function discard(scope: DraftScope, path: string, history?: string): StepResult {
    const entry = files.get(draftKey(scope, path));
    if (!entry) return { ok: false, error: `${path} is not open in the draft store.` };
    if (entry.baseSha === null) return drop(scope, path, true) ? { ok: true } : { ok: false, error: `${path} is open in an editor.` };
    return edit({ scope, path, history, label: "Discard changes", text: entry.base, origin: "discard" });
  }
  /** Forgets the draft: its record and its entry (dropDraft). Refused while retained unless forced. */
  function drop(scope: DraftScope, path: string, force = false) {
    const key = draftKey(scope, path), entry = files.get(key);
    if (entry?.leases && !force) return false;
    typing.delete(key);
    removeRecord({ scope, path });
    if (entry) files.delete(key);
    invalidate(key);
    emit({ type: "file", key, scope, path, change: "dropped" });
    return true;
  }
  /** Forgets the entry, leaving the persisted record (forgetDraftModel: renamed, moved or deleted). Refused while retained unless forced. */
  function forget(scope: DraftScope, path: string, force = false) {
    const key = draftKey(scope, path), entry = files.get(key);
    if (!entry || entry.leases && !force) return false;
    typing.delete(key);
    files.delete(key);
    invalidate(key);
    emit({ type: "file", key, scope, path, change: "forgotten" });
    return true;
  }
  /** Saved to GitHub as `original` at blob `baseSha`; text typed meanwhile stays a draft over it (reconcilePublished). */
  function markSaved(scope: DraftScope, path: string, saved: { baseSha: string; original: string }) {
    const entry = files.get(draftKey(scope, path));
    if (!entry) return false;
    entry.base = saved.original;
    entry.baseSha = saved.baseSha;
    entry.flags = undefined;
    persist(entry);
    emit({ type: "file", key: entry.key, scope: entry.scope, path, change: "saved" });
    return true;
  }
  /** "Keep my draft over this version": the draft's base becomes GitHub's current text. */
  function acceptBase(scope: DraftScope, path: string, base: { text: string; baseSha: string | null | undefined }) {
    const entry = files.get(draftKey(scope, path));
    if (!entry) return false;
    entry.base = base.text;
    entry.baseSha = base.baseSha;
    persist(entry);
    emit({ type: "file", key: entry.key, scope: entry.scope, path, change: "base" });
    return true;
  }
  /** Another tab (or an outside writer) changed the persisted draft: adopt it, outside history. */
  function reload(scope: DraftScope, path: string) {
    const key = draftKey(scope, path), entry = files.get(key);
    if (!entry || !persistence) return false;
    const record = persistence.get(scope, path);
    if (record === entry.record) return true;
    typing.delete(key);
    const previous = entry.text;
    if (record) Object.assign(entry, { text: record.content, base: record.original, baseSha: record.baseSha, flags: flagsOf(record) });
    else entry.text = entry.base;
    entry.record = record;
    entry.persisted = true;
    entry.revision = ++revisions;
    invalidate(key);
    textEvent(entry, "external", [diffRange(previous, entry.text)]);
    return true;
  }

  /**
   * A host-owned text change outside the journals (an operation's own
   * receipt): no step is recorded and no journal is cleared, so the steps
   * below stay valid once the host puts the text back. `revision` restores
   * the revision the text had (the host's undo); otherwise a new one is
   * given. Returns the revision before and after, or undefined when the file
   * is not open or is a typing pane's uncommitted text.
   */
  function write(scope: DraftScope, path: string, text: string, revision?: number) {
    const key = draftKey(scope, path), entry = files.get(key);
    if (!entry) return undefined;
    if (typing.get(key)?.start) commitTyping(key);
    const before = entry.revision, previous = entry.text;
    if (previous === text && revision === undefined) return { before, after: before };
    entry.text = text;
    entry.revision = revision ?? ++revisions;
    persist(entry);
    if (previous !== text) textEvent(entry, "receipt", [diffRange(previous, text)]);
    return { before, after: entry.revision };
  }
  /**
   * The persisted record of an open file was written by a host for this very
   * text (an operation's own draft write, a rename's flags): its base, flags
   * and identity become this store's. A record with other text is left alone
   * (another writer's; Undo over the file refuses).
   */
  function adopt(scope: DraftScope, path: string) {
    if (persisting || !persistence) return false;
    const entry = files.get(draftKey(scope, path));
    if (!entry || entry.baseSha === undefined) return false;
    const record = persistence.get(scope, path);
    if (record === entry.record) return true;
    if (!record) {
      // Pruned as unchanged: the text is GitHub's.
      if (entry.text !== entry.base && entry.baseSha !== null) return false;
      entry.record = undefined;
      return true;
    }
    if (record.deleted || record.content !== entry.text) return false;
    const changedBase = record.original !== entry.base || record.baseSha !== entry.baseSha || !sameFlags(flagsOf(record), entry.flags);
    Object.assign(entry, { base: record.original, baseSha: record.baseSha, flags: flagsOf(record), record, persisted: true });
    if (changedBase) emit({ type: "file", key: entry.key, scope: entry.scope, path, change: "base" });
    return true;
  }
  /** A journal holds a typing step of the file whose pane can still step through it. */
  function hasTyping(scope: DraftScope, path: string) {
    const key = draftKey(scope, path);
    return [...journals.values()].some(found => [...found.undo, ...found.redo].some(step => step.kind === "typing" && step.key === key && !step.session.ended));
  }
  /** Writes again every changed file whose last write did not reach persistence. */
  function retry() {
    for (const entry of files.values()) if (!entry.persisted && entry.baseSha !== undefined && isChanged(entry)) persist(entry);
  }
  /**
   * The drafts of `scope` as Save sends them: the persisted records, with
   * each changed file whose last write did not reach persistence as this
   * store holds it (failed writes are tried again first).
   */
  function drafts(scope: DraftScope, list: () => readonly SavedDraft[]) {
    retry();
    const out = new Map(list().map(record => [record.path, record]));
    const same = (other: DraftScope) => other.account.toLowerCase() === scope.account.toLowerCase() && other.repoId === scope.repoId && other.branch === scope.branch;
    for (const entry of files.values())
      if (!entry.persisted && entry.baseSha !== undefined && isChanged(entry) && same(entry.scope)) out.set(entry.path, recordOf(entry));
    return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
  /** Any Undo or Redo step is held in memory (lost on reload). */
  const hasHistory = () => [...journals.values()].some(found => found.undo.length + found.redo.length > 0);

  function clearHistory() {
    for (const [history, found] of journals) {
      for (const step of [...found.undo, ...found.redo]) disposeStep(step);
      found.undo.length = 0; found.redo.length = 0;
      emitHistory(history);
    }
    journals.clear();
  }

  return {
    open,
    get: (scope: DraftScope, path: string) => { const entry = files.get(draftKey(scope, path)); return entry && view(entry); },
    text: (scope: DraftScope, path: string) => files.get(draftKey(scope, path))?.text,
    edit: (input: EditInput) => batch(() => edit(input)),
    closeGroup,
    attachCompanion,
    applyReceipt: (history: string, label: string, changes: ReceiptFile[], record = true) => batch(() => applyReceipt(history, label, changes, record)),
    recordAction: (history: string, action: Parameters<typeof recordAction>[1]) => batch(() => recordAction(history, action)),
    beginTyping,
    undo: (history: string) => run(history, "undo"),
    redo: (history: string) => run(history, "redo"),
    canUndo: (history: string) => canRun(history, "undo"),
    canRedo: (history: string) => canRun(history, "redo"),
    /** The label of the step Undo or Redo would run next. */
    peek: (history: string, direction: "undo" | "redo") => journals.get(history)?.[direction].at(-1)?.label,
    hold,
    retain,
    discard: (scope: DraftScope, path: string, history?: string) => batch(() => discard(scope, path, history)),
    drop: (scope: DraftScope, path: string, force = false) => batch(() => drop(scope, path, force)),
    forget: (scope: DraftScope, path: string, force = false) => batch(() => forget(scope, path, force)),
    write: (scope: DraftScope, path: string, text: string, revision?: number) => batch(() => write(scope, path, text, revision)),
    adopt,
    hasTyping,
    hasHistory,
    retry,
    drafts,
    markSaved,
    acceptBase,
    reload: (scope: DraftScope, path: string) => batch(() => reload(scope, path)),
    /** Files whose draft differs from GitHub (changedFiles). */
    changed: () => [...files.values()].filter(isChanged).map(view),
    /** Changed files whose last write did not reach persistence (hasUnpersistedEdits). */
    unpersisted: () => [...files.values()].some(entry => isChanged(entry) && !entry.persisted),
    clearHistory,
    /** Forgets every entry and history (clearDrafts: sign-out, workspace switch); persisted drafts stay. */
    clear() { typing.clear(); clearHistory(); files.clear(); },
    subscribe(listener: (event: DraftEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type DraftTextStore = ReturnType<typeof createDraftStore>;
