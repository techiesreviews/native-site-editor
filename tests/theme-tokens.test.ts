import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRepository, undefinedProperties } from "../scripts/check-css-vars.mjs";

const root = new URL("..", import.meta.url).pathname;
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");

test("the --layer-* steps are strictly increasing in the order they are written", () => {
  const layers = [...theme.matchAll(/^\s*(--layer-[\w-]+):\s*(\d+);/gm)].map(([, name, value]) => ({ name, value: Number(value) }));
  assert.deepEqual(layers.map(layer => layer.name), ["raised", "canvas", "pins", "bar", "popover", "dialog", "tooltip", "wizard", "drag", "celebration", "note"].map(step => `--layer-${step}`));
  layers.slice(1).forEach((layer, index) => {
    assert.ok(layer.value > layers[index].value, `${layer.name} (${layer.value}) is above ${layers[index].name} (${layers[index].value})`);
  });
});

test("--ease-out is defined, so the fallbacks that name it are never the only source", () => {
  assert.match(theme, /^\s*--ease-out:\s*cubic-bezier\(/m);
});

test("every var(--name) in the stylesheets names something defined", () => {
  assert.deepEqual(checkRepository(root), []);
});

test("a name used with a fallback but defined nowhere is reported, as --ease-out once was", () => {
  const sheets = { "a.css": ".x { transition: opacity 150ms var(--ease-out, ease-out); }" };
  assert.deepEqual(undefinedProperties(sheets, {}, {}), ["a.css: var(--ease-out) is defined nowhere (no declaration in src/**/*.css, no script sets it)"]);
});

test("a declaration, a literal script name, a script template prefix and an open hook all count as defined", () => {
  const sheets = {
    "a.css": ":root { --one: 1px; } .x { margin: var(--one) var(--two) var(--agent-pin) var(--hook, 0); }",
  };
  const scripts = { "a.ts": 'el.style.setProperty("--two", "1"); pin.style.setProperty(`--agent${part}`, c);' };
  assert.deepEqual(undefinedProperties(sheets, scripts, { "--hook": "a hook" }), []);
  assert.equal(undefinedProperties(sheets, {}, {}).length, 3);
});

test("a declaration inside a comment does not define a name", () => {
  assert.equal(undefinedProperties({ "a.css": "/* --ghost: 1; */ .x { top: var(--ghost); }" }, {}, {}).length, 1);
});

test("a script that only mentions or reads a name does not define it", () => {
  const problems = undefinedProperties({ "a.css": ".x{top:var(--ghost)}" }, { "a.ts": "// --ghost\nel.style.cssText = 'top: var(--ghost)';" }, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /var\(--ghost\)/);
});

test("a script that writes a name in cssText or a quoted setProperty does define it", () => {
  const scripts = { "a.ts": "el.style.cssText = 'top: 1px; --nub: 2px'; box.style.setProperty('--ghost', c); // https://example.com" };
  assert.deepEqual(undefinedProperties({ "a.css": ".x{top:var(--nub) var(--ghost)}" }, scripts, {}), []);
});

test("a script that only reads or removes a name does not define it", () => {
  const sheets = { "a.css": ".x{top:var(--ghost)}" };
  for (const code of ["getComputedStyle(el).getPropertyValue('--ghost')", "el.style.removeProperty('--ghost')"]) {
    assert.equal(undefinedProperties(sheets, { "a.ts": code }, {}).length, 1, code);
  }
});

test("both arms of a ternary name in setProperty count as written", () => {
  const scripts = { "a.ts": "arrow.style.setProperty(vertical ? \"--arrow-top\" : \"--arrow-left\", `${n}px`);" };
  assert.deepEqual(undefinedProperties({ "a.css": ".x{top:var(--arrow-top);left:var(--arrow-left)}" }, scripts, {}), []);
});

test("a glob with an unclosed comment opener and an HTML comment do not hide or add writes", () => {
  const scripts = { "a.ts": "const glob = \"**/*.ts\"; el.style.setProperty('--real', '1');", "index.html": "<!-- --ghost: 1; -->" };
  assert.deepEqual(undefinedProperties({ "a.css": ".x{top:var(--real) var(--ghost)}" }, scripts, {}).map(problem => problem.match(/--[a-z]+/)![0]), ["--ghost"]);
});
