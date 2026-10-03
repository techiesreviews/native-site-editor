import "./code-editor.css";
import { cssVariableCompletion, cssVariableDeclarations, cssVariableReference, isCssPath, type CssWorkspace } from "../page-builder/css-intelligence";
import { monaco } from "./monaco";
import {
  draftStore,
  draftKey,
  type DraftScope,
  type SavedDraft,
} from "../drafts";
import { createPublishMenu } from "./publish-menu";
import { textHash, type AgentCommand } from "../../shared/agent";
import type { EditorContext } from "../../shared/types";
import type { PublishResult } from "../../shared/types";
import { listChanges, type FileChange } from "../file-changes";
import { button, node } from "../ui/dom";
import { icon } from "../icons";
import { CODE_POINTER_EVENT, type CodePointer } from "../page-builder/canvas-model";

// Code to canvas (page builder): an HTML editor reports where its cursor
// goes by a click or a key and which line the pointer is over, so the
// canvas can select or point at that element (src/page-builder/code-link.ts).
function linkToCanvas(editor: monaco.editor.ICodeEditor, path: string, model: monaco.editor.ITextModel) {
  const tell = (pointer: CodePointer) => window.dispatchEvent(new CustomEvent(CODE_POINTER_EVENT, { detail: pointer }));
  // A pointer's source is read when it is sent, so its offset matches it;
  // the canvas drops it when the model has changed since (`stale`).
  const snapshot = () => {
    const version = model.getVersionId();
    return { source: model.getValue(), stale: () => model.isDisposed() || model.getVersionId() !== version };
  };
  // A range of text being selected is about text, not an element: a cursor
  // move counts only while the selection stays empty.
  const empty = () => editor.getSelection()?.isEmpty() !== false;
  const cursor = (position: monaco.IPosition) => {
    const shot = snapshot();
    tell({ path, kind: "cursor", offset: model.getOffsetAt(position), source: shot.source, stale: () => shot.stale() || !empty() });
  };
  let pressed = false;
  editor.onDidChangeCursorPosition((event) => {
    // Typing, undo and the editor's own reveals move the cursor too; they
    // are not pointing. A press counts when it is let go (it may become a drag).
    if (event.source !== "keyboard" || event.reason !== monaco.editor.CursorChangeReason.Explicit) return;
    if (empty()) cursor(event.position);
    else tell({ path, kind: "range" });
  });
  editor.onMouseDown((event) => {
    // In the text, not on a fold chevron or the scrollbar.
    const type = event.target.type;
    pressed = event.event.leftButton &&
      (type === monaco.editor.MouseTargetType.CONTENT_TEXT || type === monaco.editor.MouseTargetType.CONTENT_EMPTY);
    tell({ path, kind: "range" });
  });
  editor.onMouseUp(() => {
    if (!pressed) return;
    pressed = false;
    const position = editor.getPosition();
    if (position && empty()) cursor(position);
  });
  let line = 0;
  editor.onMouseMove((event) => {
    const at = event.target.position?.lineNumber ?? 0;
    if (at === line) return;
    line = at;
    if (!at) tell({ path, kind: "leave" });
    else tell({ path, kind: "hover", offset: model.getOffsetAt({ lineNumber: at, column: model.getLineFirstNonWhitespaceColumn(at) || 1 }), ...snapshot() });
  });
  editor.onMouseLeave(() => {
    line = 0;
    tell({ path, kind: "leave" });
  });
}

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
  /** Opens an unmounted file before routed visual history changes its model. */
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
}

