import test from "node:test";
import assert from "node:assert/strict";
import { hasHeadingSlot, isCardSlot, isCardTag, isItemsSlot } from "../src/page-builder/rules/cards.ts";
import { domView, meaningful, type DomLikeNode, type RuleView } from "../src/page-builder/rules/tree.ts";
import { isCardComponent, parseSource, readInstance, slotStates, sourceView, templateSlots, type SourceElement, type SourceNode } from "../src/page-builder/component-model.ts";
import { cardSlotOf } from "../src/page-builder/card-slot.ts";

// One rule, two trees: each case is a template as written (the editor reads
// it through `sourceView`) and the nodes the browser makes of it (the
// runtime reads them through `domView`). The browser's reading wins: text
// is decoded and only ASCII white space is blank, so U+00A0 is text and
// `&#32;` is not; a slot's name is not trimmed.

type Dom = DomLikeNode & { childNodes: Dom[]; parentElement: Dom | null; attributes?: Record<string, string>; shadow?: Dom[] };
const el = (localName: string, children: (Dom | string)[] = [], attributes?: Record<string, string>): Dom => {
  const node: Dom = { nodeType: 1, localName, childNodes: [], parentElement: null, ...(attributes ? { attributes } : {}) };
  for (const child of children) {
    const kid: Dom = typeof child === "string" ? { nodeType: 3, data: child, childNodes: [], parentElement: null } : child;
    kid.parentElement = node;
    node.childNodes.push(kid);
  }
  return node;
};
const comment = (data: string): Dom => ({ nodeType: 8, data, childNodes: [], parentElement: null });
/** A shadow root's children: top-level nodes have no parent element. */
const roots = (...nodes: Dom[]) => nodes;
// The runtime hides its own injected styles.
const injected = (element: Dom) => element.localName === "style" && (element.attributes?.["data-native-css"] !== undefined || element.attributes?.["data-native-component-css"] !== undefined);
const dom = domView<Dom>(injected);
const fromSource = (html: string) => ({ nodes: parseSource(html), view: sourceView(html) });

const headingCases: { name: string; html: string; dom: Dom[]; heading: boolean }[] = [
  { name: "a slot that is a heading's only content", html: '<article><h2><slot name="title"></slot></h2></article>', dom: roots(el("article", [el("h2", [el("slot", [], { name: "title" })])])), heading: true },
  { name: "a slot holding a heading", html: '<slot name="title"><h3>Untitled</h3></slot>', dom: roots(el("slot", [el("h3", ["Untitled"])], { name: "title" })), heading: true },
  { name: "ASCII white space around it", html: '<h2>\n  <slot name="t"></slot>\t</h2>', dom: roots(el("h2", ["\n  ", el("slot", [], { name: "t" }), "\t"])), heading: true },
  { name: "a comment beside it", html: '<h2><slot name="t"></slot><!-- title --></h2>', dom: roots(el("h2", [el("slot", [], { name: "t" }), comment(" title ")])), heading: true },
  { name: "words beside it", html: '<h2>Hi <slot name="t"></slot></h2>', dom: roots(el("h2", ["Hi ", el("slot", [], { name: "t" })])), heading: false },
  { name: "an element beside it", html: '<h2><slot name="t"></slot><span></span></h2>', dom: roots(el("h2", [el("slot", [], { name: "t" }), el("span")])), heading: false },
  // The two disagreements the shared rule settles.
  { name: "a literal U+00A0 beside it (text to the browser)", html: '<h2> <slot name="t"></slot></h2>', dom: roots(el("h2", [" ", el("slot", [], { name: "t" })])), heading: false },
  { name: "&#32; beside it (a space to the browser)", html: '<h2>&#32;<slot name="t"></slot></h2>', dom: roots(el("h2", [" ", el("slot", [], { name: "t" })])), heading: true },
  { name: "&nbsp; beside it", html: '<h2>&nbsp;<slot name="t"></slot></h2>', dom: roots(el("h2", [" ", el("slot", [], { name: "t" })])), heading: false },
  { name: "&#32; around the heading in its slot", html: '<slot name="t">&#32;<h3>T</h3>&#10;</slot>', dom: roots(el("slot", [" ", el("h3", ["T"]), "\n"], { name: "t" })), heading: true },
  { name: "U+00A0 around the heading in its slot", html: '<slot name="t"><h3>T</h3> </slot>', dom: roots(el("slot", [el("h3", ["T"]), " "], { name: "t" })), heading: false },
  { name: "a heading slot in another slot's fallback", html: '<slot name="body"><h2><slot name="title"></slot></h2><p>x</p></slot>', dom: roots(el("slot", [el("h2", [el("slot", [], { name: "title" })]), el("p", ["x"])], { name: "body" })), heading: true },
  { name: "a heading slot in a nested instance's content", html: '<card-note><h3><slot name="title" slot="text"></slot></h3></card-note>', dom: roots(el("card-note", [el("h3", [el("slot", [], { name: "title", slot: "text" })])])), heading: true },
  { name: "a heading slot inside <template> (inert content, no children)", html: '<template><h2><slot name="t"></slot></h2></template>', dom: roots(el("template")), heading: false },
  { name: "a heading without a slot", html: "<h2>Title</h2><slot></slot>", dom: roots(el("h2", ["Title"]), el("slot")), heading: false },
  { name: "a slot at the top level (no heading parent)", html: '<slot name="t"></slot>', dom: roots(el("slot", [], { name: "t" })), heading: false },
];

