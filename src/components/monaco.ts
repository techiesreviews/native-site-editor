import * as monaco from "monaco-editor";
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
