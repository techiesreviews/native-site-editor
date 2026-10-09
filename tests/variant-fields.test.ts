import { test } from "node:test";
import assert from "node:assert/strict";
import { componentVariants, siteVariants, variantsForComponent } from "../shared/variants.ts";
import { startTags } from "../shared/html-source.ts";
import { attributeEdit } from "../src/page-builder/component-model.ts";
import { conditionsNote, variantAttribute, variantFields } from "../src/page-builder/variant-fields.ts";

const fields = (css: string, attributes: { name: string; value: string }[] = []) => variantFields(componentVariants(css).variants, attributes);

test("a choice offers the default first, then each value, and marks the instance's value", () => {
  const [layout] = fields(`:host {} :host([data-layout="image-left"]) {} :host([data-layout=centered]) {}`, [{ name: "data-layout", value: "centered" }]);
  assert.deepEqual(layout, {
    attribute: "data-layout", label: "Layout", kind: "choice", value: "=centered",
    options: [{ label: "Default", value: "" }, { label: "Image left", value: "=image-left" }, { label: "Centered", value: "=centered" }],
  });
  assert.equal(fields(`:host {} :host([data-layout=centered]) {}`)[0].value, "");
});

test("a value no rule knows shows as Custom and stays an option", () => {
  const [size] = fields(`:host {} :host([data-size=small]) {}`, [{ name: "data-size", value: "huge" }]);
  assert.equal(size.value, "=huge");
  assert.deepEqual(size.options.at(-1), { label: "Custom", value: "=huge" });
  // An empty value on a choice is not the default (the attribute is there): Custom too.
  const [empty] = fields(`:host {} :host([data-size=small]) {}`, [{ name: "data-size", value: "" }]);
  assert.deepEqual([empty.value, empty.options.at(-1)], ["=", { label: "Custom", value: "=" }]);
});

test("a yes/no variant is on when the attribute is there, unless it says false", () => {
  const css = `:host {} :host([data-featured]) {}`;
  assert.deepEqual(fields(css)[0], { attribute: "data-featured", label: "Featured", kind: "yes-no", options: [], value: "" });
  assert.equal(fields(css, [{ name: "data-featured", value: "" }])[0].value, "on");
  assert.equal(fields(css, [{ name: "data-featured", value: "False" }])[0].value, "");
});

test("a conditional variant says where it shows; a conditional value says it in its option", () => {
  const [reverse] = fields(`:host {} @media (width > 56rem) { :host([data-reverse]) .a {} }`);
  assert.equal(reverse.note, "wide screens only");
  const [layout] = fields(`:host {} @media (width > 720px) { :host([data-layout="content-left"]) {} } :host([data-layout=centered]) {}`);
  assert.equal(layout.note, undefined);
  assert.deepEqual(layout.options.map(({ label }) => label), ["Default", "Content left (wide screens only)", "Centered"]);
  const [only] = fields(`:host {} @media (min-width: 40rem) { :host([data-tone=dark]) {} :host([data-tone=light]) {} }`);
  assert.equal(only.note, "wide screens only");
  assert.deepEqual(only.options.map(({ label }) => label), ["Default", "Dark", "Light"]);
});

test("conditions read plainly", () => {
  assert.equal(conditionsNote([]), undefined);
  assert.equal(conditionsNote(["@media (min-width: 40rem)"]), "wide screens only");
  assert.equal(conditionsNote(["@media (max-width: 720px)"]), "narrow screens only");
  assert.equal(conditionsNote(["@media (width < 30em)"]), "narrow screens only");
  assert.equal(conditionsNote(["@container (min-width: 30rem)"]), "wide containers only");
  assert.equal(conditionsNote(["@media (prefers-color-scheme: dark)"]), "dark mode only");
  assert.equal(conditionsNote(["@media print"]), "print only");
  assert.equal(conditionsNote(["@media (hover: hover)"]), "some screens only");
  assert.equal(conditionsNote(["@media (min-width: 40rem)", "@media (min-width: 60rem)"]), "wide screens only");
  assert.equal(conditionsNote(["@media (min-width: 40rem)", "@media (max-width: 20rem)"]), "some screens only");
});

test("a default value alias reads as the default and shows as its own option only when written", () => {
  const css = `:host, :host([data-layout=image-left]) {} :host([data-layout=centered]) {}`;
  assert.deepEqual(fields(css)[0].options, [{ label: "Image left (default)", value: "" }, { label: "Centered", value: "=centered" }]);
  const written = fields(css, [{ name: "data-layout", value: "image-left" }])[0];
  assert.deepEqual([written.value, written.options.map(({ value }) => value)], ["=image-left", ["", "=image-left", "=centered"]]);
});

test("site and global variants come in as fields too", () => {
  const site = siteVariants([{ path: "styles/site.css", source: `card-tip[data-tone=accent] {} [data-color-scheme=dark] {}` }]);
  const { variants } = variantsForComponent("card-tip", { css: ":host {} :host([data-featured]) {}", site });
  assert.deepEqual(variantFields(variants, []).map(({ attribute, kind }) => [attribute, kind]).sort(), [
    ["data-color-scheme", "choice"], ["data-featured", "yes-no"], ["data-tone", "choice"],
  ]);
});

test("picking writes a value, a bare attribute for yes, and removes it for the default or no", () => {
  const [layout, featured] = fields(`:host {} :host([data-layout=centered]) {} :host([data-featured]) {}`);
  assert.equal(variantAttribute(layout, "=centered"), "centered");
  assert.equal(variantAttribute(layout, ""), undefined);
  assert.equal(variantAttribute(featured, "on"), true);
  assert.equal(variantAttribute(featured, ""), undefined);
});

test("attributeEdit writes a bare attribute, and replaces or removes one", () => {
  const apply = (source: string, value: string | true | undefined) => {
    const tag = startTags(source)[0];
    const edit = attributeEdit(source, tag, "data-featured", value);
    return source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  };
  assert.equal(apply(`<card-tip class="a">x</card-tip>`, true), `<card-tip class="a" data-featured>x</card-tip>`);
  assert.equal(apply(`<card-tip data-featured="false">x</card-tip>`, true), `<card-tip data-featured>x</card-tip>`);
  assert.equal(apply(`<card-tip data-featured class="a">x</card-tip>`, undefined), `<card-tip class="a">x</card-tip>`);
  assert.equal(apply(`<card-tip data-featured>x</card-tip>`, "yes"), `<card-tip data-featured="yes">x</card-tip>`);
});
