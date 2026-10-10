import test from "node:test";
import assert from "node:assert/strict";
import { blockMarkup, clickTarget, itemsSlotRule, templateClickTarget, templateDropRefusal, templateMovePath, templateMoveRefusal, type BlockTarget } from "../src/page-builder/block-insert.ts";
import { templateSlotRefusal } from "../src/page-builder/native-elements.ts";
import { applyGuardedSourceEdit, nativeMarkupInsertEdit, nativeMoveEdit, nativeOutline } from "../src/page-builder/native-operations.ts";
import type { NativeElementKind } from "../src/page-builder/native-elements.ts";

// Body paths: <site-header> [0], <main> [1], <site-footer> [2].
const page = (main: string) => `<!doctype html><html><head><title>T</title></head><body><site-header></site-header><main class="page">${main}</main><site-footer></site-footer></body></html>`;
const home = page('<section-hero><h1 slot="title">Hi</h1></section-hero><section class="flow" id="work"><h2>Recent work</h2><p>Intro</p><div class="cards"><card-project><h3 slot="title">A</h3></card-project></div><ul><li>One</li></ul></section><section class="flow"><h2>Contact</h2></section>');
const ok = (target: BlockTarget) => { assert.ok(target.ok, target.ok ? "" : target.reason); return target; };
const at = (target: BlockTarget) => { const t = ok(target); return { parent: t.parent, index: t.index, wrap: t.wrap }; };

test("a selected Section or Div takes the block inside, at the end", () => {
  assert.deepEqual(at(clickTarget(home, "paragraph", [1, 1])), { parent: [1, 1], index: 4, wrap: false });
  assert.deepEqual(at(clickTarget(home, "div", [1, 1])), { parent: [1, 1], index: 4, wrap: false });
  assert.deepEqual(at(clickTarget(home, "heading", [1, 1, 2])), { parent: [1, 1, 2], index: 1, wrap: false });
  const target = ok(clickTarget(home, "image", [1, 2]));
  assert.equal(target.where, "Into Section “Contact” › after Heading");
  assert.deepEqual(target.select, [1, 2, 1]);
});

test("a selected leaf takes the block right after it, in its container", () => {
  const target = ok(clickTarget(home, "paragraph", [1, 1, 0]));
  assert.deepEqual([target.parent, target.index], [[1, 1], 1]);
  assert.equal(target.where, "Into Section “Recent work” › after Heading");
  // Inside a list or inline text: after the element that sits in the Section.
  assert.deepEqual(at(clickTarget(home, "button", [1, 1, 3, 0])), { parent: [1, 1], index: 4, wrap: false });
  assert.deepEqual(at(clickTarget(page('<section><p>Hi <a class="btn" href="#">Go</a></p></section>'), "image", [1, 0, 0, 0])), { parent: [1, 0], index: 1, wrap: false });
  // Blocks go only into a Section or a Div (ticket 10): a figure's image takes the block after the figure.
  assert.deepEqual(at(clickTarget(page('<section><figure><img src="/a.png" alt=""></figure><p>B</p></section>'), "paragraph", [1, 0, 0, 0])), { parent: [1, 0], index: 1, wrap: false });
});

test("a Section always goes after the selection's page band, never nested", () => {
  for (const selection of [[1, 1], [1, 1, 0], [1, 1, 2], [1, 1, 2, 0], [1, 1, 3, 0]]) {
    const target = ok(clickTarget(home, "section", selection));
    assert.deepEqual([target.parent, target.index], [[1], 2], String(selection));
    assert.equal(target.where, "Between page bands › after “Recent work”");
  }
  // A component band, its slotted content, and the page's header and footer.
  assert.deepEqual(at(clickTarget(home, "section", [1, 0, 0])), { parent: [1], index: 1, wrap: false });
  assert.equal(ok(clickTarget(home, "section", [1, 0])).where, "Between page bands › after Section hero");
  assert.deepEqual(at(clickTarget(home, "section", [0])), { parent: [1], index: 0, wrap: false });
  assert.deepEqual(at(clickTarget(home, "section", [2])), { parent: [1], index: 3, wrap: false });
  assert.equal(ok(clickTarget(home, "section", [0])).where, "Between page bands › before Section hero");
});

test("with nothing selected, a Section goes after the last band and other blocks into the last Section", () => {
  for (const selection of [undefined, [], [1], [7, 7]]) {
    assert.deepEqual(at(clickTarget(home, "section", selection)), { parent: [1], index: 3, wrap: false });
    assert.deepEqual(at(clickTarget(home, "heading", selection)), { parent: [1, 2], index: 1, wrap: false });
  }
  // The last plain Section, not a section component after it.
  assert.deepEqual(at(clickTarget(page('<section><p>A</p></section><section-hero></section-hero>'), "paragraph")), { parent: [1, 0], index: 1, wrap: false });
});

