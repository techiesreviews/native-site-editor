import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkRepository, undefinedProperties } from "../scripts/check-css-vars.mjs";

const root = new URL("..", import.meta.url).pathname;
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");

test("the --layer-* steps are strictly increasing in the order they are written", () => {
  const layers = [...theme.matchAll(/^\s*(--layer-[\w-]+):\s*(\d+);/gm)].map(([, name, value]) => ({ name, value: Number(value) }));
  assert.ok(layers.length >= 8, "the layer block is found");
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
