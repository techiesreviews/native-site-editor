import { test } from "node:test";
import assert from "node:assert/strict";
import { effectPresets, insertEffectsCss, linkEffectsStylesheet } from "../src/page-builder/site-effects";
test("each effect inserts once and retains site CSS", () => {
  let css = "/* Existing */\nbody { color: red; }\n";
  for (const preset of effectPresets) {
    const next = insertEffectsCss(css, preset.value);
    assert.equal(insertEffectsCss(next, preset.value), next);
    css = next;
  }
  assert.ok(css.startsWith("/* Existing */\nbody { color: red; }\n"));
  assert.equal((css.match(/\/\* Effect:/g) ?? []).length, 4);
  assert.ok(!css.includes("transition: all"));
});
test("scroll presets guard support and reduced motion, never hide fallback content", () => {
  for (const value of ["reveal-fade", "reveal-slide"] as const) {
    const css = insertEffectsCss("", value);
    assert.ok(css.includes("@supports (animation-timeline: view())"));
    assert.ok(css.includes("@media (prefers-reduced-motion: no-preference)"));
    assert.ok(css.indexOf("@supports") < css.indexOf("opacity: 0"));
    assert.ok(css.includes("animation-timeline: view()"));
  }
});
test("hover lift respects motion and precise pointers; underline supports keyboard", () => {
  assert.ok(insertEffectsCss("", "hover-lift").includes("(pointer: fine) and (prefers-reduced-motion: no-preference)"));
  assert.ok(insertEffectsCss("", "hover-underline").includes(":focus-visible"));
});
test("effects stylesheet links idempotently within head before scripts", () => {
  const page = '<html>\n<head>\n  <title>Home</title>\n  <script src="/site.js"></script>\n</head>\n<body></body></html>';
  const next = linkEffectsStylesheet(page);
  assert.equal(linkEffectsStylesheet(next), next);
  assert.ok(next.indexOf('href="/styles/effects.css"') < next.indexOf('<script'));
  assert.throws(() => linkEffectsStylesheet("<body>Broken</body>"), /complete <head>/);
});
test("effects refuse ambiguous or false head closing tags", () => {
  for (const html of ['<head></header>', '<head><script>const text = "</head>";</script></head>']) {
    assert.throws(() => linkEffectsStylesheet(html), /complete <head>/);
  }
});
