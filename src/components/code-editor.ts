import { cssVariableCompletion, cssVariableDeclarations, cssVariableReference, isCssPath } from "../page-builder/css-intelligence";
import { monaco } from "./monaco";
import type { DraftScope } from "../drafts";
import type { TypingSession } from "../draft-store";
import { node } from "../ui/dom";
import { CODE_POINTER_EVENT, type CodePointer } from "../page-builder/canvas-model";
import { languageFor, mountSourceEditor, onReset, paneOf, useView, type PaneHost, type PaneRender, type PaneViewFactory, type SourceFile } from "./source-editor";

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

// The Monaco view of the source editor (src/components/source-editor.ts):
// importing this module brings Monaco and shows the code of every mounted
// file. The text, drafts and Undo/Redo live in the draft store; a model is
// created from the store's text on demand and owns only typing undo inside
// a code pane (the seam described in src/draft-store.ts). A closed pane's
// model is kept while the history holds its typing steps, so Undo keeps
// stepping through them stop by stop.
export * from "./source-editor";

/** A pause in typing this long closes the typing group as one Undo step. */
export const TYPING_SETTLE_MS = 700;

// Monaco stops its editor worker whenever no model is left, as happens for a
// moment each time one file's editors close and the next file's open, and
// starts a new one (its script fetched again) once the new editor needs it.
// An empty model kept for the page's lifetime keeps the one worker.
monaco.editor.createModel("", "plaintext", monaco.Uri.parse("inmemory://editor/keep-worker"));

// Undo and Redo in a code pane run the shared journal (typing steps keep
// Monaco's own stops there), registered once for every editor: each editor's
// own context keys say whether they route there, and its route runs them.
// Keys registered per editor made Monaco rebuild its keybinding lookup in
// every open editor at each mount and dispose, a good part of opening a file.
const HISTORY_UNDO_KEY = "aseRoutesUndo", HISTORY_REDO_KEY = "aseRoutesRedo";
const historyKeyRoutes = new WeakMap<monaco.editor.ICodeEditor, (direction: "undo" | "redo") => Promise<void>>();
monaco.editor.addEditorAction({ id: "ase.history.undo", label: "Undo", precondition: HISTORY_UNDO_KEY,
  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ], run: (editor) => historyKeyRoutes.get(editor)?.("undo") });
monaco.editor.addEditorAction({ id: "ase.history.redo", label: "Redo", precondition: HISTORY_REDO_KEY,
  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY],
  run: (editor) => historyKeyRoutes.get(editor)?.("redo") });

/**
 * A file's Monaco model, shared by its panes and kept after they close while
 * the history holds its typing steps. Versions given to the store are
 * Monaco's alternative version ids, except that a state the store comes
 * back to (a visual edit undone) keeps the id it first had (`aliases`), so a
 * typing step's stops still line up after edits applied outside Monaco's
 * own undo stack.
 */
interface SharedModel {
  key: string;
  scope: DraftScope;
  path: string;
  stored: boolean;
  model: monaco.editor.ITextModel;
  views: number;
  typing?: TypingSession;
  history?: string;
  aliases: Map<number, number>;
  byRevision: Map<number, number>;
  applying: boolean;
  stepping: boolean;
  timer?: ReturnType<typeof setTimeout>;
  viewState: monaco.editor.ICodeEditorViewState | null;
  /** When a diff editor over this model last closed (its worker diff may still be on its way). */
  diffClosed: number;
  settle(): void;
  dispose(): void;
}
const models = new Map<string, SharedModel>();
/** How long a closed diff's models stay for a worker diff still on its way. */
const DIFF_SETTLE_MS = 3000;
let serial = 0;
onReset(() => { for (const shared of [...models.values()]) shared.dispose(); });

