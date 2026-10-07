// The source editor without Monaco (lean-fast-editor ticket 03, point 4).
//
// A file opened for editing is mounted here at once: its text, draft and
// visual Undo/Redo live in the Monaco-free draft store (src/draft-store.ts),
// and its toolbar (Undo, Redo, History, Discard changes, Save) works from
// that store. Preview edits, page details, structure moves, inserts, file
// operations and agent commands all apply to the store, before Monaco has
// loaded. Monaco (src/components/code-editor.ts) is a view attached later by
// `useView`: it creates a model from the store's text on demand and owns
// only typing undo inside an open code pane.
//
// The exports keep the names the editor had when Monaco owned the text
// (`isMounted`, `replaceActiveRange`, `runVisualHistory`, the model proofs):
// a "model" is now the file's entry in the store, and its version the
// entry's revision.
import "./source-editor.css";
import type { CssWorkspace } from "../page-builder/css-intelligence";
import { draftStore, draftKey, type DraftScope, type SavedDraft } from "../drafts";
import { createDraftStore, RECEIPT_REFUSAL, type DraftEvent, type DraftTextStore, type HistoryCompanion } from "../draft-store";
import { createPublishMenu } from "./publish-menu";
import { textHash, type AgentCommand } from "../../shared/agent";
import type { EditorContext, PublishResult } from "../../shared/types";
import { listChanges, type FileChange } from "../file-changes";
import { button, node } from "../ui/dom";
import { icon } from "../icons";

export type { HistoryCompanion } from "../draft-store";

export interface SourceFile {
  key: string;
  /** Current, scope-bound CSS sources. The host opens a real editor for definitions. */
  cssWorkspace?: () => CssWorkspace | undefined;
  path: string;
  source: string;
  readOnly?: boolean;
  onSessionExpired?: () => void;
  scope?: DraftScope;
  baseSha?: string | null;
  onPublished?: (result: PublishResult, submitted: SavedDraft[]) => void;
  /** Native save UI relabels the publish menu to "Save to GitHub" wording. */
  saveLabels?: boolean;
  onDiscardNew?: () => void;
  onContextChange?: (
    file: EditorContext["file"],
    changes?: { start: number; end: number; text: string }[],
  ) => void;
  onHistory?: () => void;
  /** Groups visual Undo/Redo across the primary file and its secondary style editors. */
  historyScope?: string;
  /** Kept for callers; the store holds every file's text, so history needs no mounted target. */
  ensureHistoryTarget?: (path: string) => Promise<boolean>;
  /**
   * Discard changes in the toolbar: every draft of the branch goes (the
   * caller asks first). Without it, the button discards this file's draft.
   */
  onDiscardAll?: () => void;
  /** The branch's head as the tab last saw it, sent with a save. */
  publishHead?: () => string | undefined;
  /** A save was refused for files GitHub changed or deleted meanwhile. */
  onRefused?: () => void;
  /** Restores a deletion or moves a renamed file back, from the Save panel. */
  onDiscardChange?: (change: FileChange) => void;
  /** Whether a draft is an edit of a file GitHub deleted since it began (this file's too). */
  deletedUpstream?: (path: string) => boolean;
  /** Settles such a draft: Discard draft, or Keep as new file (`keep`). */
  onSettleDeleted?: (path: string, keep: boolean) => void;
  /** Shown where the code goes until Monaco is here. */
  loadingMessage?: string;
}
/** An earlier version of the file, shown beside the current one (History). */
export type VersionCompare = { content: string; label: string };
// A CSS rule styling the selected element: dimmed when the cascade overrides
// all of it, with the declarations it overrides (`struck`) crossed out.
export interface HighlightRange {
  start: number;
  end: number;
  overridden?: boolean;
  struck?: { start: number; end: number }[];
}
// Visual-edit proof (ticket 06): replace one verified byte range of a mounted file.
export interface RangeEdit {
  path: string;
  start: number;
  end: number;
  expected: string;
  text: string;
}
/** Returning false refuses the operation and retains its history entry. */
export type HistoryActionCallback = () => void | boolean | Promise<void | boolean>;

// --- The Monaco seam -------------------------------------------------------
type FileContext = NonNullable<EditorContext["file"]>;
/** What a code pane's view (Monaco) is given: the mounted file, read from the store. */
export interface PaneHost {
  readonly key: string;
  readonly path: string;
  /** The store's scope for the file (a local one for a file without a repository). */
  readonly scope: DraftScope;
  /** False for a read-only file, whose text is not in the store. */
  readonly stored: boolean;
  readonly readOnly: boolean;
  readonly body: HTMLElement;
  readonly store: DraftTextStore;
  session(): string;
  text(): string;
  /** The pane is still mounted. */
  isCurrent(): boolean;
  cssWorkspace?: () => CssWorkspace | undefined;
  runHistory(direction: "undo" | "redo"): Promise<boolean>;
  reportContext(): void;
}
export interface PaneRender {
  mode: "edit" | "review" | "version";
  /** Review: the text the draft is compared with, and its label. */
  original: string;
  originalLabel: string;
  version?: VersionCompare;
}
export interface PaneView {
  render(render: PaneRender): void;
  select(start: number, end: number): void;
  selectEdited(start: number, end: number): void;
  reveal(start: number, end: number): void;
  focus(): void;
  highlight(ranges: HighlightRange[]): void;
  markElement(tag: { start: number; end: number } | undefined, reveal: boolean): void;
  selection(): FileContext["selection"];
  diagnostics(): FileContext["diagnostics"];
  dispose(): void;
}
export type PaneViewFactory = (host: PaneHost) => PaneView;
let viewFactory: PaneViewFactory | undefined;
let viewLoader: (() => Promise<PaneViewFactory>) | undefined;
/** Monaco is here: every mounted pane shows its code, and later ones at once. */
export function useView(factory: PaneViewFactory) {
  viewFactory = factory;
  for (const editor of [...liveMounted]) editor.attach();
}
/** How a pane asks for Monaco when something needs it (Review, focus) before it came. */
export function setViewLoader(load: () => Promise<PaneViewFactory>) {
  viewLoader = load;
}
function requestView() {
  if (!viewFactory) void viewLoader?.().then(useView).catch(() => {});
}
const textHooks = new Set<(file: { scope: DraftScope; path: string }) => void>();
/**
 * A file's text changed in the store while no pane shows it (Undo or Redo of
 * a stylesheet whose pane has closed): the host draws the preview again.
 * Mounted files report through their pane's onContextChange.
 */
