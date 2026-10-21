import assert from "node:assert/strict";
import test from "node:test";
import { descendants, makeComponentOffered, makeComponentPlan, parseSource } from "../src/page-builder/component-model.ts";
import { withPageCss } from "../src/page-builder/component-css.ts";

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
    ["html", "head", "header"], ["html", "head", "footer"],
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

test("Make component offers page headers and footers as well as sectioning headers and footers", () => {
  for (const tag of ["header", "footer"]) {
    for (const ancestors of [[], ["html", "body"], ["html", "body", "div"]]) {
      assert.equal(makeComponentOffered([...ancestors, tag]), true, [...ancestors, tag].join(" > "));
    }
    for (const ancestor of ["article", "aside", "main", "nav", "section"]) {
      assert.equal(makeComponentOffered(["html", "body", ancestor, "div", tag]), true, ancestor + " > " + tag);
    }
  }
});

function bandPlan(markup: string, css = "") {
  const element = [...descendants(parseSource(markup))].find(node => node.name === "header" || node.name === "footer");
  assert.ok(element);
  const range = { tag: element.tag, start: element.start, end: element.end, close: element.close };
  const plan = makeComponentPlan(markup, range, "site-band");
  assert.ok(!("error" in plan));
  return withPageCss(plan, markup, range, "site-band", [{ path: "styles/site.css", source: css }]);
}

test("page header/footer hosts make no box, including through document and div ancestors", () => {
  for (const band of ["header", "footer"]) for (const [open, close] of [
    ["", ""], ["<html><body>", "</body></html>"], ["<html><body><div>", "</div></body></html>"],
  ]) {
    assert.equal(bandPlan(`${open}<${band}><h2>Title</h2></${band}>${close}`).css, ":host {\n  display: contents;\n}\n");
  }
});

test("sectioning header/footer hosts retain the ordinary block layout", () => {
  for (const ancestor of ["article", "aside", "main", "nav", "section"]) for (const band of ["header", "footer"]) {
    assert.equal(bandPlan(`<${ancestor}><div><${band}><h2>Title</h2></${band}></div></${ancestor}>`).css, ":host {\n  display: block;\n}\n");
  }
});

test("inline positioning and custom properties stay on the inner band", () => {
  const style = "--pin: sticky; position: var(--pin) !important; top: 0; z-index: 30; padding: 1rem";
  const plan = bandPlan(`<header style="${style}"><h2>Title</h2></header>`);
  assert.ok(plan.template.includes(`style="${style}"`));
  assert.equal(plan.css, ":host {\n  display: contents;\n}\n");
  assert.deepEqual(plan.notes, []);
});

test("hover-dependent offsets and responsive fixed widths never become unconditional host styles", () => {
  for (const css of [
    "header { --pin: sticky; position: var(--pin); --offset: 0px; top: var(--offset); } header:hover { --offset: 20px; }",
    "header { position: fixed; top: 0; left: 0; width: 100%; } @media (max-width: 40em) { header { width: auto; } }",
  ]) {
    const plan = bandPlan("<header><h2>Title</h2></header>", css);
    assert.equal(plan.css, ":host {\n  display: contents;\n}\n");
    assert.ok(!plan.template.includes("position: static"));
    assert.deepEqual(plan.notes, []);
  }
});
