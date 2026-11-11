import assert from "node:assert/strict";
import test from "node:test";
import { cssChangeRequest, cssProblem } from "../src/catalogue/css-file.ts";

// The design board's CSS section (src/catalogue/css-file.ts): what is wrong with a hand-edited component CSS file,
// and the change request "Send to agent" copies.

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

test("a problem: a brace, quote, comment or url( that does not close is named, as the browser reads braces", () => {
  assert.equal(cssProblem(BUTTON), "");
  assert.equal(cssProblem(".a { color: red; } }  body { display: none }"), "A } closes a rule that was never opened");
  assert.equal(cssProblem(".a { color: red;"), "A { is never closed");
  assert.equal(cssProblem(".a { content: \"}\" }"), "");
  assert.equal(cssProblem("/* } */ .a { color: red }"), "");
  assert.equal(cssProblem(".a { content: \"open"), "A quote is never closed");
  // As the browser reads them: an escaped brace and one inside an unquoted url() are text, so the brace after them
  // closes the rule and the next one is a stray.
  assert.equal(cssProblem(".a { color: red\\{ } } body { display: none }"), "A } closes a rule that was never opened");
  assert.equal(cssProblem(".a { background: url({) } } body { display: none }"), "A } closes a rule that was never opened");
  assert.equal(cssProblem(".a { background: url( \"x{\" ) }"), "");
  assert.equal(cssProblem(".a { background: url(a\\){) } } body { display: none }"), "A } closes a rule that was never opened");
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
