import test from "node:test";
import assert from "node:assert/strict";
import { cardSlotAddEdit, cardSlotOf, freshCardMarkup, slotCardLinks } from "../src/page-builder/card-slot.ts";
import { applyGuardedSourceEdit, nativeInstanceInsertEdit } from "../src/page-builder/native-operations.ts";

const templates: Record<string, string> = {
  "card-project": '<article>\n  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>\n  <slot name="title"><h3>Untitled project</h3></slot>\n  <slot name="body"><p class="body">No description yet.</p></slot>\n  <slot></slot>\n  <p class="actions"><slot name="link"></slot></p>\n</article>\n',
  "card-note": '<p class="note"><slot name="text">Note</slot></p>',
  "card-quote": '<blockquote><slot name="quote"><p>A kind word.</p></slot><h3><slot name="who">Someone</slot></h3></blockquote>',
  "section-work": '<section>\n  <slot name="title"><h2>Recent work</h2></slot>\n  <div class="cards"><slot><card-project></card-project></slot></div>\n</section>\n',
  "section-pair": '<section><slot name="title"><h2>Two</h2></slot><slot name="quotes"><card-quote></card-quote></slot><slot name="notes"><card-note></card-note></slot></section>',
  "section-plain": "<section><slot></slot></section>",
  "section-mixed": "<section><slot><card-project></card-project><p>Or this</p></slot></section>",
  "section-said": "<section><slot>Intro <card-project></card-project></slot></section>",
  "card-photo": '<figure><slot name="image"><img src="/a.jpg" srcset="/a.jpg 1x, /a@2x.jpg 2x" alt=""></slot><figcaption><slot name="title"><h3>Photo</h3></slot></figcaption></figure>',
  "section-photos": '<section><slot name="photos"><card-photo></card-photo></slot></section>',
};
const templateOf = (tag: string) => templates[tag];

// Body paths: <main> [0]; the section component [0, 0].
const page = (main: string) => `<!doctype html><html><head><title>T</title></head><body><main>\n    ${main}\n  </main></body></html>`;
const card = (title: string) => `<card-project>\n        <h3 slot="title">${title}</h3>\n      </card-project>`;
const work = (...items: string[]) => page(`<section-work>\n      <h2 slot="title">Work</h2>${items.map((item) => `\n      ${item}`).join("")}\n    </section-work>`);

const fresh = '<card-project>\n  <p slot="note">Project</p>\n  <h3 slot="title">Untitled project</h3>\n  <p slot="body" class="body">No description yet.</p>\n</card-project>';

test("a fresh card is its template's fallbacks, each in its slot; text and image fallbacks copied, items and empty slots left empty", () => {
  assert.equal(freshCardMarkup("card-project", templateOf), fresh);
  assert.equal(freshCardMarkup("card-quote", templateOf), '<card-quote>\n  <p slot="quote">A kind word.</p>\n  <span slot="who">Someone</span>\n</card-quote>');
  assert.equal(freshCardMarkup("card-gone", templateOf), undefined);
});

test("a card slot is an items slot whose fallback is a card component; plain and ordinary slots are not", () => {
  assert.deepEqual(cardSlotOf("section-work", templateOf), [{ slot: "", card: "card-project" }]);
  // card-note has no heading slot: an ordinary slot; card-project's own unnamed slot holds no card.
  assert.deepEqual(cardSlotOf("section-pair", templateOf), [{ slot: "quotes", card: "card-quote" }]);
  assert.deepEqual(cardSlotOf("card-project", templateOf), []);
  assert.deepEqual(cardSlotOf("section-plain", templateOf), []);
  assert.deepEqual(cardSlotOf("section-mixed", templateOf), []);
  assert.deepEqual(cardSlotOf("section-said", templateOf), []);
});

test("Add card takes the card from the slot's fallback, after the last item, with 0, 1 and many items", () => {
  const added = (source: string) => {
    const result = cardSlotAddEdit(source, [0, 0], templateOf);
    assert.ok(result);
    return { next: applyGuardedSourceEdit(source, result.edit)!, index: result.index, card: result.card };
  };
  const indented = fresh.replace(/\n/g, "\n      ");

  const empty = added(work());
  assert.equal(empty.next, work(indented));
  assert.deepEqual([empty.index, empty.card], [1, "card-project"]);

  const one = added(work(card("A")));
  assert.equal(one.next, work(card("A"), indented));
  assert.equal(one.index, 2);

  const many = added(work(card("A"), card("B"), card("C")));
  assert.equal(many.next, work(card("A"), card("B"), card("C"), indented));
  assert.equal(many.index, 4);

  // The kind comes from the fallback, not the siblings: quotes in the unnamed slot still get a card-project.
  const quotes = added(work("<card-quote></card-quote>", "<card-quote></card-quote>"));
  assert.match(quotes.next, /<card-quote><\/card-quote>\n      <card-project>\n        <p slot="note">/);
});