export function onUnmountedText(hook: (file: { scope: DraftScope; path: string }) => void) {
  textHooks.add(hook);
  return () => { textHooks.delete(hook); };
}
const resetHooks = new Set<() => void>();
/** The view's kept state goes with the drafts (sign-out, another workspace). */
export function onReset(hook: () => void) {
  resetHooks.add(hook);
  return () => { resetHooks.delete(hook); };
}

// --- The store ---------------------------------------------------------------
let shared: DraftTextStore | undefined;
/** The editor's draft store, over the browser's persisted drafts. */
export function sourceStore() {
  if (!shared) {
    const persistence = draftStore();
    const store = (shared = createDraftStore({ persistence }));
    // A host's own draft write for an open file's very text (an operation's
    // receipt, a rename's flags) is the store's own record from then on.
    persistence.onWrite = (scope, path) => { store.adopt(scope, path); };
    store.subscribe(onStoreEvent);
  }
  return shared;
}

export function languageFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
      css: "css", scss: "scss", json: "json", html: "html", md: "markdown", mdx: "markdown", yaml: "yaml", yml: "yaml",
    } as Record<string, string>
  )[extension] ?? "plaintext";
}

/**
 * A file the editor holds: its entry in the store (or, read only, its text
 * here). Its identity is what a model's was: proofs compare it.
 */
interface Doc {
  key: string;
  path: string;
  scope: DraftScope;
  stored: boolean;
  /** A read-only file's text (not in the store). */
  local: string;
  historySession?: string;
}
const docs = new Map<string, Doc>();
const alive = (doc: Doc) => docs.get(doc.key) === doc && (!doc.stored || sourceStore().get(doc.scope, doc.path) !== undefined);
const docText = (doc: Doc) => doc.stored ? sourceStore().text(doc.scope, doc.path) ?? "" : doc.local;
const docRevision = (doc: Doc) => doc.stored ? sourceStore().get(doc.scope, doc.path)?.revision ?? -1 : 0;

type RangeApi = {
  select(edit: Omit<RangeEdit, "text">): boolean;
  replace(edit: RangeEdit, group: boolean, companion?: HistoryCompanion): void;
  replaceMany(edits: RangeEdit[]): void;
  closeGroup(): void;
  hasOpenGroup(): boolean;
  discardGroup(): boolean;
  reveal(start: number, end: number): void;
  focus(): void;
  highlight(ranges: HighlightRange[]): void;
  markElement(tag: { start: number; end: number } | undefined, reveal: boolean): void;
  review(on: boolean): void;
  reviewing(): boolean;
  compare(version: VersionCompare | undefined): void;
};
type MountedEditor = {
  path: string;
  key: string;
  doc: Doc;
  apply(command: AgentCommand): Promise<void>;
  discardNew(): boolean;
  dispose(): void;
  range: RangeApi;
  session: string;
  readOnly: boolean;
  refresh(): void;
  attach(): void;
  onStore(event: DraftEvent): void;
  refused(message: string | undefined): void;
};
// Several editors can be mounted at once (page and stylesheet side by side);
// commands are routed by file path.
const mounted = new Map<string, MountedEditor>();
// More than one pane can temporarily own the same file.
const liveMounted = new Set<MountedEditor>();
function unregisterMounted(path: string, registration: MountedEditor) {
  liveMounted.delete(registration);
  if (mounted.get(path) !== registration) return;
  const previous = [...liveMounted].reverse().find(editor => editor.path === path);
  if (previous) mounted.set(path, previous);
  else mounted.delete(path);
}
function onStoreEvent(event: DraftEvent) {
  if (event.type === "history") {
    for (const editor of [...liveMounted]) if (editor.session === event.history) editor.refresh();
    return;
  }
  if (event.type === "file" && (event.change === "dropped" || event.change === "forgotten")) {
    const doc = docs.get(event.key);
    if (doc?.stored && ![...liveMounted].some(editor => editor.doc === doc)) docs.delete(event.key);
  }
  const shown = [...liveMounted].filter(editor => editor.key === event.key);
  for (const editor of shown) editor.onStore(event);
  if (event.type === "text" && !shown.length) for (const hook of [...textHooks]) hook({ scope: event.scope, path: event.path });
}
/** What a pane of `path` is: for the view's CSS definitions across panes. */
export function paneOf(path: string) {
  const editor = mounted.get(path);
  return editor && { key: editor.key, session: editor.session, readOnly: editor.readOnly, registration: editor as object, text: () => docText(editor.doc) };
}

