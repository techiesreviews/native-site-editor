// Selective Monaco build. Importing "monaco-editor" pulls editor.main.js, which
// eagerly registers every editor contribution and all ~84 basic-language
// grammars. We instead import the base API and register only the contributions
// this source editor actually surfaces and the languages it opens, keeping the
// full standard editing experience while dropping features we never expose
// (GPU rendering, inline/AI completions, code lens, inlay hints) and grammars
// for file types the site editor never edits.
import * as monaco from "monaco-editor/editor/editor.api.js";

// --- Editor contributions (curated subset of editor.main.js) ---------------
import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js";
import "monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/caretOperations/browser/caretOperations.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/codeAction/browser/codeActionContributions.js";
import "monaco-editor/editor/contrib/colorPicker/browser/colorPickerContribution.js";
import "monaco-editor/editor/contrib/comment/browser/comment.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js";
import "monaco-editor/editor/contrib/dnd/browser/dnd.js";
import "monaco-editor/editor/contrib/documentSymbols/browser/documentSymbols.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/floatingMenu/browser/floatingMenu.contribution.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/format/browser/formatActions.js";
import "monaco-editor/editor/contrib/gotoError/browser/gotoError.js";
import "monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus.js";
import "monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js";
import "monaco-editor/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/editor/contrib/inPlaceReplace/browser/inPlaceReplace.js";
import "monaco-editor/editor/contrib/indentation/browser/indentation.js";
import "monaco-editor/editor/contrib/lineSelection/browser/lineSelection.js";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/editor/contrib/linkedEditing/browser/linkedEditing.js";
import "monaco-editor/editor/contrib/links/browser/links.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/parameterHints/browser/parameterHints.js";
import "monaco-editor/editor/contrib/readOnlyMessage/browser/contribution.js";
import "monaco-editor/editor/contrib/rename/browser/rename.js";
import "monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens.js";
import "monaco-editor/editor/contrib/semanticTokens/browser/viewportSemanticTokens.js";
import "monaco-editor/editor/contrib/smartSelect/browser/smartSelect.js";
import "monaco-editor/editor/contrib/snippet/browser/snippetController2.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/tokenization/browser/tokenization.js";
import "monaco-editor/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.js";
import "monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js";
import "monaco-editor/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js";
import "monaco-editor/editor/common/standaloneStrings.js";

// --- Language intelligence (LSP-backed features) ---------------------------
import "monaco-editor/languages/features/css/register.js";
import "monaco-editor/languages/features/html/register.js";
import "monaco-editor/languages/features/json/register.js";
import "monaco-editor/languages/features/typescript/register.js";

// --- Syntax highlighting for the languages the editor maps to --------------
import "monaco-editor/languages/definitions/typescript/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/css/register.js";
import "monaco-editor/languages/definitions/scss/register.js";
import "monaco-editor/languages/definitions/less/register.js";
import "monaco-editor/languages/definitions/html/register.js";
import "monaco-editor/languages/definitions/handlebars/register.js";
import "monaco-editor/languages/definitions/razor/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/mdx/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";
import "monaco-editor/languages/definitions/xml/register.js";

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
      "editorBracketMatch.background": color("selected"),
      "editorBracketMatch.border": color("focus"),
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
