// Trimmed Monaco build: only the editor contributions and languages the code
// panes use. Importing "monaco-editor" pulls editor.main.js, which registers
// every contribution (gpu, inline completions, code lens, inlay hints, ...)
// and all ~84 basic-language grammars.
//
// The trap that broke an earlier hand-picked set: contributions inject service
// singletons (ICodeLensCache, ITreeViewsDnDService, IOutlineModelService, ...).
// A set that keeps a contribution but loses the module registering a service it
// injects throws "[createInstance] ... depends on UNKNOWN service" when an
// editor mounts. In monaco-editor 0.56 each such registration is imported by
// the module that injects it, and the core services come from editor.api.js
// (standaloneServices.js), so every line below pulls its own services with it.
//
// The second trap: the language features' worker manager imports
// internal/common/workers.js, which side-effect imports nearly every
// contribution again. vite-monaco-trim.ts strips those imports, or the first
// HTML/CSS/JSON/JS model would quietly load the full set.
//
// After changing this list, run tests/native-save/native-monaco-features.spec.ts
// against the production build (npm run build:ui, then ASE_NATIVE_SAVE_DIST=1).
// The dev server's dependency pre-bundling can merge modules and keep a dropped
// contribution alive, so only the build shows what ships. The monaco-lsp-client
// re-export is omitted: the app never uses `monaco.lsp`.
//
// Dropped: anchor select, code lens (no provider), diff-editor breadcrumbs,
// floating menu, gpu, inline completions and suggest-as-inline,
// inline progress, in-place replace, insert final newline, inspect tokens,
// iPad keyboard, linked editing (off by
// default), long-lines helper, middle-click scroll, placeholder text,
// minimap section headers (no minimap), semantic tokens (no
// provider for our languages), high-contrast toggle, force retokenize, and the
// marker-selection context key.
import * as monaco from "monaco-editor/editor/editor.api.js";

// The codicon font and its modifiers (folding chevrons, widget icons).
import "monaco-editor/features/codicon/register.js";

// --- Core ----------------------------------------------------------------------
import "monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js";
// Cursor moves, selection, typing, undo/redo, Tab: every basic key.
import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/common/standaloneStrings.js";
// Save's compare view and the history version view (createDiffEditor).
import "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution.js";
// "Cannot edit in read-only editor" in read-only views (symlinks, diffs).
import "monaco-editor/editor/contrib/readOnlyMessage/browser/contribution.js";
// The right-click menu, and Cut / Copy / Paste in it and on the keys.
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
// Paste as plain text through the paste controller clipboard.js already loads.
import "monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js";
// Editable panes keep Monaco's default-enabled plain-text and path drops.
import "monaco-editor/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.js";

// --- Navigation and editing keys ------------------------------------------------
// Find / replace (Ctrl+F, Ctrl+H, F3), with the find widget's tab-order fix.
import "monaco-editor/features/find/register.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
// The head and sections open folded (editor.fold), and the gutter toggles.
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
// Ctrl+/ and Shift+Alt+A.
import "monaco-editor/editor/contrib/comment/browser/comment.js";
// Ctrl+D, Alt+click, Ctrl+Alt+Up/Down, Ctrl+Shift+L.
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
// Alt+Up/Down move, Shift+Alt+Up/Down copy, Ctrl+Shift+K delete, Ctrl+Enter.
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
// Ctrl+Left/Right and Ctrl+Backspace/Delete by word.
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
// Preserve existing platform bindings and command-palette editing actions.
import "monaco-editor/editor/contrib/wordPartOperations/browser/wordPartOperations.js";
import "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js";
import "monaco-editor/editor/contrib/caretOperations/browser/transpose.js";
import "monaco-editor/editor/contrib/caretOperations/browser/caretOperations.js";
import "monaco-editor/editor/contrib/indentation/browser/indentation.js";
import "monaco-editor/editor/contrib/fontZoom/browser/fontZoom.js";
// Ctrl+L, and Shift+Alt+Left/Right expand and shrink selection.
import "monaco-editor/editor/contrib/lineSelection/browser/lineSelection.js";
import "monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js";
// Drag a selection to move it.
import "monaco-editor/editor/contrib/dnd/browser/dnd.js";
// Ctrl+G go to line, and F1 / the context menu's Command Palette.
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js";
// Sticky scroll and inlay hints are enabled by Monaco's defaults. Document
// symbols supply the outline service used by sticky scroll and Go to Symbol.
import "monaco-editor/editor/contrib/documentSymbols/browser/documentSymbols.js";
import "monaco-editor/editor/contrib/stickyScroll/browser/stickyScrollContribution.js";
import "monaco-editor/editor/contrib/inlayHints/browser/inlayHintsContribution.js";
// Ctrl+M: Tab moves focus out of the editor (keyboard accessibility).
import "monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js";