test("with no Section yet, a block comes in a new Section after the last band", () => {
  for (const main of ["", "<section-hero></section-hero>"]) {
    const source = page(main);
    const target = ok(clickTarget(source, "paragraph"));
    assert.deepEqual([target.parent, target.index, target.wrap, target.select], [[1], main ? 1 : 0, true, [1, main ? 1 : 0, 0]]);
    assert.equal(target.where, "Into a new Section › Paragraph");
    const markup = blockMarkup(source, "heading", target.parent, true);
    assert.equal(markup, '<section class="flow">\n  <h2>Heading</h2>\n</section>');
    assert.ok(nativeMarkupInsertEdit(source, target.parent, target.index, markup));
  }
  assert.equal(ok(clickTarget(page(""), "section")).where, "Between page bands › the first");
});

test("components refuse blocks with the reason; so do bands that are no Section or Div", () => {
  for (const selection of [[1, 0], [1, 0, 0], [1, 1, 2, 0], [0], [2]]) {
    const target = clickTarget(home, "paragraph", selection);
    assert.equal(target.ok, false, String(selection));
    if (!target.ok) assert.match(target.reason, /is a component without an items slot: .*Select a Section or a Div\./);
  }
  const band = clickTarget(page("<article><p>Hi</p></article>"), "paragraph", [1, 0, 0]);
  assert.equal(band.ok, false);
  if (!band.ok) assert.match(band.reason, /not straight between page bands/);
  assert.equal(clickTarget("<body><section></section></body>", "paragraph").ok, false);
  assert.equal(clickTarget(page("<section><div></section>"), "paragraph").ok, false);
});

test("Heading levels follow the place: h2 in a Section, one below per Div", () => {
  assert.equal(blockMarkup(home, "heading", [1, 2]), "<h2>Heading</h2>");
  assert.equal(blockMarkup(home, "heading", [1, 1, 2]), "<h3>Heading</h3>");
  assert.equal(blockMarkup(home, "image", [1, 2]), '<img src="/images/placeholder.svg" alt="" width="640" height="400">');
});

test("clicking Section, Div, Heading, Paragraph in turn builds a nested page, selecting each", () => {
  let source = page('<section class="flow"><h2>Old</h2></section>');
  let selection: number[] | undefined;
  for (const kind of ["section", "div", "heading", "paragraph"] as NativeElementKind[]) {
    const target = ok(clickTarget(source, kind, selection));
    const edit = nativeMarkupInsertEdit(source, target.parent, target.index, blockMarkup(source, kind, target.parent, target.wrap))!;
    source = applyGuardedSourceEdit(source, edit)!;
    selection = target.select;
  }
  assert.deepEqual(selection, [1, 1, 0, 1]);
  assert.match(source.replace(/\s+(?=<)/g, ""), /<section class="flow"><h2>Old<\/h2><\/section><section class="flow"><div class="flow"><h3>Heading<\/h3><p>Text<\/p><\/div><\/section><\/main>/);
});

// Slice 40: an instance's items slots take blocks. section-work has the unnamed
// slot and a named one of cards ("more"); card-project's "note" holds card-note,
// which has no heading slot, so it is an ordinary slot.
const templates: Record<string, string> = {
  "section-work": `<section><slot name="title"><h2>Work</h2></slot><div class="cards"><slot></slot></div><slot name="more"><card-project></card-project></slot></section>`,
  "card-project": `<article><card-note><slot name="note" slot="text"><p>Project</p></slot></card-note><slot name="title"><h3>Untitled</h3></slot><slot name="link"></slot></article>`,
  "card-note": `<div><slot name="text"><p>Note</p></slot></div>`,
  "section-hero": `<section><slot name="title"><h1>Hi</h1></slot></section>`,
};
const templateOf = (tag: string) => templates[tag];
const items = itemsSlotRule(templateOf);
const work = page('<section-work><h2 slot="title">Work</h2><card-project><h3 slot="title">A</h3></card-project><card-project slot="more"><h3 slot="title">B</h3></card-project></section-work><section-hero><h1 slot="title">Hi</h1></section-hero>');
const insert = (source: string, kind: NativeElementKind, target: BlockTarget) => {
  const t = ok(target);
  const edit = nativeMarkupInsertEdit(source, t.parent, t.index, blockMarkup(source, kind, t.parent, t.wrap, items), items, t.slot);
  assert.ok(edit, t.where);
  return applyGuardedSourceEdit(source, edit)!.replace(/\s+(?=<)/g, "");
};

