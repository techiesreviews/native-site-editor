import assert from "node:assert/strict";
import test from "node:test";
import { makeComponentOffered, makeComponentPlan, parseSource } from "../src/page-builder/component-model.ts";
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

function positionedBand(markup: string, css: string) {
  const element = parseSource(markup).find(node => node.type === "element");
  assert.ok(element?.type === "element");
  const range = { tag: element.tag, start: element.start, end: element.end, close: element.close };
  const plan = makeComponentPlan(markup, range, "site-band");
  assert.ok(!("error" in plan));
  return withPageCss(plan, markup, range, "site-band", [{ path: "styles/site.css", source: css }]);
}

test("sticky and fixed band positioning follows the host, including conditional offsets and original specificity", () => {
  for (const band of ["header", "footer"]) for (const position of ["sticky", "fixed"]) {
    const plan = positionedBand(`<${band} class="band"><h2>Title</h2></${band}>`, `
      .band { position: ${position}; inset-block-start: 0; z-index: 20; }
      ${band} { z-index: 1; }
      @media (max-width: 40em) { .band { position: static; inset-block-start: auto; } }
    `);
    assert.match(plan.css, new RegExp(`:host \\{\\s+position: ${position};`));
    assert.ok(plan.css.indexOf("z-index: 1;") < plan.css.indexOf("z-index: 20;"));
    assert.match(plan.css, /@media \(max-width: 40em\) \{\s+:host \{\s+position: static;\s+inset-block-start: auto;/);
    assert.match(plan.template, new RegExp(`<${band}[^>]*style="position: static !important"`));
    assert.match(plan.notes.join(" "), /positioning, offsets and z-index moved to the component host/);
  }
});

test("inline important positioning moves to the host without dropping other inline styles", () => {
  const plan = positionedBand('<header style="position: sticky !important; top: 0; z-index: 30; padding: 1rem"><h2>Title</h2></header>', "");
  assert.match(plan.css, /:host \{\s+position: sticky !important;\s+top: 0;\s+z-index: 30;/);
  assert.ok(!plan.template.includes("position: sticky"));
  assert.match(plan.template, /style="top: 0; z-index: 30; padding: 1rem; position: static !important"/);
});

test("state-dependent band positioning is left in place with a plan note", () => {
  const plan = positionedBand("<header><h2>Title</h2></header>", "header { position: sticky; top: 0; } header:hover { top: 2rem; }");
  assert.match(plan.notes.join(" "), /state-dependent positioning was not moved/);
  assert.ok(!plan.css.includes("position: static !important"));
});

test("a full-width fixed band's width also reaches its host", () => {
  const plan = positionedBand('<header><h2>Title</h2></header>', "header { position: fixed; top: 0; left: 0; width: 100%; }");
  assert.match(plan.css, /:host \{\s+position: fixed;\s+top: 0;\s+left: 0;\s+width: 100%;/);
});

test("variable-based band positioning is left in place with an explicit limitation note", () => {
  for (const [markup, css] of [
    ["<header><h2>Title</h2></header>", "header { --pin: sticky; position: var(--pin); top: 0; }"],
    ['<header style="--pin: sticky; position: var(--pin); top: 0"><h2>Title</h2></header>', ""],
  ]) {
    const plan = positionedBand(markup, css);
    assert.match(plan.notes.join(" "), /variable-based positioning was not moved to the host; sticky positioning may be bounded by the component's height/);
    assert.ok(!plan.template.includes("position: static !important"));
  }
});
