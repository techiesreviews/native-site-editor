import { test } from "node:test";
import assert from "node:assert/strict";
import { componentVariants, siteVariants, variantsForClass, variantsForComponent } from "../shared/variants.ts";
import { expandStyleImports } from "../shared/css-imports.ts";

const site = (source: string) => siteVariants([{ path: "styles/site.css", source }]);
const component = (source: string, tag = "section-hero") => variantsForComponent(tag, { css: "", site: site(source) }).variants;
const choices = (variants: ReturnType<typeof component>) => variants.map(({ attribute, values }) => [attribute, values.map(({ value }) => value)]);

test("tag subjects read every compound and both nested forms without leaking other tags", () => {
  const source = `SECTION-HERO[data-tone=dark] {}
    main section-hero[data-tone=light] h2[data-inner=x] {}
    section-hero { &[data-layout=image-left] {} }
    h2 { section-hero[data-layout=centered] & {} }
    other-tag[data-other] section-hero h2[data-descendant=x] {}
    other-tag[data-tone=other] { section-hero {} }`;
  assert.deepEqual(choices(component(source, "Section-Hero")), [
    ["data-tone", ["dark", "light"]], ["data-layout", ["image-left", "centered"]],
  ]);
  assert.deepEqual(choices(component(source, "other-tag")), [["data-other", []], ["data-tone", ["other"]]]);
});

test("nested tags inside grouping rules preserve media and container conditions", () => {
  const [variant] = component(`@layer components { @supports (display: grid) {
    @media (width > 56rem) { section-hero { &[data-layout=wide] {}
      @container card (width > 20rem) { &[data-layout=compact] {} }
    } }
  } }`);
  assert.deepEqual(variant.conditions, ["@media (width > 56rem)", "@media (width > 56rem) and @container card (width > 20rem)"]);
  assert.deepEqual(variant.values.map(({ conditions }) => conditions), [
    ["@media (width > 56rem)"], ["@media (width > 56rem) and @container card (width > 20rem)"],
  ]);
});

test("site host rules reach every component, using only a valid first host compound", () => {
  const source = `:host([data-theme=brand]) h2[data-inner=x] {}
    @media print { h2 { :host([data-print]) & {} } }
    main :host([data-later=x]) {} :host[data-broken] {}
    :host { &[data-nested-broken] {} }`;
  for (const tag of ["section-hero", "code-drawer"])
    assert.deepEqual(choices(component(source, tag)), [["data-theme", ["brand"]], ["data-print", []]]);
});

test("global attributes reach every component, including the techies color scheme shape", () => {
  const source = `[data-color-scheme="light"], [data-color-scheme="dark"] {}
    [data-color-scheme]:not(:root) {} *[data-reverse] {}
    :root[data-root=x] {} :host-context([data-context=x]) {}
    #page[data-id=x] {} .card[data-class=x] {} html[data-html=x] {}`;
  for (const tag of ["section-hero", "section-split"])
    assert.deepEqual(choices(component(source, tag)), [["data-color-scheme", ["light", "dark"]], ["data-reverse", []]]);
});

test("Button variants read nested utilities and flat hover rules; classes stay case-sensitive", () => {
  const parsed = site(`@layer utilities { .btn {
    &[data-variant="secondary"] {} &[data-size="small"] {} &[data-size="large"] {}
  } } .btn[data-variant="ghost"]:hover {} .Btn[data-variant=capital] {}`);
  const variants = variantsForClass("btn", parsed);
  assert.deepEqual(choices(variants), [["data-variant", ["secondary", "ghost"]], ["data-size", ["small", "large"]]]);
  assert.ok(variants.every(({ defaultValue }) => defaultValue === undefined));
  assert.deepEqual(choices(variantsForClass("Btn", parsed)), [["data-variant", ["capital"]]]);
  assert.deepEqual(variantsForClass("missing", parsed), []);
  assert.deepEqual(variantsForComponent("section-hero", { css: "", site: parsed }).variants, []);
});

