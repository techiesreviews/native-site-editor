import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, plain, readSource, sourceView, type SourceNode } from "../src/page-builder/source-tree.ts";
import { contractCases, outline } from "./fakes/source-tree-contract.ts";

// The contract on the source adapter; tests/source-tree-browser.test.ts runs
// the same table on the page adapter in Chromium and pins the two together.
for (const contract of contractCases) {
  test(`source adapter: ${contract.name}`, () => {
    assert.deepEqual(contract.read(readSource(contract.source, { page: true })), contract.expected);
  });
}

test("without `page`, markup reads as written: scripts and the document around the body stay", () => {
  const html = "<html><head><title>T</title></head><body><script>x()</script><p>A</p></body></html>";
  const tree = readSource(html);
  assert.equal(outline(tree), "html(head(title),body(script,p))");
  assert.equal(tree.text(tree.at([0, 1, 0])), "x()");
  assert.equal(tree.exact, true);
});

test("from and to read a stretch, with offsets into the whole source", () => {
  const html = "<main><article class=\"card\"><h3>Caf&eacute;</h3><p>Body</p></article><article><h3>Two</h3></article></main>";
  const from = html.indexOf("<article");
  const to = html.indexOf("</article>") + "</article>".length;
  const tree = readSource(html, { from, to });
  assert.equal(outline(tree), "article(h3,p)");
  assert.equal(tree.exact, true);
  const card = tree.at([0])!;
  assert.deepEqual(tree.range(card), { tag: { name: "article", start: from, nameEnd: from + 8, end: html.indexOf("<h3>") }, start: from, end: to, close: { start: to - 10, end: to } });
  assert.equal(tree.attribute(card, "class")?.value, "card");
  assert.equal(plain(tree.text(tree.at([0, 0]))), "Café");
  assert.deepEqual(tree.path(tree.at([0, 1])!), [0, 1]);
});

test("a node from another tree has no path or range here; nothing throws", () => {
  const tree = readSource("<div><p>A</p></div>");
  const other = readSource("<section><p>B</p></section>").at([0, 0])!;
  assert.deepEqual(tree.path(other), []);
  assert.equal(tree.range(other), undefined);
});

test("a stretch cut inside an element is not exact", () => {
  const html = "<div><p>A</p><p>B</p></div>";
  assert.equal(readSource(html, { from: 0, to: html.indexOf("<p>B") }).exact, false);
});

test("parseSource reads the same nodes it always did: exact is recorded, not acted on", () => {
  const nodes = parseSource("<div><span>A</div></i><p>B");
  const shape = (list: SourceNode[]): unknown[] => list.map((node) => node.type === "text" ? [node.start, node.end] : [node.name, node.start, node.end, node.close ?? null, shape(node.children)]);
  assert.deepEqual(shape(nodes), [
    ["div", 0, 18, { start: 12, end: 18 }, [["span", 5, 12, null, [[11, 12]]]]],
    ["p", 22, 26, null, [[25, 26]]],
  ]);
});

test("sourceView reads text as the browser does: raw text undecoded, CR as LF", () => {
  const html = "<style>a::after{content:\"&amp;\"}</style><p>x&amp;\r\ny\rz</p>";
  const view = sourceView(html);
  const [style, p] = parseSource(html) as Extract<SourceNode, { type: "element" }>[];
  assert.equal(view.text(style.children[0]), "a::after{content:\"&amp;\"}");
  assert.equal(view.text(p.children[0]), "x&\ny\nz");
});

test("plain: white space runs to one space, NBSP included, ends trimmed", () => {
  assert.equal(plain("  Café  \n\tRio  "), "Café Rio");
  assert.equal(plain(""), "");
});
