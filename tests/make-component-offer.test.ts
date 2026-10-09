import assert from "node:assert/strict";
import test from "node:test";
import { makeComponentOffered } from "../src/page-builder/component-model.ts";

test("Make component is offered on ordinary page elements", () => {
  for (const tag of ["section", "article", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "figure", "nav", "aside"]) {
    assert.equal(makeComponentOffered(["html", "body", "main", tag]), true, tag);
  }
});

test("Make component refuses document elements, head content, void elements and instances", () => {
  for (const chain of [
    [], ["html"], ["html", "head"], ["html", "body"], ["html", "body", "main"],
    ["html", "head", "title"], ["html", "head", "div", "p"],
    ...["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]
      .map((tag) => ["html", "body", "main", tag]),
    ["project-card"], ["html", "body", "project-card", "p"],
    ["html", "body", "project-card", "div", "h2"],
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