test("component and sheets merge values in source order across all subject kinds", () => {
  const parsed = siteVariants([
    { path: "a.css", source: `[data-tone=global] {} section-hero[data-tone=tagged] {}
      :host([data-tone=host]) {} section-hero[data-tone=own] {}
      section-hero[data-tone=first], [data-tone=middle], section-hero[data-tone=last] {}` },
    { path: "b.css", source: `section-hero[data-tone=second] {} [data-tone=global] {}` },
  ]);
  const result = variantsForComponent("section-hero", { css: ":host {} :host([data-tone=own]) {}", site: parsed });
  assert.deepEqual(choices(result.variants), [["data-tone", ["own", "global", "tagged", "host", "first", "middle", "last", "second"]]]);
  assert.deepEqual(result.warnings, []);
});

test("conditions union across sources and unconditional values win", () => {
  const parsed = siteVariants([
    { path: "a.css", source: `@media print { [data-tone=dark] {} .btn[data-size=small] {} }
      @container card (width > 20rem) { section-hero[data-tone=dark] {} }` },
    { path: "b.css", source: `@media print { :host([data-tone=dark]) {} }
      [data-tone=light] {} .btn[data-size=small] {}` },
  ]);
  const [tone] = variantsForComponent("section-hero", { css: "@media screen { :host([data-tone=dark]) {} }", site: parsed }).variants;
  assert.deepEqual(tone.conditions, []);
  assert.deepEqual(tone.values, [
    { value: "dark", label: "Dark", conditions: ["@media screen", "@media print", "@container card (width > 20rem)"] },
    { value: "light", label: "Light", conditions: [] },
  ]);
  assert.deepEqual(variantsForClass("btn", parsed)[0].values[0].conditions, []);
  const [unconditional] = variantsForComponent("section-hero", { css: ":host([data-tone=dark]) {}", site: parsed }).variants;
  assert.deepEqual(unconditional.values[0].conditions, []);
});

test("choice promotion retains boolean values, presence conditions and first default", () => {
  const parsed = site(`@media print { section-hero[data-tone=dark] {} }
    section-hero:not([data-tone]), section-hero[data-tone=light] {}
    section-hero:not([data-tone]), section-hero[data-tone=brand] {}`);
  const [tone] = variantsForComponent("section-hero", { css: ":host {} :host([data-tone=true]) {}", site: parsed }).variants;
  assert.equal(tone.kind, "choice");
  assert.deepEqual(tone.values.map(({ value }) => value), ["true", "dark", "light", "brand"]);
  assert.equal(tone.defaultValue, "light");
  const [ownDefault] = variantsForComponent("section-hero", { css: ":host, :host([data-tone=own]) {}", site: parsed }).variants;
  assert.equal(ownDefault.defaultValue, "own");
  const [presence] = variantsForComponent("section-hero", { css: ":host([data-tone]) {}", site: site("@media print { [data-tone=dark] {} }") }).variants;
  assert.deepEqual(presence.conditions, ["@media print"]);
});

test("script-set exclusion affects only component CSS; warnings stay slice 11 warnings", () => {
  const css = ":host[data-broken] {} :host([data-open]) {} :host([data-color-scheme=own]) {} :host([data-tone=dark]) {}";
  const parsed = site(`[data-color-scheme=light], [data-color-scheme=dark] {}`);
  const scriptAttributes = ["DATA-OPEN", "data-color-scheme"];
  const result = variantsForComponent("section-hero", { css, site: parsed, scriptAttributes });
  assert.deepEqual(choices(result.variants), [["data-tone", ["dark"]], ["data-color-scheme", ["light", "dark"]]]);
  assert.deepEqual(result.warnings, componentVariants(css, { scriptAttributes }).warnings);
  assert.deepEqual(choices(variantsForComponent("section-hero", { css, scriptAttributes, site: site("section-hero[data-open] {}") }).variants), [["data-tone", ["dark"]], ["data-open", []]]);
});