test("a named card slot gets the card with its slot attribute, after that slot's last item, not other slots' children", () => {
  const source = page('<section-pair><h2 slot="title">Pair</h2><card-quote slot="quotes"></card-quote><p slot="notes">x</p></section-pair>');
  const result = cardSlotAddEdit(source, [0, 0], templateOf);
  assert.ok(result);
  assert.equal(result.index, 2);
  assert.match(applyGuardedSourceEdit(source, result.edit)!, /<card-quote slot="quotes"><\/card-quote><card-quote slot="quotes">\s*<p slot="quote">A kind word\.<\/p>\s*<span slot="who">Someone<\/span>\s*<\/card-quote>\s*<p slot="notes">/);
  assert.equal(cardSlotAddEdit(source, [0, 0], templateOf, "notes"), undefined);
  assert.equal(cardSlotAddEdit(source, [0, 0], templateOf, "quotes")?.index, 2);
});

test("no card slot, no card: plain grids and other elements keep today's copy", () => {
  assert.equal(cardSlotAddEdit(page('<section-plain><article class="card"><h3>A</h3></article><article class="card"><h3>B</h3></article></section-plain>'), [0, 0], templateOf), undefined);
  assert.equal(cardSlotAddEdit(page('<div class="cards">' + card("A") + card("B") + "</div>"), [0, 0], templateOf), undefined);
  assert.equal(cardSlotAddEdit(work(), [0, 5], templateOf), undefined);
});

test("an instance insert takes one bare instance of plain markup, and opens an instance only at an items slot", () => {
  const source = work();
  const items = (tag: string, slot: string) => tag === "section-work" && slot === "";
  assert.ok(nativeInstanceInsertEdit(source, [0, 0], 1, "<card-project></card-project>", items));
  for (const markup of ['<card-project class="x"></card-project>', "<card-project></card-project><card-project></card-project>", "<p>x</p>", "<card-project><script>x()</script></card-project>", "<card-project><style>p{}</style></card-project>"])
    assert.equal(nativeInstanceInsertEdit(source, [0, 0], 1, markup, items), undefined, markup);
  // The seal holds at a slot that is not an items slot, and with no rule at all.
  assert.equal(nativeInstanceInsertEdit(source, [0, 0], 1, "<card-project></card-project>", items, "title"), undefined);
  assert.equal(nativeInstanceInsertEdit(source, [0, 0], 1, "<card-project></card-project>"), undefined);
  // Outside instances it goes as a block does.
  assert.ok(nativeInstanceInsertEdit(page("<section><h2>A</h2></section>"), [0, 0], 1, "<card-project></card-project>"));
});

test("an image fallback is copied as written, a srcset included", () => {
  const source = page("<section-photos></section-photos>");
  const result = cardSlotAddEdit(source, [0, 0], templateOf);
  assert.ok(result);
  assert.equal(applyGuardedSourceEdit(source, result.edit), page('<section-photos>\n      <card-photo slot="photos">\n        <img slot="image" src="/a.jpg" srcset="/a.jpg 1x, /a@2x.jpg 2x" alt="">\n        <h3 slot="title">Photo</h3>\n      </card-photo>\n    </section-photos>'));
});

test("the pages a fresh card's slot already links to: its own slot's other cards, any page, the card itself left out", () => {
  const routes: Record<string, string> = { "/": "index.html", "/about/": "about/index.html", "/work/a/": "work/a/index.html", "/work/b/": "work/b/index.html" };
  const route = (href: string) => (Object.hasOwn(routes, href) ? href : undefined);
  const linked = (title: string, href: string, slot = "") => `<card-project${slot ? ` slot="${slot}"` : ""}>\n        <h3 slot="title">${title}</h3>\n        <a slot="link" href="${href}">Read</a>\n      </card-project>`;
  const source = page(`<section-pair>\n      <h2 slot="title"><a href="/work/b/">Two</a></h2>\n      ${linked("A", "/work/a/")}\n      ${linked("About", "/about/")}\n      ${linked("B", "/work/b/", "quotes")}\n      ${linked("Off", "https://example.com/")}\n      ${linked("New", "/work/a/")}\n    </section-pair>`);
  // The unnamed slot's cards: a top-level page counts too, other slots and links off the site do not.
  assert.deepEqual(slotCardLinks(source, [0, 0, 5], route), ["/work/a/", "/about/"]);
  // In the named slot, only its own (here none but the card).
  assert.deepEqual(slotCardLinks(source, [0, 0, 3], route), []);
  assert.deepEqual(slotCardLinks(source, [0, 0, 9], route), []);
});
