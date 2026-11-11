import assert from "node:assert/strict";
import test from "node:test";
import { cssChangeRequest, cssProblem, liveCss, revertCopy } from "../src/catalogue/css-file.ts";

// The design board's CSS section (src/catalogue/css-file.ts): a part's own component CSS file, edited by hand and
// shown on its live cell only, and the change request "Send to agent" copies.

const BUTTON = `/* A note: with a colon */
@layer tokens, elements, components;

@layer components {
  .button {
    --btn-radius: var(--radius);
    border-radius: var(--btn-radius);
    &:active:not(:disabled) { background: red; }
    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) { background: blue }
    }
  }
}
`;

test("the reverting copy sets every declaration back to the layer before, and keeps selectors and at-rules", () => {
  const copy = revertCopy(BUTTON);
  assert.doesNotMatch(copy, /var\(--radius\)|red|blue|A note/);
  assert.match(copy, /--btn-radius: revert-layer;/);
  assert.match(copy, /border-radius: revert-layer;/);
  assert.match(copy, /&:active:not\(:disabled\) \{ background: revert-layer; \}/);
  // The last declaration of a block needs no semicolon in the file; the copy still reverts it.
  assert.match(copy, /&:hover:not\(:disabled\) \{ background: revert-layer;\s*\}/);
  assert.match(copy, /@media \(hover: hover\) and \(pointer: fine\) \{/);
  assert.match(copy, /@layer components \{/);
  assert.doesNotMatch(copy, /@layer tokens, elements, components;/);
});

test("a value with a semicolon in quotes or brackets stays one declaration", () => {
  const copy = revertCopy(`.a { content: "x;y"; background: url(data:image/png;base64,AAA); color: red }`);
  assert.equal(copy.trim(), ".a { content: revert-layer; background: revert-layer; color: revert-layer; }");
});

test("the live CSS cancels the file's rules inside the scope, then applies the edited file there", () => {
  const edited = BUTTON.replace("var(--radius)", "20px");
  const css = liveCss(BUTTON, edited, '.stage[data-part="button"]');
  const [cancel, apply] = css.split("\n:where(");
  assert.ok(cancel.startsWith(':where(.stage[data-part="button"]) {'));
  assert.match(cancel, /border-radius: revert-layer;/);
  assert.ok(apply.startsWith('.stage[data-part="button"]) {'));
  assert.match(apply, /--btn-radius: 20px;/);
  // Order statements cannot sit inside a rule; the layers' order is the page's own.
  assert.doesNotMatch(css, /@layer tokens, elements, components;/);
});

test("a problem: unbalanced braces or a closing tag would leave the live cell's scope, so they are refused", () => {
  assert.equal(cssProblem(BUTTON), "");
  assert.equal(cssProblem(".a { color: red; } }  body { display: none }"), "A } closes a rule that was never opened");
  assert.equal(cssProblem(".a { color: red;"), "A { is never closed");
  assert.equal(cssProblem(".a { content: \"}\" }"), "");
  assert.equal(cssProblem("/* } */ .a { color: red }"), "");
  assert.equal(cssProblem(".a { color: red } </style><script>"), "A closing tag cannot be in a stylesheet");
  assert.equal(cssProblem(".a { content: \"open"), "A quote is never closed");
  // As the browser reads them: an escaped brace and one inside an unquoted url() are text, so the brace after them
  // closes the rule and the next one is a stray.
  assert.equal(cssProblem(".a { color: red\\{ } } body { display: none }"), "A } closes a rule that was never opened");
  assert.equal(cssProblem(".a { background: url({) } } body { display: none }"), "A } closes a rule that was never opened");
  assert.equal(cssProblem(".a { background: url( \"x{\" ) }"), "");
});

test("Send to agent copies the changed lines and the whole file as edited; nothing when the file is unchanged", () => {
  const part = { id: "button", name: "Button" };
  assert.equal(cssChangeRequest(part, "src/ui/parts/button.css", BUTTON, BUTTON), "");
  const edited = BUTTON.replace("var(--radius)", "20px");
  const request = cssChangeRequest(part, "src/ui/parts/button.css", BUTTON, edited);
  assert.match(request, /^Design board change request\nPart: Button \(data-part="button"\)\nFile: src\/ui\/parts\/button\.css\n/);
  assert.match(request, /\n- {4}--btn-radius: var\(--radius\);\n\+ {4}--btn-radius: 20px;\n/);
  assert.ok(request.includes(`\`\`\`css\n${edited.trimEnd()}\n\`\`\``), "the whole file as edited");
  assert.match(request, /Tried on the board's live cell only; nothing is in the code yet\.$/);
});
