import { test } from "node:test";
import assert from "node:assert/strict";
import { componentVariants, variantLabel, valueLabel } from "../shared/variants.ts";
import { withSlottedRules } from "../shared/slotted-css.ts";

const parse = (css: string) => componentVariants(css).variants;
const values = (css: string) => parse(css).map((variant) => [variant.attribute, variant.values.map(({ value }) => value)]);

test("quoting, flags, CSS escapes and attribute case deduplicate in source order", () => {
  assert.deepEqual(values(String.raw`
    :host([DATA-Tone=dark]), :host([data-tone='dark']), :host([data-tone="dark" i]) {}
    :host([data-tone="image\2d left" s]), :host([data-tone=image-left]) {}
    :host([data-\74 one="two\_col"]), :host([data-tone="say\"hi"] ) {}
  `), [["data-tone", ["dark", "image-left", "two_col", 'say"hi']]]);
});

test("presence and only boolean values are yes-no; a nonboolean makes a choice", () => {
  const variants = parse(`:host {} :host([data-reverse]) {} :host([data-open=true]) {}
    :host([data-ready=false]) {} :host([data-ready=true]) {}
    :host([data-tone]) {} :host([data-tone=true]) {} :host([data-tone=dark]) {}`);
  assert.deepEqual(variants.map(({ attribute, kind, values }) => [attribute, kind, values.map(({ value }) => value)]), [
    ["data-reverse", "yes-no", []], ["data-open", "yes-no", []], ["data-ready", "yes-no", []],
    ["data-tone", "choice", ["true", "dark"]],
  ]);
  assert.deepEqual(parse(`:host {} :host([data-wide=""]) {}`).map(({ attribute, kind, values }) => [attribute, kind, values.length]), [["data-wide", "yes-no", 0]]);
});

test("first host compound only, combined attributes and functional alternatives", () => {
  assert.deepEqual(values(`:host([data-layout=image-left][data-tone=dark]) .y[data-inner=x] {}
    :host(:is([data-tone=light], [data-tone=brand]):where([data-size=small], [data-size=large])) {}
    :host(:not([data-tone=accent])) {} :host-context([data-context=x]) {}
    h2[data-inner=y] {} .wrapper :host([data-later=x]) {} :host([role=button].dark) {}`), [
    ["data-layout", ["image-left"]], ["data-tone", ["dark", "light", "brand", "accent"]],
    ["data-size", ["small", "large"]],
  ]);
});

test("only absent state offers nothing; negated equality contributes a value", () => {
  assert.deepEqual(componentVariants(":host(:not([data-x])) {}"), { variants: [], warnings: [] });
  assert.deepEqual(values(":host(:not([data-x=v])) {}"), [["data-x", ["v"]]]);
  assert.deepEqual(componentVariants(":host(:not([data-x=v])) {}").warnings, []);
});

test("non-equality operators offer nothing", () => {
  assert.deepEqual(parse(`:host([data-a~=one][data-b|=two][data-c^=three][data-d$=four][data-e*=five]) {}`), []);
});

test("media and container chains merge per option, unconditional occurrences win", () => {
  const variants = parse(`
    @media (width > 56rem) { :host([data-tone=dark][data-reverse]) .window { order: 2 }
      @container card (width > 20rem) { :host([data-tone=brand]) {} }
    }
    @container (width > 30rem) { :host([data-tone=dark][data-reverse]) {} }
    @media (width > 56rem) { :host([data-tone=dark]) {} }
    :host([data-tone=light]) {} :host([data-tone=dark]) {}
  `);
  assert.deepEqual(variants[0], {
    attribute: "data-tone", label: "Tone", kind: "choice", conditions: [], values: [
      { value: "dark", label: "Dark", conditions: [] },
      { value: "brand", label: "Brand", conditions: ["@media (width > 56rem) and @container card (width > 20rem)"] },
      { value: "light", label: "Light", conditions: [] },
    ],
  });
  assert.deepEqual(variants[1], {
    attribute: "data-reverse", label: "Reverse", kind: "yes-no", values: [],
    conditions: ["@media (width > 56rem)", "@container (width > 30rem)"],
  });
});

test("choice conditions union values; presence does not remove value conditions", () => {
  const [variant] = parse(`:host([data-tone]) {}
    @media print { :host([data-tone=dark]) {} }
    @container card (width > 20rem) { :host([data-tone=light]) {} }`);
  assert.deepEqual(variant.conditions, ["@media print", "@container card (width > 20rem)"]);
});

test("variant conditions follow occurrence order across interleaved values", () => {
  const [variant] = parse(`@media first { :host([data-tone=dark]) {} }
    @media second { :host([data-tone=light]) {} }
    @media third { :host([data-tone=dark]) {} }`);
  assert.deepEqual(variant.conditions, ["@media first", "@media second", "@media third"]);
});

test("warnings retain comments in the original authored selector", () => {
  const css = `:host/* keep */[data-x] {}`;
  assert.equal(componentVariants(css).warnings[0].kind, "host-without-parentheses");
  const warning = componentVariants(css).warnings[0];
  if (warning.kind === "host-without-parentheses") assert.equal(warning.selector, ":host/* keep */[data-x]");
});

test("supports, layer and scope descend without adding conditions", () => {
  assert.deepEqual(parse(`@layer components { @supports (display: grid) {
    @scope (.card) { :host([data-reverse]) {} }
  } }`)[0].conditions, []);
});

