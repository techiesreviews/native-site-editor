import { test } from "node:test";
import assert from "node:assert/strict";
import { startTags } from "../shared/html-source.ts";
import { attributeEdit } from "../src/page-builder/component-model.ts";
import { bandVariantFields, buttonVariantFields, instanceVariantFields, isToneBand, variantAttribute } from "../src/page-builder/variant-fields.ts";

const templates: Record<string, string> = {
  "section-split": "<section><slot></slot></section>",
  "card-tip": "<article><slot></slot></article>",
  "site-header": "<!-- banner --><header><slot></slot></header>",
  "site-footer": "<footer><slot></slot></footer>",
};
const template = (tag: string) => templates[tag];

test("only outer page sections and page headers/footers are bands", () => {
  const cases: [string[], boolean][] = [
    [["main", "section"], true],
    [["main", "section-split"], true],
    [["main", "card-tip"], false],
    [["body", "header"], true],
    [["body", "footer"], true],
    [["body", "site-header"], true],
    [["body", "site-footer"], true],
    [["body", "div", "header"], true],
    [["article", "header"], false],
    [["aside", "footer"], false],
    [["main", "header"], false],
    [["nav", "footer"], false],
    [["section", "header"], false],
    [["section", "section"], false],
    [["section", "section-split"], false],
    [["section-split", "section"], false],
    [["card-tip", "section"], false],
    [["header", "section"], false],
    [["site-footer", "section-split"], false],
    [["article", "header", "section"], true],
    [[], false],
  ];
  for (const [chain, expected] of cases) {
    assert.equal(isToneBand(chain, true, template), expected, chain.join(" > "));
    assert.equal(isToneBand(chain, false, template), false, "template file: " + chain.join(" > "));
  }
});

const sheets = [{ path: "tones.css", source: '[data-tone=light] {} [data-tone=brand] {} [data-tone=dark] {} [data-color-scheme=dark] {}' }];

test("without a CSS default, No tone removes the attribute and Light writes light", () => {
  const [absent] = bandVariantFields(sheets, []);
  assert.deepEqual(absent.options.map(({ label }) => label), ["No tone (follows the page)", "Light", "Brand", "Dark"]);
  assert.deepEqual(absent.options[0], { label: "No tone (follows the page)", value: "" });
  assert.equal(absent.value, "");
  assert.equal(variantAttribute(absent, "=light"), "light");
  assert.equal(variantAttribute(absent, ""), undefined);
  const source = '<section data-tone="brand"><h2>Band</h2></section>';
  const edit = attributeEdit(source, startTags(source)[0], absent.attribute, variantAttribute(absent, ""));
  assert.equal(source.slice(0, edit.start) + edit.text + source.slice(edit.end), '<section><h2>Band</h2></section>');
  const lightEdit = attributeEdit(source, startTags(source)[0], absent.attribute, variantAttribute(absent, "=light"));
  assert.equal(source.slice(0, lightEdit.start) + lightEdit.text + source.slice(lightEdit.end), '<section data-tone="light"><h2>Band</h2></section>');
  const [written] = bandVariantFields(sheets, [{ name: "data-tone", value: "light" }]);
  assert.equal(written.value, "=light");
  assert.deepEqual(written.options.find(({ value }) => value === "=light"), { label: "Light", value: "=light" });
});

test("CSS-declared tone defaults keep their label and remove the attribute", () => {
  for (const value of ["light", "dark"]) {
    const defaults = [{ path: "tones.css", source: `:not([data-tone]), [data-tone=${value}] {} [data-tone=brand] {}` }];
    const [tone] = bandVariantFields(defaults, []);
    assert.deepEqual(tone.options, [{ label: `${value === "light" ? "Light" : "Dark"} (default)`, value: "" }, { label: "Brand", value: "=brand" }]);
    assert.equal(variantAttribute(tone, ""), undefined);
    const [written] = bandVariantFields(defaults, [{ name: "data-tone", value }]);
    assert.equal(written.value, `=${value}`);
    assert.equal(written.options.some(option => option.value === `=${value}`), true);
    const [unknown] = bandVariantFields(defaults, [{ name: "data-tone", value: "sepia" }]);
    assert.equal(unknown.options.at(-1)?.label, "Custom");
  }
});

test("non-band instances drop Tone from every CSS source but keep global Color scheme", () => {
  const sources = [...sheets, { path: "card.css", source: 'card-tip[data-tone=accent] {} :host([data-tone=host]) {}' }];
  const css = ':host {} :host([data-tone=own]) {} :host([data-size=small]) {}';
  const card = instanceVariantFields("card-tip", css, sources, []);
  assert.deepEqual(card.map(({ attribute }) => attribute), ["data-size", "data-color-scheme"]);
  const band = instanceVariantFields("section-split", css, sources, [], [], true);
  assert.deepEqual(band.find(({ attribute }) => attribute === "data-tone")?.options.map(({ label }) => label), ["No tone (follows the page)", "Own", "Light", "Brand", "Dark", "Host"]);
  assert.equal(band.some(({ attribute }) => attribute === "data-color-scheme"), true);
});

test("plain bands use only global Tone; no tone rules means no field", () => {
  assert.deepEqual(bandVariantFields(sheets, []).map(({ attribute }) => attribute), ["data-tone"]);
  const other = [{ path: "other.css", source: 'section[data-tone=tagged] {} :host([data-tone=host]) {} .btn[data-tone=button] {} [data-color-scheme=dark] {}' }];
  assert.deepEqual(bandVariantFields(other, []), []);
  assert.deepEqual(bandVariantFields([], []), []);
  assert.deepEqual(instanceVariantFields("section-split", ":host {}", [], [], [], true), []);
  assert.deepEqual(buttonVariantFields(other, []), []);
});
