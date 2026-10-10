import { test } from "node:test";
import assert from "node:assert/strict";
import { startTags } from "../shared/html-source.ts";
import { attributeEdit } from "../src/page-builder/component-model.ts";
import { bandVariantFields, buttonVariantFields, instanceVariantFields, isToneBand, variantAttribute } from "../src/page-builder/variant-fields.ts";
import { memorySiteVariants } from "./variant-files-fake.ts";

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

const tones = '[data-tone=light] {} [data-tone=brand] {} [data-tone=dark] {} [data-color-scheme=dark] {}';
const global = memorySiteVariants({ sheets: { "tones.css": tones } }).global();

test("without a CSS default, No tone removes the attribute and Light writes light", () => {
  const [absent] = bandVariantFields(global, []);
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
  const [written] = bandVariantFields(global, [{ name: "data-tone", value: "light" }]);
  assert.equal(written.value, "=light");
  assert.deepEqual(written.options.find(({ value }) => value === "=light"), { label: "Light", value: "=light" });
});

test("CSS-declared tone defaults keep their label and remove the attribute", () => {
  for (const value of ["light", "dark"]) {
    const defaults = memorySiteVariants({ sheets: { "tones.css": `:not([data-tone]), [data-tone=${value}] {} [data-tone=brand] {}` } }).global();
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
  const css = ':host {} :host([data-tone=own]) {} :host([data-size=small]) {}';
  const lookup = memorySiteVariants({ sheets: { "tones.css": tones, "card.css": 'card-tip[data-tone=accent] {} :host([data-tone=host]) {}' }, components: { "card-tip": css, "section-split": css } });
  const card = instanceVariantFields(lookup.forTag("card-tip")!.variants, []);
  assert.deepEqual(card.map(({ attribute }) => attribute), ["data-size", "data-color-scheme"]);
  const band = instanceVariantFields(lookup.forTag("section-split")!.variants, [], true);
  assert.deepEqual(band.find(({ attribute }) => attribute === "data-tone")?.options.map(({ label }) => label), ["No tone (follows the page)", "Own", "Light", "Brand", "Dark", "Host"]);
  assert.equal(band.some(({ attribute }) => attribute === "data-color-scheme"), true);
});

test("plain bands use only global Tone; no tone rules means no field", () => {
  assert.deepEqual(bandVariantFields(global, []).map(({ attribute }) => attribute), ["data-tone"]);
  const other = memorySiteVariants({ sheets: { "other.css": 'section[data-tone=tagged] {} :host([data-tone=host]) {} .btn[data-tone=button] {} [data-color-scheme=dark] {}' } });
  assert.deepEqual(bandVariantFields(other.global(), []), []);
  const none = memorySiteVariants({ components: { "section-split": ":host {}" } });
  assert.deepEqual(bandVariantFields(none.global(), []), []);
  assert.deepEqual(instanceVariantFields(none.forTag("section-split")!.variants, [], true), []);
  assert.deepEqual(buttonVariantFields(other.forClass("btn"), []), []);
});
