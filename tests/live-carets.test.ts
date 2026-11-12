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
const { boxesMeet, holds, pressArea, programMark, rightToLeft } = await import("../src/components/live-carets");

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

test("a circle's press area reaches up from the caret's line (down from it for a tag below) and meets the controls it touches", () => {
  const circle = { left: 100, right: 118, top: 50, bottom: 68 };
  // The 24 px area: centred on the circle, its foot 2 px above the circle's, so it reaches 8 px above the circle.
  assert.deepEqual(pressArea(circle, 24, 24, false), { left: 97, right: 121, top: 42, bottom: 68 });
  // Below the caret it hangs from 2 px under the circle's top.
  assert.deepEqual(pressArea(circle, 24, 24, true), { left: 97, right: 121, top: 50, bottom: 76 });
  // An area smaller than the circle is the circle.
  assert.deepEqual(pressArea(circle, 10, 10, false), circle);
  const bold = { left: 120, right: 150, top: 40, bottom: 70 };
  assert.equal(boxesMeet(pressArea(circle, 24, 24, false), bold), true, "the area's edge reaches the control the circle itself does not touch");
  assert.equal(boxesMeet(pressArea(circle, 10, 10, false), bold), false, "the circle alone does not");
  assert.equal(boxesMeet({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 10, right: 20, top: 0, bottom: 10 }), false, "boxes that only share an edge do not meet");
  const point = { left: 109, right: 109, top: 59, bottom: 59 };
  assert.equal(holds({ left: 100, right: 150, top: 40, bottom: 70 }, point), true, "a control holds the circle's middle");
  assert.equal(holds({ left: 110, right: 150, top: 40, bottom: 70 }, point), false, "a control only touching the circle's edge does not");
});