interface Draft {
  original: string;
  model: monaco.editor.ITextModel;
  view: monaco.editor.ICodeEditorViewState | null;
  path: string;
  scope?: DraftScope;
  baseSha?: string | null;
  persisted?: boolean;
}
const drafts = new Map<string, Draft>();
let serial = 0;
// Several editors can be mounted at once (page and stylesheet side by side);
// commands are routed by file path.
type RangeApi = {
  select(edit: Omit<RangeEdit, "text">): boolean;
  replace(edit: RangeEdit, group: boolean, companion?: HistoryCompanion): void;
  replaceMany(edits: RangeEdit[]): void;
  closeGroup(): void;
  reveal(start: number, end: number): void;
  highlight(ranges: HighlightRange[]): void;
  markElement(tag: { start: number; end: number } | undefined, reveal: boolean): void;
  review(on: boolean): void;
  reviewing(): boolean;
  compare(version: VersionCompare | undefined): void;
};
/** An earlier version of the file, shown beside the current one (History). */
export type VersionCompare = { content: string; label: string };
type MountedEditor = {
  apply(command: AgentCommand): Promise<void>;
  discardNew(): boolean;
  range: RangeApi;
  model: monaco.editor.ITextModel;
  session: string;
  readOnly: boolean;
  ensureHistoryTarget?: (path: string) => Promise<boolean>;
  refresh(): void;
};
type VisualHistoryEntry = {
  model: monaco.editor.ITextModel;
  path: string;
  after: number;
  undone?: number;
  group?: boolean;
  /** Changes to other files made with this edit: undone and redone with it. */
  companions?: HistoryCompanion[];
};
/** A change outside the edited model (another file, as a draft) that belongs to an edit's undo step. */
export interface HistoryCompanion {
  undo(): void;
  redo(): void;
}
const mounted = new Map<string, MountedEditor>();
// The Save menus of the mounted editors, for a draft written outside them.
const publishers = new Set<() => void>();
/** A browser draft changed outside the editors: the Save menus list it again. */
export function refreshDrafts() {
  for (const refresh of publishers) refresh();
}
/** Returning false refuses the operation and retains its history entry. */
export type HistoryActionCallback = () => void | boolean | Promise<void | boolean>;
// Legacy actions run once on Undo; actions with Redo move between both stacks.
type HistoryAction = { path: string; action: HistoryActionCallback; redo?: HistoryActionCallback };
const isAction = (entry: VisualHistoryEntry | HistoryAction | undefined): entry is HistoryAction => Boolean(entry && "action" in entry);
const visualHistory = new Map<string, { undo: (VisualHistoryEntry | HistoryAction)[]; redo: (VisualHistoryEntry | HistoryAction)[] }>();
const runningVisualHistory = new Set<string>();
const routedModelChanges = new WeakSet<monaco.editor.ITextModel>();
// A companion of a single (ungrouped) edit runs whenever the model itself is undone to before
// that edit or redone to after it, by the toolbar, the keyboard or Monaco's own stack once the
// visual history has been cleared by typing, so the other file never drifts from the edit.
type CompanionMark = { before: number; after: number; done: boolean; companion: HistoryCompanion };
const companionMarks = new WeakMap<monaco.editor.ITextModel, CompanionMark[]>();
function runCompanions(model: monaco.editor.ITextModel, undoing: boolean) {
  const version = model.getAlternativeVersionId();
  for (const mark of companionMarks.get(model) ?? []) {
    if (undoing && mark.done && version === mark.before) {
      mark.done = false;
      mark.companion.undo();
    } else if (!undoing && !mark.done && version === mark.after) {
      mark.done = true;
      mark.companion.redo();
    }
  }
}
const historyFor = (session: string) => {
  let history = visualHistory.get(session);
  if (!history) { history = { undo: [], redo: [] }; visualHistory.set(session, history); }
  return history;
};
function recordVisualEdit(session: string, path: string, model: monaco.editor.ITextModel, group = false, companion?: HistoryCompanion) {
  const history = historyFor(session);
  const last = history.undo.at(-1);
  if (group && !isAction(last) && last?.group && last.model === model && last.path === path) {
    last.after = model.getAlternativeVersionId();
    if (companion) (last.companions ??= []).push(companion);
  } else history.undo.push({ model, path, after: model.getAlternativeVersionId(), group, companions: companion ? [companion] : undefined });
  history.redo.length = 0;
  for (const editor of mounted.values()) if (editor.session === session) editor.refresh();
}
function closeVisualGroup(session: string, model: monaco.editor.ITextModel) {
  const last = historyFor(session).undo.at(-1);
  if (!isAction(last) && last?.model === model) last.group = false;
}
function invalidateVisualHistory(session: string) {
  const history = visualHistory.get(session);
  if (history) { history.undo.length = 0; history.redo.length = 0; }
}
function canRunVisualHistory(session: string, direction: "undo" | "redo", fallback: monaco.editor.ITextModel) {
  if (runningVisualHistory.has(session)) return false;
  const entry = historyFor(session)[direction];
  const candidate = entry.at(-1);
  if (isAction(candidate)) return true;
  const expected = direction === "undo" ? candidate?.after : candidate?.undone;
  return Boolean(candidate && !candidate.model.isDisposed() && candidate.model.getAlternativeVersionId() === expected) ||
    (direction === "undo" ? fallback.canUndo() : fallback.canRedo());
}
/**
 * Records `action` as the next undo step of the mounted file `path`'s history,
 * below any later edit: Undo runs it once the edits after it are undone. A
 * text change typed in the file clears it with the rest of the history.
 * Supply redo for a reversible action. False, throws and rejected promises keep
 * the entry in place. Callbacks own source/draft checks and any side-effect rollback.
 */
export function recordHistoryAction(path: string, action: HistoryActionCallback, redo?: HistoryActionCallback) {
  const editor = mounted.get(path);
  if (!editor) return false;
  const history = historyFor(editor.session);
  history.undo.push({ path, action, redo });
  history.redo.length = 0;
  for (const other of mounted.values()) if (other.session === editor.session) other.refresh();
  return true;
}
export interface HistorySourceEdit { path: string; expectedSource: string; text: string }
export interface HistorySourceReceipt {
  apply(): boolean;
  undo(): boolean;
  redo(): boolean;
  isCurrent(): boolean;
}
/**
 * Prepares owned, isolated local text steps without recording another journal
 * entry. The host commits drafts synchronously, then records this receipt's
 * callbacks as its single history action. No model notification is masked
 * across an await, and every source/model/session/version is checked first.
 */