for (const { name, html, dom: nodes, heading } of headingCases) {
  test(`heading slot: ${name}`, () => {
    const source = fromSource(html);
    assert.equal(hasHeadingSlot(source.nodes, source.view), heading, "source view");
    assert.equal(hasHeadingSlot(nodes, dom), heading, "DOM view");
  });
}

test("the DOM view leaves out the runtime's injected styles", () => {
  const style = el("style", ["h2{}"], { "data-native-component-css": "" });
  const nodes = roots(el("h2", [el("slot", [], { name: "t" }), style]));
  assert.equal(hasHeadingSlot(nodes, dom), true);
  assert.equal(hasHeadingSlot(nodes, domView<Dom>(() => false)), false);
  assert.deepEqual(meaningful(dom.children(nodes[0]), dom).map((node) => node.localName), ["slot"]);
});

// Card components for the slot rules: card-a has a heading slot, card-b has none.
const templates: Record<string, string> = {
  "card-a": '<article><h3><slot name="title"></slot></h3></article>',
  "card-b": '<p><slot name="text">Note</slot></p>',
};
const templateOf = (tag: string) => templates[tag];
const sourceCard = (node: SourceNode) => node.type === "element" && isCardComponent(node.name, templateOf);
const shadows: Record<string, Dom[]> = {
  "card-a": roots(el("article", [el("h3", [el("slot", [], { name: "title" })])])),
  "card-b": roots(el("p", [el("slot", ["Note"], { name: "text" })])),
};
// As the runtime's isCardElement: a card-… element with a template that has a heading slot.
const domCard = (node: Dom) => isCardTag(node.localName ?? "") && node.localName! in shadows && hasHeadingSlot(shadows[node.localName!], dom);

