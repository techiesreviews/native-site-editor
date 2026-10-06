// The Monaco-free draft store (lean-fast-editor ticket 03, point 4).
//
// It owns, per scope and path, a file's draft text (a plain string), its saved
// base (the text and blob GitHub has), and the visual Undo/Redo history, so
// preview selection, the edit bar, inline edits, drafts, Undo/Redo and Save to
// GitHub all work before Monaco has loaded. Persistence goes through the
// existing browser layer (src/drafts.ts `DraftStore`, IndexedDB with a
// localStorage fallback) by its `DraftAccess` surface.
//
// Not wired in yet (handoff plan, phase 4d): src/components/code-editor.ts
// still keeps its own Maps. The API below is shaped so that code can be
// expressed in it:
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
// 1. `beginTyping(scope, path, history)` when the pane mounts. Each content
//    change Monaco makes from typing goes to `session.input(model.getValue())`:
//    the store's text (and so the preview and the persisted draft) follows at
//    once, without a history step.
// 2. When typing settles (code-editor.ts's TYPING_SETTLE_MS) or the pane
//    closes, `session.commit()` turns everything typed since the last commit
//    into one history step; the adapter calls `model.pushStackElement()` and
//    remembers the model's alternative version id as its floor.
// 3. Ctrl+Z in the pane: while the model is above its floor (uncommitted
//    typing), Monaco's own `model.undo()` undoes keystrokes and the adapter
//    passes the resulting text to `input`. At the floor, the key runs
//    `store.undo(history)` instead. The store itself commits pending typing
//    first whenever its history moves, so the two never interleave.
// 4. The adapter subscribes; a `text` event for its file whose origin is not
//    "typing" (a visual edit, Undo/Redo, a receipt, Discard, another tab) is
//    applied to the model with `model.applyEdits(event.changes)` (outside
//    Monaco's undo stack), then the floor moves to the new version.
// 5. `retain(scope, path)` while the pane is open, released on dispose.
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
  /** The pane's text after a keystroke (Monaco's own Undo inside the pane included). */
  input(text: string): void;
  /** Closes what was typed since the last commit as one history step. */
  commit(label?: string): number | undefined;
  /** Commits and ends the session. */
  dispose(): void;
}
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
type EditStep = { kind: "edit"; id: number; label: string; key: string; changes: TextChange[]; inverse: TextChange[]; before: number; after: number; group: boolean; companions: HistoryCompanion[] };
type ReceiptStep = { kind: "receipt"; id: number; label: string; files: { key: string; scope: DraftScope; path: string; before: Snapshot; after: Snapshot }[] };
type ActionStep = { kind: "action"; id: number; label: string; undo: HistoryActionCallback; redo?: HistoryActionCallback; dispose?: () => void };
type Step = EditStep | ReceiptStep | ActionStep;
type Journal = { undo: Step[]; redo: Step[] };
type Typing = { history: string; label: string; start?: { text: string; revision: number } };

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
  let revisions = 0, steps = 0;

  const emit = (event: DraftEvent) => { for (const listener of [...listeners]) try { listener(event); } catch { /* A listener must not break a step. */ } };
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
  const keysOf = (step: Step) => step.kind === "edit" ? [step.key] : step.kind === "receipt" ? step.files.map(file => file.key) : [];
  const view = (entry: Entry): DraftFile => ({
    key: entry.key, scope: entry.scope, path: entry.path, text: entry.text, base: entry.base, baseSha: entry.baseSha,
    flags: entry.flags, revision: entry.revision, changed: isChanged(entry), persisted: entry.persisted,
  });

  function persist(entry: Entry) {
    if (!persistence || entry.baseSha === undefined) { entry.persisted = false; return true; }
    const { account, repoId, repo, branch } = entry.scope;
    const draft: SavedDraft = { ...entry.flags, account, repoId, repo, branch, version: 1, path: entry.path,
      baseSha: entry.baseSha, original: entry.base, content: entry.text, updatedAt: now() };
    const existing = persistence.get(entry.scope, entry.path);
    // A refresh that changes nothing keeps the exact record, so its identity proves no foreign write.
    const ok = persistence.save(existing && sameRecord(existing, draft) ? existing : draft);
    entry.record = persistence.get(entry.scope, entry.path);
    entry.persisted = ok;
    return ok;
  }
  function removeRecord(entry: { scope: DraftScope; path: string }) {
    return persistence ? persistence.remove(entry.scope, entry.path) : true;
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
    if (entry.text === start.text) {
      // Typed and erased: no step, and the steps below stay valid.
      entry.revision = start.revision;
      return undefined;
    }
    const found = journal(session.history);
    const step: EditStep = { kind: "edit", id: ++steps, label: label ?? session.label, key, changes: [diffRange(start.text, entry.text)],
      inverse: [diffRange(entry.text, start.text)], before: start.revision, after: entry.revision, group: false, companions: [] };
    found.undo.push(step);
    clearRedo(found);
    emitHistory(session.history);
    return step.id;
  }
  const commitHistoryTyping = (history: string) => { for (const [key, session] of typing) if (session.history === history) commitTyping(key); };

  function beginTyping(scope: DraftScope, path: string, history?: string, label = "Typing"): TypingSession {
    const key = draftKey(scope, path);
    if (!files.has(key)) throw new Error(`${path} is not open in the draft store.`);
    if (typing.has(key)) throw new Error(`${path} already has a typing session.`);
    const session: Typing = { history: history ?? key, label };
    typing.set(key, session);
    let ended = false;
    return {
      key,
      input(text) {
        const entry = files.get(key);
        if (ended || !entry || entry.text === text) return;
        const previous = entry.text;
        session.start ??= { text: entry.text, revision: entry.revision };
        entry.text = text;
        entry.revision = ++revisions;
        persist(entry);
        textEvent(entry, "typing", [diffRange(previous, text)]);
      },
      commit: (commitLabel) => ended ? undefined : commitTyping(key, commitLabel),
      dispose() {
        if (ended) return;
        commitTyping(key);
        ended = true;
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
    if (typing.get(key)?.start) commitTyping(key);
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
    const before = entry.revision, previous = entry.text;
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
      if (input.companion) last.companions.push(input.companion);
    } else {
      found.undo.push({ kind: "edit", id: ++steps, label: input.label ?? "Edit", key, changes: applied.changes, inverse: applied.inverse,
        before, after: entry.revision, group: Boolean(input.group), companions: input.companion ? [input.companion] : [] });
    }
    clearRedo(found);
    emitHistory(history);
    return { ok: true, step: found.undo.at(-1)!.id };
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
    if (last?.kind !== "edit" || last.id !== step || files.get(last.key)?.revision !== last.after) return false;
    last.companions.push(companion);
    return true;
  }

  const snapshot = (entry: Entry | undefined): Snapshot => entry
    ? { text: entry.text, base: entry.base, baseSha: entry.baseSha, flags: entry.flags, revision: entry.revision } : null;
  const atSnapshot = (key: string, expected: Snapshot) => {
    const entry = files.get(key);
    if (!expected) return !entry;
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
    for (const key of keys) if (typing.get(key)?.start) commitTyping(key);
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
    const found = journal(history);
    const step: ReceiptStep = { kind: "receipt", id: ++steps, label, files: planned };
    found.undo.push(step);
    clearRedo(found);
    emitHistory(history);
    return { ok: true, step: step.id };
  }

  /** Records a host step (recordHistoryAction): Undo runs `undo` once the steps after it are undone. */
  function recordAction(history: string, action: { label?: string; undo: HistoryActionCallback; redo?: HistoryActionCallback; dispose?: () => void }) {
    commitHistoryTyping(history);
    const found = journal(history);
    const step: ActionStep = { kind: "action", id: ++steps, label: action.label ?? "Change", undo: action.undo, redo: action.redo, dispose: action.dispose };
    found.undo.push(step);
    clearRedo(found);
    emitHistory(history);
    return step.id;
  }

  function stepError(step: Step, direction: "undo" | "redo"): string | undefined {
    if (step.kind === "action") return direction === "redo" && !step.redo ? "This change cannot be redone." : undefined;
    if (step.kind === "edit") {
      const entry = files.get(step.key);
      if (!entry || entry.revision !== (direction === "undo" ? step.after : step.before)) return `${entry?.path ?? "The file"} changed since this step.`;
      if (!ownsRecord(entry)) return `The draft for ${entry.path} changed outside the editor.`;
      return undefined;
    }
    const changed = step.files.find(file => !atSnapshot(file.key, direction === "undo" ? file.after : file.before));
    return changed ? `${RECEIPT_REFUSAL} (${changed.path})` : undefined;
  }
  const blocked = (history: string) => running.has(history) || holds.has(history);
  function canRun(history: string, direction: "undo" | "redo") {
    if (blocked(history)) return false;
    const found = journals.get(history);
    if (direction === "undo" && [...typing.values()].some(session => session.history === history && session.start)) return true;
    const step = found?.[direction].at(-1);
    return Boolean(step && !stepError(step, direction));
  }

  async function run(history: string, direction: "undo" | "redo"): Promise<Result<{ label: string }>> {
    if (blocked(history)) return { ok: false, error: "Undo and Redo wait for the current change to finish." };
    commitHistoryTyping(history);
    const found = journal(history);
    const from = found[direction], to = direction === "undo" ? found.redo : found.undo;
    const step = from.at(-1);
    if (!step) return { ok: false, error: direction === "undo" ? "Nothing to undo." : "Nothing to redo." };
    const error = stepError(step, direction);
    if (error) {
      // A stale single-file step means the file changed outside history: the journal is cleared, as Monaco's was.
      if (step.kind === "edit") { for (const old of [...found.undo, ...found.redo]) disposeStep(old); found.undo.length = 0; found.redo.length = 0; emitHistory(history); }
      return { ok: false, error };
    }
    running.add(history);
    try {
      if (step.kind === "action") {
        const callback = direction === "undo" ? step.undo : step.redo!;
        let accepted: void | boolean;
        try { accepted = await callback(); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "The change could not be undone." }; }
        // The callback may await; only this exact journal, with the step still on top, moves.
        if (accepted === false) return { ok: false, error: "The change was refused." };
        if (journals.get(history) !== found || from.at(-1) !== step) return { ok: false, error: "The history changed meanwhile." };
        from.pop();
        if (step.redo) to.push(step);
        else { disposeStep(step); clearRedo(found); }
        return { ok: true, label: step.label };
      }
      if (step.kind === "edit") {
        const entry = files.get(step.key)!;
        const previous = { text: entry.text, revision: entry.revision };
        const applied = applyChanges(entry.text, direction === "undo" ? step.inverse : step.changes);
        entry.text = applied.text;
        entry.revision = direction === "undo" ? step.before : step.after;
        if (!persist(entry)) {
          entry.text = previous.text; entry.revision = previous.revision; persist(entry);
          return { ok: false, error: persistence?.error ?? `Could not update ${entry.path}.` };
        }
        textEvent(entry, direction, applied.changes);
        const companions = direction === "undo" ? [...step.companions].reverse() : step.companions;
        for (const companion of companions) companion[direction]();
      } else {
        const failed = setSnapshots(step.files.map(file => ({ ...file, to: direction === "undo" ? file.before : file.after })), direction);
        if (failed) return { ok: false, error: failed };
      }
      from.pop();
      to.push(step);
      return { ok: true, label: step.label };
    } finally {
      running.delete(history);
      emitHistory(history);
    }
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
  /** Forgets the entry, leaving the persisted record (forgetDraftModel: renamed, moved or deleted). */
  function forget(scope: DraftScope, path: string) {
    const key = draftKey(scope, path), entry = files.get(key);
    if (!entry || entry.leases) return false;
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
    edit,
    closeGroup,
    attachCompanion,
    applyReceipt,
    recordAction,
    beginTyping,
    undo: (history: string) => run(history, "undo"),
    redo: (history: string) => run(history, "redo"),
    canUndo: (history: string) => canRun(history, "undo"),
    canRedo: (history: string) => canRun(history, "redo"),
    /** The label of the step Undo or Redo would run next. */
    peek: (history: string, direction: "undo" | "redo") => journals.get(history)?.[direction].at(-1)?.label,
    hold,
    retain,
    discard,
    drop,
    forget,
    markSaved,
    acceptBase,
    reload,
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
