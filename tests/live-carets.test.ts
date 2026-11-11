// Others' carets in the code pane (ticket am-22): the marks of agents' programs and right-to-left names (names and
// initials: tests/participant.test.ts).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Stylesheets and raw icons load as nothing, and the code panes as none: only the pure helpers run here.
registerHooks({
  load: (url, context, next) => /\.css$|\?raw$/.test(url) ? { format: "module", source: "export default '';", shortCircuit: true }
    : url.endsWith("/components/source-editor.ts") ? { format: "module", source: "export const caretPanes = () => []; export const watchCaretPanes = () => () => {};", shortCircuit: true }
    : next(url, context),
});
const { programMark, rightToLeft } = await import("../src/components/live-carets");

test("each agent's program has its own mark, and any other agent the plain one", () => {
  const [claude, codex, openai, gemini, cursor] = ["claude-code", "codex", "openai-mcp", "gemini-cli", "cursor"].map(programMark);
  assert.equal(new Set([claude, codex, gemini, cursor]).size, 4, "Claude, OpenAI, Gemini and the plain mark differ");
  assert.equal(codex, openai, "Codex and an OpenAI client share OpenAI's mark");
  assert.equal(programMark("Claude Desktop"), claude);
});

test("a name whose first strong letter is written right to left reads right to left", () => {
  assert.equal(rightToLeft("שרה"), true, "Hebrew");
  assert.equal(rightToLeft("سارة"), true, "Arabic");
  assert.equal(rightToLeft("Anna"), false, "Latin");
  assert.equal(rightToLeft("2 שרה"), true, "a digit before Hebrew");
  assert.equal(rightToLeft("«سارة»"), true, "punctuation before Arabic");
  assert.equal(rightToLeft("🦊 Anna"), false, "an emoji before Latin");
});