test("all site subjects share exclusions, equality rules, booleans, escapes and labels", () => {
  const source = String.raw`section-hero[data-empty][data-unloaded][data-native-state][data-skip~=x][data-wide=""] {}
    .btn[data-variant=image-left][data-native-selected] {}
    [data-ready=true] {} [data-ready=false] {} :host([data-\74 one=dark]) {}`;
  assert.deepEqual(choices(component(source)), [["data-wide", []], ["data-ready", []], ["data-tone", ["dark"]]]);
  const [variant] = variantsForClass("btn", site(source));
  assert.equal(variant.label, "Variant");
  assert.equal(variant.values[0].label, "Image left");
});

test("expanded imports already carry their wrappers, without applying conditions twice", () => {
  const files = new Map([
    ["site.css", '@import "utilities.css" layer(utilities) supports(display: grid) screen;'],
    ["utilities.css", ".btn { &[data-size=small] {} } section-hero[data-wide] {}"],
  ]);
  const expanded = expandStyleImports(["site.css"], (path) => files.get(path));
  const parsed = siteVariants(expanded.sheets);
  assert.deepEqual(variantsForClass("btn", parsed)[0].conditions, ["@media screen"]);
  assert.deepEqual(variantsForComponent("section-hero", { css: "", site: parsed }).variants[0].conditions, ["@media screen"]);
});

test("cache reuses sheets by path and content, reparses changes and evicts oldest", () => {
  const original = { path: "cache-original.css", source: "[data-tone=dark] {}" };
  const first = siteVariants([original]);
  assert.strictEqual(siteVariants([{ ...original }]).sheets[0], first.sheets[0]);
  const changed = siteVariants([{ ...original, source: "[data-tone=light] {}" }]);
  assert.notStrictEqual(changed.sheets[0], first.sheets[0]);
  assert.deepEqual(choices(variantsForComponent("section-hero", { css: "", site: changed }).variants), [["data-tone", ["light"]]]);
  assert.notStrictEqual(siteVariants([{ ...original, path: "another-path.css" }]).sheets[0], first.sheets[0]);
  const result = variantsForComponent("section-hero", { css: "", site: first });
  result.variants[0].values[0].conditions.push("changed output");
  assert.deepEqual(variantsForComponent("section-hero", { css: "", site: first }).variants[0].values[0].conditions, []);
  siteVariants(Array.from({ length: 128 }, (_, index) => ({ path: `cache-fill-${index}.css`, source: "" })));
  assert.notStrictEqual(siteVariants([original]).sheets[0], first.sheets[0]);
});

test(":is() and :where() subjects name their alternatives, not every component", () => {
  const parsed = site(`:is(section-hero)[data-tone=dark] {} :where(.btn, main .btn)[data-size=small] {}
    :is([data-a], [data-b])[data-scheme=dark] {}`);
  assert.deepEqual(choices(variantsForComponent("section-hero", { css: "", site: parsed }).variants), [["data-tone", ["dark"]], ["data-a", []], ["data-b", []], ["data-scheme", ["dark"]]]);
  assert.deepEqual(choices(variantsForComponent("site-footer", { css: "", site: parsed }).variants), [["data-a", []], ["data-b", []], ["data-scheme", ["dark"]]]);
  assert.deepEqual(choices(variantsForClass("btn", parsed)), [["data-size", ["small"]]]);
});

test("a repeated compound in one selector is not a default alternative", () => {
  const [tone] = component("section-hero[data-tone=dark] section-hero {}");
  assert.equal(tone.defaultValue, undefined);
  const [alias] = variantsForClass("btn", site(".btn, .btn[data-variant=primary] {}"));
  assert.equal(alias.defaultValue, "primary");
});
