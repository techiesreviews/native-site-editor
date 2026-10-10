import { test } from "node:test";
import assert from "node:assert/strict";
import { componentVariants } from "../shared/variants.ts";
import { variantCssMarkers, variantHover, variantSuggestions, variantValueMarkers } from "../src/page-builder/variant-intelligence.ts";

const variants = componentVariants(`:host, :host([data-tone=light]) {} :host([data-tone=dark]) {}
  :host([data-reverse]) {} @media (width > 60rem) { :host([data-layout=image-left]) {} }`).variants;
const lookup = (tag: string) => tag === "section-hero" ? variants : undefined;
const suggest = (marked: string) => {
  const offset = marked.indexOf("|");
  return variantSuggestions(marked.replace("|", ""), offset, lookup);
};
test("component attribute suggestions respect prefix and existing attributes", () => {
  const items = suggest('<section-hero class="x" |');
  assert.deepEqual(items.map(item => item.label), ["data-tone", "data-reverse", "data-layout"]);
  assert.match(items[0].detail, /Tone \(choice\).*light.*dark/);
  assert.match(items[1].detail, /yes-no/);
  assert.equal(items[1].insertText, "data-reverse");
  assert.deepEqual(suggest('<section-hero data-t|').map(item => item.label), ["data-tone"]);
  assert.deepEqual(suggest('<section-hero data-tone="dark" |').map(item => item.label), ["data-reverse", "data-layout"]);
  assert.deepEqual(suggest('<section-hero | data-tone="dark">').map(item => item.label), ["data-reverse", "data-layout"]);
  // A name typed over an existing value keeps the value.
  const over = suggest('<section-hero data-l|="old">');
  assert.deepEqual(over.map(item => [item.label, item.insertText]), [["data-layout", "data-layout"]]);
});
test("a yes/no variant whose CSS only matches \"true\" is suggested with that value", () => {
  const pinned = componentVariants(`:host {} :host([data-pinned="true"]) {}`).variants;
  const [item] = variantSuggestions("<card-tip |>", 10, tag => tag === "card-tip" ? pinned : undefined);
  assert.deepEqual([item.label, item.insertText], ["data-pinned", 'data-pinned="true"']);
  assert.match(item.detail, /data-pinned="true" enables this variant/);
});
test("no suggestions in plain tags, unrelated values, comments or raw text", () => {
  for (const marked of ['<div |>', '<section-unknown |>', '<section-hero class="|">', '<!-- <section-hero |>', '<script>const x="<section-hero |>";</script>', '<style>/* <section-hero |> */</style>', '<section-hero title="a > <section-hero |">', '<textarea><section-hero |></textarea>', '<title><section-hero |></title>']) assert.deepEqual(suggest(marked), []);
  assert.equal(suggest('<!-- ignored --> <section-hero |>').length, 3);
});
test("values describe absent default without inserting it, with quote and prefix support", () => {
  const items = suggest('<section-hero data-tone="|">');
  assert.deepEqual(items.map(item => item.label), ["dark"]);
  assert.match(items[0].detail, /Dark.*Leaving the attribute off: Light.*removing/);
  assert.deepEqual(suggest("<section-hero data-tone='d|'>").map(item => item.label), ["dark"]);
  const conditional = suggest('<section-hero data-layout="|">')[0];
  assert.match(conditional.detail, /only when @media \(width > 60rem\)/);
  assert.match(conditional.detail, /Default look/);
  assert.equal(conditional.start, '<section-hero data-layout="'.length);
  assert.equal(conditional.end, conditional.start);
});
test("hover on names and values shows choices, default and conditions", () => {
  const text = '<section-hero data-tone="dark" data-layout="image-left">';
  for (const offset of [text.indexOf('data-tone') + 2, text.indexOf('dark') + 2]) {
    const hover = variantHover(text, offset, lookup)!;
    assert.match(hover.text, /light: Light.*dark: Dark.*attribute off: Light/);
    assert.equal(hover.start, text.indexOf('data-tone'));
  }
  assert.match(variantHover(text, text.indexOf('image-left'), lookup)!.text, /only when @media/);
  assert.equal(variantHover('<!-- ' + text + ' -->', 10, lookup), undefined);
});
test("unknown choices get a soft Custom note, yes/no accepts any value", () => {
  const text = '<section-hero data-tone="sepia" data-reverse="anything" data-other="x">';
  const markers = variantValueMarkers(text, lookup);
  assert.equal(markers.length, 1);
  assert.equal(text.slice(markers[0].start, markers[0].end), 'sepia');
  assert.match(markers[0].message, /Custom.*kept/);
  assert.deepEqual(variantValueMarkers('<section-hero data-tone="light">', lookup), []);
  assert.deepEqual(variantValueMarkers('<script>' + text + '</script><!-- ' + text + ' --><div data-tone="sepia">', lookup), []);
});
test("CSS warning mapping preserves broken offsets and fix; default warning only for component CSS", () => {
  const css = '\n:host[data-tone=dark] {} :host { &[data-reverse] {} } :host([data-layout=wide]) {}';
  const markers = variantCssMarkers(css, true);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].start, 1);
  assert.match(markers[0].message, /never matches; write :host\(\[data-tone=dark\]\)/);
  assert.match(markers[1].message, /:host\(\[data-reverse\]\)/);
  const noDefault = variantCssMarkers(':host([data-layout=wide]) {}', true);
  assert.match(noDefault[0].message, /no default look/);
  assert.equal(noDefault[0].start, 0);
  assert.equal(variantCssMarkers(css, false).length, 2);
  assert.deepEqual(variantCssMarkers(':host {} :host([data-tone=dark]) {}', true), []);
});
