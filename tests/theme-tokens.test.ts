import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
