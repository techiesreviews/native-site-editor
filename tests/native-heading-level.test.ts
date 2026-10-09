import test from "node:test";
import assert from "node:assert/strict";
import { nativeHeadingLevel } from "../src/page-builder/native-operations.ts";

test("a Heading directly in a Section defaults to h2, including hero and empty sections", () => {
  for (const heading of ['<h2>Projects</h2>', '<h1>Studio</h1>', '']) {
    const source = `<!doctype html><html><head><title>Studio</title></head><body><main><section class="flow">${heading}</section></main></body></html>`;
    assert.equal(nativeHeadingLevel(source, [0, 0]), 2);
  }
});

test("component instances take one level below the section base, ignoring Div depth", () => {
  const source = '<main><section class="flow"><h2>Projects</h2><div class="cards"><div><card-project><h3 slot="title">Project</h3></card-project></div></div></section><section-feature><article>Feature</article></section-feature></main>';
  assert.equal(nativeHeadingLevel(source, [0, 0, 1, 0, 0]), 3);
  assert.equal(nativeHeadingLevel(source, [0, 1]), 3);
  for (const [heading, expected] of [[1, 2], [3, 4], [6, 4]] as const) {
    const section = `<main><section><h${heading}>Projects</h${heading}><div class="cards"><card-project></card-project></div></section></main>`;
    assert.equal(nativeHeadingLevel(section, [0, 0, 1, 0]), expected);
  }
});

test("unresolvable paths and unparseable source have no Heading level", () => {
  const source = '<main><section><h2>Projects</h2></section></main>';
  for (const path of [[0, 1], [0, -1], [0, 0.5], [0, 0, 0, 0]]) {
    assert.equal(nativeHeadingLevel(source, path), undefined);
  }
  assert.equal(nativeHeadingLevel('<main><section><div></section></main>', [0, 0]), undefined);
});

test("the first section heading sets the base, including direct header and hgroup headings", () => {
  const hero = '<main><section><h1>Studio</h1><div class="flow"><div class="flow"></div></div></section></main>';
  assert.equal(nativeHeadingLevel(hero, [0, 0, 1]), 2);
  assert.equal(nativeHeadingLevel(hero, [0, 0, 1, 0]), 3);
  for (const wrapper of ['header', 'hgroup']) {
    const source = `<main><section><${wrapper}><p>Selected work</p><h3>Projects</h3></${wrapper}><h2>Later heading</h2><div class="cards"></div></section></main>`;
    assert.equal(nativeHeadingLevel(source, [0, 0, 2]), 4);
  }
  const wrapped = '<main><section><header><div><h3>Projects</h3></div></header><div></div></section></main>';
  assert.equal(nativeHeadingLevel(wrapped, [0, 0, 1]), 4);
  const nested = '<main><section><div><h6>Card title</h6></div><h2>Projects</h2><article><figure><div></div></figure></article></section></main>';
  assert.equal(nativeHeadingLevel(nested, [0, 0, 2, 0, 0]), 3);
  const inner = '<main><section><h6>Outer</h6><div><section><h1>Inner</h1><div></div></section></div></section></main>';
  assert.equal(nativeHeadingLevel(inner, [0, 0, 1, 0, 1]), 2);
});

test("Div depth raises the Heading level with or without a section heading, capped at h4", () => {
  for (const heading of ['<h2>Projects</h2>', '']) {
    const source = `<main><section class="flow">${heading}<div class="cards"><div class="flow"><div class="flow"></div></div></div></section></main>`;
    const div = heading ? 1 : 0;
    assert.equal(nativeHeadingLevel(source, [0, 0, div]), 3);
    assert.equal(nativeHeadingLevel(source, [0, 0, div, 0]), 4);
    assert.equal(nativeHeadingLevel(source, [0, 0, div, 0, 0]), 4);
  }
  assert.equal(nativeHeadingLevel('<main><div class="flow"></div></main>', [0, 0]), 3);
  assert.equal(nativeHeadingLevel('<main><article><header></header></article></main>', [0]), 2);
});
