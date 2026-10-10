// The memory adapter of the guarded edit module's seam (src/guarded-edit.ts):
// a whole editor workspace in maps, so the module's suite (and, from slice 11,
// the caller suites) run without a browser. Files are a branch plus drafts;
// mounted files have a model (text, revision, session); the history is one
// stack whose operation steps run the real receipt (prepareNativeTextHistory)
// over planNativeStructuralDrafts, as applyNativeOperation does, and whose
// range steps follow the source editor's own steps and typing groups.
//
// Limits (as the tests need them): one history stack for every file; an
// operation never deletes or moves a mounted file (production retains its
// model; this adapter has no leases); `open` after an operation is recorded,
// not mounted.

import { prepareNativeTextHistory } from "../../src/page-builder/native-operation-history";
import { planNativeStructuralDrafts } from "../../src/page-builder/native-structural-history";
import type { DraftScope, SavedDraft } from "../../src/drafts";
import type { DraftAccess, MovableFile } from "../../src/file-changes";
import type { EditorWorkspace, NodeRef, OperationRequest } from "../../src/guarded-edit";
import type { NativeSite } from "../../shared/native-project";

export interface Deferred<T = void> { promise: Promise<T>; resolve(value: T): void }
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

type Step = { kind: "range" | "operation"; path: string; undo(): boolean; redo(): boolean; dispose?(): void; group?: { open: boolean; revision: number; after: string } };
type Model = { text: string; version: number; session: number };
/** A wait the test holds open: `reached` once the code under test waits on it, then `release()`. */
export interface Hold { reached: Promise<void>; release(): void }

const STALE_OPERATION = "The repository or source changed meanwhile. Review the latest files and try again.";