export function prepareHistorySources(edits: HistorySourceEdit[]): HistorySourceReceipt | undefined {
  if (new Set(edits.map((edit) => edit.path)).size !== edits.length) return undefined;
  const steps = edits.map((edit) => {
    const editor = mounted.get(edit.path);
    if (!editor || editor.readOnly || editor.model.isDisposed() || editor.model.getValue() !== edit.expectedSource) return undefined;
    return { ...edit, editor, session: editor.session, model: editor.model, before: editor.model.getAlternativeVersionId(), after: undefined as number | undefined };
  });
  if (steps.some((step) => !step)) return undefined;
  const owned = steps.filter((step): step is NonNullable<typeof step> => Boolean(step));
  if (new Set(owned.map((step) => step.editor.session)).size > 1 || new Set(owned.map((step) => step.model)).size !== owned.length) return undefined;
  let state: "prepared" | "applied" | "undone" | "failed" = "prepared";
  const matchesStep = (step: typeof owned[number], after: boolean) => mounted.get(step.path) === step.editor &&
    !step.editor.readOnly && step.editor.session === step.session && !step.model.isDisposed() && step.model.getAlternativeVersionId() === (after ? step.after : step.before) &&
    step.model.getValue() === (after ? step.text : step.expectedSource);
  const matches = (after: boolean) => owned.every((step) => matchesStep(step, after));
  const move = (direction: "undo" | "redo", expectedState: "applied" | "undone") => {
    if (state !== expectedState || !matches(direction === "undo")) return false;
    const moved: typeof owned = [];
    try {
      for (const step of owned) {
        if (!matchesStep(step, direction === "undo")) throw new Error("The source changed during its text history operation.");
        if (step.text === step.expectedSource) continue;
        routedModelChanges.add(step.model);
        try {
          const result = step.model[direction]();
          // These are isolated text-model steps. A workspace-wide async undo
          // is not an owned local step and cannot be committed by this receipt.
          if (result) { void result.catch(() => {}); throw new Error("The text history step is asynchronous."); }
        } finally { routedModelChanges.delete(step.model); }
        moved.push(step);
        const after = direction === "redo";
        if (step.model.getAlternativeVersionId() !== (after ? step.after : step.before) ||
            step.model.getValue() !== (after ? step.text : step.expectedSource)) throw new Error("The owned text history step changed.");
      }
      state = direction === "undo" ? "undone" : "applied";
      return true;
    } catch {
      // A synchronous local failure rolls back only the steps already moved.
      for (const step of moved.reverse()) {
        if (!matchesStep(step, direction === "redo")) { state = "failed"; continue; }
        routedModelChanges.add(step.model);
        try { const result = step.model[direction === "undo" ? "redo" : "undo"](); if (result) void result.catch(() => {}); }
        catch { state = "failed"; }
        finally { routedModelChanges.delete(step.model); }
      }
      if (!matches(expectedState === "applied")) state = "failed";
      return false;
    }
  };
  return {
    isCurrent: () => state !== "failed" && matches(state === "applied"),
    apply() {
      if (state !== "prepared" || !matches(false)) return false;
      const applied: typeof owned = [];
      try {
        for (const step of owned) {
          if (!matchesStep(step, false)) throw new Error("The source changed during its text history operation.");
          if (step.text !== step.expectedSource) {
            step.model.pushStackElement();
            routedModelChanges.add(step.model);
            try { step.model.pushEditOperations([], [{ range: step.model.getFullModelRange(), text: step.text }], () => null); }
            finally { routedModelChanges.delete(step.model); }
            step.model.pushStackElement();
          }
          step.after = step.model.getAlternativeVersionId();
          applied.push(step);
        }
        if (!matches(true)) throw new Error("The source changed while applying its text step.");
        state = "applied";
        return true;
      } catch {
        for (const step of applied.reverse()) if (step.text !== step.expectedSource && matchesStep(step, true)) {
          routedModelChanges.add(step.model);
          try { const result = step.model.undo(); if (result) void result.catch(() => {}); }
          catch { state = "failed"; }
          finally { routedModelChanges.delete(step.model); }
        }
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
 * stored draft and any model kept for it.
 */
export function dropDraft(scope: DraftScope, path: string) {
  const key = draftKey(scope, path);
  const kept = drafts.get(key);
  if (kept && [...mounted.values()].some((editor) => editor.model === kept.model)) return false;
  draftStore().remove(scope, path);
  if (kept) {
    kept.model.dispose();
    drafts.delete(key);
  }
  return true;
}
/**
 * Forgets the model kept for `path` (a draft not mounted), leaving its
 * stored draft as it is: the file was renamed, moved or deleted, and its
 * draft now lives elsewhere or is a deletion.
 */
export function forgetDraftModel(scope: DraftScope, path: string) {
  const key = draftKey(scope, path);
  const kept = drafts.get(key);
  if (!kept || [...mounted.values()].some((editor) => editor.model === kept.model)) return false;
  kept.model.dispose();
  drafts.delete(key);
  return true;
}
/** Read-only proof of mounted and cached models for one originating scope/path. */
export function captureFileModelState(scope: DraftScope, path: string) {
  const key = draftKey(scope, path), editor = mounted.get(path), cached = drafts.get(key);
  const model = editor?.model ?? cached?.model;
  const session = editor?.session;
  const version = model?.getAlternativeVersionId(), source = model?.getValue();
  return { isCurrent: () => mounted.get(path) === editor && drafts.get(key) === cached &&
    (!editor || editor.session === session) && (!model || !model.isDisposed() &&
      model.getAlternativeVersionId() === version && model.getValue() === source) };
}
/** Evicts only an unchanged, unmounted cached model and proves its absence. */
export function evictDraftModel(scope: DraftScope, path: string, proof: { isCurrent(): boolean }) {
  if (!proof.isCurrent() || mounted.has(path)) return undefined;
  const key = draftKey(scope, path);
  if (!drafts.has(key)) return proof;
  forgetDraftModel(scope, path);
  if (mounted.has(path) || drafts.has(key)) return undefined;
  return captureFileModelState(scope, path);
}
/** The history journal must stay attached to its initiating mounted editor/session. */
export function captureHistoryHost(path: string) {
  const editor = mounted.get(path);
  if (!editor || editor.readOnly) return undefined;
  const model = editor.model, session = editor.session;
  return { isCurrent: () => mounted.get(path) === editor && editor.model === model &&
    editor.session === session && !editor.readOnly && !model.isDisposed() };
}
export function getMountedSource(path: string) {
  return mounted.get(path)?.model.getValue();
}
export async function runVisualHistory(direction: "undo" | "redo", fallbackPath?: string) {
  const fallback = fallbackPath ? mounted.get(fallbackPath) : undefined;
  if (fallback?.readOnly) return false;
  const session = fallback?.session ?? [...mounted.values()].at(-1)?.session;
  if (!session) return false;
  if (runningVisualHistory.has(session)) return false;
  runningVisualHistory.add(session);
  try {
    const history = historyFor(session);
    const source = direction === "undo" ? history.undo : history.redo;
    const target = direction === "undo" ? history.redo : history.undo;
    const last = source.at(-1);
    if (isAction(last)) {
      const owner = fallback ?? mounted.get(last.path) ?? [...mounted.values()].find((editor) => editor.session === session);
      if (!owner || owner.readOnly || owner.session !== session) return false;
      const ownerPath = [...mounted].find(([, editor]) => editor === owner)?.[0];
      const action = direction === "undo" ? last.action : last.redo;
      if (!action) return false;
      const accepted = await action();
      // The callback may await network work or change workspace. It owns its
      // side effects; only this exact, still-mounted journal may receive history.
      if (accepted === false || visualHistory.get(session) !== history || source.at(-1) !== last ||
          !ownerPath || mounted.get(ownerPath) !== owner || owner.session !== session || owner.model.isDisposed()) return false;
      source.pop();
      if (last.redo) target.push(last);
      else history.redo.length = 0;
      return true;
    }
    const entry = last;
    if (entry && mounted.get(entry.path)?.model !== entry.model && fallback?.ensureHistoryTarget)
      await fallback.ensureHistoryTarget(entry.path);
    // Loading a displaced stylesheet is asynchronous. A newer action or a
    // workspace switch owns the history now; never pop its journal entry.
    if ((fallbackPath && mounted.get(fallbackPath) !== fallback) || source.at(-1) !== entry) return false;
    const targetEditor = entry ? mounted.get(entry.path) : undefined;
    const expected = direction === "undo" ? entry?.after : entry?.undone;
    if (entry && targetEditor?.model === entry.model && targetEditor.session === session && !targetEditor.readOnly &&
        !entry.model.isDisposed() && entry.model.getAlternativeVersionId() === expected) {
      source.pop();
      routedModelChanges.add(entry.model);
      try { await entry.model[direction](); }
      finally { routedModelChanges.delete(entry.model); }
      if (direction === "undo") entry.undone = entry.model.getAlternativeVersionId();
      else entry.after = entry.model.getAlternativeVersionId();
      const companions = entry.companions ?? [];
      for (const companion of direction === "undo" ? [...companions].reverse() : companions) companion[direction]();
      target.push(entry);
      for (const editor of mounted.values()) if (editor.session === session) editor.refresh();
      return true;
    }
    invalidateVisualHistory(session);
    if (entry) return false;
    if (!fallback || fallback.readOnly || fallback.model.isDisposed() || !(direction === "undo" ? fallback.model.canUndo() : fallback.model.canRedo())) return false;
    if (direction === "undo") fallback.model.pushStackElement();
    routedModelChanges.add(fallback.model);
    try { await fallback.model[direction](); }
    finally { routedModelChanges.delete(fallback.model); }
    fallback.refresh();
    return true;
  } finally {
    runningVisualHistory.delete(session);
    for (const editor of mounted.values()) if (editor.session === session) editor.refresh();
  }
}
const editorFor = (path: string) => {
  const editor = mounted.get(path);
  if (!editor) throw new Error("The active file changed or is read only.");
  return editor;
};
export async function applyAgentDraft(command: AgentCommand) {
  return editorFor(command.path).apply(command);
}
// Visual-edit proof (ticket 06): replace one verified byte range of a mounted file.
export interface RangeEdit {
  path: string;
  start: number;
  end: number;
  expected: string;
  text: string;
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
// Scrolls a mounted file to a byte range (e.g. a CSS rule) and selects it.
export function revealRange(path: string, start: number, end: number) {
  mounted.get(path)?.range.reveal(start, end);
}
// A CSS rule styling the selected element: dimmed when the cascade overrides
// all of it, with the declarations it overrides (`struck`) crossed out.
export interface HighlightRange {
  start: number;
  end: number;
  overridden?: boolean;
  struck?: { start: number; end: number }[];
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
  return [...drafts.values()]
    .filter((d) => d.baseSha === null || d.model.getValue() !== d.original)
    .map((d) => ({ path: d.path, created: d.baseSha === null, scopeKey: d.scope ? `${d.scope.repoId}:${d.scope.branch}` : "" }));
}
/** Forgets every Undo and Redo step: the drafts they changed are gone (Discard changes). */
export function clearHistory() {
  visualHistory.clear();
  for (const editor of mounted.values()) editor.refresh();
}
export function clearDrafts() {
  for (const draft of drafts.values()) draft.model.dispose();
  drafts.clear();
  visualHistory.clear();
  draftStore().release();
}
window.addEventListener("beforeunload", (event) => {
  if (
    [...drafts.values()].some(
      (d) =>
        (d.baseSha === null || d.model.getValue() !== d.original) &&
        !d.persisted,
    )
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function languageFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    (
      {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        css: "css",
        scss: "scss",
        json: "json",
        html: "html",
        md: "markdown",
        mdx: "markdown",
        yaml: "yaml",
        yml: "yaml",
      } as Record<string, string>
    )[extension] ?? "plaintext"
  );
}

// Start lines (0-based) of the multi-line <head>, <section> and component
// elements, collapsed when a page first opens in the code editor.
export function defaultFoldLines(source: string) {
  // Comments, scripts and styles blanked to their newlines: offsets stay put.
  const text = source.replace(/<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (match) => match.replace(/[^\n]/g, " "));
  const lineAt = (offset: number) => text.slice(0, offset).split("\n").length - 1;
  const open: { name: string; line: number }[] = [];
  const lines: number[] = [];
  for (const match of text.matchAll(/<(\/?)(head|section|[a-z][a-z0-9]*-[a-z0-9-]*)(?=[\s/>])[^>]*>/gi)) {
    const name = match[2].toLowerCase();
    if (!match[1]) {
      if (!match[0].endsWith("/>")) open.push({ name, line: lineAt(match.index) });
      continue;
    }
    let at = open.length - 1;
    while (at >= 0 && open[at].name !== name) at--;
    if (at < 0) continue;
    const { line } = open[at];
    open.length = at;
    if (lineAt(match.index) > line && !lines.includes(line)) lines.push(line);
  }
  return lines.sort((a, b) => a - b);
}

export function mountCodeEditor(
  host: HTMLElement,
  file: SourceFile,
  toolbarHost?: HTMLElement | null,
) {
  const session = file.historyScope ?? file.key;
  const store = draftStore();
  const saved =
    file.scope && !file.readOnly ? store.get(file.scope, file.path) : undefined;
  let draft = drafts.get(file.key);
  if (!draft) {
    draft = {
      original: saved?.original ?? file.source,
      model: monaco.editor.createModel(
        saved?.content ?? file.source,
        languageFor(file.path),
        monaco.Uri.parse(`inmemory://editor/${++serial}/${file.path}`),
      ),
      view: null,
      path: file.path,
      scope: file.scope,
      baseSha: saved ? saved.baseSha : file.baseSha,
    };
    drafts.set(file.key, draft);
  }
  const current = draft;
  // A successful publish whose response was lost is recognized on reopening.
  if (
    file.baseSha !== null &&
    (current.model.getValue() === file.source ||
      current.original === file.source)
  ) {
    current.original = file.source;
    current.baseSha = file.baseSha;
  }
  let conflict = file.baseSha !== undefined && current.baseSha !== file.baseSha;
  let reviewingLatest = false;
  let disposed = false;
  let view: monaco.editor.ICodeEditor | undefined;
  function reportContext(changes?: { start: number; end: number; text: string }[]) {
    if (disposed) return;
    const selection = view?.getSelection();
    file.onContextChange?.({
      path: file.path,
      baseSha: current.baseSha ?? null,
      language: current.model.getLanguageId(),
      readOnly: !!file.readOnly,
      original: current.original,
      content: current.model.getValue(),
      selection: selection
        ? {
            startLine: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLine: selection.endLineNumber,
            endColumn: selection.endColumn,
          }
        : null,
      diagnostics: monaco.editor
        .getModelMarkers({ resource: current.model.uri })
        .slice(0, 50)
        .map((marker) => ({
          severity: monaco.MarkerSeverity[marker.severity].toLowerCase(),
          message: marker.message.slice(0, 2000),
          line: marker.startLineNumber,
          column: marker.startColumn,
        })),
    }, changes);
  }
  const apply = async (command: AgentCommand) => {
    if (disposed || file.readOnly || file.path !== command.path)
      throw new Error("The active file changed or is read only.");
    const text = current.model.getValue();
    if (text === command.content) return;
    const hash = await textHash(text);
    if (
      disposed ||
      hash !== command.expectedHash ||
      current.model.getValue() !== text
    )
      throw new Error(
        "The draft changed while the agent was working. Read it again and retry.",
      );
    current.model.pushStackElement();
    current.model.pushEditOperations(
      [],
      [{ range: current.model.getFullModelRange(), text: command.content }],
      () => null,
    );
    current.model.pushStackElement();
  };
  let marks: string[] = [];
  let elementMarks: string[] = [];
  const rangeOf = (edit: Omit<RangeEdit, "text">) => {
    if (disposed || file.readOnly || file.path !== edit.path)
      throw new Error("The active file changed or is read only.");
    const model = current.model;
    if (model.getValue().slice(edit.start, edit.end) !== edit.expected)
      throw new Error(
        "The source at this location no longer matches the preview. Refresh, wait for the new build, then try again.",
      );
    return monaco.Range.fromPositions(
      model.getPositionAt(edit.start),
      model.getPositionAt(edit.end),
    );
  };
  const range = {
    select(edit: Omit<RangeEdit, "text">) {
      const target = rangeOf(edit);
      current.model.pushStackElement();
      view?.setSelection(target);
      view?.revealRangeInCenter(target);
      return true;
    },
    closeGroup() {
      current.model.pushStackElement();
      closeVisualGroup(session, current.model);
    },
    review(on: boolean) {
      if ((mode === "review") !== on) render(on ? "review" : "edit");
    },
    compare(next: VersionCompare | undefined) {
      version = next;
      if (next || mode === "version") render(next ? "version" : "edit");
    },
    reviewing: () => mode === "review",
    reveal(start: number, end: number) {
      const model = current.model;
      const target = monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
      view?.setSelection(monaco.Range.fromPositions(target.getStartPosition(), target.getStartPosition()));
      view?.revealRangeNearTop(target);
    },
    highlight(ranges: HighlightRange[]) {
      const model = current.model;
      const at = (start: number, end: number) => monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
      marks = model.deltaDecorations(
        marks,
        ranges.flatMap((range) => [
          {
            range: at(range.start, range.end),
            options: {
              isWholeLine: true,
              className: range.overridden ? "code-editor__match code-editor__match--overridden" : "code-editor__match",
              overviewRuler: { color: { id: "editorOverviewRuler.findMatchForeground" }, position: monaco.editor.OverviewRulerLane.Full },
            },
          },
          ...(range.struck ?? []).map((item) => ({
            range: at(item.start, item.end),
            options: { inlineClassName: "code-editor__overridden", hoverMessage: { value: "Overridden for the selected element" } },
          })),
        ]),
      );
    },
    markElement(tag: { start: number; end: number } | undefined, reveal: boolean) {
      const model = current.model;
      const target = tag && monaco.Range.fromPositions(model.getPositionAt(tag.start), model.getPositionAt(tag.end));
      elementMarks = model.deltaDecorations(
        elementMarks,
        target
          ? [{
              range: target,
              options: {
                className: "code-editor__element",
                linesDecorationsClassName: "code-editor__element-line",
                overviewRuler: { color: { id: "editorOverviewRuler.selectionHighlightForeground" }, position: monaco.editor.OverviewRulerLane.Full },
              },
            }]
          : [],
      );
      if (!target || !reveal) return;
      view?.setSelection(monaco.Range.fromPositions(target.getEndPosition(), target.getEndPosition()));
      view?.revealRangeInCenterIfOutsideViewport(target);
    },
    replace(edit: RangeEdit, group: boolean, companion?: HistoryCompanion) {
      const target = rangeOf(edit);
      if (edit.text === edit.expected) return;
      if (!group) current.model.pushStackElement();
      const before = current.model.getAlternativeVersionId();
      routedModelChanges.add(current.model);
      try { current.model.pushEditOperations([], [{ range: target, text: edit.text }], () => null); }
      finally { routedModelChanges.delete(current.model); }
      if (!group) current.model.pushStackElement();
      // An ungrouped edit's companion follows the model's own undo and redo (`runCompanions`).
      const marked = companion && !group;
      if (marked) {
        const marks = companionMarks.get(current.model) ?? [];
        marks.push({ before, after: current.model.getAlternativeVersionId(), done: true, companion });
        companionMarks.set(current.model, marks.slice(-50));
      }
      recordVisualEdit(session, file.path, current.model, group, marked ? undefined : companion);
      view?.setSelection(
        monaco.Range.fromPositions(
          current.model.getPositionAt(edit.start),
          current.model.getPositionAt(edit.start + edit.text.length),
        ),
      );
    },
    replaceMany(edits: RangeEdit[]) {
      const verified = edits.map((edit) => ({ edit, range: rangeOf(edit) }));
      const changes = verified.filter(({ edit }) => edit.text !== edit.expected);
      if (!changes.length) return;
      current.model.pushStackElement();
      routedModelChanges.add(current.model);
      try {
        current.model.pushEditOperations(
          [],
          changes.map(({ edit, range }) => ({ range, text: edit.text })),
          () => null,
        );
      } finally { routedModelChanges.delete(current.model); }
      current.model.pushStackElement();
      recordVisualEdit(session, file.path, current.model);
    },
  };
  const registration: MountedEditor = {
    apply, range, discardNew: () => discardNew(), model: current.model, session, readOnly: !!file.readOnly,
    ensureHistoryTarget: file.ensureHistoryTarget,
    refresh: () => update(),
  };
  mounted.set(file.path, registration);
  const cssProviders: monaco.IDisposable[] = [];
  if (isCssPath(file.path) && file.cssWorkspace) {
    const workspaceFor = (model: monaco.editor.ITextModel) => {
      if (disposed || model.isDisposed() || model !== current.model || mounted.get(file.path) !== registration) return;
      const workspace = file.cssWorkspace?.();
      // A host may update its source map in place while openDefinition awaits.
      return workspace && { ...workspace, sources: { ...workspace.sources }, orderedPaths: [...workspace.orderedPaths] };
    };
    const range = (model: monaco.editor.ITextModel, start: number, end: number) =>
      monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
    const language = current.model.getLanguageId();
    cssProviders.push(monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ["-"],
      provideCompletionItems(model, position) {
        const workspace = workspaceFor(model);
        const token = workspace && cssVariableCompletion(model.getValue(), model.getOffsetAt(position), file.path);
        if (!workspace || !token) return { suggestions: [] };
        const declarations = cssVariableDeclarations(workspace);
        const names = [...new Set(declarations.map(item => item.name))].filter(name => name.startsWith(token.prefix));
        return { suggestions: names.map(name => ({
          label: name, kind: monaco.languages.CompletionItemKind.Variable,
          insertText: token.wrap ? `var(${name})` : name,
          range: range(model, token.start, token.end),
          detail: declarations.filter(item => item.name === name).map(item => `${item.path}: ${item.value}`).join("; "),
        })) };
      },
    }));
    cssProviders.push(monaco.languages.registerHoverProvider(language, {
      provideHover(model, position) {
        const workspace = workspaceFor(model);
        const token = workspace && cssVariableReference(model.getValue(), model.getOffsetAt(position), file.path);
        if (!workspace || !token) return;
        const declarations = cssVariableDeclarations(workspace).filter(item => item.name === token.name);
        if (!declarations.length) return;
        return { range: range(model, token.start, token.end), contents: declarations.map(item => ({
          value: `**${item.path.replace(/[\\`*_{}[\]()<>]/g, "\\$&")}**\n\n`,
        })).flatMap((heading, index) => [heading, { value: "```css\n" + declarations[index].name + ": " + declarations[index].value.replace(/`/g, "\\`") + "\n```" }]) };
      },
    }));
    cssProviders.push(monaco.languages.registerDefinitionProvider(language, {
      async provideDefinition(model, position, cancellation) {
        const workspace = workspaceFor(model);
        const token = workspace && cssVariableReference(model.getValue(), model.getOffsetAt(position), file.path);
        if (!workspace || !token || cancellation?.isCancellationRequested) return;
        const version = model.getVersionId();
        const definitions = cssVariableDeclarations(workspace).filter(item => item.name === token.name);
        const locations: monaco.languages.Location[] = [];
        for (const definition of definitions) {
          let target = mounted.get(definition.path);
          if (!target || target.model.getValue() !== workspace.sources[definition.path]) {
            try {
              if (!await workspace.openDefinition(definition.path, definition.start, definition.end, workspace.revision)) return;
            } catch { return; }
            target = mounted.get(definition.path);
          }
          const fresh = workspaceFor(model);
          if (cancellation?.isCancellationRequested || !fresh || fresh.revision !== workspace.revision || model.getVersionId() !== version ||
            Object.keys(workspace.sources).some(path => fresh.sources[path] !== workspace.sources[path]) ||
            Object.keys(fresh.sources).length !== Object.keys(workspace.sources).length) return;
          if (!target || target.session !== session || target.model.isDisposed() || target.model.getValue() !== workspace.sources[definition.path]) return;
          locations.push({ uri: target.model.uri, range: range(target.model, definition.start, definition.end) });
        }
        return locations;
      },
    }));
  }

  let mode: "edit" | "review" | "version" = "edit";
  let version: VersionCompare | undefined;
  let destroyView = () => {};
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
    if (current.baseSha !== null || !file.scope || disposed) return false;
    store.remove(file.scope, file.path);
    drafts.delete(file.key);
    file.onDiscardNew?.();
    current.model.dispose();
    return true;
  };
  const discard = button(
    "Discard changes",
    () => {
      if (file.onDiscardAll) {
        file.onDiscardAll();
        return;
      }
      if (!confirm(current.baseSha === null ? "Discard this new file?" : "Discard this file’s draft changes? You can undo this in the editor.")) return;
      if (discardNew()) return;
      if (conflict) {
        current.original = file.source;
        current.baseSha = file.baseSha;
        conflict = false;
        reviewingLatest = false;
      }
      current.model.pushStackElement();
      current.model.pushEditOperations(
        [],
        [{ range: current.model.getFullModelRange(), text: current.original }],
        () => null,
      );
      current.model.pushStackElement();
    },
    "text-button",
  );
  if (file.onDiscardAll) discard.title = "Discard every unsaved change on this branch";
  // With Discard all, the button waits for any draft of the branch, not only this file's.
  const refreshDiscard = (changed: boolean) => {
    discard.disabled = !!file.readOnly || (file.onDiscardAll && file.scope ? listChanges(store.list(file.scope)).length === 0 : !changed);
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
  // A draft written outside this editor: the Save menu and Discard changes follow.
  const refreshOutside = () => {
    publisher?.refresh();
    refreshDiscard(current.baseSha === null || current.model.getValue() !== current.original);
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
      current.original = file.source;
      current.baseSha = file.baseSha;
      conflict = false;
      reviewingLatest = false;
      update();
      render(mode);
    },
    "text-button",
  );
  acceptLatest.hidden = true;
  // GitHub deleted the file: nothing to review, only to settle.
  const deletedUpstream = current.baseSha !== null && Boolean(file.deletedUpstream?.(file.path));
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
  function update(changes?: { start: number; end: number; text: string }[]) {
    // Back to GitHub's version as it is now: no change, whatever blob the
    // draft began from (a stale one, or none for a path GitHub has since).
    if (!file.readOnly && typeof file.baseSha === "string" && current.baseSha !== file.baseSha && current.model.getValue() === file.source) {
      current.original = file.source;
      current.baseSha = file.baseSha;
      conflict = false;
      reviewingLatest = false;
    }
    const changed =
      current.baseSha === null || current.model.getValue() !== current.original;
    if (file.scope && current.baseSha !== undefined && !file.readOnly) {
      // A renamed file keeps where it came from (src/file-changes.ts).
      const stored = current.baseSha === null ? store.get(file.scope, file.path) : undefined;
      const moved = stored && !stored.deleted
        ? { ...(stored.movedFrom ? { movedFrom: stored.movedFrom } : {}), ...(stored.sourceSha ? { sourceSha: stored.sourceSha } : {}), ...(stored.mode ? { mode: stored.mode } : {}) }
        : {};
      current.persisted = store.save({
        ...moved,
        ...file.scope,
        version: 1,
        path: file.path,
        baseSha: current.baseSha,
        original: current.original,
        content: current.model.getValue(),
        updatedAt: Date.now(),
      });
    }
    conflictBar.hidden = !conflict && !deletedUpstream;
    publisher?.refresh();
    const message = file.readOnly ? "Read only" : store.error;
    notice.hidden = !message;
    notice.textContent = message ?? "";
    refreshDiscard(changed);
    undo.disabled = !!file.readOnly || !canRunVisualHistory(session, "undo", current.model);
    redo.disabled = !!file.readOnly || !canRunVisualHistory(session, "redo", current.model);
    reportContext(changes);
  }
  function render(next: typeof mode) {
    destroyView();
    mode = next;
    review.setAttribute("aria-pressed", String(mode !== "edit"));
    body.replaceChildren();
    const canvas = node("div", "code-editor__canvas");
    body.append(canvas);
    const options: monaco.editor.IStandaloneEditorConstructionOptions = {
      automaticLayout: true,
      theme: "astro-editor",
      overviewRulerBorder: false,
      renderLineHighlight: "none",
      scrollbar: { useShadows: false },
      fontSize: 14,
      padding: { top: 16 },
      scrollBeyondLastLine: false,
      readOnly: file.readOnly,
      ariaLabel: file.readOnly ? "Symbolic link target" : "File source",
      minimap: { enabled: false },
    };
    if (mode === "edit") {
      const editor = monaco.editor.create(canvas, {
        ...options,
        model: current.model,
      });
      view = editor;
      editor.onDidChangeCursorSelection(() => queueMicrotask(reportContext));
      if (current.model.getLanguageId() === "html") linkToCanvas(editor, file.path, current.model);
      if (current.view) editor.restoreViewState(current.view);
      else if (current.model.getLanguageId() === "html") {
        const lines = defaultFoldLines(current.model.getValue());
        if (lines.length)
          void editor.getAction("editor.fold")?.run({ selectionLines: lines, levels: 1 });
      }
      destroyView = () => {
        current.view = editor.saveViewState();
        editor.dispose();
      };
    } else if (mode === "version" && version) {
      const labels = node("div", "code-editor__diff-labels");
      labels.append(node("span", "", `${version.label} · read only`), node("span", "", "Current version · read only"));
      body.prepend(labels);
      const original = monaco.editor.createModel(version.content, current.model.getLanguageId());
      const editor = monaco.editor.createDiffEditor(canvas, {
        ...options,
        readOnly: true,
        renderSideBySide: true,
        originalEditable: false,
      });
      editor.setModel({ original, modified: current.model });
      view = editor.getModifiedEditor();
      // Opens on the first difference.
      const shown = editor.onDidUpdateDiff(() => {
        const first = editor.getLineChanges()?.[0];
        if (!first) return;
        shown.dispose();
        editor.getModifiedEditor().revealLineInCenter(Math.max(1, first.modifiedStartLineNumber || first.modifiedEndLineNumber));
      });
      destroyView = () => {
        shown.dispose();
        editor.setModel(null);
        editor.dispose();
        original.dispose();
      };
    } else {
      const labels = node("div", "code-editor__diff-labels");
      labels.append(
        node(
          "span",
          "",
          current.baseSha === null ? "New file" : "GitHub snapshot · read only",
        ),
        node("span", "", "Your draft"),
      );
      body.prepend(labels);
      const original = monaco.editor.createModel(
        reviewingLatest ? file.source : current.original,
        current.model.getLanguageId(),
      );
      const editor = monaco.editor.createDiffEditor(canvas, {
        ...options,
        minimap: { enabled: false },
        renderSideBySide: true,
        originalEditable: false,
      });
      editor.setModel({ original, modified: current.model });
      view = editor.getModifiedEditor();
      view.onDidChangeCursorSelection(() => queueMicrotask(reportContext));
      destroyView = () => {
        editor.setModel(null);
        editor.dispose();
        original.dispose();
      };
    }
  }
  const markers = monaco.editor.onDidChangeMarkers((uris) => {
    if (uris.some((uri) => uri.toString() === current.model.uri.toString()))
      reportContext();
  });
  const subscription = current.model.onDidChangeContent((event) => {
    if (!routedModelChanges.has(current.model)) invalidateVisualHistory(session);
    if (event.isUndoing || event.isRedoing) runCompanions(current.model, event.isUndoing);
    update(event.changes.map((change) => ({
      start: change.rangeOffset,
      end: change.rangeOffset + change.rangeLength,
      text: change.text,
    })));
    for (const editor of mounted.values()) if (editor !== registration && editor.session === session) editor.refresh();
  });
  update();
  render("edit");
  reportContext();
  return () => {
    disposed = true;
    if (mounted.get(file.path) === registration) mounted.delete(file.path);
    if (marks.length || elementMarks.length) current.model.deltaDecorations([...marks, ...elementMarks], []);
    markers.dispose();
    for (const provider of cssProviders) provider.dispose();
    file.onContextChange?.(null);
    publisher?.destroy();
    publishers.delete(refreshOutside);
    subscription.dispose();
    document.removeEventListener("keydown", historyShortcut);
    destroyView();
    root.remove();
    toolbar.remove();
    workspace?.classList.remove("workspace--code");
    if (
      current.baseSha !== null &&
      current.model.getValue() === current.original
    ) {
      current.model.dispose();
      drafts.delete(file.key);
    }
  };
}

function reconcilePublished(result: PublishResult, submitted: SavedDraft[]) {
  const store = draftStore();
  const removed = new Set(result.deleted ?? []);
  for (const sent of submitted) {
    const latest = store.get(sent, sent.path);
    // A deletion saved: the path is gone from GitHub, and so is its draft.
    if (sent.deleted) {
      if (removed.has(sent.path) && latest?.deleted) store.remove(sent, sent.path);
      continue;
    }
    const sha = result.files.find((file) => file.path === sent.path)?.sha;
    if (!sha) continue;
    const key = draftKey(sent, sent.path);
    const open = drafts.get(key);
    // Saved, a renamed or copied file is a file like any other.
    const { movedFrom: _from, sourceSha: _source, opaque, mode: _mode, ...plain } = sent;
    // Edits typed during publishing remain a new draft on top of the committed content.
    if (open) {
      open.original = sent.content;
      open.baseSha = sha;
      open.persisted = store.save({
        ...plain,
        baseSha: sha,
        original: sent.content,
        content: open.model.getValue(),
        updatedAt: Date.now(),
      });
    } else if (opaque) {
      if (latest?.opaque) store.remove(sent, sent.path);
    } else if (latest) {
      const { movedFrom: _f, sourceSha: _s, opaque: _o, mode: _m, ...rest } = latest;
      store.save({
        ...rest,
        baseSha: sha,
        original: sent.content,
        updatedAt: Date.now(),
      });
    }
  }
}