test("items slots: the unnamed slot and named slots of card components; card-note's slot is not one", () => {
  assert.deepEqual([items("section-work", ""), items("section-work", "more"), items("section-work", "title")], [true, true, false]);
  assert.deepEqual([items("card-project", ""), items("card-project", "note"), items("card-note", "text"), items("section-gone", "")], [false, false, false, false]);
});

test("a selected instance takes the block in its first items slot, after that slot's last child", () => {
  const target = ok(clickTarget(work, "paragraph", [1, 0], templateOf));
  assert.deepEqual([target.parent, target.index, target.slot, target.select], [[1, 0], 2, "", [1, 0, 2]]);
  assert.equal(target.where, "Into Section work › items › after Card project");
  assert.match(insert(work, "paragraph", target), /<card-project><h3 slot="title">A<\/h3><\/card-project><p>Text<\/p><card-project slot="more">/);
  // A part of an ordinary slot stands for the instance.
  assert.deepEqual(ok(clickTarget(work, "paragraph", [1, 0, 0], templateOf)).index, 2);
  // An empty items slot: at the end.
  const empty = page("<section-work></section-work>");
  const first = ok(clickTarget(empty, "heading", [1, 0], templateOf));
  assert.deepEqual([first.parent, first.index, first.where], [[1, 0], 0, "Into Section work › items › empty"]);
  // A Heading in a section component's items is one below the component's own.
  assert.match(insert(empty, "heading", first), /<section-work><h3>Heading<\/h3><\/section-work>/);
});

test("a selected child of an items slot takes the block right after it, in that slot; a Div in it takes blocks inside", () => {
  const more = page('<section-work><p slot="more">M</p><p>N</p></section-work>');
  const named = ok(clickTarget(more, "image", [1, 0, 0], templateOf));
  assert.deepEqual([named.parent, named.index, named.slot], [[1, 0], 1, "more"]);
  assert.equal(named.where, "Into Section work › “more” slot › after Paragraph");
  assert.match(insert(more, "image", named), /<p slot="more">M<\/p><img slot="more" src="\/images\/placeholder.svg"[^>]*><p>N<\/p>/);
  // A card in an items slot is an instance: its own items slot, or the reason (card-project here has none).
  assert.equal(clickTarget(work, "image", [1, 0, 2], templateOf).ok, false);
  const withDiv = page('<section-work><div class="flow"><p>In</p></div></section-work>');
  const inner = ok(clickTarget(withDiv, "paragraph", [1, 0, 0], templateOf));
  assert.deepEqual([inner.parent, inner.index, inner.slot], [[1, 0, 0], 1, undefined]);
  assert.match(insert(withDiv, "paragraph", inner), /<div class="flow"><p>In<\/p><p>Text<\/p><\/div>/);
  const leaf = ok(clickTarget(withDiv, "paragraph", [1, 0, 0, 0], templateOf));
  assert.deepEqual([leaf.parent, leaf.index], [[1, 0, 0], 1]);
});

test("an instance without an items slot refuses a click-insert with the reason", () => {
  const target = clickTarget(work, "paragraph", [1, 1], templateOf);
  assert.equal(target.ok, false);
  if (!target.ok) assert.equal(target.reason, "Section hero is a component without an items slot: its parts are filled by editing them. Select a Section or a Div.");
  // Without its template the editor can't tell: refused too.
  assert.equal(clickTarget(work, "paragraph", [1, 0]).ok, false);
});

test("slot names are read and written as the browser reads them", () => {
  const odd: Record<string, string> = {
    "section-odd": `<section><slot name="a&amp;&quot;b"><card-quote></card-quote></slot><slot name="c">&#32;<card-quote></card-quote>&Tab;&#32</slot><slot name="d">&nbsp;<card-quote></card-quote></slot><slot name="&eacute;"><card-quote></card-quote></slot></section>`,
    "card-quote": `<blockquote><h3><slot name="title">Q</slot></h3></blockquote>`,
  };
  const rule = itemsSlotRule((tag) => odd[tag]);
  assert.deepEqual([rule("section-odd", 'a&"b'), rule("section-odd", "a&amp;&quot;b"), rule("section-odd", "c"), rule("section-odd", "d"), rule("section-odd", "é")], [true, false, true, false, true]);
  const source = page("<section-odd></section-odd>");
  const target = ok(clickTarget(source, "paragraph", [1, 0], (tag) => odd[tag]));
  assert.equal(target.slot, 'a&"b');
  const edit = nativeMarkupInsertEdit(source, target.parent, target.index, "<p>X</p>", rule, target.slot);
  assert.match(applyGuardedSourceEdit(source, edit!)!, /<p slot="a&amp;&quot;b">X<\/p>/);
});

