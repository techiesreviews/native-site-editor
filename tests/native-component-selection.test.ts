import assert from "node:assert/strict";
import test from "node:test";
import { nativeComponentScopeSelection, nativeLockedComponentPart } from "../src/page-builder/native-component-selection";
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

test("page-owned layout descendants cannot select their container inside an instance", () => {
  const page = '<outer-card><div><p>Page text</p></div></outer-card><div>Outside</div>';
  const ownSources = { ...sources, "index.html": page };
  const tags: Record<string, string> = { "0": "outer-card", "0.0": "div", "0.0.0": "p", "1": "div" };
  const tagAt = (_source: string, node: readonly number[]) => tags[node.join(".")];
  const wrapper = { ...selection, path: "index.html", node: [0, 0], tag: "div", hostChain: undefined };
  const mapped = nativeComponentScopeSelection(wrapper, "index.html", components, ownSources, tagAt)!;
  assert.deepEqual(mapped.node, [0]);
  assert.equal(mapped.tag, "outer-card");
  const text = { ...wrapper, node: [0, 0, 0], tag: "p" };
  assert.equal(nativeComponentScopeSelection(text, "index.html", components, ownSources, tagAt), text);
  const outside = { ...wrapper, node: [1] };
  assert.equal(nativeComponentScopeSelection(outside, "index.html", components, ownSources, tagAt), outside);
});

test("content and card targets remain selected; a container inside a link resolves to the link", () => {
  const page = '<outer-card><a><div></div></a><button>Go</button><img><article>Card</article></outer-card>';
  const tags: Record<string, string> = { "0": "outer-card", "0.0": "a", "0.0.0": "div", "0.1": "button", "0.2": "img", "0.3": "article" };
  const tagAt = (_source: string, node: readonly number[]) => tags[node.join(".")];
  const ownSources = { ...sources, "index.html": page };
  const wrapper = { ...selection, path: "index.html", node: [0, 0, 0], tag: "div", hostChain: undefined };
  const mapped = nativeComponentScopeSelection(wrapper, "index.html", components, ownSources, tagAt)!;
  assert.deepEqual(mapped.node, [0, 0]); assert.equal(mapped.tag, "a");
  for (const [node, tag] of [[[0, 0], "a"], [[0, 1], "button"], [[0, 2], "img"]] as const) {
    const atom = { ...wrapper, node: [...node], tag };
    assert.equal(nativeComponentScopeSelection(atom, "index.html", components, ownSources, tagAt), atom);
  }
  const card = { ...wrapper, node: [0, 3], tag: "article" };
  assert.equal(nativeComponentScopeSelection(card, "index.html", components, ownSources, tagAt, (_source, node) => node.join(".") === "0.3"), card);
  const direct = { ...wrapper, path: "outer.html" };
  assert.equal(nativeComponentScopeSelection(direct, "outer.html", components, sources, tagAt), direct);
});

test("locked parts name the nested instance in the outer template", () => {
  assert.deepEqual(nativeLockedComponentPart(selection, "index.html", components, sources, hostTag), {
    part: { path: "outer.html", node: [0], tag: "inner-card" },
    instance: { path: "index.html", node: [0, 1], tag: "outer-card" },
    source: sources["outer.html"],
  });
  assert.equal(nativeLockedComponentPart(selection, "index.html", components, sources, hostTag, true), undefined);
  assert.equal(nativeLockedComponentPart(selection, "index.html", { ...components, "inner-card": "wrong.html" }, sources, hostTag), undefined);
});

test("direct fixed clicks retain the part; slot fallback descendants do not", () => {
  const direct = { ...selection, hostChain: [selection.hostChain![1]], path: "outer.html", node: [0], tag: "p" };
  const tagAt = (source: string, node: readonly number[]) => source === sources["index.html"] ? hostTag(source, node) : node.length === 1 ? "p" : undefined;
  assert.deepEqual(nativeLockedComponentPart(direct, "index.html", components, sources, tagAt)?.part, { path: "outer.html", node: [0], tag: "p" });
  const placeholder = { ...direct, node: [0, 0, 0] };
  const fallbackTag = (source: string, node: readonly number[]) => source === sources["index.html"] ? hostTag(source, node) : ["div", "slot", "p"][node.length - 1];
  assert.equal(nativeLockedComponentPart(placeholder, "index.html", components, sources, fallbackTag), undefined);
  assert.equal(nativeLockedComponentPart({ ...direct, path: "index.html" }, "index.html", components, sources, tagAt), undefined);
  assert.equal(nativeLockedComponentPart({ ...direct, node: [99] }, "index.html", components, sources, hostTag), undefined);
});

test("a nested instance in an outer slot fallback is a placeholder, not a fixed part", () => {
  const nested = { ...selection, hostChain: [{ ...selection.hostChain![0], node: [0, 0] }, selection.hostChain![1]] };
  const tagAt = (source: string, node: readonly number[]) => source === sources["outer.html"]
    ? node.length === 1 ? "slot" : "inner-card" : hostTag(source, node);
  assert.equal(nativeLockedComponentPart(nested, "index.html", components, sources, tagAt), undefined);
});
