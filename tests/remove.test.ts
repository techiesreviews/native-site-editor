import assert from "node:assert/strict";
import { test } from "node:test";
import { pageRemovable, selectionAfterRemove, templateRemoval } from "../src/page-builder/remove";

test("removal selects next, previous, then parent, without changing its input", () => {
  const node = [0, 2, 1];
  assert.deepEqual(selectionAfterRemove(node, true), [0, 2, 1]);
  assert.deepEqual(selectionAfterRemove(node, false), [0, 2, 0]);
  assert.deepEqual(selectionAfterRemove([0, 2, 0], false), [0, 2]);
  assert.deepEqual(selectionAfterRemove([0], false), []);
  assert.deepEqual(node, [0, 2, 1]);
});

test("page removal protects main, page landmarks, and instance contents", () => {
  for (const chain of [["body", "main"], ["body", "header"], ["body", "div", "footer"],
    ["body", "site-header"], ["body", "site-footer"], ["body", "main", "section-hero", "h1"],
    ["body", "main", "section-work", "div", "card-project"], ["head", "title"], ["body"]]) {
    assert.equal(pageRemovable(chain), false, chain.join(" > "));
  }
  for (const chain of [["body", "main", "p"], ["body", "main", "section"], ["body", "main", "div", "card-project"],
    ["body", "main", "section-hero"], ["body", "article", "header"], ["body", "main", "footer"], ["body", "p"]]) {
    assert.equal(pageRemovable(chain), true, chain.join(" > "));
  }
});

const template = `<section><slot name="eyebrow"><p>Welcome</p></slot><div><slot name="title"><h2>Title</h2></slot><slot name="body"><p>Body</p></slot></div><p>Last</p></section>`;
const home = `<main><section-hero><p slot="eyebrow">Hello</p><h2 slot="title">Home</h2><p slot="body">Content</p></section-hero></main>`;
const files = { "index.html": home, "about.html": home.replace("Hello", "About"), "other.html": "<p>Unrelated</p>",
  "components/other/other.html": home };

test("removing a slot's element removes its wrapper and every fill", () => {
  const plan = templateRemoval(template, [0, 0, 0], files, "section-hero")!;
  assert.equal(plan.source, template.replace('<slot name="eyebrow"><p>Welcome</p></slot>', ""));
  assert.deepEqual(plan.slots, ["eyebrow"]);
  assert.deepEqual(plan.select, [0, 0]);
  assert.equal(plan.pages.get("index.html"), home.replace('<p slot="eyebrow">Hello</p>', ""));
  assert.equal(plan.pages.size, 3);
  assert.equal(plan.pages.has("other.html"), false);
  assert.equal(files["index.html"], home);
});

test("removing a container removes both slots and their fills in one plan", () => {
  const plan = templateRemoval(template, [0, 1], files, "section-hero")!;
  assert.deepEqual(plan.slots, ["title", "body"]);
  assert.equal(plan.source, '<section><slot name="eyebrow"><p>Welcome</p></slot><p>Last</p></section>');
  assert.equal(plan.pages.get("index.html"), '<main><section-hero><p slot="eyebrow">Hello</p></section-hero></main>');
  assert.deepEqual(plan.select, [0, 1]);
});

test("template root and nested instance parts refuse; fixed parts and nested instances remove", () => {
  assert.equal(templateRemoval(template, [0], files, "section-hero"), undefined);
  const nested = '<section><card-project><p slot="body">Fill</p></card-project><p>Fixed</p></section>';
  assert.equal(templateRemoval(nested, [0, 0, 0], files, "section-hero"), undefined);
  assert.deepEqual(templateRemoval(nested, [0, 0], files, "section-hero")?.select, [0, 0]);
  const fixed = templateRemoval(nested, [0, 1], files, "section-hero")!;
  assert.deepEqual(fixed.slots, []);
  assert.equal(fixed.pages.size, 0);
  assert.deepEqual(fixed.select, [0, 0]);
});

test("a part inside a slot's element, or one of several fallback elements, goes alone", () => {
  const deep = '<section><slot name="lead"><div><p>One</p><p>Two</p></div></slot></section>';
  const inner = templateRemoval(deep, [0, 0, 0, 1], files, "section-hero")!;
  assert.equal(inner.source, '<section><slot name="lead"><div><p>One</p></div></slot></section>');
  assert.deepEqual(inner.slots, []);
  assert.equal(inner.pages.size, 0);
  assert.deepEqual(inner.select, [0, 0, 0, 0]);
  const items = '<section><slot><article>A</article><article>B</article></slot></section>';
  const one = templateRemoval(items, [0, 0, 0], files, "section-hero")!;
  assert.equal(one.source, '<section><slot><article>B</article></slot></section>');
  assert.deepEqual(one.slots, []);
  assert.deepEqual(one.select, [0, 0, 0]);
});

test("after a removal the next slot's element is selected, not its <slot>", () => {
  const hero = '<section><slot name="eyebrow"><p>E</p></slot><slot name="title"><h1>T</h1></slot></section>';
  assert.deepEqual(templateRemoval(hero, [0, 0, 0], files, "section-hero")?.select, [0, 0, 0]);
  const fixed = '<section><p>Fixed</p><slot name="title"><h1>T</h1></slot></section>';
  assert.deepEqual(templateRemoval(fixed, [0, 0], files, "section-hero")?.select, [0, 0, 0]);
});

test("a slot name with spaces still finds every page's fill", () => {
  const spaced = '<section><slot name=" title "><h1>T</h1></slot><p>Fixed</p></section>';
  const page = '<main><section-hero><h1 slot=" title ">Home</h1></section-hero></main>';
  const plan = templateRemoval(spaced, [0, 0, 0], { "index.html": page }, "section-hero")!;
  assert.deepEqual(plan.slots, [" title "]);
  assert.equal(plan.pages.get("index.html"), "<main><section-hero></section-hero></main>");
});