export function createMemoryWorkspace(init: { branch?: Record<string, string>; drafts?: Record<string, string>; open?: string; mounted?: string[]; site?: NativeSite } = {}) {
  const scope: DraftScope = { account: "lex", repoId: 1, repo: "lex/site", branch: "main" };
  let scopeKey = "lex/site@main", generation = 0, versionView = false, route: string | undefined = "/";
  let editEntry: object | undefined;
  let site: NativeSite | undefined = init.site;
  // Revisions only grow, except that Undo and Redo put a model back at the revision its step saw.
  let clock = 0, sessions = 0, escaped = 0, revisions = 0;
  const branch = new Map(Object.entries(init.branch ?? {}).map(([path, text], index) => [path, { sha: `sha-${index}`, text }]));
  const records = new Map<string, SavedDraft>();
  const store: DraftAccess & { error: string | null } = {
    error: null,
    get: (_scope, path) => records.get(path),
    save: draft => { records.set(draft.path, draft); return true; },
    remove: (_scope, path) => { records.delete(path); return true; },
  };
  const models = new Map<string, Model>();
  let openFile: string | undefined = init.open;
  const done: Step[] = [], undone: Step[] = [];
  const refusals: string[] = [], announced: string[] = [], selected: ((NodeRef & { source?: string }) | undefined)[] = [], flashed: string[] = [], opened: string[] = [];
  let refreshFails = false;
  let branchHold: (Hold & { wait: Promise<void>; arrive(): void }) | undefined;
  let openHold: (Hold & { wait: Promise<void>; arrive(): void }) | undefined;

  const text = (path: string) => {
    const model = models.get(path);
    if (model) return model.text;
    const draft = records.get(path);
    if (draft) return draft.deleted || draft.opaque ? undefined : draft.content;
    return branch.get(path)?.text;
  };
  const files = () => {
    const out = new Set([...branch.keys()].filter(path => !records.get(path)?.deleted));
    for (const [path, draft] of records) if (!draft.deleted) out.add(path);
    return out;
  };
  const exists = (path: string) => [...files()].some(file => file === path || file.startsWith(`${path}/`));
  // The draft a write of `content` leaves, as the source editor's store keeps it.
  function saveText(path: string, content: string) {
    const draft = records.get(path), base = branch.get(path), updatedAt = ++clock;
    if (draft && !draft.deleted) {
      if (draft.baseSha !== null && !draft.movedFrom && content === draft.original) records.delete(path);
      else records.set(path, { ...draft, content, updatedAt });
    } else if (base && content === base.text) records.delete(path);
    else records.set(path, { ...scope, version: 1, path, baseSha: base?.sha ?? null, original: base?.text ?? "", content, updatedAt });
  }
  for (const [path, content] of Object.entries(init.drafts ?? {})) saveText(path, content);
  const mount = (path: string) => { models.set(path, { text: text(path) ?? "", version: ++revisions, session: ++sessions }); };
  for (const path of new Set([...init.mounted ?? [], ...init.open ? [init.open] : []])) mount(path);

  const proof = (path: string) => {
    const model = models.get(path), version = model?.version;
    return { isCurrent: () => models.get(path) === model && model?.version === version };
  };
  function push(step: Step) {
    for (const dropped of undone.splice(0)) dropped.dispose?.();
    done.push(step);
  }
  const holdable = () => {
    const arrived = deferred(), released = deferred();
    return { reached: arrived.promise, release: () => released.resolve(), wait: released.promise, arrive: () => arrived.resolve() };
  };
  async function branchRead() {
    const hold = branchHold;
    if (!hold) { await Promise.resolve(); return; }
    branchHold = undefined;
    hold.arrive();
    await hold.wait;
  }
  // The models a receipt moves, as the source editor's prepareHistorySources does: each model
  // goes back and forth between its text and revision before the step and after it.
  function prepareSources(edits: { path: string; expectedSource: string; text: string }[]) {
    const steps = edits.map(edit => ({ ...edit, model: models.get(edit.path)!, before: models.get(edit.path)?.version ?? -1, after: -1 }));
    if (steps.some(step => !step.model || step.model.text !== step.expectedSource)) return undefined;
    let after = false;
    const current = () => steps.every(step => models.get(step.path) === step.model && step.model.text === (after ? step.text : step.expectedSource) && step.model.version === (after ? step.after : step.before));
    const move = (next: boolean) => {
      if (!current()) return false;
      for (const step of steps) {
        if (next && step.after < 0) step.after = ++revisions;
        step.model.text = next ? step.text : step.expectedSource; step.model.version = next ? step.after : step.before;
      }
      after = next;
      return true;
    };
    return { isCurrent: current, apply: () => move(true), undo: () => move(false), redo: () => move(true) };
  }

  // applyNativeOperation, over these maps.
  async function operation(op: OperationRequest): Promise<string | undefined> {
    const epoch = generation, key = scopeKey;
    const { moves, deletes, creates, edits } = op;
    const expected = new Map(op.expectedSources);
    for (const path of [...moves.flatMap(move => [move.from, move.to]), ...deletes, ...creates.map(file => file.path), ...edits.keys()])
      if (!expected.has(path)) expected.set(path, text(path));
    const stale = () => epoch !== generation || key !== scopeKey || [...expected].some(([path, source]) => text(path) !== source) || !op.current();
    if (stale()) return STALE_OPERATION;
    const vacated = new Set([...moves.map(move => move.from), ...deletes]);
    for (const file of creates) {
      if (!vacated.has(file.path) && exists(file.path)) return `${file.path} already exists. No files were changed.`;
      await branchRead();
      if (stale()) return STALE_OPERATION;
    }
    const movable = new Map<string, MovableFile>();
    for (const path of vacated) {
      await branchRead();
      if (stale()) return STALE_OPERATION;
      if (!exists(path)) return `${path} is not there any more.`;
      movable.set(path, { path, sha: branch.get(path)?.sha, text: branch.get(path)?.text });
    }
    const arriving = new Set([...moves.map(move => move.to), ...creates.map(file => file.path)]);
    const bases = new Map<string, { sha: string; text: string } | undefined>();
    for (const path of edits.keys()) {
      if (!arriving.has(path) && !records.get(path)) bases.set(path, branch.get(path));
      await branchRead();
      if (stale()) return STALE_OPERATION;
    }
    const anchor = openFile;
    if (!anchor || !models.has(anchor)) return "Open a page before changing these files.";
    const touched = new Set([anchor, ...moves.flatMap(move => [move.from, move.to]), ...deletes, ...creates.map(file => file.path), ...edits.keys()]);
    const before = new Map([...touched].map(path => [path, records.get(path)] as const));
    const after = planNativeStructuralDrafts({ scope, before, movable, bases, moves, deletes, creates, edits, now: ++clock });
    // Every source the caller read stays in the step's proof, unchanged inputs (templates) too.
    const beforeSources = new Map(expected);
    for (const path of after.keys()) beforeSources.set(path, text(path));
    const afterSources = new Map(beforeSources);
    for (const [path, record] of after) afterSources.set(path, record ? record.deleted || record.opaque ? undefined : record.content : branch.get(path)?.text);
    const receipt = prepareNativeTextHistory({
      scope, store, isLive: () => epoch === generation && key === scopeKey && !versionView,
      source: text, mounted: path => models.has(path), modelState: proof,
      evictModel: (_path, held) => held.isCurrent() ? held : undefined, prepareSources,
    }, { before, after, beforeSources, afterSources });
    if (!receipt?.apply()) { const error = receipt?.error() ?? STALE_OPERATION; receipt?.dispose(); return error; }
    const transition = (direction: "undo" | "redo") => {
      const select = direction === "undo" ? op.selection.before : op.selection.after;
      if (select) selected.push(select);
      if (!receipt[direction]()) { if (select) selected.push(undefined); refusals.push(receipt.error() ?? STALE_OPERATION); return false; }
      announced.push(direction === "undo" ? op.undone : op.done);
      return true;
    };
    push({ kind: "operation", path: anchor, undo: () => transition("undo"), redo: () => transition("redo"), dispose: () => receipt.dispose() });
    op.recorded();
    // The structural branch opens the next page after the step; that can fail with the step kept.
    if (refreshFails && (moves.length || deletes.length || creates.length || op.open)) return "The files changed, but the editor changed while opening them. Review the current drafts.";
    announced.push(op.done);
    if (op.open) opened.push(op.open);
    return undefined;
  }

  // The port the module is built on. Its `source` is the module's own read; the
  // test's direct `source` below counts as an escaped read.
  const workspace: EditorWorkspace = {
    scope: () => scopeKey,
    generation: () => generation,
    versionView: () => versionView,
    route: () => route,
    editModeEntry: () => editEntry,
    site: () => site,
    source: text,
    exists,
    modelState: path => models.has(path) ? proof(path) : undefined,
    openFile: () => openFile,
    async open(path) {
      const hold = openHold;
      openHold = undefined;
      if (hold) { hold.arrive(); await hold.wait; } else await Promise.resolve();
      if (openFile && openFile !== path) models.delete(openFile);
      openFile = path;
      if (!models.has(path)) mount(path);
    },
    anchor(path) {
      const model = models.get(path), version = model?.version;
      return openFile === path && model ? { isCurrent: () => openFile === path && models.get(path) === model && model.version === version } : undefined;
    },
    change(path, edits, group) {
      const model = models.get(path);
      if (!model) throw new Error("The active file changed or is read only.");
      let next = model.text;
      for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
        if (next.slice(edit.start, edit.end) !== edit.expected) throw new Error("The source changed.");
        next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
      }
      const top = done.at(-1), before = model.text, revision = model.version;
      model.text = next; model.version = ++revisions;
      saveText(path, next);
      // A typing group goes on while nothing else moved its file since its last keystroke.
      if (group && top?.kind === "range" && top.path === path && top.group?.open && top.group.revision === revision) {
        top.group.revision = model.version; top.group.after = next;
        return;
      }
      const step: Step = {
        kind: "range", path, group: { open: group, revision: model.version, after: next },
        undo: () => move(step.group!.after, step.group!.revision, before, revision),
        redo: () => move(before, revision, step.group!.after, step.group!.revision),
      };
      const move = (from: string, fromRevision: number, to: string, toRevision: number) => {
        const current = models.get(path);
        if (current?.text !== from || current.version !== fromRevision) { refusals.push("The source changed."); return false; }
        current.text = to; current.version = toRevision; saveText(path, to);
        step.group!.open = false;
        return true;
      };
      push(step);
    },
    closeGroup(path) {
      const top = done.at(-1);
      if (top?.kind === "range" && top.path === path && top.group) top.group.open = false;
    },
    operation,
    select(request, flash) {
      selected.push(request);
      if (request && flash) flashed.push(flash);
    },
    announce: message => { announced.push(message); },
  };

  return {
    workspace,
    scope,
    /** A read straight from the workspace, not through `r` or `peek`: counted. */
    source(path: string) { escaped++; return text(path); },
    escapedReads: () => escaped,
    draft: (path: string) => records.get(path),
    model: (path: string) => models.get(path),
    files: () => [...files()].sort(),
    openFile: () => openFile,
    steps: () => done.map(step => step.kind),
    refusals, announced, selected, flashed, opened,
    undo() { const step = done.at(-1); if (!step?.undo()) return false; undone.push(done.pop()!); return true; },
    redo() { const step = undone.at(-1); if (!step?.redo()) return false; done.push(undone.pop()!); return true; },
    /** Typing into a file: its model when mounted (a new revision), and its draft. */
    typeInto(path: string, content = `${text(path) ?? ""}<!-- typed -->`) {
      const model = models.get(path);
      if (model) { model.text = content; model.version = ++revisions; }
      saveText(path, content);
    },
    /** Another tab or an agent wrote a draft: the bytes change, no model revision. */
    writeDraft(path: string, content: string) { saveText(path, content); },
    /** Another tab or an agent deleted a file. */
    deleteFile(path: string) {
      const base = branch.get(path);
      if (base) records.set(path, { ...scope, version: 1, path, baseSha: base.sha, original: base.text, content: text(path) ?? "", updatedAt: ++clock, deleted: true });
      else records.delete(path);
    },
    mount, unmount: (path: string) => { models.delete(path); },
    remount: (path: string) => { mount(path); },
    close() { if (openFile) models.delete(openFile); openFile = undefined; },
    bumpGeneration() { generation++; },
    setScope(next: string) { scopeKey = next; },
    setVersionView(on: boolean) { versionView = on; },
    setRoute(next: string | undefined) { route = next; },
    enterEditMode() { editEntry = {}; },
    leaveEditMode() { editEntry = undefined; },
    setSite(next: NativeSite | undefined) { site = next; },
    /** Holds the next branch read the commit makes (a blob, an entry). */
    holdBranchRead(): Hold { branchHold = holdable(); return branchHold; },
    /** Opening the page after a structural operation fails from now on (the step stays written). */
    failRefresh() { refreshFails = true; },
    /** Holds the next `open` (the anchor page opening). */
    holdOpen(): Hold { openHold = holdable(); return openHold; },
  };
}
export type MemoryWorkspace = ReturnType<typeof createMemoryWorkspace>;