function sharedModel(host: PaneHost): SharedModel {
  let shared = models.get(host.key);
  if (shared && (shared.model.isDisposed() || shared.stored !== host.stored)) { shared.dispose(); shared = undefined; }
  if (!shared) shared = createSharedModel(host);
  else if (shared.model.getValue() !== host.text()) {
    // Out of step (it should not be): the store's text wins, outside Monaco's undo.
    shared.applying = true;
    try { shared.model.applyEdits([{ range: shared.model.getFullModelRange(), text: host.text() }]); }
    finally { shared.applying = false; }
  }
  // Typing goes into the pane's history; a pane mounted in another one starts a new session.
  const kept = shared;
  if (host.stored && !host.readOnly && kept.history !== host.session()) {
    kept.typing?.dispose();
    kept.typing = undefined;
    kept.history = undefined;
    try {
      kept.typing = host.store.beginTyping(host.scope, host.path, host.session(), { version: reported(kept), native: {
        undo: (expected) => stepNative(kept, "undo", expected),
        redo: (expected) => stepNative(kept, "redo", expected),
      } });
      kept.history = host.session();
    } catch { /* Not in the store (dropped meanwhile): nothing to type into. */ }
  }
  return kept;
}
const reported = (shared: SharedModel) => {
  const version = shared.model.getAlternativeVersionId();
  return shared.aliases.get(version) ?? version;
};
// One Monaco undo stop of a committed typing step, asked for by the store.
function stepNative(shared: SharedModel, direction: "undo" | "redo", expected: number) {
  const model = shared.model;
  if (model.isDisposed() || reported(shared) !== expected) return undefined;
  model.pushStackElement();
  if (!(direction === "undo" ? model.canUndo() : model.canRedo())) return undefined;
  shared.stepping = true;
  try {
    const result = model[direction]();
    if (result) void result.catch(() => {});
  } finally { shared.stepping = false; }
  return { text: model.getValue(), version: reported(shared) };
}
function createSharedModel(host: PaneHost): SharedModel {
  const store = host.store;
  const model = monaco.editor.createModel(host.text(), languageFor(host.path), monaco.Uri.parse(`inmemory://editor/${++serial}/${host.path}`));
  const shared: SharedModel = {
    key: host.key, scope: host.scope, path: host.path, stored: host.stored, model, views: 0,
    aliases: new Map(), byRevision: new Map(), applying: false, stepping: false, viewState: null, diffClosed: 0,
    settle() {
      clearTimeout(shared.timer);
      shared.timer = undefined;
      if (model.isDisposed() || !shared.typing) return;
      // The settle point is an Undo stop: Undo comes back to exactly here.
      model.pushStackElement();
      shared.typing.commit();
    },
    dispose() {
      clearTimeout(shared.timer);
      shared.typing?.dispose();
      shared.typing = undefined;
      content.dispose();
      unsubscribe();
      // A diff closed a moment ago may still be computed in the worker, which
      // fails on a model disposed under it: such a model goes a little later.
      if (!model.isDisposed()) {
        if (Date.now() - shared.diffClosed < DIFF_SETTLE_MS) setTimeout(() => model.dispose(), DIFF_SETTLE_MS);
        else model.dispose();
      }
      if (models.get(shared.key) === shared) models.delete(shared.key);
    },
  };
  // Typing (and Monaco's own undo of uncommitted typing) goes to the store at once.
  const content = model.onDidChangeContent(() => {
    if (shared.applying || shared.stepping || !shared.typing) return;
    shared.typing.input(model.getValue(), reported(shared));
    clearTimeout(shared.timer);
    shared.timer = setTimeout(() => shared.settle(), TYPING_SETTLE_MS);
  });
  // Every other change (a visual edit, Undo/Redo, an operation, Discard)
  // comes from the store, outside Monaco's undo stack.
  const unsubscribe = store.subscribe((event) => {
    if (model.isDisposed()) return;
    if (event.type === "history") {
      if (!shared.views && (!shared.stored || !store.hasTyping(shared.scope, shared.path))) { shared.dispose(); return; }
      // The journal moved (a step recorded, run or cleared): Monaco's open undo
      // group ends here too, so its stops never span two store steps.
      if (event.history === shared.history) model.pushStackElement();
      return;
    }
    if (event.key !== shared.key) return;
    if (event.type === "file") {
      if ((event.change === "dropped" || event.change === "forgotten") && !shared.views) shared.dispose();
      return;
    }
    if (event.origin !== "typing" && model.getValue() !== event.text) {
      // A change from outside Monaco's undo stack: typing before it is one stop,
      // typing after it another (the store has already committed the first).
      model.pushStackElement();
      shared.applying = true;
      try {
        if (event.changes) model.applyEdits(event.changes.map((change) => ({
          range: monaco.Range.fromPositions(model.getPositionAt(change.start), model.getPositionAt(change.end)), text: change.text })));
        if (model.getValue() !== event.text) model.applyEdits([{ range: model.getFullModelRange(), text: event.text }]);
      } finally { shared.applying = false; }
      const known = shared.byRevision.get(event.revision);
      if (known !== undefined) shared.aliases.set(model.getAlternativeVersionId(), known);
      shared.typing?.sync(reported(shared));
    }
    if (!shared.byRevision.has(event.revision)) shared.byRevision.set(event.revision, reported(shared));
  });
  models.set(host.key, shared);
  return shared;
}

