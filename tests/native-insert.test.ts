import assert from "node:assert/strict";
import test from "node:test";
import { componentLabel, insertBesideEdit, instanceMarkup, isSectionTemplate, slotMarkup, uniqueDataKey } from "../src/native-insert.ts";

test("a component fits between sections only when its template is one section", () => {
  assert.equal(isSectionTemplate(`<section class="feature"><h2>Hi</h2><section>x</section></section>\n`), true);
  assert.equal(isSectionTemplate(`<!-- feature -->\n<section><p>a</p></section>\n<!-- end -->`), true);
  assert.equal(isSectionTemplate(`<a class="button" href="#/"><slot>Go</slot></a>`), false);
  assert.equal(isSectionTemplate(`<article class="card"><h3>t</h3></article>`), false);
  assert.equal(isSectionTemplate(`<section>a</section><section>b</section>`), false);
  assert.equal(isSectionTemplate(`intro<section>a</section>`), false);
  assert.equal(isSectionTemplate(`<section>unclosed`), false);
  assert.equal(isSectionTemplate(""), false);
});

test("labels and data keys for a new instance", () => {
  assert.equal(componentLabel("feature-block"), "Feature block");
  assert.equal(uniqueDataKey(`<p data-key="x"></p>`, "feature-block"), "feature-block");
  assert.equal(
    uniqueDataKey(`<feature-block data-key="feature-block"></feature-block><i data-key='feature-block-2'></i>`, "feature-block"),
    "feature-block-3",
  );
});

test("inserted markup gets its own line with the neighbour's indentation", () => {
  const source = `<main>\n  <section>a</section>\n  <section>b</section>\n</main>`;
  const second = { start: source.indexOf("<section>b"), end: source.indexOf("</main>") - 1 };
  const before = insertBesideEdit(source, second, "before", "<x-a></x-a>");
  assert.equal(
    source.slice(0, before.start) + before.text + source.slice(before.end),
    `<main>\n  <section>a</section>\n  <x-a></x-a>\n  <section>b</section>\n</main>`,
  );
  const after = insertBesideEdit(source, second, "after", "<x-a></x-a>");
  assert.equal(
    source.slice(0, after.start) + after.text + source.slice(after.end),
    `<main>\n  <section>a</section>\n  <section>b</section>\n  <x-a></x-a>\n</main>`,
  );
  const inline = `<main><section>a</section></main>`;
  const only = { start: 6, end: inline.indexOf("</main>") };
  const edit = insertBesideEdit(inline, only, "after", "<x-a></x-a>");
  assert.equal(inline.slice(0, edit.start) + edit.text + inline.slice(edit.end), `<main><section>a</section>\n<x-a></x-a></main>`);
});

test("a new instance carries its own copy of the template's text slots", () => {
  const template = `<section>
  <h2><slot name="title">What we <em>offer</em></slot></h2>
  <p><slot name="action"><a href="#/about/">Get in touch</a></slot></p>
  <div><slot name="items"><p>Add items.</p></slot></div>
  <slot>Default</slot>
  <slot name="empty"><!-- none --></slot>
</section>`;
  assert.deepEqual(slotMarkup(template), [
    `<span slot="title">What we <em>offer</em></span>`,
    `<span slot="action"><a href="#/about/">Get in touch</a></span>`,
  ]);
  assert.equal(
    instanceMarkup("", "feature-section", template),
    `<feature-section data-key="feature-section">\n  <span slot="title">What we <em>offer</em></span>\n  <span slot="action"><a href="#/about/">Get in touch</a></span>\n</feature-section>`,
  );
  assert.equal(instanceMarkup("", "site-hero", `<section><h2>Fixed</h2></section>`), `<site-hero data-key="site-hero"></site-hero>`);
  // Every line of a multi-line instance takes the neighbour's indentation.
  const source = `<main>\n  <section>a</section>\n</main>`;
  const edit = insertBesideEdit(source, { start: 9, end: 29 }, "after", "<x-a>\n  <span slot=\"t\">T</span>\n</x-a>");
  assert.equal(
    source.slice(0, edit.start) + edit.text + source.slice(edit.end),
    `<main>\n  <section>a</section>\n  <x-a>\n    <span slot="t">T</span>\n  </x-a>\n</main>`,
  );
});
