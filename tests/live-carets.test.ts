// Others' carets in the code pane (ticket am-22): the marks of agents' programs and a person's first letter.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Stylesheets and raw icons load as nothing, and the code panes as none: only the pure helpers run here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true }
    : url.endsWith("/components/source-editor.ts") ? { format: "module", source: "export const caretPanes = () => []; export const watchCaretPanes = () => () => {};", shortCircuit: true }
    : next(url, context),
});
const { initialOf, programMark } = await import("../src/components/live-carets");

test("each agent's program has its own mark, and any other agent the plain one", () => {
  const [claude, codex, openai, gemini, cursor] = ["claude-code", "codex", "openai-mcp", "gemini-cli", "cursor"].map(programMark);
  assert.equal(new Set([claude, codex, gemini, cursor]).size, 4, "Claude, OpenAI, Gemini and the plain mark differ");
  assert.equal(codex, openai, "Codex and an OpenAI client share OpenAI's mark");
  assert.equal(programMark("Claude Desktop"), claude);
});

test("a person's circle holds the first character a reader sees, upper-cased to one letter", () => {
  assert.deepEqual(initialOf("anna"), { first: "a", letter: "A", rest: "nna" });
  // A decomposed É stays one letter with its accent.
  assert.deepEqual(initialOf("Émile"), { first: "É", letter: "É", rest: "mile" });
  // "ß" upper-cases to "SS": the circle keeps one.
  assert.equal(initialOf("ßen").letter, "S");
  // A flag emoji is never cut in half.
  assert.deepEqual(initialOf("🇳🇱 Lex"), { first: "🇳🇱", letter: "🇳🇱", rest: " Lex" });
  assert.deepEqual(initialOf(""), { first: "", letter: "", rest: "" });
});