/** The Monaco view of a mounted file (see source-editor.ts `useView`). */
export const monacoView: PaneViewFactory = (host) => {
  const shared = sharedModel(host);
  shared.views++;
  const model = shared.model;
  const store = host.store;
  let disposed = false;
  let view: monaco.editor.ICodeEditor | undefined;
  let destroyView = () => {};
  let marks: string[] = [];
  let elementMarks: string[] = [];
  const cssProviders: monaco.IDisposable[] = [];
  if (isCssPath(host.path) && host.cssWorkspace) {
    const workspaceFor = (target: monaco.editor.ITextModel) => {
      if (disposed || target.isDisposed() || target !== model || !host.isCurrent()) return;
      const workspace = host.cssWorkspace?.();
      // A host may update its source map in place while openDefinition awaits.
      return workspace && { ...workspace, sources: { ...workspace.sources }, orderedPaths: [...workspace.orderedPaths] };
    };
    const range = (target: monaco.editor.ITextModel, start: number, end: number) =>
      monaco.Range.fromPositions(target.getPositionAt(start), target.getPositionAt(end));
    const language = model.getLanguageId();
    cssProviders.push(monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ["-"],
      provideCompletionItems(target, position) {
        const workspace = workspaceFor(target);
        const token = workspace && cssVariableCompletion(target.getValue(), target.getOffsetAt(position), host.path);
        if (!workspace || !token) return { suggestions: [] };
        const declarations = cssVariableDeclarations(workspace);
        const names = [...new Set(declarations.map(item => item.name))].filter(name => name.startsWith(token.prefix));
        return { suggestions: names.map(name => ({
          label: name, kind: monaco.languages.CompletionItemKind.Variable,
          insertText: token.wrap ? `var(${name})` : name,
          range: range(target, token.start, token.end),
          detail: declarations.filter(item => item.name === name).map(item => `${item.path}: ${item.value}`).join("; "),
        })) };
      },
    }));
    cssProviders.push(monaco.languages.registerHoverProvider(language, {
      provideHover(target, position) {
        const workspace = workspaceFor(target);
        const token = workspace && cssVariableReference(target.getValue(), target.getOffsetAt(position), host.path);
        if (!workspace || !token) return;
        const declarations = cssVariableDeclarations(workspace).filter(item => item.name === token.name);
        if (!declarations.length) return;
        return { range: range(target, token.start, token.end), contents: declarations.map(item => ({
          value: `**${item.path.replace(/[\\`*_{}[\]()<>]/g, "\\$&")}**\n\n`,
        })).flatMap((heading, index) => [heading, { value: "```css\n" + declarations[index].name + ": " + declarations[index].value.replace(/`/g, "\\`") + "\n```" }]) };
      },
    }));
    cssProviders.push(monaco.languages.registerDefinitionProvider(language, {
      async provideDefinition(target, position, cancellation) {
        const workspace = workspaceFor(target);
        const token = workspace && cssVariableReference(target.getValue(), target.getOffsetAt(position), host.path);
        if (!workspace || !token || cancellation?.isCancellationRequested) return;
        const version = target.getVersionId();
        const definitions = cssVariableDeclarations(workspace).filter(item => item.name === token.name);
        const locations: monaco.languages.Location[] = [];
        const targets: { path: string; registration: object; model: monaco.editor.ITextModel; version: number; source: string }[] = [];
        const requesterCurrent = () => {
          const fresh = workspaceFor(target);
          return !cancellation?.isCancellationRequested && !!fresh && fresh.revision === workspace.revision && target.getVersionId() === version &&
            Object.keys(workspace.sources).every(path => fresh.sources[path] === workspace.sources[path]) &&
            Object.keys(fresh.sources).length === Object.keys(workspace.sources).length;
        };
        const paneModel = (path: string) => {
          const pane = paneOf(path);
          const found = pane && models.get(pane.key)?.model;
          return pane && found && !found.isDisposed() ? { pane, model: found } : undefined;
        };
        for (const definition of definitions) {
          let found = paneModel(definition.path);
          if (!found || found.model.getValue() !== workspace.sources[definition.path]) {
            try {
              if (!await workspace.openDefinition(definition.path, definition.start, definition.end, workspace.revision)) return;
            } catch { return; }
            found = paneModel(definition.path);
          }
          if (!requesterCurrent()) return;
          if (!found || found.pane.session !== host.session() || found.model.getValue() !== workspace.sources[definition.path]) return;
          targets.push({ path: definition.path, registration: found.pane.registration, model: found.model, version: found.model.getVersionId(), source: workspace.sources[definition.path] });
          locations.push({ uri: found.model.uri, range: range(found.model, definition.start, definition.end) });
        }
        // A later host await may replace or edit a target already accumulated.
        if (!requesterCurrent() || targets.some(item => paneOf(item.path)?.registration !== item.registration ||
          paneModel(item.path)?.model !== item.model || paneOf(item.path)?.session !== host.session() || item.model.isDisposed() ||
          item.model.getVersionId() !== item.version || item.model.getValue() !== item.source)) return;
        return locations;
      },
    }));
  }
  // Undo and Redo keys in the pane run the shared journal: typing first
  // closes as one step (its Monaco stops kept), so the two never interleave.
  function routeHistory(direction: "undo" | "redo") {
    shared.settle();
    return host.runHistory(direction).then(() => {});
  }
  function guardHistoryKeys(editor: monaco.editor.IStandaloneCodeEditor) {
    const routes = !host.readOnly;
    editor.createContextKey(HISTORY_UNDO_KEY, routes);
    editor.createContextKey(HISTORY_REDO_KEY, routes);
    historyKeyRoutes.set(editor, routeHistory);
    // The editor's command palette lists them too; their keys are the shared actions'.
    const actions = [
      editor.addAction({ id: "ase.history.undo", label: "Undo", precondition: HISTORY_UNDO_KEY, run: () => routeHistory("undo") }),
      editor.addAction({ id: "ase.history.redo", label: "Redo", precondition: HISTORY_REDO_KEY, run: () => routeHistory("redo") }),
    ];
    return () => {
      for (const action of actions) action.dispose();
      if (historyKeyRoutes.get(editor) === routeHistory) historyKeyRoutes.delete(editor);
    };
  }
  const reportSoon = () => queueMicrotask(() => { if (!disposed) host.reportContext(); });
  function render(next: PaneRender) {
    destroyView();
    host.body.replaceChildren();
    const canvas = node("div", "code-editor__canvas");
    host.body.append(canvas);
    const options: monaco.editor.IStandaloneEditorConstructionOptions = {
      automaticLayout: true,
      theme: "astro-editor",
      overviewRulerBorder: false,
      renderLineHighlight: "none",
      scrollbar: { useShadows: false },
      fontSize: 14,
      padding: { top: 16 },
      scrollBeyondLastLine: false,
      readOnly: host.readOnly,
      ariaLabel: host.readOnly ? "Symbolic link target" : "File source",
      minimap: { enabled: false },
    };
    if (next.mode === "edit") {
      const editor = monaco.editor.create(canvas, { ...options, model });
      view = editor;
      const unguard = guardHistoryKeys(editor);
      editor.onDidChangeCursorSelection(reportSoon);
      if (model.getLanguageId() === "html") linkToCanvas(editor, host.path, model);
      if (shared.viewState) editor.restoreViewState(shared.viewState);
      else if (model.getLanguageId() === "html") {
        const lines = defaultFoldLines(model.getValue());
        if (lines.length)
          void editor.getAction("editor.fold")?.run({ selectionLines: lines, levels: 1 });
      }
      destroyView = () => {
        unguard();
        shared.viewState = editor.saveViewState();
        editor.dispose();
        view = undefined;
      };
    } else if (next.mode === "version" && next.version) {
      const labels = node("div", "code-editor__diff-labels");
      labels.append(node("span", "", `${next.version.label} · read only`), node("span", "", "Current version · read only"));
      host.body.prepend(labels);
      const original = monaco.editor.createModel(next.version.content, model.getLanguageId());
      const editor = monaco.editor.createDiffEditor(canvas, { ...options, readOnly: true, renderSideBySide: true, originalEditable: false });
      editor.setModel({ original, modified: model });
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
        shared.diffClosed = Date.now();
        setTimeout(() => original.dispose(), DIFF_SETTLE_MS);
        view = undefined;
      };
    } else {
      const labels = node("div", "code-editor__diff-labels");
      labels.append(node("span", "", next.originalLabel), node("span", "", "Your draft"));
      host.body.prepend(labels);
      const original = monaco.editor.createModel(next.original, model.getLanguageId());
      const editor = monaco.editor.createDiffEditor(canvas, { ...options, minimap: { enabled: false }, renderSideBySide: true, originalEditable: false });
      editor.setModel({ original, modified: model });
      const modified = editor.getModifiedEditor();
      view = modified;
      const unguard = guardHistoryKeys(modified as monaco.editor.IStandaloneCodeEditor);
      modified.onDidChangeCursorSelection(reportSoon);
      destroyView = () => {
        unguard();
        editor.setModel(null);
        editor.dispose();
        shared.diffClosed = Date.now();
        setTimeout(() => original.dispose(), DIFF_SETTLE_MS);
        view = undefined;
      };
    }
  }
  const markers = monaco.editor.onDidChangeMarkers((uris) => {
    if (uris.some((uri) => uri.toString() === model.uri.toString())) host.reportContext();
  });
  const at = (start: number, end: number) => monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
  return {
    render,
    select(start, end) {
      const target = at(start, end);
      model.pushStackElement();
      view?.setSelection(target);
      view?.revealRangeInCenter(target);
    },
    selectEdited(start, end) {
      view?.setSelection(at(start, end));
    },
    reveal(start, end) {
      const target = at(start, end);
      view?.setSelection(monaco.Range.fromPositions(target.getStartPosition(), target.getStartPosition()));
      view?.revealRangeNearTop(target);
    },
    focus() {
      view?.focus();
    },
    highlight(ranges) {
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
    markElement(tag, reveal) {
      const target = tag && at(tag.start, tag.end);
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
    selection() {
      const selection = view?.getSelection();
      return selection
        ? { startLine: selection.startLineNumber, startColumn: selection.startColumn, endLine: selection.endLineNumber, endColumn: selection.endColumn }
        : null;
    },
    diagnostics() {
      return monaco.editor
        .getModelMarkers({ resource: model.uri })
        .slice(0, 50)
        .map((marker) => ({
          severity: monaco.MarkerSeverity[marker.severity].toLowerCase(),
          message: marker.message.slice(0, 2000),
          line: marker.startLineNumber,
          column: marker.startColumn,
        }));
    },
    dispose() {
      if (disposed) return;
      // Closing the file settles its typing now, while the model is still this file's.
      shared.settle();
      disposed = true;
      destroyView();
      if (!model.isDisposed() && (marks.length || elementMarks.length)) model.deltaDecorations([...marks, ...elementMarks], []);
      markers.dispose();
      for (const provider of cssProviders) provider.dispose();
      shared.views--;
      // Kept while the history can still step through its typing stop by stop.
      if (!shared.views && (!shared.stored || !store.get(shared.scope, shared.path) || !store.hasTyping(shared.scope, shared.path))) shared.dispose();
    },
  };
};

/** Mounts `file` with its code shown in Monaco at once. */
export function mountCodeEditor(host: HTMLElement, file: SourceFile, toolbarHost?: HTMLElement | null) {
  useView(monacoView);
  return mountSourceEditor(host, file, toolbarHost);
}
// Monaco is here: the panes already mounted show their code.
useView(monacoView);