const slotCases: { name: string; html: string; dom: Dom; card: boolean; items: boolean }[] = [
  { name: "the unnamed slot, empty", html: "<slot></slot>", dom: el("slot"), card: false, items: true },
  { name: "the unnamed slot holding a card", html: "<slot><card-a></card-a></slot>", dom: el("slot", [el("card-a")]), card: true, items: true },
  { name: "a named slot holding a card", html: '<slot name="cards"><card-a></card-a></slot>', dom: el("slot", [el("card-a")], { name: "cards" }), card: true, items: true },
  { name: "cards with blank text and &#32; between them", html: '<slot name="cards">\n  <card-a></card-a> &#32;\n  <card-a></card-a>\n</slot>', dom: el("slot", ["\n  ", el("card-a"), "  \n  ", el("card-a"), "\n"], { name: "cards" }), card: true, items: true },
  { name: "cards with words between them", html: '<slot name="cards"><card-a></card-a> and <card-a></card-a></slot>', dom: el("slot", [el("card-a"), " and ", el("card-a")], { name: "cards" }), card: false, items: false },
  { name: "cards with U+00A0 between them", html: '<slot name="cards"><card-a></card-a>&nbsp;<card-a></card-a></slot>', dom: el("slot", [el("card-a"), " ", el("card-a")], { name: "cards" }), card: false, items: false },
  { name: "a card and a paragraph", html: '<slot name="cards"><card-a></card-a><p>Or this</p></slot>', dom: el("slot", [el("card-a"), el("p", ["Or this"])], { name: "cards" }), card: false, items: false },
  { name: "an instance that is no card (no heading slot)", html: '<slot name="notes"><card-b></card-b></slot>', dom: el("slot", [el("card-b")], { name: "notes" }), card: false, items: false },
  { name: "a named slot, empty", html: '<slot name="cards"></slot>', dom: el("slot", [], { name: "cards" }), card: false, items: false },
  { name: "a slot named with a space (named to the browser)", html: '<slot name=" "></slot>', dom: el("slot", [], { name: " " }), card: false, items: false },
];

for (const { name, html, dom: slot, card, items } of slotCases) {
  test(`card and items slot: ${name}`, () => {
    const { nodes, view } = fromSource(html);
    const element = nodes[0] as SourceElement;
    const written = templateSlots(html, templateOf)[0];
    assert.equal(isCardSlot(element, view, sourceCard), card, "card slot, source view");
    assert.equal(isItemsSlot(written.name, element.children, view, sourceCard), items, "items slot, source view");
    assert.equal(written.items, items, "templateSlots");
    assert.equal(isCardSlot(slot, dom, domCard), card, "card slot, DOM view");
    assert.equal(isItemsSlot(slot.attributes?.name ?? "", slot.childNodes, dom, domCard), items, "items slot, DOM view");
  });
}

test("the editor's card components follow the browser's reading of blank text", () => {
  const site: Record<string, string> = {
    "card-nbsp": '<article><h3> <slot name="title"></slot></h3></article>',
    "card-space": '<article><h3>&#32;<slot name="title"></slot></h3></article>',
    "section-list": '<section><slot name="items"><card-space></card-space></slot><slot name="other"><card-nbsp></card-nbsp></slot></section>',
  };
  const of = (tag: string) => site[tag];
  assert.equal(isCardComponent("card-nbsp", of), false);
  assert.equal(isCardComponent("card-space", of), true);
  assert.deepEqual(cardSlotOf("section-list", of), [{ slot: "items", card: "card-space" }]);
});

test("a slot named with white space keeps its name: not the unnamed items slot", () => {
  const slots = templateSlots('<section><slot name=" "></slot><slot name=" cards "><card-a></card-a></slot></section>', templateOf);
  assert.deepEqual(slots.map((slot) => [slot.name, slot.items]), [[" ", false], [" cards ", true]]);
  assert.deepEqual(cardSlotOf("section-x", (tag) => (tag === "section-x" ? '<section><slot name=" cards "><card-a></card-a></slot></section>' : templateOf(tag))), [{ slot: " cards ", card: "card-a" }]);
});

test("a page fills a slot named with white space by that same name, as the browser assigns it", () => {
  const template = '<section><slot name=" title "><h2>Fallback</h2></slot><slot name="title"><p>Other</p></slot></section>';
  const page = '<section-x><h2 slot=" title ">Mine</h2></section-x>';
  const [host] = parseSource(page) as SourceElement[];
  const states = slotStates(template, readInstance(page, { tag: host.tag, start: host.start, end: host.end, close: host.close }));
  assert.equal(states.get(" title ")?.filled, true);
  assert.equal(states.get("title")?.filled, false);
});

test("the source view reads text decoded and a template's content as no children", () => {
  const html = "<p>a&amp;b</p><template><p>x</p></template>";
  const [p, template] = parseSource(html) as SourceElement[];
  const view: RuleView<SourceNode> = sourceView(html);
  assert.equal(view.text(p.children[0]), "a&b");
  assert.deepEqual(view.children(template), []);
  assert.equal(view.parent(p.children[0]), p);
  assert.equal(view.parent(p), undefined);
});