// --- Language features (HTML, CSS, JSON, JS/TS IntelliSense, our providers) -------
// Completions (incl. the CSS variable provider) and snippet insertion.
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/snippet/browser/snippetController2.js";
// Signature help for JS.
import "monaco-editor/editor/contrib/parameterHints/browser/parameterHints.js";
// Hovers: CSS variable values, diagnostics, JS types.
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
// Diagnostics: F8 / Shift+F8 and the hover's "View Problem".
import "monaco-editor/editor/contrib/gotoError/browser/gotoError.js";
// Quick fixes from the CSS and TS services (light bulb, Ctrl+.).
import "monaco-editor/editor/contrib/codeAction/browser/codeActionContributions.js";
// Go to definition (F12, Ctrl+click: the CSS variable provider) and peek /
// find references (Shift+F12) for JS.
import "monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js";
import "monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import "monaco-editor/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js";
// F2 rename (CSS, JS) and Shift+Alt+F format (HTML, CSS, JSON, JS).
import "monaco-editor/editor/contrib/rename/browser/rename.js";
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
// Color swatches and the picker in CSS.
import "monaco-editor/editor/contrib/colorPicker/browser/colorPickerContribution.js";
// Ctrl+click on href / src / url() targets.
import "monaco-editor/editor/contrib/links/browser/links.js";
// Highlights of the other occurrences of the word under the cursor.
import "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js";
// Invisible / confusable characters and stray line separators, on by default.
import "monaco-editor/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js";
import "monaco-editor/editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js";

// --- Language intelligence (worker-backed) ---------------------------------------
import "monaco-editor/languages/features/css/register.js";
import "monaco-editor/languages/features/html/register.js";
import "monaco-editor/languages/features/json/register.js";
// JS IntelliSense stays (lean-fast-editor ticket 12): ts.worker loads only
// when a JS or TS file opens.
import "monaco-editor/languages/features/typescript/register.js";

// --- Syntax highlighting for the ids languageFor() in code-editor.ts maps to ---
import "monaco-editor/languages/definitions/typescript/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/css/register.js";
import "monaco-editor/languages/definitions/scss/register.js";
import "monaco-editor/languages/definitions/html/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";

import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

import { watchEditorTheme } from "../theme";

watchEditorTheme(({ dark, colors }) => {
  const color = (name: keyof typeof colors) => colors[name];
  monaco.editor.defineTheme("astro-editor", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": color("surface"),
      "editor.foreground": color("text"),
      "editorGutter.background": color("surface"),
      "editorLineNumber.foreground": color("muted"),
      "editor.selectionBackground": color("selected"),
      "editorOverviewRuler.findMatchForeground": color("focus"),
      "focusBorder": color("focus"),
      "editorWidget.background": color("surface-raised"),
      "editorWidget.foreground": color("text"),
      "editorHoverWidget.background": color("surface-raised"),
      "editorHoverWidget.foreground": color("text"),
      "editorSuggestWidget.background": color("surface-raised"),
      "editorSuggestWidget.foreground": color("text"),
      "editorSuggestWidget.selectedBackground": color("selected"),
      "editorOverviewRuler.border": "#00000000",
      "editorWidget.border": "#00000000",
      "editorHoverWidget.border": "#00000000",
      "editorSuggestWidget.border": "#00000000",
      "diffEditor.border": "#00000000",
    },
  });
  monaco.editor.setTheme("astro-editor");
});

(
  self as typeof self & {
    MonacoEnvironment: {
      getWorker: (moduleId: string, label: string) => Worker;
    };
  }
).MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "html") return new HtmlWorker();
    if (label === "css" || label === "scss" || label === "less")
      return new CssWorker();
    if (label === "json") return new JsonWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

export { monaco };
