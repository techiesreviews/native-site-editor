// The memory adapter of the guarded edit module's seam (src/guarded-edit.ts):
// a whole editor workspace in maps, so the module's suite (and the caller
// suites) run without a browser. Files are a branch plus drafts; mounted files
// have a model (text, revision, session); the history is one stack whose
// receipt steps are the module's own commit (src/guarded-edit/commit.ts) over
// these primitives, and whose range steps follow the source editor's own steps
// and typing groups (with their Undo/Redo hooks).
//
// Limits (as the tests need them): one history stack for every file; models
// are never leased; a page opened after a step is recorded in `opened`, and
// mounted only when no page was open (else the open page stays mounted);
// the page refresh after Undo and Redo runs at once, not after the history
// accepts the move.

import type { DraftScope, SavedDraft } from "../../src/drafts";
import type { DraftAccess } from "../../src/file-changes";
import type { EditorWorkspace, HistoryHooks, NodeRef } from "../../src/guarded-edit";
import type { NativeSite } from "../../shared/native-project";

export interface Deferred<T = void> { promise: Promise<T>; resolve(value: T): void }
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

type Step = { kind: "range" | "operation"; path: string; undo(): boolean; redo(): boolean; dispose?(): void; group?: { open: boolean; revision: number; after: string }; hooks?: HistoryHooks };
type Model = { text: string; version: number; session: number };
/** A wait the test holds open: `reached` once the code under test waits on it, then `release()`. */
export interface Hold { reached: Promise<void>; release(): void }

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

  // The module's commit tells this listener of every file a pane mounts.
  let mountListener: ((path: string, pane: boolean) => void) | undefined;
  const mountOpen = (path: string) => {
    if (openFile && openFile !== path) models.delete(openFile);
    openFile = path;
    if (!models.has(path)) mount(path);
    mountListener?.(path, false);
  };
  const branchFile = (path: string) => {
    const base = branch.get(path);
    return base && !records.get(path)?.deleted ? base : undefined;
  };

  // The editor's range step (replaceActiveRanges): a typing group goes on while nothing else
  // moved its file since its last keystroke; `hooks` run once the step's Undo or Redo moved it.
  function replaceRanges(path: string, edits: { start: number; end: number; text: string; expected: string }[], group: boolean, hooks?: HistoryHooks) {
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
    if (group && top?.kind === "range" && top.path === path && top.group?.open && top.group.revision === revision) {
      top.group.revision = model.version; top.group.after = next;
      return;
    }
    const step: Step = {
      kind: "range", path, group: { open: group, revision: model.version, after: next }, hooks,
      undo: () => move(step.group!.after, step.group!.revision, before, revision) && (step.hooks?.undo(), true),
      redo: () => move(before, revision, step.group!.after, step.group!.revision) && (step.hooks?.redo(), true),
    };
    const move = (from: string, fromRevision: number, to: string, toRevision: number) => {
      const current = models.get(path);
      if (current?.text !== from || current.version !== fromRevision) { refusals.push("The source changed."); return false; }
      current.text = to; current.version = toRevision; saveText(path, to);
      step.group!.open = false;
      return true;
    };
    push(step);
  }

  // The port the module is built on. Its `source` is the module's own read; the
  // test's direct `source` below counts as an escaped read. `change` is the
  // editor's own range step with no hooks, as another action makes it.
  const workspace: EditorWorkspace & { change(path: string, edits: { start: number; end: number; text: string; expected: string }[], group: boolean): void } = {
    scope: () => scopeKey,
    draftScope: () => scope,
    generation: () => generation,
    versionView: () => versionView,
    route: () => route,
    editModeEntry: () => editEntry,
    agentActing: () => false,
    site: () => site,
    files: () => [...files()],
    store,
    source: text,
    exists,
    base: path => branchFile(path)?.text,
    async branchText(path) { await branchRead(); return branch.get(path); },
    async entry(path) {
      await branchRead();
      return exists(path) ? { path, sha: branch.get(path)?.sha, text: branch.get(path)?.text } : undefined;
    },
    async createProblem() { await branchRead(); return undefined; },
    modelState: path => models.has(path) ? proof(path) : undefined,
    model: proof,
    mounted: path => models.has(path),
    mountedSource: path => models.get(path)?.text,
    openFile: () => openFile,
    async open(path, beforeMount) {
      const hold = openHold;
      openHold = undefined;
      if (hold) { hold.arrive(); await hold.wait; } else await Promise.resolve();
      if (openFile && openFile !== path) models.delete(openFile);
      openFile = path;
      // Refused before mounting: the file is chosen, its editor is not there.
      if (beforeMount && !beforeMount()) return;
      if (!models.has(path)) mount(path);
      mountListener?.(path, false);
    },
    anchor(path) {
      const model = models.get(path), version = model?.version;
      return openFile === path && model ? { isCurrent: () => openFile === path && models.get(path) === model && model.version === version } : undefined;
    },
    retainModel: () => () => {},
    evictModel: (_path, held) => held.isCurrent() ? held : undefined,
    prepareSources,
    replaceRanges,
    change: (path, edits, group) => replaceRanges(path, edits, group),
    closeGroup(path) {
      const top = done.at(-1);
      if (top?.kind === "range" && top.path === path && top.group) top.group.open = false;
    },
    recordHistory(path, undo, redo, dispose) {
      if (!models.has(path)) return false;
      push({ kind: "operation", path, undo, redo, dispose });
      return true;
    },
    holdRefresh: () => () => {},
    shareHistory: () => () => {},
    onMount(listener) { mountListener = listener; },
    paneFile: () => undefined,
    closePane() {},
    afterFileChanges() {},
    openAfter(path) {
      // The editor changed while the page opened: the step stays written.
      if (refreshFails) { generation++; return; }
      if (path === undefined || path === openFile) return;
      opened.push(path);
      if (!openFile) mountOpen(path);
    },
    showRow() {},
    later: task => task(),
    status: () => announced.at(-1) ?? "",
    select(request, flash) {
      selected.push(request);
      if (request && flash) flashed.push(flash);
    },
    announce: message => { announced.push(message); },
    refuse: message => { refusals.push(message); },
    error: error => { refusals.push(error instanceof Error ? error.message : String(error)); },
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
    /** Opening the page after a step that opens one fails from now on (the editor changes meanwhile; the step stays written). */
    failRefresh() { refreshFails = true; },
    /** Holds the next `open` (the anchor page opening). */
    holdOpen(): Hold { openHold = holdable(); return openHold; },
  };
}
export type MemoryWorkspace = ReturnType<typeof createMemoryWorkspace>;
