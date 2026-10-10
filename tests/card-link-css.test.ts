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
