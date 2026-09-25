import "./code-editor.css";
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
import { button, node } from "../ui/dom";

export interface SourceFile {
  key: string;
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
  replace(edit: RangeEdit, group: boolean): void;
  replaceMany(edits: RangeEdit[]): void;
  closeGroup(): void;
  reveal(start: number, end: number): void;
  highlight(ranges: HighlightRange[]): void;
  markElement(tag: { start: number; end: number } | undefined, reveal: boolean): void;
  review(on: boolean): void;
  reviewing(): boolean;
};
type MountedEditor = {
  apply(command: AgentCommand): Promise<void>;
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
};
const mounted = new Map<string, MountedEditor>();
// The Save menus of the mounted editors, for a draft written outside them.
const publishers = new Set<() => void>();
/** A browser draft changed outside the editors: the Save menus list it again. */
export function refreshDrafts() {
  for (const refresh of publishers) refresh();
}
const visualHistory = new Map<string, { undo: VisualHistoryEntry[]; redo: VisualHistoryEntry[] }>();
const routedModelChanges = new WeakSet<monaco.editor.ITextModel>();
const historyFor = (session: string) => {
  let history = visualHistory.get(session);
  if (!history) { history = { undo: [], redo: [] }; visualHistory.set(session, history); }
  return history;
};
function recordVisualEdit(session: string, path: string, model: monaco.editor.ITextModel, group = false) {
  const history = historyFor(session);
  const last = history.undo.at(-1);
  if (group && last?.group && last.model === model && last.path === path) last.after = model.getAlternativeVersionId();
  else history.undo.push({ model, path, after: model.getAlternativeVersionId(), group });
  history.redo.length = 0;
  for (const editor of mounted.values()) if (editor.session === session) editor.refresh();
}
function closeVisualGroup(session: string, model: monaco.editor.ITextModel) {
  const last = historyFor(session).undo.at(-1);
  if (last?.model === model) last.group = false;
}
function invalidateVisualHistory(session: string) {
  const history = visualHistory.get(session);
  if (history) { history.undo.length = 0; history.redo.length = 0; }
}
function canRunVisualHistory(session: string, direction: "undo" | "redo", fallback: monaco.editor.ITextModel) {
  const entry = historyFor(session)[direction];
  const candidate = entry.at(-1);
  const expected = direction === "undo" ? candidate?.after : candidate?.undone;
  return Boolean(candidate && !candidate.model.isDisposed() && candidate.model.getAlternativeVersionId() === expected) ||
    (direction === "undo" ? fallback.canUndo() : fallback.canRedo());
}
export function getMountedSource(path: string) {
  return mounted.get(path)?.model.getValue();
}
export async function runVisualHistory(direction: "undo" | "redo", fallbackPath?: string) {
  const fallback = fallbackPath ? mounted.get(fallbackPath) : undefined;
  if (fallback?.readOnly) return false;
  const session = fallback?.session ?? [...mounted.values()].at(-1)?.session;
  if (!session) return false;
  const history = historyFor(session);
  const source = direction === "undo" ? history.undo : history.redo;
  const target = direction === "undo" ? history.redo : history.undo;
  const entry = source.at(-1);
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
export function replaceActiveRange(edit: RangeEdit, group = false) {
  editorFor(edit.path).range.replace(edit, group);
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
export function isReviewing(path: string) {
  return mounted.get(path)?.range.reviewing() ?? false;
}
// Files whose browser draft differs from GitHub, for the changes window.
export function changedFiles() {
  return [...drafts.values()]
    .filter((d) => d.baseSha === null || d.model.getValue() !== d.original)
    .map((d) => ({ path: d.path, created: d.baseSha === null, scopeKey: d.scope ? `${d.scope.repoId}:${d.scope.branch}` : "" }));
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
    replace(edit: RangeEdit, group: boolean) {
      const target = rangeOf(edit);
      if (edit.text === edit.expected) return;
      if (!group) current.model.pushStackElement();
      routedModelChanges.add(current.model);
      try { current.model.pushEditOperations([], [{ range: target, text: edit.text }], () => null); }
      finally { routedModelChanges.delete(current.model); }
      if (!group) current.model.pushStackElement();
      recordVisualEdit(session, file.path, current.model, group);
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
    apply, range, model: current.model, session, readOnly: !!file.readOnly,
    ensureHistoryTarget: file.ensureHistoryTarget,
    refresh: () => update(),
  };
  mounted.set(file.path, registration);
  let mode: "edit" | "review" = "edit";
  let destroyView = () => {};
  const root = node("section", "code-editor");
  root.setAttribute("aria-label", "Source editor");
  const toolbar = node("div", "code-editor__toolbar");
  const undo = button("", () => void runVisualHistory("undo", file.path), "icon-button code-editor__undo");
  undo.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 5 3.5 8.5 7 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 8.5h7a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  undo.setAttribute("aria-label", "Undo");
  undo.title = "Undo";
  const redo = button("", () => void runVisualHistory("redo", file.path), "icon-button code-editor__redo");
  redo.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m13 5 3.5 3.5L13 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 8.5H9a5 5 0 0 0-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
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
  review.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 3a7 7 0 1 1-6.3 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 3v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 6.5V10l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  review.setAttribute("aria-label", file.onHistory ? "History" : "Changes");
  review.title = file.onHistory ? "Commit history for this file" : "Changes on this branch";
  review.id = "history-button";
  if (file.onHistory) {
    review.setAttribute("aria-controls", "changes");
    review.setAttribute("aria-haspopup", "dialog");
    review.setAttribute("aria-expanded", "false");
  }
  const discard = button(
    "Discard changes",
    () => {
      if (
        !confirm(
          current.baseSha === null
            ? "Discard this new file?"
            : "Discard this file’s draft changes? You can undo this in the editor.",
        )
      )
        return;
      if (current.baseSha === null && file.scope) {
        store.remove(file.scope, file.path);
        drafts.delete(file.key);
        file.onDiscardNew?.();
        current.model.dispose();
        return;
      }
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
  const publisher =
    file.scope && !file.readOnly
      ? createPublishMenu({
          scope: file.scope,
          currentPath: file.path,
          saveLabels: file.saveLabels,
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
  if (publisher) {
    toolbar.append(publisher.root);
    publishers.add(publisher.refresh);
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
    const changed =
      current.baseSha === null || current.model.getValue() !== current.original;
    if (file.scope && current.baseSha !== undefined && !file.readOnly) {
      current.persisted = store.save({
        ...file.scope,
        version: 1,
        path: file.path,
        baseSha: current.baseSha,
        original: current.original,
        content: current.model.getValue(),
        updatedAt: Date.now(),
      });
    }
    conflictBar.hidden = !conflict;
    publisher?.refresh();
    const message = file.readOnly ? "Read only" : store.error;
    notice.hidden = !message;
    notice.textContent = message ?? "";
    discard.disabled = !changed || !!file.readOnly;
    undo.disabled = !!file.readOnly || !canRunVisualHistory(session, "undo", current.model);
    redo.disabled = !!file.readOnly || !canRunVisualHistory(session, "redo", current.model);
    reportContext(changes);
  }
  function render(next: typeof mode) {
    destroyView();
    mode = next;
    review.setAttribute("aria-pressed", String(mode === "review"));
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
      editor.restoreViewState(current.view);
      destroyView = () => {
        current.view = editor.saveViewState();
        editor.dispose();
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
    file.onContextChange?.(null);
    publisher?.destroy();
    if (publisher) publishers.delete(publisher.refresh);
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
  for (const sent of submitted) {
    const sha = result.files.find((file) => file.path === sent.path)?.sha;
    if (!sha) continue;
    const key = draftKey(sent, sent.path);
    const open = drafts.get(key);
    const latest = store.get(sent, sent.path);
    // Edits typed during publishing remain a new draft on top of the committed content.
    if (open) {
      open.original = sent.content;
      open.baseSha = sha;
      open.persisted = store.save({
        ...sent,
        baseSha: sha,
        original: sent.content,
        content: open.model.getValue(),
        updatedAt: Date.now(),
      });
    } else if (latest) {
      store.save({
        ...latest,
        baseSha: sha,
        original: sent.content,
        updatedAt: Date.now(),
      });
    }
  }
}
