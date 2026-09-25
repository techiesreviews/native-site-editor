import assert from "node:assert/strict";
import test from "node:test";
import { startTags } from "../src/native-source-location.ts";
import { currentTextSize, INLINE_TEXT_SIZES, textSizeEdit, textSizeLabel, textSizeScale } from "../src/native-text-size.ts";

const apply = (source: string, edit: { start: number; end: number; text: string } | undefined) =>
  edit ? source.slice(0, edit.start) + edit.text + source.slice(edit.end) : source;
const tagOf = (source: string) => startTags(source)[0];

const tokens = `@layer tokens {
  :root {
    --ink: #20231f;
    /* Type */
    --font-body: ui-sans-serif, system-ui;
    --text-s: 14px;
    --text-m: 16px;
    --text-4xl: clamp(28px, 4vw, 44px);
    --text-color: #333;
    --space-s: 16px;
  }
}`;

test("sizes: size classes first, then size variables on :root, else the bar's own scale", () => {
  const variables = textSizeScale([tokens]);
  assert.equal(variables.kind, "variable");
  assert.deepEqual(variables.sizes, [
    { value: "--text-s", label: "S" },
    { value: "--text-m", label: "M" },
    { value: "--text-4xl", label: "4XL" },
  ]);
  const classes = textSizeScale([tokens, `.text-small { font-size: 14px; }\n@media (min-width: 40em) { .text-large { font-size: 22px } }\n.text-center { text-align: center }\n.card .text-huge { font-size: 40px }\n.fs-2xl{font-size:2rem}`]);
  assert.equal(classes.kind, "class");
  assert.deepEqual(classes.sizes, [
    { value: "text-small", label: "Small" },
    { value: "text-large", label: "Large" },
    { value: "fs-2xl", label: "2XL" },
  ]);
  // Variables set on something other than :root/html, and a site with nothing, fall back.
  assert.deepEqual(textSizeScale([`.hero { --text-l: 18px; }`, `p { font-size: 1rem }`]), { kind: "inline", sizes: INLINE_TEXT_SIZES });
  assert.equal(textSizeLabel("body-small"), "Body small");
  assert.equal(textSizeLabel("xl"), "XL");
});

test("a size class replaces the other size classes and an inline font-size", () => {
  const scale = textSizeScale([`.text-small{font-size:14px}.text-large{font-size:22px}`]);
  const plain = `<p data-key="a">x</p>`;
  assert.equal(currentTextSize(plain, tagOf(plain), scale), "default");
  const large = apply(plain, textSizeEdit(plain, tagOf(plain), scale, "text-large"));
  assert.equal(large, `<p data-key="a" class="text-large">x</p>`);
  assert.equal(currentTextSize(large, tagOf(large), scale), "text-large");
  const mixed = `<p class="lead text-small" style="color: red; font-size: 1.25rem">x</p>`;
  assert.equal(apply(mixed, textSizeEdit(mixed, tagOf(mixed), scale, "text-large")), `<p class="lead text-large" style="color: red">x</p>`);
  assert.equal(apply(large, textSizeEdit(large, tagOf(large), scale, "default")), plain);
  // An inline size outside the classes is Custom; the same size again is no edit.
  const custom = `<p style="font-size: 3px">x</p>`;
  assert.equal(currentTextSize(custom, tagOf(custom), scale), "custom");
  assert.equal(textSizeEdit(large, tagOf(large), scale, "text-large"), undefined);
  assert.equal(textSizeEdit(plain, tagOf(plain), scale, "nope"), undefined);
});

test("a size variable is written as var() in the inline font-size", () => {
  const scale = textSizeScale([tokens]);
  const plain = `<h2>x</h2>`;
  const m = apply(plain, textSizeEdit(plain, tagOf(plain), scale, "--text-m"));
  assert.equal(m, `<h2 style="font-size: var(--text-m)">x</h2>`);
  assert.equal(currentTextSize(m, tagOf(m), scale), "--text-m");
  const s = apply(m, textSizeEdit(m, tagOf(m), scale, "--text-s"));
  assert.equal(s, `<h2 style="font-size: var(--text-s)">x</h2>`);
  assert.equal(apply(s, textSizeEdit(s, tagOf(s), scale, "default")), plain);
  const rem = `<h2 style="font-size: 1rem">x</h2>`;
  assert.equal(currentTextSize(rem, tagOf(rem), scale), "custom");
});

test("with no sizes of its own the site gets the bar's rem scale inline", () => {
  const scale = textSizeScale([]);
  const plain = `<p class="lead" data-key="hero-lead">x</p>`;
  const l = apply(plain, textSizeEdit(plain, tagOf(plain), scale, "l"));
  assert.equal(l, `<p class="lead" data-key="hero-lead" style="font-size: 1.25rem">x</p>`);
  assert.equal(currentTextSize(l, tagOf(l), scale), "l");
  assert.equal(apply(l, textSizeEdit(l, tagOf(l), scale, "default")), plain);
  const kept = `<p style="color: red">x</p>`;
  assert.equal(apply(kept, textSizeEdit(kept, tagOf(kept), scale, "xs")), `<p style="color: red; font-size: 0.75rem">x</p>`);
});
