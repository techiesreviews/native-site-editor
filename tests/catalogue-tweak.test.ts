import assert from "node:assert/strict";
import test from "node:test";
import { changeRequest, changedSides, kindOf, soleToken, specificity, splitSelectors, tweakCss, type Edits, type TweakField } from "../src/catalogue/tweak.ts";

// The design board's Tweak section (src/catalogue/tweak.ts): which declarations it offers, the CSS it writes for
// the live cell only, and the change request "Send to agent" copies.

const primary: TweakField = {
  id: "token:--primary", kind: "colour", token: "--primary", property: "background", usedBy: [".primary { background }"],
  before: { light: "oklch(0.5 0.18 263)", dark: "oklch(0.5 0.18 263)" }, themed: true,
};
const padding: TweakField = {
  id: "rule:.button|padding", kind: "spacing", selector: ".button", property: "padding", usedBy: [],
  before: { light: "6px 14px", dark: "6px 14px" }, themed: false,
};
const scope = (side: "light" | "dark") => `.cat-live[data-theme="${side}"] > .stage`;

test("kindOf sorts a property into colours, spacing, corners, shadows or font size", () => {
  assert.equal(kindOf("background"), "colour");
  assert.equal(kindOf("border-inline-start-color"), "colour");
  assert.equal(kindOf("padding-inline"), "spacing");
  assert.equal(kindOf("row-gap"), "spacing");
  assert.equal(kindOf("border-top-left-radius"), "corner");
  assert.equal(kindOf("box-shadow"), "shadow");
  assert.equal(kindOf("font-size"), "type");
  assert.equal(kindOf("width"), undefined);
  assert.equal(kindOf("font-weight"), undefined);
});

test("a declaration that is one token names it", () => {
  assert.equal(soleToken("var(--primary)"), "--primary");
  assert.equal(soleToken(" var( --radius , 4px ) "), "--radius");
  assert.equal(soleToken("6px var(--space-s)"), undefined);
  assert.equal(soleToken("6px 14px"), undefined);
});

test("splitSelectors splits a selector list at its top-level commas only", () => {
  assert.deepEqual(splitSelectors(".a, .b:is(.c, .d) > .e,.f[data-x=\"1,2\"]"), [".a", ".b:is(.c, .d) > .e", ".f[data-x=\"1,2\"]"]);
});

test("specificity weighs a selector as the cascade does, so an overridden declaration is left out", () => {
  assert.deepEqual(specificity(".button"), [0, 1, 0]);
  assert.deepEqual(specificity("button.primary:active:not(:disabled)"), [0, 3, 1]);
  assert.deepEqual(specificity("#id > .a [data-x=\"#.b\"]::before"), [1, 2, 1]);
  assert.deepEqual(specificity(":where(.a, #b) .c"), [0, 1, 0]);
  assert.deepEqual(specificity(":is(.a, #b) li:has(> img)"), [1, 0, 2]);
  assert.deepEqual(specificity(".md\\:flex:hover"), [0, 2, 0]);
  assert.deepEqual(specificity("li:nth-child(2 of .on)"), [0, 2, 1]);
  assert.deepEqual(specificity("a:before"), [0, 0, 2]);
});

test("changedSides: a themed field changes per side, an unthemed one for both", () => {
  assert.deepEqual(changedSides(primary, undefined), []);
  assert.deepEqual(changedSides(primary, { light: primary.before.light, dark: "#ff0000" }), ["dark"]);
  assert.deepEqual(changedSides(padding, { light: "8px 16px", dark: "8px 16px" }), ["light", "dark"]);
});

test("tweakCss writes only what changed, scoped to the live cell and each theme, at the rule's own specificity", () => {
  assert.equal(tweakCss([primary, padding], {}, scope), "");
  const edits: Edits = {
    [primary.id]: { light: primary.before.light, dark: "#ff0000" },
    [padding.id]: { light: "8px 16px", dark: "8px 16px" },
  };
  const css = tweakCss([primary, padding], edits, scope);
  assert.match(css, /:where\(\.cat-live\[data-theme="dark"\] > \.stage\) \{ --primary: #ff0000; \}/);
  assert.doesNotMatch(css, /data-theme="light"\] > \.stage\) \{ --primary/);
  assert.match(css, /:where\(\.cat-live\[data-theme="light"\] > \.stage\) \.button \{ padding: 8px 16px; \}/);
  assert.match(css, /:where\(\.cat-live\[data-theme="dark"\] > \.stage\) \.button \{ padding: 8px 16px; \}/);
  // A selector list is scoped item by item, so each keeps its own specificity.
  const list = { ...padding, id: "rule:.a, .b|padding", selector: ".a, .b" };
  assert.match(tweakCss([list], { [list.id]: { light: "1px", dark: "1px" } }, scope), /:where\([^)]*\) \.a, :where\([^)]*\) \.b \{ padding: 1px; \}/);
});

test("tweakCss leaves out a value that would break out of its declaration", () => {
  assert.equal(tweakCss([padding], { [padding.id]: { light: "1px; } body { display: none", dark: "1px; } body { display: none" } }, scope), "");
});

test("the change request names the part, each selector, the values before and after, and light or dark", () => {
  assert.equal(changeRequest({ id: "button", name: "Button" }, [primary, padding], {}), "");
  const text = changeRequest({ id: "button", name: "Button" }, [primary, padding], {
    [primary.id]: { light: primary.before.light, dark: "#ff0000" },
    [padding.id]: { light: "8px 16px", dark: "8px 16px" },
  });
  assert.equal(text, [
    "Design board change request",
    "Part: Button (data-part=\"button\")",
    "- --primary (theme token in src/theme.css, used by .primary { background }), dark: oklch(0.5 0.18 263) → #ff0000",
    "- .button { padding }, light and dark: 6px 14px → 8px 16px",
    "Tried on the board's live cell only; nothing is in the code yet.",
  ].join("\n"));
  // A themed value changed differently in each theme gives one line per theme.
  const both = changeRequest({ id: "button", name: "Button" }, [primary], { [primary.id]: { light: "#00ff00", dark: "#ff0000" } });
  assert.match(both, /, light: oklch\(0\.5 0\.18 263\) → #00ff00\n- --primary .*, dark: oklch\(0\.5 0\.18 263\) → #ff0000/);
});