// The Save menus of the mounted editors, for a draft written outside them.
const publishers = new Set<() => void>();
/** A browser draft changed outside the editors: the Save menus list it again. */
export function refreshDrafts() {
  for (const refresh of publishers) refresh();
}
/** Keep the shared journal unavailable while its accepted action remounts UI. */
export function holdHistoryRefresh(path: string) {
  const session = mounted.get(path)?.session;
  return session ? sourceStore().hold(session) : () => {};
}
/** Lease the file's entry, including a clean one, until a receipt is disposed. */
export function retainFileModel(scope: DraftScope, path: string) {
  const doc = docs.get(draftKey(scope, path));
  return doc?.stored && alive(doc) ? sourceStore().retain(doc.scope, doc.path) : () => {};
}
/** The state of the file `path` (mounted or kept), if the editor holds it. */
export function modelState(scope: DraftScope, path: string) {
  const doc = docs.get(draftKey(scope, path));
  return doc && alive(doc) ? { version: docRevision(doc), source: docText(doc) } : undefined;
}
/**
 * Records `action` as the next undo step of the mounted file `path`'s history,
 * below any later edit: Undo runs it once the edits after it are undone.
 * Supply redo for a reversible action. False, throws and rejected promises keep
 * the entry in place. Callbacks own source/draft checks and any side-effect rollback.
 */
export function recordHistoryAction(path: string, action: HistoryActionCallback, redo?: HistoryActionCallback, dispose?: () => void) {
  const editor = mounted.get(path);
  if (!editor || editor.readOnly) return false;
  const session = editor.session;
  // The callback may await network work or change workspace. It owns its side
  // effects; only the exact, still-mounted pane that ran it takes the step
  // (else it stays where it is), and what it throws reaches the caller.
  const guarded = (callback: HistoryActionCallback) => async () => {
    const run = historyRuns.get(session);
    let accepted: void | boolean;
    try { accepted = await callback(); }
    catch (error) { if (run) run.thrown = { error }; throw error; }
    if (accepted !== false && run && !(mounted.get(run.owner.path) === run.owner && run.owner.session === session && !run.owner.readOnly && alive(run.owner.doc))) return false;
    return accepted;
  };
  sourceStore().recordAction(session, { undo: guarded(action), redo: redo && guarded(redo), dispose });
  return true;
}
/** The pane each running Undo/Redo was asked from, by history. */
const historyRuns = new Map<string, { owner: MountedEditor; thrown?: { error: unknown } }>();
export interface HistorySourceEdit { path: string; expectedSource: string; text: string }
export interface HistorySourceReceipt {
  dispose?(): void;
  apply(): boolean;
  undo(): boolean;
  redo(): boolean;
  isCurrent(): boolean;
}
/**
 * Prepares owned, isolated text steps of mounted files without recording a
 * journal entry: the host commits drafts synchronously, then records this
 * receipt's callbacks as its single history action. Every
 * source/file/session/revision is checked first; Undo restores each file's
 * exact revision, so the steps below it stay valid.
 */
export function prepareHistorySources(edits: HistorySourceEdit[], persistent = false): HistorySourceReceipt | undefined {
  if (new Set(edits.map((edit) => edit.path)).size !== edits.length) return undefined;
  const store = sourceStore();
  const steps = edits.map((edit) => {
    const editor = mounted.get(edit.path);
    if (!editor || editor.readOnly || !editor.doc.stored || !alive(editor.doc) || docText(editor.doc) !== edit.expectedSource) return undefined;
    return { ...edit, editor, session: editor.session, doc: editor.doc, before: docRevision(editor.doc), after: undefined as number | undefined };
  });
  if (steps.some((step) => !step)) return undefined;
  const owned = steps.filter((step): step is NonNullable<typeof step> => Boolean(step));
  if (new Set(owned.map((step) => step.session)).size > 1 || new Set(owned.map((step) => step.doc)).size !== owned.length) return undefined;
  let state: "prepared" | "applied" | "undone" | "failed" = "prepared";
  const leases = persistent ? owned.map(step => store.retain(step.doc.scope, step.doc.path)) : [];
  let released = false;
  const release = () => { if (released) return; released = true; for (const dispose of leases) dispose(); };
  const matchesStep = (step: typeof owned[number], after: boolean) =>
    (persistent ? step.doc.historySession === step.session &&
      (!mounted.has(step.path) || mounted.get(step.path)?.doc === step.doc && mounted.get(step.path)?.session === step.session && !mounted.get(step.path)?.readOnly)
      : mounted.get(step.path) === step.editor && !step.editor.readOnly && step.editor.session === step.session) &&
    alive(step.doc) && docRevision(step.doc) === (after ? step.after : step.before) && docText(step.doc) === (after ? step.text : step.expectedSource);
  const matches = (after: boolean) => !released && owned.every((step) => matchesStep(step, after));
  const put = (step: typeof owned[number], after: boolean) =>
    store.write(step.doc.scope, step.doc.path, after ? step.text : step.expectedSource, after ? step.after : step.before);
  const move = (direction: "undo" | "redo", expectedState: "applied" | "undone") => {
    if (state !== expectedState || !matches(direction === "undo")) return false;
    const after = direction === "redo";
    const moved: typeof owned = [];
    try {
      for (const step of owned) {
        if (!matchesStep(step, !after)) throw new Error("The source changed during its text history operation.");
        if (step.text === step.expectedSource) continue;
        put(step, after);
        moved.push(step);
        if (!matchesStep(step, after)) throw new Error("The owned text history step changed.");
      }
      state = after ? "applied" : "undone";
      return true;
    } catch {
      // A synchronous failure rolls back only the steps already moved.
      for (const step of moved.reverse()) {
        if (!matchesStep(step, after)) { state = "failed"; continue; }
        put(step, !after);
      }
      if (!matches(expectedState === "applied")) state = "failed";
      return false;
    }
  };
  return {
    dispose: release,
    isCurrent: () => !released && state !== "failed" && matches(state === "applied"),
    apply() {
      if (state !== "prepared" || !matches(false)) return false;
      const applied: typeof owned = [];
      try {
        for (const step of owned) {
          if (!matchesStep(step, false)) throw new Error("The source changed during its text history operation.");
          step.after = step.text === step.expectedSource ? step.before : store.write(step.doc.scope, step.doc.path, step.text)?.after;
          applied.push(step);
        }
        if (!matches(true)) throw new Error("The source changed while applying its text step.");
        state = "applied";
        return true;
      } catch {
        for (const step of applied.reverse()) if (step.text !== step.expectedSource && matchesStep(step, true)) put(step, false);
        state = matches(false) ? "prepared" : "failed";
        return false;
      }
    },
    undo: () => move("undo", "applied"),
    redo: () => move("redo", "undone"),
  };
}
/** Discards the mounted new file `path` as its Discard changes does, without asking. */
export function discardNewFile(path: string) {
  return mounted.get(path)?.discardNew() ?? false;
}
/**
 * Forgets the browser draft of `path`, which is not the mounted file: its
 * stored draft and anything the editor kept for it.
 */
