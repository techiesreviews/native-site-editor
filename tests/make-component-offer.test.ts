import assert from "node:assert/strict";
import test from "node:test";
import { makeComponentOffered } from "../src/page-builder/component-model.ts";

test("Make component is offered on each page container kind", () => {
  for (const tag of ["section", "div", "article", "aside", "figure", "nav"]) {
    assert.equal(makeComponentOffered(["html", "body", "main", tag]), true, tag);
  }
});

test("Make component refuses text, images, links, buttons, lists, forms and other non-containers", () => {
  for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "button", "img",
    "ul", "ol", "li", "blockquote", "form", "label", "input", "select", "textarea", "fieldset",
    "strong", "em", "small", "code", "pre", "figcaption", "dl", "dt", "dd", "table", "video", "svg"]) {
    assert.equal(makeComponentOffered(["html", "body", "main", "section", tag]), false, tag);
  }
});

test("Make component refuses document elements, head content, void elements and instances", () => {
  for (const chain of [
    [], ["html"], ["html", "head"], ["html", "body"], ["html", "body", "main"],
    ["html", "head", "title"], ["html", "head", "div"], ["html", "head", "section"],
    ...["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]
      .map((tag) => ["html", "body", "main", tag]),
    ["project-card"], ["html", "body", "project-card", "p"],
    ["html", "body", "project-card", "div", "h2"],
    ...["section", "div", "article", "aside", "figure", "nav", "header", "footer"]
      .map((tag) => ["html", "body", "main", "project-card", tag]),
  ]) {
    assert.equal(makeComponentOffered(chain), false, chain.join(" > "));
  }
});

test("Make component refuses page header and footer but offers sectioning headers and footers", () => {
  for (const tag of ["header", "footer"]) {
    for (const ancestors of [[], ["html", "body"], ["html", "body", "div"]]) {
      assert.equal(makeComponentOffered([...ancestors, tag]), false, [...ancestors, tag].join(" > "));
    }
    for (const ancestor of ["article", "aside", "main", "nav", "section"]) {
      assert.equal(makeComponentOffered(["html", "body", ancestor, "div", tag]), true, ancestor + " > " + tag);
    }
  }
});