test("the seal holds everywhere but items slots", () => {
  // An ordinary named slot, and card-project's card-note slot, refuse.
  assert.equal(nativeMarkupInsertEdit(work, [1, 0], 1, "<p>X</p>", items, "title"), undefined);
  assert.equal(nativeMarkupInsertEdit(work, [1, 0, 1], 0, "<p>X</p>", items, "note"), undefined);
  // Without the rule an instance takes nothing; nor does a path through an ordinary slot's child.
  assert.equal(nativeMarkupInsertEdit(work, [1, 0], 1, "<p>X</p>"), undefined);
  assert.equal(nativeMarkupInsertEdit(page('<section-work><div slot="title"></div></section-work>'), [1, 0, 0], 0, "<p>X</p>", items), undefined);
  // Markup naming its own slot is refused; an items slot's index is checked like any other.
  assert.equal(nativeMarkupInsertEdit(work, [1, 0], 1, '<p slot="title">X</p>', items, ""), undefined);
  assert.equal(nativeMarkupInsertEdit(work, [1, 0], 4, "<p>X</p>", items, ""), undefined);
  // Moves don't open it.
  assert.equal(nativeMoveEdit(work, [1, 1], { parent: [1, 0], index: 0 }), undefined);
  // The named items slot writes its slot attribute; the unnamed none.
  assert.match(applyGuardedSourceEdit(work, nativeMarkupInsertEdit(work, [1, 0], 3, "<p>X</p>", items, "more")!)!, /<p slot="more">X<\/p>/);
  assert.match(applyGuardedSourceEdit(work, nativeMarkupInsertEdit(work, [1, 0], 1, "<p>X</p>", items, "")!)!, /<h2 slot="title">Work<\/h2>\s*<p>X<\/p>/);
});

// ---- In a component's template (Edit component mode, slice 43). ----

// section-work: [0] <section>; [0,0] title slot, [0,1] div.cards, [0,1,0] the items slot, [0,1,0,0] its card.
const workTemplate = `<section class="flow">
  <slot name="title"><h2>Section title</h2></slot>
  <div class="cards">
    <slot>
      <card-project></card-project>
    </slot>
  </div>
</section>
`;
const cardTemplate = `<article>
  <slot name="title"><h3>Untitled</h3></slot>
  <slot></slot>
</article>
`;
const inWork = (kind: NativeElementKind, selection?: number[]) => templateClickTarget(workTemplate, "section-work", kind, selection);

test("in a template, a selected block part takes the block inside; nothing selected, the root does", () => {
  assert.deepEqual(at(inWork("paragraph", [0])), { parent: [0], index: 2, wrap: false });
  assert.deepEqual(at(inWork("paragraph")), { parent: [0], index: 2, wrap: false });
  const target = ok(inWork("div", [0, 1]));
  assert.deepEqual([target.parent, target.index, target.select], [[0, 1], 1, [0, 1, 1]]);
  assert.equal(target.where, "Into Div › after items");
  // An article (a card's root) takes blocks too.
  assert.deepEqual(at(templateClickTarget(cardTemplate, "card-project", "paragraph", [0])), { parent: [0], index: 2, wrap: false });
});

test("in a template, an items slot's placeholder takes blocks; a named slot's part puts them after the slot", () => {
  // The card in the items slot (a nested component): after it, in the slot.
  const target = ok(inWork("paragraph", [0, 1, 0, 0]));
  assert.deepEqual([target.parent, target.index], [[0, 1, 0], 1]);
  assert.equal(target.where, "Into Section work › items › after Card project");
  // The title's heading: after the title slot, in the section.
  const title = ok(inWork("image", [0, 0, 0]));
  assert.deepEqual([title.parent, title.index], [[0], 1]);
  assert.equal(title.where, "Into Section › after “title” slot");
  // A Div in a named slot's placeholder does not take blocks: the slot is filled by each page.
  const fallback = '<section><slot name="media"><div><p>A</p></div></slot></section>';
  assert.deepEqual(at(templateClickTarget(fallback, "section-x", "paragraph", [0, 0, 0])), { parent: [0], index: 1, wrap: false });
  assert.deepEqual(at(templateClickTarget(fallback, "section-x", "paragraph", [0, 0, 0, 0])), { parent: [0], index: 1, wrap: false });
  // A named cards slot takes no blocks either: one would make it an ordinary slot. They go after it.
  const cards = '<section><slot name="cards"><card-project></card-project></slot></section>';
  const after = ok(templateClickTarget(cards, "section-x", "heading", [0, 0, 0]));
  assert.deepEqual([after.parent, after.index, after.where], [[0], 1, "Into Section › after “cards” slot"]);
});

