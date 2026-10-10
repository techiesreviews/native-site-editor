// The SourceTree contract (src/page-builder/source-tree.ts): one table of
// cases, each a page read and what it should say. tests/source-tree.test.ts
// runs it on the source adapter in Node; tests/source-tree-browser.test.ts
// runs it in Chromium on both adapters (the page adapter is the browser's
// parser, so it decides how the browser reads each case). Observations are
// plain data, so they cross from the browser to the assertions in Node.

import type { SourceTree } from "../../src/page-builder/source-tree";
import { hasHeadingSlot } from "../../src/page-builder/rules/cards";
import { itemKind } from "../../src/page-builder/rules/items";

export interface ContractCase {
  name: string;
  /** Read as a page: `readPage(source)`, `readSource(source, { page: true })`. */
  source: string;
  read: <N>(tree: SourceTree<N>) => unknown;
  expected: unknown;
  /** Where the page adapter (the browser) reads it differently: only `exact`, always true there. */
  page?: unknown;
}

/** The element tree as `name(children)`, comma separated. */
export function outline<N>(tree: SourceTree<N>, node?: N): string {
  return tree.children(node).map((el) => {
    const inside = outline(tree, el);
    return tree.view.name(el) + (inside ? `(${inside})` : "");
  }).join(",");
}

const ranges = <N>(tree: SourceTree<N>) => tree.elements().map((el) => {
  const range = tree.range(el);
  return range ? [tree.view.name(el), range.start, range.end, range.close?.start ?? null, range.tag.start, range.tag.end] : [tree.view.name(el), null];
});

const VOID_PAGE = "<div>A<br>B<br/>C<img src=\"x.png\" alt=\"\"/><span/>D</span>E</div>";
const voidAt = (text: string, from = 0) => VOID_PAGE.indexOf(text, from);

const ATTRIBUTE_PAGE = `<a href="/caf&eacute;/?a=1&amp;b=2" TITLE=&#233;t&eacute; data-legacy="&eacutex &eacute=" data-end="x&eacute" HIDDEN data-num='&#x41;&#66;&#128;' data-lf="a\r\nb\rc" Class = Big>A</a>`;