export function dropDraft(scope: DraftScope, path: string) {
  const key = draftKey(scope, path);
  const kept = docs.get(key);
  if (kept && [...liveMounted].some((editor) => editor.doc === kept)) return false;
  sourceStore().drop(scope, path, true);
  docs.delete(key);
  return true;
}
/**
 * Forgets what the editor kept for `path` (a draft not mounted), leaving its
 * stored draft as it is: the file was renamed, moved or deleted, and its
 * draft now lives elsewhere or is a deletion.
 */
export function forgetDraftModel(scope: DraftScope, path: string) {
  const key = draftKey(scope, path);
  const kept = docs.get(key);
  if (!kept || [...liveMounted].some((editor) => editor.doc === kept)) return false;
  if (kept.stored) sourceStore().forget(kept.scope, kept.path, true);
  docs.delete(key);
  return true;
}
/** Read-only proof of the mounted and kept file for one originating scope/path. */
export function captureFileModelState(scope: DraftScope, path: string, persistent = false) {
  const key = draftKey(scope, path), editor = mounted.get(path), cached = docs.get(key);
  const doc = editor?.doc ?? cached;
  const session = editor?.session ?? cached?.historySession;
  const version = doc && docRevision(doc), source = doc && docText(doc);
  return { isCurrent: () => docs.get(key) === cached &&
    (persistent && cached ? cached.historySession === session && (!mounted.has(path) || mounted.get(path)?.doc === doc && (!session || mounted.get(path)?.session === session))
      : mounted.get(path) === editor && (!editor || editor.session === session)) && (!doc || alive(doc) &&
      docRevision(doc) === version && docText(doc) === source) };
}
/** Evicts only an unchanged, unmounted kept file and proves its absence. */
export function evictDraftModel(scope: DraftScope, path: string, proof: { isCurrent(): boolean }) {
  if (!proof.isCurrent() || mounted.has(path)) return undefined;
  const key = draftKey(scope, path);
  if (!docs.has(key)) return proof;
  forgetDraftModel(scope, path);
  if (mounted.has(path) || docs.has(key)) return undefined;
  return captureFileModelState(scope, path);
}
/** The history journal must stay attached to its initiating mounted editor/session. */
export function captureHistoryHost(path: string) {
  const editor = mounted.get(path);
  if (!editor || editor.readOnly) return undefined;
  const doc = editor.doc, session = editor.session;
  return { isCurrent: () => mounted.get(path) === editor && editor.doc === doc &&
    editor.session === session && !editor.readOnly && alive(doc) };
}
export function getMountedSource(path: string) {
  const editor = mounted.get(path);
  return editor && docText(editor.doc);
}
/** Undo or Redo in the history of `fallbackPath`'s pane (else the last mounted one). */
export async function runVisualHistory(direction: "undo" | "redo", fallbackPath?: string) {
  const fallback = fallbackPath ? mounted.get(fallbackPath) : undefined;
  if (fallback?.readOnly) return false;
  const owner = fallback ?? [...mounted.values()].at(-1);
  const session = owner?.session;
  if (!owner || !session) return false;
  const run: { owner: MountedEditor; thrown?: { error: unknown } } = { owner };
  const earlier = historyRuns.get(session);
  if (!earlier) historyRuns.set(session, run);
  let result: Awaited<ReturnType<DraftTextStore["undo"]>>;
  try { result = await sourceStore()[direction](session); }
  finally { if (historyRuns.get(session) === run) historyRuns.delete(session); }
  if (!result.ok && run.thrown) throw run.thrown.error;
  if (!result.ok && result.error.startsWith(RECEIPT_REFUSAL))
    for (const editor of liveMounted) if (editor.session === session) editor.refused(RECEIPT_REFUSAL);
  return result.ok;
}
const editorFor = (path: string) => {
  const editor = mounted.get(path);
  if (!editor) throw new Error("The active file changed or is read only.");
  return editor;
};
export async function applyAgentDraft(command: AgentCommand) {
  return editorFor(command.path).apply(command);
}
export function selectActiveRange(edit: Omit<RangeEdit, "text">) {
  return editorFor(edit.path).range.select(edit);
}
// Inline edits stream keystrokes; `group` keeps them in one undo step until
// `closeActiveEditGroup` is called.
// A `companion` (another file changed with it) is undone and redone with the edit.
export function replaceActiveRange(edit: RangeEdit, group = false, companion?: HistoryCompanion) {
  editorFor(edit.path).range.replace(edit, group, companion);
}
export function replaceActiveRanges(edits: RangeEdit[]) {
  if (!edits.length) return;
  const path = edits[0].path;
  if (edits.some((edit) => edit.path !== path))
    throw new Error("A source change cannot span multiple files.");
  editorFor(path).range.replaceMany(edits);
}
export function closeActiveEditGroup(path: string) {
  mounted.get(path)?.range.closeGroup();
}
// A closer for the typing group of the file as mounted now: it closes that
// session's group later, even once another branch's file is mounted instead.
export function editGroupCloser(path: string) {
  const session = mounted.get(path)?.session;
  return () => { if (session) sourceStore().closeGroup(session); };
}
// Whether the file's last undo step is a typing group still open.
export function hasOpenEditGroup(path: string) {
  return mounted.get(path)?.range.hasOpenGroup() ?? false;
}
// Takes the open group back (an inline field's Escape): the file returns to
// where the group began and no undo step is left. False when it could not.
export function discardActiveEditGroup(path: string) {
  return mounted.get(path)?.range.discardGroup() ?? false;
}
// Scrolls a mounted file to a byte range (e.g. a CSS rule) and selects it.
export function revealRange(path: string, start: number, end: number) {
  mounted.get(path)?.range.reveal(start, end);
}
// Puts the caret in a mounted file's code, so typing goes there at once.
export function focusEditor(path: string) {
  mounted.get(path)?.range.focus();
}
// Marks byte ranges (the CSS rules styling the selected element) in a mounted file.
export function highlightRanges(path: string, ranges: HighlightRange[]) {
  mounted.get(path)?.range.highlight(ranges);
}
// Marks the start tag of the element selected in the preview. With `reveal`
// the caret moves just past the tag, where its content starts, and the tag
// scrolls into view; without it only the mark follows edits.
export function markElement(path: string, tag: { start: number; end: number } | undefined, reveal: boolean) {
  mounted.get(path)?.range.markElement(tag, reveal);
}
export function isMounted(path: string) {
  return mounted.has(path);
}
// Shows the diff against the GitHub baseline for a mounted file.
export function setReviewMode(path: string, on: boolean) {
  mounted.get(path)?.range.review(on);
}
// Shows an earlier version of a mounted file beside the current one, both
// read only; `undefined` goes back to editing.
export function compareVersion(path: string, version: VersionCompare | undefined) {
  mounted.get(path)?.range.compare(version);
}
export function isReviewing(path: string) {
  return mounted.get(path)?.range.reviewing() ?? false;
}
// Files whose browser draft differs from GitHub, for the changes window.
export function changedFiles() {
  return sourceStore().changed()
    .map((file) => ({ path: file.path, created: file.baseSha === null, scopeKey: `${file.scope.repoId}:${file.scope.branch}` }));
}
/** Forgets every Undo and Redo step: the drafts they changed are gone (Discard changes). */
export function clearHistory() {
  sourceStore().clearHistory();
  // A draft whose write failed is written again (the storage may have room now).
  sourceStore().retry();
  for (const editor of mounted.values()) editor.refresh();
}
export function clearDrafts() {
  for (const owner of [...liveMounted]) owner.dispose();
  sourceStore().clear();
  docs.clear();
  for (const hook of [...resetHooks]) hook();
  draftStore().release();
}
/** Changed files whose last write has not reached the browser's draft storage. */
export function hasUnpersistedEdits() {
  return sourceStore().unpersisted();
}
/** Undo/Redo steps or unsaved text live only in this tab's memory: a reload would lose them. */
export function hasMemoryState() {
  return sourceStore().hasHistory() || hasUnpersistedEdits();
}
window.addEventListener("beforeunload", (event) => {
  if (hasUnpersistedEdits()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

/** Files outside a repository live in the store under a scope of their own, never persisted. */
const localScope = (key: string): DraftScope => ({ account: "", repoId: 0, repo: "", branch: `local:${key}` });

/**
 * Mounts `file` for editing in `host`: its toolbar and status at once, its
 * code once Monaco is here (`useView`). Returns the pane's dispose.
 */
export function mountSourceEditor(
  host: HTMLElement,
  file: SourceFile,
  toolbarHost?: HTMLElement | null,
) {
  const store = sourceStore();
  const session = file.historyScope ?? file.key;
  const stored = !file.readOnly;
  const scope = file.scope ?? localScope(file.key);
  const key = stored ? draftKey(scope, file.path) : file.key;
  let conflict = false;
  // A file no pane shows any more takes a draft written for it since (another writer's) as it is.
  if (stored && store.get(scope, file.path) && ![...liveMounted].some(editor => editor.key === key)) store.reload(scope, file.path);
  if (stored) conflict = store.open(scope, file.path, { text: file.source, baseSha: file.scope ? file.baseSha : undefined }).conflict;
  let doc = docs.get(key);
  if (!doc || doc.stored !== stored || !alive(doc)) {
    doc = { key, path: file.path, scope, stored, local: file.source };
    docs.set(key, doc);
  }
  const current = doc;
  current.historySession = session;
  const releaseEntry = stored ? store.retain(scope, file.path) : () => {};
  const entry = () => stored ? store.get(scope, file.path) : undefined;
  const base = () => entry()?.base ?? current.local;
  const baseSha = () => stored ? entry()?.baseSha : file.baseSha;
  let reviewingLatest = false;
  let disposed = false;
  let view: PaneView | undefined;
  let refusal: string | undefined;
  function reportContext(changes?: { start: number; end: number; text: string }[]) {
    if (disposed) return;
    file.onContextChange?.({
      path: file.path,
      baseSha: baseSha() ?? null,
      language: languageFor(file.path),
      readOnly: !!file.readOnly,
      original: base(),
      content: docText(current),
      selection: view?.selection() ?? null,
      diagnostics: view?.diagnostics() ?? [],
    }, changes);
  }
  const apply = async (command: AgentCommand) => {
    if (disposed || file.readOnly || file.path !== command.path)
      throw new Error("The active file changed or is read only.");
    const text = docText(current);
    if (text === command.content) return;
    const hash = await textHash(text);
    if (disposed || hash !== command.expectedHash || docText(current) !== text)
      throw new Error("The draft changed while the agent was working. Read it again and retry.");
    const result = store.edit({ scope, path: file.path, history: session, label: "Agent edit", text: command.content });
    if (!result.ok) throw new Error(result.error);
  };
  const verify = (edit: Omit<RangeEdit, "text">) => {
    if (disposed || file.readOnly || file.path !== edit.path)
      throw new Error("The active file changed or is read only.");
    if (docText(current).slice(edit.start, edit.end) !== edit.expected)
      throw new Error("The source at this location no longer matches the preview. Refresh, wait for the new build, then try again.");
  };
  // Marks asked for before Monaco came, shown once it is here (while the text is as it was).
  let pendingHighlight: { ranges: HighlightRange[]; revision: number } | undefined;
  let pendingReveal: { start: number; end: number; revision: number } | undefined;
  let pendingElement: { tag: { start: number; end: number } | undefined; revision: number; reveal: boolean } | undefined;
  const range: RangeApi = {
    select(edit) {
      verify(edit);
      view?.select(edit.start, edit.end);
      return true;
    },
    closeGroup() {
      store.closeGroup(session);
    },
    hasOpenGroup() {
      return store.hasOpenGroup(session);
    },
    discardGroup() {
      return store.discardGroup(session);
    },
    review(on) {
      if ((mode === "review") !== on) render(on ? "review" : "edit");
    },
    compare(next) {
      version = next;
      if (next || mode === "version") render(next ? "version" : "edit");
    },
    reviewing: () => mode === "review",
    reveal(start, end) {
      pendingReveal = view ? undefined : { start, end, revision: docRevision(current) };
      view?.reveal(start, end);
    },
    focus() {
      if (view) view.focus();
      else requestView();
    },
    highlight(ranges) {
      pendingHighlight = view ? undefined : { ranges, revision: docRevision(current) };
      view?.highlight(ranges);
    },
    markElement(tag, reveal) {
      pendingElement = view ? undefined : { tag, revision: docRevision(current), reveal: reveal || Boolean(pendingElement?.reveal && pendingElement.tag?.start === tag?.start && pendingElement.tag?.end === tag?.end) };
      view?.markElement(tag, reveal);
    },
    replace(edit, group, companion) {
      verify(edit);
      if (edit.text === edit.expected) return;
      const result = store.edit({ scope, path: file.path, history: session, label: "Edit",
        changes: [{ start: edit.start, end: edit.end, expected: edit.expected, text: edit.text }], group, companion });
      if (!result.ok) throw new Error(result.error);
      view?.selectEdited(edit.start, edit.start + edit.text.length);
    },
    replaceMany(edits) {
      for (const edit of edits) verify(edit);
      const changes = edits.filter((edit) => edit.text !== edit.expected);
      if (!changes.length) return;
      const result = store.edit({ scope, path: file.path, history: session, label: "Edit",
        changes: changes.map(({ start, end, expected, text }) => ({ start, end, expected, text })) });
      if (!result.ok) throw new Error(result.error);
    },
  };

  let mode: PaneRender["mode"] = "edit";
  let version: VersionCompare | undefined;
  const root = node("section", "code-editor");
  root.setAttribute("aria-label", "Source editor");
  const toolbar = node("div", "code-editor__toolbar");
  const undo = button("", () => void runVisualHistory("undo", file.path), "icon-button code-editor__undo");
  undo.append(icon("undo"));
  undo.setAttribute("aria-label", "Undo");
  undo.title = "Undo";
  const redo = button("", () => void runVisualHistory("redo", file.path), "icon-button code-editor__redo");
  redo.append(icon("redo"));
  redo.setAttribute("aria-label", "Redo");
  redo.title = "Redo";
  for (const control of [undo, redo])
    control.addEventListener("mousedown", (event) => event.preventDefault());
  const historyShortcut = (event: KeyboardEvent) => {
    const target = event.target;
    if (file.readOnly || toolbarHost === null || !(target instanceof Element) ||
        target.closest("input, textarea, select, [contenteditable=true], .monaco-editor, .preview-edit-bar, dialog, [role=dialog], .publish-menu, .preview-link")) return;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const direction = modifier && key === "z" ? (event.shiftKey ? "redo" : "undo")
      : event.ctrlKey && !event.shiftKey && key === "y" ? "redo" : undefined;
    if (!direction) return;
    event.preventDefault();
    void runVisualHistory(direction, file.path);
  };
  document.addEventListener("keydown", historyShortcut);
  // Review mode shows a diff against the GitHub baseline; the button toggles it.
  const review = button(
    "",
    () => (file.onHistory ? file.onHistory() : render(mode === "review" ? "edit" : "review")),
    "icon-button code-editor__history",
  );
  review.append(icon("clock-counter-clockwise"));
  review.setAttribute("aria-label", file.onHistory ? "History" : "Changes");
  review.title = file.onHistory ? "Commit history for this file" : "Changes on this branch";
  review.id = "history-button";
  if (file.onHistory) {
    review.setAttribute("aria-controls", "changes");
    review.setAttribute("aria-haspopup", "dialog");
    review.setAttribute("aria-expanded", "false");
  }
  const discardNew = () => {
    if (baseSha() !== null || !file.scope || disposed) return false;
    const owners = [...liveMounted].filter(editor => editor.doc === current);
    store.drop(scope, file.path, true);
    if (docs.get(key) === current) docs.delete(key);
    file.onDiscardNew?.();
    for (const owner of owners) owner.dispose();
    return true;
  };
  const discard = button(
    "Discard changes",
    () => {
      if (file.onDiscardAll) {
        file.onDiscardAll();
        return;
      }
      if (!confirm(baseSha() === null ? "Discard this new file?" : "Discard this file’s draft changes? You can undo this in the editor.")) return;
      if (discardNew()) return;
      if (conflict) {
        store.acceptBase(scope, file.path, { text: file.source, baseSha: file.baseSha });
        conflict = false;
        reviewingLatest = false;
      }
      store.discard(scope, file.path, session);
    },
    "text-button",
  );
  if (file.onDiscardAll) discard.title = "Discard every unsaved change on this branch";
  // With Discard all, the button waits for any draft of the branch, not only this file's.
  const refreshDiscard = (changed: boolean) => {
    discard.disabled = !!file.readOnly || (file.onDiscardAll && file.scope ? listChanges(store.drafts(file.scope, () => draftStore().list(file.scope!))).length === 0 : !changed);
  };
  const publisher =
    file.scope && !file.readOnly
      ? createPublishMenu({
          scope: file.scope,
          currentPath: file.path,
          saveLabels: file.saveLabels,
          onDiscardChange: file.onDiscardChange,
          deletedUpstream: file.deletedUpstream,
          onSettleDeleted: file.onSettleDeleted,
          head: file.publishHead,
          onRefused: file.onRefused,
          // Save sends what the draft store holds.
          drafts: () => store.drafts(file.scope!, () => draftStore().list(file.scope!)),
          onExpired: () => file.onSessionExpired?.(),
          onPublished: (result, submitted) => {
            reconcilePublished(result, submitted);
            file.onPublished?.(result, submitted);
            if (!disposed) {
              conflict = false;
              update();
              render(mode);
            }
          },
        })
      : undefined;
  toolbar.append(undo, redo, review, discard);
  const changedNow = () => baseSha() === null || docText(current) !== base();
  // A draft written outside this editor: the Save menu and Discard changes follow.
  const refreshOutside = () => {
    publisher?.refresh();
    refreshDiscard(changedNow());
  };
  if (publisher) {
    toolbar.append(publisher.root);
    publishers.add(refreshOutside);
  }
  const notice = node("div", "code-editor__notice");
  notice.setAttribute("role", "status");
  const conflictBar = node("div", "code-editor__conflict");
  conflictBar.setAttribute("role", "status");
  const reviewLatest = button(
    "Review latest GitHub version",
    () => {
      reviewingLatest = true;
      render("review");
      acceptLatest.hidden = false;
    },
    "text-button",
  );
  const acceptLatest = button(
    "Keep my draft over this version",
    () => {
      store.acceptBase(scope, file.path, { text: file.source, baseSha: file.baseSha });
      conflict = false;
      reviewingLatest = false;
      update();
      render(mode);
    },
    "text-button",
  );
  acceptLatest.hidden = true;
  // GitHub deleted the file: nothing to review, only to settle.
  const deletedUpstream = baseSha() !== null && Boolean(file.deletedUpstream?.(file.path));
  if (deletedUpstream)
    conflictBar.append(
      node("span", "", "GitHub deleted this file since this draft started."),
      button("Discard draft", () => file.onSettleDeleted?.(file.path, false), "text-button"),
      button("Keep as new file", () => file.onSettleDeleted?.(file.path, true), "text-button"),
    );
  else
    conflictBar.append(
      node("span", "", "GitHub changed since this draft started."),
      reviewLatest,
      acceptLatest,
    );
  const body = node("div", "code-editor__body");
  body.append(node("p", "empty-message", file.loadingMessage ?? "Opening editor…"));
  // toolbarHost: element → toolbar lives there; null → secondary pane without toolbar.
  if (toolbarHost) {
    toolbar.classList.add("code-editor__toolbar--hosted");
    toolbarHost.replaceChildren(toolbar);
    root.append(notice, conflictBar, body);
  } else if (toolbarHost === null) root.append(notice, conflictBar, body);
  else root.append(toolbar, notice, conflictBar, body);
  host.replaceChildren(root);
  const workspace = host.closest(".workspace");
  workspace?.classList.add("workspace--code");
  let updating = false;
  function update(changes?: { start: number; end: number; text: string }[]) {
    if (disposed || updating) return;
    updating = true;
    try {
      // Back to GitHub's version as it is now: no change, whatever blob the
      // draft began from (a stale one, or none for a path GitHub has since).
      if (stored && file.scope && typeof file.baseSha === "string" && baseSha() !== file.baseSha && docText(current) === file.source) {
        store.acceptBase(scope, file.path, { text: file.source, baseSha: file.baseSha });
        conflict = false;
        reviewingLatest = false;
      }
      conflictBar.hidden = !conflict && !deletedUpstream;
      publisher?.refresh();
      if (changes) refusal = undefined;
      refreshControls();
      reportContext(changes);
    } finally {
      updating = false;
    }
  }
  function refreshControls() {
    const message = file.readOnly ? "Read only" : draftStore().error ?? refusal;
    notice.hidden = !message;
    notice.textContent = message ?? "";
    refreshDiscard(changedNow());
    undo.disabled = !!file.readOnly || !store.canUndo(session);
    redo.disabled = !!file.readOnly || !store.canRedo(session);
    undo.title = refusal && undo.disabled ? `Undo: ${refusal}` : "Undo";
    redo.title = refusal && redo.disabled ? `Redo: ${refusal}` : "Redo";
  }
  function render(next: PaneRender["mode"]) {
    mode = next;
    review.setAttribute("aria-pressed", String(mode !== "edit"));
    if (!view) { if (mode !== "edit") requestView(); return; }
    view.render({
      mode,
      version,
      original: reviewingLatest ? file.source : base(),
      originalLabel: baseSha() === null ? "New file" : "GitHub snapshot · read only",
    });
  }
  const paneHost: PaneHost = {
    key, path: file.path, scope, stored, readOnly: !!file.readOnly, body, store,
    session: () => session,
    text: () => docText(current),
    isCurrent: () => !disposed && mounted.get(file.path) === registration,
    cssWorkspace: file.cssWorkspace,
    runHistory: (direction) => runVisualHistory(direction, file.path),
    reportContext: () => reportContext(),
  };
  function attach() {
    if (disposed || view || !viewFactory) return;
    body.replaceChildren();
    view = viewFactory(paneHost);
    render(mode);
    if (pendingHighlight?.revision === docRevision(current)) view.highlight(pendingHighlight.ranges);
    if (pendingElement?.revision === docRevision(current)) view.markElement(pendingElement.tag, pendingElement.reveal);
    if (pendingReveal?.revision === docRevision(current)) view.reveal(pendingReveal.start, pendingReveal.end);
    pendingHighlight = pendingElement = pendingReveal = undefined;
    reportContext();
  }
  const registration: MountedEditor = {
    path: file.path, key, doc: current, apply, range, discardNew: () => discardNew(), dispose: disposeMountedEditor, session, readOnly: !!file.readOnly,
    refresh: () => { if (!disposed) refreshControls(); },
    attach,
    onStore(event) {
      if (disposed) return;
      if (event.type === "text") update(event.changes);
      else if (event.type === "file" && (event.change === "base" || event.change === "saved")) update();
    },
    refused(message) {
      if (disposed) return;
      refusal = message;
      refreshControls();
    },
  };
  mounted.set(file.path, registration);
  liveMounted.add(registration);
  update();
  attach();
  function disposeMountedEditor() {
    if (disposed) return;
    disposed = true;
    unregisterMounted(file.path, registration);
    view?.dispose();
    view = undefined;
    file.onContextChange?.(null);
    publisher?.destroy();
    publishers.delete(refreshOutside);
    document.removeEventListener("keydown", historyShortcut);
    root.remove();
    toolbar.remove();
    workspace?.classList.remove("workspace--code");
    // A clean file nothing refers to any more leaves the store.
    releaseEntry();
    if (!stored && docs.get(key) === current && ![...liveMounted].some(editor => editor.doc === current)) docs.delete(key);
  }
  return disposeMountedEditor;
}

function reconcilePublished(result: PublishResult, submitted: SavedDraft[]) {
  const persisted = draftStore(), store = sourceStore();
  const removed = new Set(result.deleted ?? []);
  for (const sent of submitted) {
    const latest = persisted.get(sent, sent.path);
    // A deletion saved: the path is gone from GitHub, and so is its draft.
    if (sent.deleted) {
      if (removed.has(sent.path) && latest?.deleted) persisted.remove(sent, sent.path);
      continue;
    }
    const sha = result.files.find((file) => file.path === sent.path)?.sha;
    if (!sha) continue;
    const opaque = sent.opaque;
    // Edits typed during publishing remain a new draft on top of the committed content.
    if (store.get(sent, sent.path)) store.markSaved(sent, sent.path, { baseSha: sha, original: sent.content });
    else if (opaque) {
      if (latest?.opaque) persisted.remove(sent, sent.path);
    } else if (latest) {
      const { movedFrom: _f, sourceSha: _s, opaque: _o, mode: _m, ...rest } = latest;
      persisted.save({
        ...rest,
        baseSha: sha,
        original: sent.content,
        updatedAt: Date.now(),
      });
    }
  }
}
