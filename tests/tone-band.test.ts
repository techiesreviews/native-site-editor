import { test } from "node:test";
import assert from "node:assert/strict";
import { componentVariants } from "../shared/variants.ts";
import { startTags } from "../shared/html-source.ts";
import { attributeEdit } from "../src/page-builder/component-model.ts";
import { bandVariantFields, buttonVariantFields, instanceVariantFields, isToneBand, toneDefault, variantAttribute, variantFields } from "../src/page-builder/variant-fields.ts";

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

test("Light (default) removes the attribute; explicit light still shows as Light", () => {
  const [absent] = bandVariantFields(sheets, []);
  assert.deepEqual(absent.options.map(({ label }) => label), ["Light (default)", "Brand", "Dark"]);
  assert.equal(absent.value, "");
  assert.equal(variantAttribute(absent, ""), undefined);
  const source = '<section data-tone="brand"><h2>Band</h2></section>';
  const edit = attributeEdit(source, startTags(source)[0], absent.attribute, variantAttribute(absent, ""));
  assert.equal(source.slice(0, edit.start) + edit.text + source.slice(edit.end), '<section><h2>Band</h2></section>');
  const [written] = bandVariantFields(sheets, [{ name: "data-tone", value: "light" }]);
  assert.equal(written.value, "=light");
  assert.deepEqual(written.options.find(({ value }) => value === "=light"), { label: "Light", value: "=light" });
});

test("the named light default preserves parsed defaults and other attributes", () => {
  const [tone] = componentVariants(':host, :host([data-tone=dark]) {} :host([data-tone=light]) {}').variants;
  assert.equal(toneDefault(tone).defaultValue, "dark");
  const [size] = componentVariants(':host([data-size=light]) {}').variants;
  assert.equal(toneDefault(size), size);
  const [unknown] = variantFields([toneDefault(tone)], [{ name: "data-tone", value: "sepia" }]);
  assert.equal(unknown.options.at(-1)?.label, "Custom");
});

test("non-band instances drop Tone from every CSS source but keep global Color scheme", () => {
  const sources = [...sheets, { path: "card.css", source: 'card-tip[data-tone=accent] {} :host([data-tone=host]) {}' }];
  const css = ':host {} :host([data-tone=own]) {} :host([data-size=small]) {}';
  const card = instanceVariantFields("card-tip", css, sources, []);
  assert.deepEqual(card.map(({ attribute }) => attribute), ["data-size", "data-color-scheme"]);
  const band = instanceVariantFields("section-split", css, sources, [], [], true);
  assert.deepEqual(band.find(({ attribute }) => attribute === "data-tone")?.options.map(({ label }) => label), ["Light (default)", "Own", "Brand", "Dark", "Host"]);
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
