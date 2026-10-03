import assert from "node:assert/strict";
import test from "node:test";
import { nativeComponentScopeSelection } from "../src/page-builder/native-component-selection";
import type { NativePreviewSelection } from "../src/components/native-preview";

const sources = {
  "index.html": '<html><body><main><outer-card></outer-card><outer-card></outer-card></main></body></html>',
  "outer.html": '<inner-card></inner-card>',
  "inner.html": '<p>Shared fallback</p>',
};
const components = { "outer-card": "outer.html", "inner-card": "inner.html" };
const hostTag = (source: string, node: readonly number[]) => {
  if (source === sources["outer.html"] && node.join(".") === "0") return "inner-card";
  if (source === sources["index.html"] && ["0.0", "0.1"].includes(node.join("."))) return "outer-card";
};
const selection: NativePreviewSelection = {
  path: "inner.html", node: [0], tag: "p", text: "Shared fallback", reason: "click", selectors: [],
  hostChain: [
    { tag: "inner-card", path: "outer.html", node: [0], selector: "inner-card", paintedSource: sources["outer.html"] },
    { tag: "outer-card", path: "index.html", node: [0, 1], selector: "outer-card:nth-of-type(2)", paintedSource: sources["index.html"] },
  ],
};

test("nested shadow parts select the exact page instance and discard part style data", () => {
  const result = nativeComponentScopeSelection({ ...selection, cascade: { layers: {}, computed: { color: "red" } } }, "index.html", components, sources, hostTag)!;
  assert.equal(result.path, "index.html");
  assert.deepEqual(result.node, [0, 1]);
  assert.equal(result.tag, "outer-card");
  assert.equal(result.cascade, undefined);
  assert.deepEqual(result.selectors, []);
  assert.equal(result.hostChain, undefined);
});

test("explicit outer template selects its nested instance, never the inner template", () => {
  const result = nativeComponentScopeSelection(selection, "outer.html", components, sources, hostTag)!;
  assert.equal(result.path, "outer.html"); assert.equal(result.tag, "inner-card"); assert.deepEqual(result.node, [0]);
});

test("foreign source, wrong host position and changed component mappings refuse the whole chain", () => {
  assert.equal(nativeComponentScopeSelection(selection, "index.html", components, { ...sources, "index.html": sources["index.html"].replace('<outer-card>', '<other-card>') }, hostTag), undefined);
  assert.equal(nativeComponentScopeSelection(selection, "index.html", { ...components, "inner-card": "other.html" }, sources, hostTag), undefined);
  assert.equal(nativeComponentScopeSelection({ ...selection, hostChain: [{ ...selection.hostChain![0], node: [99] }, selection.hostChain![1]] }, "index.html", components, sources, hostTag), undefined);
});

test("oversized chains refuse and light DOM retains its real source position", () => {
  assert.equal(nativeComponentScopeSelection({ ...selection, hostChain: Array(17).fill(selection.hostChain![0]) }, "index.html", components, sources, hostTag), undefined);
  assert.equal(nativeComponentScopeSelection(selection, "inner.html", components, sources, hostTag), selection);
});
