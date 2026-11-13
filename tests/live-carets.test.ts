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
const { overControlState, pressArea } = await import("../src/components/live-carets");
const { paintCaret, programMark, rightToLeft } = await import("../src/components/caret-flag");

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
  const area = pressArea(circle, 24, 24, false);
  const control = (left: number, right: number, top = 40, bottom = 70) => ({ left, right, top, bottom });
  assert.equal(overControlState(circle, area, [control(120, 150)]), "pad", "only the press area's edge reaches the control");
  assert.equal(overControlState(circle, pressArea(circle, 10, 10, false), [control(120, 150)]), undefined, "the circle alone is clear of it");
  assert.equal(overControlState(circle, area, [control(105, 150)]), "circle", "the circle's middle (109, 59) is over the control");
  assert.equal(overControlState(circle, area, [control(110, 150)]), "pad", "a control only touching the circle's edge is not over its middle");
  assert.equal(overControlState(circle, area, [control(200, 230), control(105, 150)]), "circle", "any control over the middle decides");
  assert.equal(overControlState(circle, area, []), undefined, "no controls, no giving way");
  assert.equal(overControlState({ left: 0, right: 10, top: 0, bottom: 10 }, { left: 0, right: 10, top: 0, bottom: 10 }, [control(10, 20, 0, 10)]), undefined, "boxes that only share an edge do not meet");
});

test("a guest's caret takes their chip's colours and Lex's the editor's own; a presence colour is left to the CSS (TOOLS-219)", () => {
  const style = new Map<string, string>();
  const root = { dataset: {} as Record<string, string>, style: { setProperty: (name: string, value: string) => style.set(name, value), removeProperty: (name: string) => style.delete(name) } };
  // eslint-disable-next-line no-restricted-syntax -- Node has no DOM; paintCaret reads only the dataset and style it is given.
  const paint = (colour: string) => paintCaret(root as unknown as HTMLElement, colour);
  paint("g1");
  assert.equal(root.dataset.colour, "g1");
  assert.deepEqual(Object.fromEntries(style), { "--live-caret": "var(--guest-2)", "--live-caret-pin": "var(--guest-2-pin)", "--live-caret-ink": "var(--guest-2-ink)" });
  paint("host");
  assert.deepEqual(Object.fromEntries(style), { "--live-caret": "var(--primary)", "--live-caret-pin": "var(--primary)", "--live-caret-ink": "var(--on-primary)" });
  paint("1");
  assert.equal(root.dataset.colour, "1");
  assert.equal(style.size, 0, "the presence colours come from live-carets.css");
});