export const contractCases: ContractCase[] = [
  {
    name: "the page part is a document's <body> content",
    source: "<!doctype html><html><head><title>T</title><script>x()</script></head><body><main><h1>Hi</h1></main><footer>f</footer></body></html>",
    read: (tree) => [outline(tree), tree.text()],
    expected: ["main(h1),footer", "Hif"],
  },
  {
    name: "without a <body> tag the page part follows </head>",
    source: "<!doctype html><html><head><title>T</title></head><main><p>A</p></main></html>",
    read: (tree) => [outline(tree), tree.text()],
    expected: ["main(p)", "A"],
  },
  {
    name: "a template or fragment is its whole text",
    source: "<section><h2>A</h2></section>\n<p>B</p>",
    read: (tree) => [outline(tree), tree.text()],
    expected: ["section(h2),p", "A\nB"],
  },
  {
    name: "scripts and refresh metas are dropped; other metas stay",
    source: "<body><script>top()</script><div><script>a()</script><p>A</p><meta http-equiv=\"Refresh\" content=\"0\"><meta name=\"x\"><meta http-equiv=\"content-type\"></div></body>",
    read: (tree) => [outline(tree), tree.text(), tree.view.name(tree.at([0, 0])!), tree.at([0, 3]) === undefined],
    expected: ["div(p,meta,meta)", "A", "p", true],
  },
  {
    name: "a <template>'s content is not its children",
    source: "<div><template><p>Hidden</p><span>x</span></template><p>Shown</p></div>",
    read: (tree) => {
      const template = tree.at([0, 0])!;
      return [outline(tree), tree.text(), tree.elements().length, tree.children(template).length, tree.elements(template).length, tree.text(template), tree.view.children(template).length];
    },
    expected: ["div(template,p)", "Shown", 3, 0, 0, "", 0],
  },
  {
    name: "comments are out of children and text",
    source: "<div><!-- <p>no</p> --><p>A<!-- c -->B</p></div>",
    read: (tree) => [outline(tree), tree.text(), tree.text(tree.at([0, 0]))],
    expected: ["div(p)", "AB", "AB"],
  },
  {
    name: "raw text: style and xmp keep references, textarea and title decode them, tags inside are text",
    source: "<style>a > b::after { content: \"&amp;<div>\" }</style><xmp>&lt;</xmp><textarea>&lt;x&gt;</textarea><title>T&amp;</title>",
    read: (tree) => [outline(tree), tree.children().map((el) => tree.text(el)), tree.children().map((el) => {
      const text = tree.view.children(el).filter((node) => tree.view.kind(node) === "text");
      return text.map((node) => tree.view.text(node)).join("");
    })],
    expected: ["style,xmp,textarea,title",
      ["a > b::after { content: \"&amp;<div>\" }", "&lt;", "<x>", "T&"],
      ["a > b::after { content: \"&amp;<div>\" }", "&lt;", "<x>", "T&"]],
  },
  {
    name: "<noscript> holds markup, read as elements (template-context parsing, no scripting)",
    source: "<noscript><p>A &amp; B</p></noscript>",
    read: (tree) => [outline(tree), tree.text()],
    expected: ["noscript(p)", "A & B"],
  },
  {
    name: "void and self-closing tags: void elements hold nothing, a non-void's slash is ignored",
    source: VOID_PAGE,
    read: (tree) => [outline(tree), tree.text(tree.at([0, 3])), ranges(tree)],
    expected: ["div(br,br,img,span)", "D", [
      ["div", 0, VOID_PAGE.length, voidAt("</div>"), 0, 5],
      ["br", voidAt("<br>"), voidAt("B"), null, voidAt("<br>"), voidAt("B")],
      ["br", voidAt("<br/>"), voidAt("C"), null, voidAt("<br/>"), voidAt("C")],
      ["img", voidAt("<img"), voidAt("<span"), null, voidAt("<img"), voidAt("<span")],
      ["span", voidAt("<span"), voidAt("E"), voidAt("</span>"), voidAt("<span"), voidAt("D")]]],
  },
  {
    name: "CR LF and lone CR read as LF in text and attribute values; <pre>'s first newline is dropped",
    source: "<p title=\"a\r\nb\rc\">x\r\ny\rz</p><pre>\r\nP\r\n</pre><textarea>\nT</textarea><pre>&#10;R</pre><pre>&#13;S</pre><pre><!-- c -->\nU</pre>",
    read: (tree) => [tree.text(), tree.attribute(tree.at([0])!, "title")?.value, tree.children().slice(1).map((el) => tree.text(el))],
    expected: ["x\ny\nzP\nTR\rS\nU", "a\nb\nc", ["P\n", "T", "R", "\rS", "\nU"]],
  },
  {
    name: "a text-only fragment reads as text; U+00A0 is kept",
    source: "Caf&eacute; &amp;&nbsp;more &lt;b&gt;",
    read: (tree) => [tree.text(), tree.children().length, tree.elements().length, tree.at([0]) === undefined],
    expected: ["Café & more <b>", 0, 0, true],
  },
  {
    name: "balanced markup is exact",
    source: "<div><span>A</span><p>B</p></div>",
    read: (tree) => tree.exact,
    expected: true,
  },
  {
    name: "an element closed by an ancestor's end tag is not exact",
    source: "<div><span>A</div>",
    read: (tree) => [tree.exact, outline(tree), tree.range(tree.at([0])!) !== undefined, tree.range(tree.at([0, 0])!)],
    expected: [false, "div(span)", true, undefined],
    page: [true, "div(span)", true, undefined],
  },
  {
    name: "a stray end tag is not exact",
    source: "<div>A</div></span>",
    read: (tree) => [tree.exact, outline(tree)],
    expected: [false, "div"],
    page: [true, "div"],
  },
  {
    name: "an element left open is not exact",
    source: "<div><p>A</p>",
    read: (tree) => [tree.exact, outline(tree), tree.range(tree.at([0])!)],
    expected: [false, "div(p)", undefined],
    page: [true, "div(p)", undefined],
  },
  {
    name: "raw text left open is not exact; it holds the rest as text",
    source: "<p>A</p><style>a{}",
    read: (tree) => [tree.exact, outline(tree), tree.range(tree.at([1])!), tree.text()],
    expected: [false, "p,style", undefined, "Aa{}"],
    page: [true, "p,style", undefined, "Aa{}"],
  },
  {
    name: "a start tag cut off at the end is not exact",
    source: "<p>A</p><img src=\"x",
    read: (tree) => [tree.exact, tree.text()],
    expected: [false, "A"],
    page: [true, "A"],
  },
  {
    // Not exact, so read as written: the browser drops the cut-off tag, the source adapter keeps it as text.
    name: "an end tag cut off at the end is not exact",
    source: "<p>A</p></div",
    read: (tree) => [tree.exact, outline(tree), tree.text()],
    expected: [false, "p", "A</div"],
    page: [true, "p", "A"],
  },
  {
    name: "at and path round trip, counted as the preview counts",
    source: "<main><script>x</script><section><h2>A</h2><div><p>1</p><p>2</p></div></section><!-- c --><footer></footer></main>",
    read: (tree) => {
      const all = tree.elements();
      return [all.map((el) => tree.path(el).join(".")), all.every((el) => tree.at(tree.path(el)) === el), tree.at([0, 9]), tree.at([])];
    },
    expected: [["0", "0.0", "0.0.0", "0.0.1", "0.0.1.0", "0.0.1.1", "0.1"], true, undefined, undefined],
  },
  {
    // elementEnd's rule: the end tag is the one past every same-named descendant's, before the next
    // start tag outside the element, so a last child inside a same-named parent fails closed.
    name: "range: exact with same-named nesting, undefined for an implied or ambiguous end tag",
    source: "<div><div>A</div><div><div>B</div></div></div><p>.</p><ul><li>X<li>Y</ul>",
    read: (tree) => ranges(tree),
    expected: [["div", 0, 46, 40, 0, 5], ["div", 5, 17, 11, 5, 10], ["div", null], ["div", null],
      ["p", 46, 54, 50, 46, 49], ["ul", 54, 73, 68, 54, 58], ["li", null], ["li", null]],
  },
  {
    name: "attribute: values decoded as the browser decodes attribute values, with their spans",
    source: ATTRIBUTE_PAGE,
    read: (tree) => {
      const a = tree.at([0])!;
      return [
        ...["href", "title", "data-legacy", "data-end", "hidden", "data-num", "data-lf", "class", "missing"].map((name) => tree.attribute(a, name)?.value),
        tree.attribute(a, "href"), tree.attribute(a, "hidden"), tree.attribute(a, "class"),
      ];
    },
    expected: ["/café/?a=1&b=2", "été", "&eacutex &eacute=", "xé", "", "AB€", "a\nb\nc", "Big", undefined,
      { start: 2, end: ATTRIBUTE_PAGE.indexOf(" TITLE"), valueStart: 9, valueEnd: ATTRIBUTE_PAGE.indexOf(" TITLE") - 1, value: "/café/?a=1&b=2" },
      { start: ATTRIBUTE_PAGE.indexOf(" HIDDEN"), end: ATTRIBUTE_PAGE.indexOf(" HIDDEN") + 7, valueStart: ATTRIBUTE_PAGE.indexOf(" HIDDEN") + 7,
        valueEnd: ATTRIBUTE_PAGE.indexOf(" HIDDEN") + 7, value: "" },
      { start: ATTRIBUTE_PAGE.indexOf(" Class"), end: ATTRIBUTE_PAGE.indexOf("Big") + 3, valueStart: ATTRIBUTE_PAGE.indexOf("Big"),
        valueEnd: ATTRIBUTE_PAGE.indexOf("Big") + 3, value: "Big" }],
  },
  {
    name: "view: the shared rules read a heading slot through either tree",
    source: "<article><slot name=\"title\">\n  <!-- t -->\n  <h3>T</h3>\n</slot><slot name=\"body\"><p>B</p></slot></article><article><slot name=\"body\"><p>B</p></slot></article>",
    read: (tree) => tree.children().map((el) => hasHeadingSlot([el], tree.view)),
    expected: [true, false],
  },
  {
    name: "view: item kinds from names and decoded classes",
    source: "<div class=\"cards\"><article class=\"card b\">1</article><article class=\" b\tcard \">2</article><figure>3</figure><card-x>4</card-x><section>5</section><a class=\"x&amp;y\">6</a></div>",
    read: (tree) => tree.children(tree.at([0])).map((el) => itemKind(tree.view.name(el), tree.attribute(el, "class")?.value) ?? null),
    expected: ["article.b.card", "article.b.card", "figure", "card-x", null, "a.x&y"],
  },
];

/** Markup the browser repairs while the source adapter reads it as written: the outlines differ, as listed. */
export const repairedPages = [
  { source: "<table><tr><td>A</td></tr></table>", page: "table(tbody(tr(td)))", written: "table(tr(td))" },
  { source: "<p>A<div>B</div></p>", page: "p,div,p", written: "p(div)" },
  { source: "<ul><li>A<li>B</ul>", page: "ul(li,li)", written: "ul(li(li))" },
];

/** Every element of a page as both adapters must agree on it: path, name, range, attributes, text. */
export function dump<N>(tree: SourceTree<N>, attributes: readonly string[]) {
  return {
    text: tree.text(),
    elements: tree.elements().map((el) => {
      const range = tree.range(el);
      return {
        path: tree.path(el).join("."),
        name: tree.view.name(el),
        range: range ? [range.start, range.end, range.close?.start ?? null] : null,
        attributes: Object.fromEntries(attributes.flatMap((name) => {
          const found = tree.attribute(el, name);
          return found ? [[name, [found.start, found.end, found.value]]] : [];
        })),
        text: tree.text(el),
        children: tree.view.children(el).filter((node) => tree.view.kind(node) !== "other").length,
      };
    }),
  };
}
