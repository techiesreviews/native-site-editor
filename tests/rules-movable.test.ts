import test from "node:test";
import assert from "node:assert/strict";
import { isCustomElementName, isInstance, movableBlock, sealed, SEALED_TAGS } from "../src/page-builder/rules/movable.ts";
import { domView, type DomLikeNode } from "../src/page-builder/rules/tree.ts";
import { nativeMovableBlock, nativeOutline } from "../src/page-builder/native-operations.ts";

// One rule, two trees: each case is a page as written (the editor reads it
// through native-operations' strict tree, `nativeMovableBlock`) and the
// nodes the browser makes of it (the runtime reads them through `domView`).
// An instance's seal opens only towards a child in an items slot.

const HTML = "http://www.w3.org/1999/xhtml", SVG = "http://www.w3.org/2000/svg", MATH = "http://www.w3.org/1998/Math/MathML";
type Dom = DomLikeNode & { childNodes: Dom[]; parentElement: Dom | null; slot?: string };
const el = (localName: string, children: (Dom | string)[] = [], options: { slot?: string; ns?: string } = {}): Dom => {
  const node: Dom = { nodeType: 1, localName, namespaceURI: options.ns ?? HTML, childNodes: [], parentElement: null, slot: options.slot ?? "" };
  for (const child of children) {
    const kid: Dom = typeof child === "string" ? { nodeType: 3, data: child, childNodes: [], parentElement: null } : child;
    kid.parentElement = node;
    node.childNodes.push(kid);
  }
  return node;
};
const svg = (localName: string, children: Dom[] = []) => el(localName, children, { ns: SVG });
const dom = domView<Dom>(() => false);
const at = (body: Dom, path: number[]) => path.reduce<Dom | undefined>((node, step) => node && node.childNodes.filter((child) => child.nodeType === 1)[step], body);

// `section-work`'s unnamed slot is its items slot; `title` is a text slot.
const items = (tag: string, slot: string) => tag === "section-work" && slot === "";
const opensInto = (instance: Dom, child: Dom) => items(instance.localName ?? "", child.slot ?? "");

const cases: { name: string; html: string; body: Dom; path: number[]; movable: boolean }[] = [
  { name: "a block in a section", html: "<main><section><p>A</p></section></main>", body: el("body", [el("main", [el("section", [el("p", ["A"])])])]), path: [0, 0, 0], movable: true },
  { name: "a section in <main>", html: "<main><section><p>A</p></section></main>", body: el("body", [el("main", [el("section", [el("p", ["A"])])])]), path: [0, 0], movable: true },
  { name: "<main> itself", html: "<main><section></section></main>", body: el("body", [el("main", [el("section")])]), path: [0], movable: false },
  { name: "a header outside <main>", html: "<header><p>Top</p></header><main></main>", body: el("body", [el("header", [el("p", ["Top"])]), el("main")]), path: [0], movable: false },
  { name: "a block in a footer outside <main>", html: "<main></main><footer><p>End</p></footer>", body: el("body", [el("main"), el("footer", [el("p", ["End"])])]), path: [1, 0], movable: false },
  { name: "an instance (moves whole)", html: "<main><section-work><p>In</p></section-work></main>", body: el("body", [el("main", [el("section-work", [el("p", ["In"])])])]), path: [0, 0], movable: true },
  { name: "a block in an instance's items slot", html: "<main><section-work><p>In</p></section-work></main>", body: el("body", [el("main", [el("section-work", [el("p", ["In"])])])]), path: [0, 0, 0], movable: true },
  { name: "a block inside a block in an items slot", html: "<main><section-work><div><p>In</p></div></section-work></main>", body: el("body", [el("main", [el("section-work", [el("div", [el("p", ["In"])])])])]), path: [0, 0, 0, 0], movable: true },
  { name: "a block in a named, non-items slot", html: '<main><section-work><h2 slot="title">T</h2></section-work></main>', body: el("body", [el("main", [el("section-work", [el("h2", ["T"], { slot: "title" })])])]), path: [0, 0, 0], movable: false },
  { name: "a block in another component's unnamed slot", html: "<main><card-x><p>In</p></card-x></main>", body: el("body", [el("main", [el("card-x", [el("p", ["In"])])])]), path: [0, 0, 0], movable: false },
  { name: "a block in an items slot of an instance in a named slot", html: '<main><section-work><section-work slot="title"><p>In</p></section-work></section-work></main>', body: el("body", [el("main", [el("section-work", [el("section-work", [el("p", ["In"])], { slot: "title" })])])]), path: [0, 0, 0, 0], movable: false },
  { name: "<svg>", html: "<main><svg><g></g></svg></main>", body: el("body", [el("main", [svg("svg", [svg("g")])])]), path: [0, 0], movable: false },
  { name: "inside <svg>", html: "<main><svg><g></g></svg></main>", body: el("body", [el("main", [svg("svg", [svg("g")])])]), path: [0, 0, 0], movable: false },
  { name: "HTML in an SVG <foreignObject>", html: "<main><svg><foreignObject><div></div></foreignObject></svg></main>", body: el("body", [el("main", [svg("svg", [svg("foreignObject", [el("div")])])])]), path: [0, 0, 0, 0], movable: false },
  { name: "<math>", html: "<main><math><mi>x</mi></math></main>", body: el("body", [el("main", [el("math", [el("mi", ["x"], { ns: MATH })], { ns: MATH })])]), path: [0, 0], movable: false },
  { name: "<template> (its content is no child)", html: "<main><template><p>t</p></template></main>", body: el("body", [el("main", [el("template")])]), path: [0, 0], movable: false },
  { name: "<noscript>", html: "<main><noscript>Turn on JavaScript</noscript></main>", body: el("body", [el("main", [el("noscript", ["Turn on JavaScript"])])]), path: [0, 0], movable: false },
];