test("both nested forms resolve every parent selector and preserve conditional context", () => {
  assert.deepEqual(values(`:host([data-tone=dark]), :host([data-tone=light]) {
    h2 { & > span { color: red } }
  }
  h2, p { :host([data-layout=image-left]) & {} }
  @media print { h2 { :host([data-reverse]) & {} } }`), [
    ["data-tone", ["dark", "light"]], ["data-layout", ["image-left"]], ["data-reverse", []],
  ]);
  assert.deepEqual(parse("@media print { h2 { :host([data-reverse]) & {} } }")[0].conditions, ["@media print"]);
});

test("nesting substitution ignores ampersands in strings and escapes", () => {
  assert.deepEqual(values(`h2 { :host([data-text="a&b"]) & {} }`), [["data-text", ["a&b"]]]);
});

test("broken host forms warn with authored selector, fix and prelude offset", () => {
  const css = `/* intro */\n:host[data-x], :host[data-tone="dark"] {}\n:host {\n  &[data-open] {}\n}\n:host([data-a])[data-b="v"] {}`;
  assert.deepEqual(componentVariants(css), { variants: [], warnings: [
    { kind: "host-without-parentheses", selector: ":host[data-x]", attribute: "data-x", fix: ":host([data-x]) { … }", offset: css.indexOf(":host[data-x]") },
    { kind: "host-without-parentheses", selector: ':host[data-tone="dark"]', attribute: "data-tone", fix: ':host([data-tone="dark"]) { … }', offset: css.indexOf(":host[data-x]") },
    { kind: "host-without-parentheses", selector: "&[data-open]", attribute: "data-open", fix: ":host([data-open]) { … }", offset: css.indexOf("&[data-open]") },
    { kind: "host-without-parentheses", selector: ':host([data-a])[data-b="v"]', attribute: "data-b", fix: ':host([data-a][data-b="v"]) { … }', offset: css.indexOf(":host([data-a])") },
  ] });
});

test("no default look warns only when offered variants have no absent-state style", () => {
  assert.deepEqual(componentVariants(":host([data-tone=dark]) { h2 {} }").warnings, [{ kind: "no-default-look" }]);
  for (const base of [":host {}", ":host(:not([data-tone])) {}", "h2 {}", ":host(:is([data-tone=light], :not([data-tone]))) {}"])
    assert.deepEqual(componentVariants(`${base} :host([data-tone=dark]) {}`).warnings, []);
  assert.deepEqual(componentVariants("").warnings, []);
});

test("a grouped bare host or matching absent state names the default value", () => {
  assert.equal(parse(":host, :host([data-tone=light]) {} :host([data-tone=dark]) {}")[0].defaultValue, "light");
  assert.equal(parse(":host(:not([data-tone])), :host([data-tone=light]) {}")[0].defaultValue, "light");
  assert.equal(parse(":host(:not([data-other])), :host([data-tone=light]) {}")[0].defaultValue, undefined);
  assert.equal(parse(":host {} :host([data-tone=light]) {}")[0].defaultValue, undefined);
});

test("reserved names and script attributes are excluded case-insensitively", () => {
  assert.deepEqual(componentVariants(`:host([data-empty][data-unloaded][data-native-selected][DATA-OPEN]) {}
    :host([data-tone=dark]) {}`, { scriptAttributes: new Set(["Data-Open"]) }).variants.map(({ attribute }) => attribute), ["data-tone"]);
});

test("comments never annotate labels or state; strings and block values do not confuse walking", () => {
  assert.deepEqual(values(`/* state data-tone; variant data-tone 'Mood': dark = Night */
    :host { --rules: { :host([data-fake=x]) {} }; content: "}; :host([data-fake=y]) {"; }
    /* :host([data-fake=z]) {} */
    :host(/* comment */[data-tone="/* literal */"]) { content: "{"; }`), [["data-tone", ["/* literal */"]]]);
  assert.equal(parse("/* state data-tone */ :host([data-tone=dark]) {}")[0].label, "Tone");
});

test("keyframes, font-face, starting-style and unknown at-rules are skipped", () => {
  assert.deepEqual(values(`@keyframes pulse { :host([data-fake=a]) {} }
    @-webkit-keyframes pulse { :host([data-fake=b]) {} }
    @font-face { :host([data-fake=c]) {} } @starting-style { :host([data-fake=d]) {} }
    @unknown { :host([data-fake=e]) {} } :host([data-tone=dark]) {}`), [["data-tone", ["dark"]]]);
});

test("slotted twins give the same variants, including nested and conditional rules", () => {
  const css = `:host {} :host([data-tone=dark]) h2 {} :host([data-size=large]) { h2 {} }
    @media print { :host([data-reverse]) .window {} } h2 { :host([data-layout=image-left]) & {} }`;
  assert.deepEqual(componentVariants(withSlottedRules(css)), componentVariants(css));
});

test("labels humanise raw names and values", () => {
  assert.equal(variantLabel("data-tone"), "Tone");
  assert.equal(variantLabel("data-text-align"), "Text align");
  assert.equal(valueLabel("image-left"), "Image left");
  assert.equal(valueLabel("two_col"), "Two col");
});

test("many variants have no cap and calls share no mutable state", () => {
  const css = Array.from({ length: 100 }, (_, index) => `:host([data-axis-${index}=one]) {}`).join("\n");
  assert.equal(parse(css).length, 100);
  assert.deepEqual(parse("h2 {}"), []);
  assert.equal(parse(css).length, 100);
});
