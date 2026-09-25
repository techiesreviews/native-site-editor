import assert from "node:assert/strict";
import test from "node:test";
import { componentLabel, insertBesideEdit, insertIntoEmptyEdit, instanceMarkup, isSectionTemplate, slotMarkup } from "../src/native-insert.ts";
import { elementEnd, startTags } from "../src/native-source-location.ts";

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

test("labels for a new instance", () => {
  assert.equal(componentLabel("feature-block"), "Feature block");
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
    `<a slot="action" href="#/about/">Get in touch</a>`,
    `<p slot="items">Add items.</p>`,
  ]);
  // Only a fallback that is exactly one element takes the slot itself.
  assert.deepEqual(slotMarkup(`<slot name="a"><a href="#x">One</a> <a href="#y">Two</a></slot><slot name="b">Go <a href="#z">here</a></slot><slot name="c"><br></slot>`), [
    `<span slot="a"><a href="#x">One</a> <a href="#y">Two</a></span>`,
    `<span slot="b">Go <a href="#z">here</a></span>`,
    `<span slot="c"><br></span>`,
  ]);
  // A slot holding a whole heading or paragraph copies that element, so the
  // page source shows a heading; one holding blocks of blocks stays in the template.
  const hero = `<section>
  <slot name="title"><h1 class="big" data-key="hero-title">A <em>clear</em> headline</h1></slot>
  <slot name="lead"><p data-key="hero-lead">Who it is for.</p></slot>
  <slot name="list"><ul><li>One</li></ul></slot>
  <slot name="box"><p><div>Block</div></p></slot>
</section>`;
  assert.deepEqual(slotMarkup(`<slot name="image"><img src="src/images/a.svg" alt="" data-key="split-image"></slot>`), [`<img slot="image" src="src/images/a.svg" alt="">`]);
  assert.deepEqual(slotMarkup(hero), [
    `<h1 slot="title" class="big">A <em>clear</em> headline</h1>`,
    `<p slot="lead">Who it is for.</p>`,
  ]);
  // Neither the instance nor the copied fallbacks get a data-key.
  assert.equal(
    instanceMarkup(`<site-hero><h1 slot="title" data-key="hero-title">x</h1></site-hero>`, "site-hero", hero),
    `<site-hero>\n  <h1 slot="title" class="big">A <em>clear</em> headline</h1>\n  <p slot="lead">Who it is for.</p>\n</site-hero>`,
  );
  assert.equal(
    instanceMarkup("", "feature-section", template),
    `<feature-section>\n  <span slot="title">What we <em>offer</em></span>\n  <a slot="action" href="#/about/">Get in touch</a>\n  <p slot="items">Add items.</p>\n</feature-section>`,
  );
  assert.equal(instanceMarkup("", "site-hero", `<section><h2>Fixed</h2></section>`), `<site-hero></site-hero>`);
  // Every line of a multi-line instance takes the neighbour's indentation.
  const source = `<main>\n  <section>a</section>\n</main>`;
  const edit = insertBesideEdit(source, { start: 9, end: 29 }, "after", "<x-a>\n  <span slot=\"t\">T</span>\n</x-a>");
  assert.equal(
    source.slice(0, edit.start) + edit.text + source.slice(edit.end),
    `<main>\n  <section>a</section>\n  <x-a>\n    <span slot="t">T</span>\n  </x-a>\n</main>`,
  );
});

test("a CRLF page gets CRLF in inserted markup", () => {
  const source = `<main>\r\n  <section>a</section>\r\n  <section>b</section>\r\n</main>`;
  const second = { start: source.indexOf("<section>b"), end: source.indexOf("</main>") - 2 };
  const instance = instanceMarkup(source, "x-a", `<section><slot name="t">T</slot><slot name="u">U</slot></section>`);
  assert.equal(instance.includes("\r\n"), true);
  assert.equal(/[^\r]\n/.test(instance), false);
  const edit = insertBesideEdit(source, second, "before", instance);
  const out = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  assert.equal(
    out,
    `<main>\r\n  <section>a</section>\r\n  <x-a>\r\n    <span slot="t">T</span>\r\n    <span slot="u">U</span>\r\n  </x-a>\r\n  <section>b</section>\r\n</main>`,
  );
  // Markup written with bare newlines is normalised to the page's endings.
  const after = insertBesideEdit(source, second, "after", "<x-a>\n  <span slot=\"t\">T</span>\n</x-a>");
  assert.equal(after.text, `\r\n  <x-a>\r\n    <span slot="t">T</span>\r\n  </x-a>`);
  assert.equal(instanceMarkup(source, "x-a", `<a><slot name="t">T</slot></a>`), `<x-a>\r\n  <span slot="t">T</span>\r\n</x-a>`);
});

test("a <main> without sections gets a section at its end: after its last child, or inside it when empty", () => {
  const apply = (source: string, edit: { start: number; end: number; text: string } | undefined) =>
    edit ? source.slice(0, edit.start) + edit.text + source.slice(edit.end) : undefined;
  // A heading-only page: the place after <main>'s last child.
  const heading = `<site-header></site-header>\n<main class="page" data-key="main">\n  <h1 data-key="title">About</h1>\n</main>\n`;
  const tags = startTags(heading);
  const h1 = elementEnd(heading, tags, tags.findIndex((tag) => tag.name === "h1"), heading.length)!;
  assert.equal(
    apply(heading, insertBesideEdit(heading, h1, "after", instanceMarkup(heading, "feature-block", `<section><slot name="t">T</slot></section>`))),
    `<site-header></site-header>\n<main class="page" data-key="main">\n  <h1 data-key="title">About</h1>\n` +
      `  <feature-block>\n    <span slot="t">T</span>\n  </feature-block>\n</main>\n`,
  );
  // An empty <main>, indented or not, with or without blank space inside.
  const main = (source: string) => {
    const all = startTags(source);
    return elementEnd(source, all, all.findIndex((tag) => tag.name === "main"), source.length)!;
  };
  const empty = `<div>\n  <main id="main">\n  </main>\n</div>`;
  assert.equal(apply(empty, insertIntoEmptyEdit(empty, main(empty), "<x-a>\n  <span slot=\"t\">T</span>\n</x-a>")),
    `<div>\n  <main id="main">\n    <x-a>\n      <span slot="t">T</span>\n    </x-a>\n  </main>\n</div>`);
  assert.equal(apply("<main></main>", insertIntoEmptyEdit("<main></main>", main("<main></main>"), "<x-a></x-a>")), "<main>\n  <x-a></x-a>\n</main>");
  const crlf = "<main>\r\n</main>";
  assert.equal(apply(crlf, insertIntoEmptyEdit(crlf, main(crlf), "<x-a></x-a>")), "<main>\r\n  <x-a></x-a>\r\n</main>");
  // Text alone stays before the new line; element children mean it is not empty.
  assert.equal(apply("<main>Hi </main>", insertIntoEmptyEdit("<main>Hi </main>", main("<main>Hi </main>"), "<x-a></x-a>")), "<main>Hi\n  <x-a></x-a>\n</main>");
  assert.equal(insertIntoEmptyEdit(heading, main(heading), "<x-a></x-a>"), undefined);
});