for (const { name, html, body, path, movable } of cases) {
  test(`movable block: ${name}`, () => {
    assert.equal(nativeMovableBlock(html, path, items), movable, "source view");
    const node = at(body, path);
    assert.ok(node, "DOM path");
    assert.equal(movableBlock(node, dom, opensInto), movable, "DOM view");
  });
}

test("without the items slot rule, no instance's seal opens", () => {
  const html = "<main><section-work><p>In</p></section-work></main>";
  assert.equal(nativeMovableBlock(html, [0, 0, 0]), false);
  assert.equal(nativeMovableBlock(html, [0, 0]), true);
  const body = el("body", [el("main", [el("section-work", [el("p", ["In"])])])]);
  assert.equal(movableBlock(at(body, [0, 0, 0])!, dom, () => false), false);
});

test("a reserved name is no custom element: not sealed, no instance (the runtime used to seal any name with a dash)", () => {
  for (const name of ["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"]) {
    assert.equal(isCustomElementName(name), false, name);
  }
  const body = el("body", [el("main", [el("font-face", [el("p", ["x"])])])]);
  assert.equal(sealed(at(body, [0, 0])!, dom), false);
  assert.equal(isInstance(at(body, [0, 0])!, dom), false);
  assert.equal(movableBlock(at(body, [0, 0, 0])!, dom, opensInto), true);
  // The editor's strict tree does not read the page at all: nothing there moves.
  assert.equal(nativeMovableBlock("<main><font-face><p>x</p></font-face></main>", [0, 0, 0], items), false);
});

test("custom element names: a lower-case letter first, a dash, no reserved name", () => {
  for (const name of ["card-x", "section-work", "a-", "x-1.2_b", "my-element-name"]) assert.equal(isCustomElementName(name), true, name);
  for (const name of ["div", "-x", "1-x", "x", "Card-x", "x-ü", "font-face"]) assert.equal(isCustomElementName(name), false, name);
});

test("sealed: an instance, a sealed tag, or foreign content, on both trees", () => {
  const html = "<main><card-x></card-x><template></template><svg><g></g><foreignObject><div></div></foreignObject></svg><div></div></main>";
  const outline = nativeOutline(html)!;
  const main = outline.children[0];
  assert.deepEqual(main.children.map((child) => [child.name, child.opaque]), [["card-x", true], ["template", true], ["svg", true], ["div", false]]);
  assert.deepEqual(main.children[2].children.map((child) => child.opaque), [true, true]);
  assert.equal(main.children[2].children[1].children[0].opaque, false, "HTML in <foreignObject> is HTML again");
  const body = el("body", [el("main", [el("card-x"), el("template"), svg("svg", [svg("g"), svg("foreignObject", [el("div")])]), el("div")])]);
  assert.deepEqual([0, 1, 2, 3].map((index) => sealed(at(body, [0, index])!, dom)), [true, true, true, false]);
  assert.deepEqual([0, 1].map((index) => sealed(at(body, [0, 2, index])!, dom)), [true, true]);
  assert.equal(sealed(at(body, [0, 2, 1, 0])!, dom), false);
  assert.equal(isInstance(at(body, [0, 0])!, dom), true);
  assert.equal(isInstance(at(body, [0, 2])!, dom), false);
  for (const tag of SEALED_TAGS) assert.equal(sealed(el(tag), dom), true, tag);
});

test("text is never sealed nor a block", () => {
  const body = el("body", [el("main", [el("section", ["Hi"])])]);
  const text = at(body, [0, 0])!.childNodes[0];
  assert.equal(sealed(text, dom), false);
  assert.equal(movableBlock(text, dom, opensInto), false);
});
