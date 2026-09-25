import assert from "node:assert/strict";
import test from "node:test";
import { componentLabel, indentUnit, insertBesideEdit, instanceMarkup, isSectionTemplate, sectionMarkup, slotMarkup, uniqueDataKey } from "../src/native-insert.ts";

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

test("a plain section: heading and paragraph placeholders, unique keys, the neighbour's indentation unit", () => {
  assert.equal(
    sectionMarkup(""),
    `<section data-key="section">\n  <h2 data-key="section-title">Something worth sharing</h2>\n  <p data-key="section-text">Start writing here.</p>\n</section>`,
  );
  // The inner keys share the section's own key as their base, and each is unique on its own.
  assert.equal(
    sectionMarkup(`<section data-key="section"></section><p data-key="section-2-text"></p>`, "\t"),
    `<section data-key="section-2">\n\t<h2 data-key="section-2-title">Something worth sharing</h2>\n\t<p data-key="section-2-text-2">Start writing here.</p>\n</section>`,
  );
  const spaces = `<main>\n  <section>\n    <h1>T</h1>\n  </section>\n</main>`;
  const section = { start: spaces.indexOf("<section>"), end: spaces.indexOf("</section>") + 10 };
  assert.equal(indentUnit(spaces, section), "  ");
  const four = `<main>\n    <section>\n        <h1>T</h1>\n    </section>\n</main>`;
  assert.equal(indentUnit(four, { start: four.indexOf("<section>"), end: four.indexOf("</section>") + 10 }), "    ");
  const tabs = `<main>\n\t<section>\n\t\t<h1>T</h1>\n\t</section>\n</main>`;
  assert.equal(indentUnit(tabs, { start: tabs.indexOf("<section>"), end: tabs.indexOf("</section>") + 10 }), "\t");
  // No indented child line, an inline section, or no neighbour: two spaces.
  assert.equal(indentUnit(`<main>\n  <section><h1>T</h1></section>\n</main>`, { start: 9, end: 36 }), "  ");
  assert.equal(indentUnit(spaces, undefined), "  ");
  // Every line of the section takes the neighbour's indentation, as one edit.
  const edit = insertBesideEdit(spaces, section, "before", sectionMarkup(spaces, indentUnit(spaces, section)));
  assert.equal(
    spaces.slice(0, edit.start) + edit.text + spaces.slice(edit.end),
    `<main>\n  <section data-key="section">\n    <h2 data-key="section-title">Something worth sharing</h2>\n    <p data-key="section-text">Start writing here.</p>\n  </section>\n  <section>\n    <h1>T</h1>\n  </section>\n</main>`,
  );
});

test("a CRLF page gets CRLF in inserted markup", () => {
  const source = `<main>\r\n  <section>a</section>\r\n  <section>b</section>\r\n</main>`;
  const second = { start: source.indexOf("<section>b"), end: source.indexOf("</main>") - 2 };
  const section = sectionMarkup(source, indentUnit(source, second));
  assert.equal(section.includes("\r\n"), true);
  assert.equal(/[^\r]\n/.test(section), false);
  const edit = insertBesideEdit(source, second, "before", section);
  const out = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  assert.equal(
    out,
    `<main>\r\n  <section>a</section>\r\n  <section data-key="section">\r\n    <h2 data-key="section-title">Something worth sharing</h2>\r\n    <p data-key="section-text">Start writing here.</p>\r\n  </section>\r\n  <section>b</section>\r\n</main>`,
  );
  // Markup written with bare newlines is normalised to the page's endings.
  const after = insertBesideEdit(source, second, "after", "<x-a>\n  <span slot=\"t\">T</span>\n</x-a>");
  assert.equal(after.text, `\r\n  <x-a>\r\n    <span slot="t">T</span>\r\n  </x-a>`);
  assert.equal(instanceMarkup(source, "x-a", `<a><slot name="t">T</slot></a>`), `<x-a data-key="x-a">\r\n  <span slot="t">T</span>\r\n</x-a>`);
});