test("in a template, a Section is refused with its reason", () => {
  for (const selection of [undefined, [0], [0, 1], [0, 1, 0, 0]]) {
    const target = inWork("section", selection);
    assert.ok(!target.ok);
    assert.match(target.reason, /not inside a component's template/);
  }
  assert.ok(!templateClickTarget("<a href=\"#\">Go</a>", "block-go", "paragraph").ok);
});

test("an insert into a template's items slot lands in its placeholder content", () => {
  const target = ok(inWork("paragraph", [0, 1, 0, 0]));
  const edit = nativeMarkupInsertEdit(workTemplate, target.parent, target.index, blockMarkup(workTemplate, "paragraph", target.parent));
  assert.ok(edit);
  assert.equal(applyGuardedSourceEdit(workTemplate, edit), workTemplate.replace("<card-project></card-project>", "<card-project></card-project>\n      <p>Text</p>"));
  // A slot holds what the element around it may: a Div's slot a paragraph, a paragraph's slot no Div.
  assert.ok(nativeMarkupInsertEdit('<div><slot name="t">A</slot></div>', [0, 0], 0, "<p>B</p>"));
  assert.equal(nativeMarkupInsertEdit('<p><slot name="t">A</slot></p>', [0, 0], 0, "<div></div>"), undefined);
  assert.ok(nativeOutline('<p class="actions"><slot name="link"></slot></p>'), "a slot is phrasing content");
});

test("a place measured in a template's preview is checked against the template's rule", () => {
  assert.equal(templateDropRefusal(workTemplate, [0]), undefined);
  assert.equal(templateDropRefusal(workTemplate, [0, 1]), undefined);
  assert.equal(templateDropRefusal(workTemplate, [0, 1, 0]), undefined);
  assert.match(templateDropRefusal(workTemplate, [0, 0])!, /“title” slot is filled on each page/);
  assert.match(templateDropRefusal(workTemplate, [0, 0, 0])!, /“title” slot/);
  assert.equal(templateDropRefusal(workTemplate, [0, 1, 0, 0]), "Card project is its own component: open it to build inside its template.");
  assert.match(templateDropRefusal('<section><slot name="cards"><card-project></card-project></slot></section>', [0, 0])!, /“cards” slot/);
  // The items slot in a paragraph (card-note) takes no blocks; nor does a path the template no longer has.
  assert.ok(templateDropRefusal('<p class="card-note"><slot>Shared note</slot></p>', [0, 0]));
  assert.ok(templateDropRefusal(workTemplate, [0, 5]));
});

test("a template's part moves with the named slot it fills alone; the root and nested components' insides don't (slice 82)", () => {
  const template = '<article><slot name="title"><h3>T</h3></slot><p>B</p><card-x><p>in</p></card-x><slot><p>a</p></slot><div><slot name="x"><p>1</p><p>2</p></slot></div></article>';
  assert.deepEqual(templateMovePath(template, [0, 0, 0]), [0, 0]);
  assert.deepEqual(templateMovePath(template, [0, 1]), [0, 1]);
  assert.equal(templateMovePath(template, [0]), undefined);
  assert.equal(templateMovePath(template, [0, 2, 0]), undefined);
  // An items slot's placeholder item moves itself; so does one of several in a named slot.
  assert.deepEqual(templateMovePath(template, [0, 3, 0]), [0, 3, 0]);
  assert.deepEqual(templateMovePath(template, [0, 4, 0, 1]), [0, 4, 0, 1]);
  assert.equal(templateMoveRefusal(template, [0, 1], [0, 4]), undefined);
  assert.equal(templateMoveRefusal(template, [0, 1], [0, 3]), undefined);
  assert.equal(templateMoveRefusal(template, [0, 1], [0, 0]), templateSlotRefusal("title"));
  assert.equal(templateMoveRefusal(template, [0, 1], [0, 2]), "Card x is its own component: open it to build inside its template.");
  assert.equal(templateMoveRefusal(template, [0, 0], [0, 3]), "A slot can't go into the component's items: each page fills them.");
  assert.equal(templateMoveRefusal(template, [0, 4], [0, 1]), "A <div> can't go inside a <p>.");
  assert.equal(templateMoveRefusal(template, [0, 1], []), "Parts go inside the template's element, not beside it.");
});
