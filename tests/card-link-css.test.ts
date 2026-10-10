import assert from "node:assert/strict";
import test from "node:test";
import { cardLinkCss } from "../src/page-builder/card-link-css.ts";

const rule = ":host { position: relative; }\n";

test("title links get a positioned host when CSS is missing or has no positioned plain host", () => {
  assert.equal(cardLinkCss(), rule);
  for (const css of ["article { padding: 24px; }\n", ":host { display: block; }\n", ":host { position: static; }\n", ':host([data-look="quote"]) { position: relative; }\n', "/* :host { position: relative; } */\n"]) {
    assert.equal(cardLinkCss(css), css + rule);
  }
});

test("a plain host with non-static positioning keeps its CSS exactly", () => {
  for (const position of ["relative", "absolute", "fixed", "sticky", "relative !important"]) {
    const css = `:host { display: block; position: ${position}; }\n`;
    assert.equal(cardLinkCss(css), css);
  }
});

test("the appended host rule preserves line endings", () => {
  assert.equal(cardLinkCss("article {\r\n color: red;\r\n}"), "article {\r\n color: red;\r\n}\r\n:host { position: relative; }\r\n");
});

test("a positioned host only under a condition, or overridden later, still gets the rule", () => {
  for (const css of ["@media (min-width: 40em) { :host { position: relative; } }\n", ":host { position: relative; }\n:host { position: static; }\n"]) {
    assert.equal(cardLinkCss(css), css + rule);
  }
  // The cascade's winner counts: an important relative beats a later static, and an important static needs an important rule.
  const important = ":host { position: relative !important; }\n:host { position: static; }\n";
  assert.equal(cardLinkCss(important), important);
  const staticImportant = ":host { position: static !important; }\n";
  assert.equal(cardLinkCss(staticImportant), `${staticImportant}:host { position: relative !important; }\n`);
});
