import test from "node:test";
import assert from "node:assert/strict";
import { cardSwap, readCardContent } from "../src/page-builder/card-swap.ts";
import { cardFill, cardFillContent, cardFillMarkup } from "../src/page-builder/card-fill.ts";

const project = [
  "<article>",
  '  <slot name="image"><img src="/images/placeholder.svg" alt=""></slot>',
  '  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>',
  '  <slot name="title"><h3>Untitled project</h3></slot>',
  '  <slot name="body"><p class="body">No description yet.</p></slot>',
  "  <slot></slot>",
  '  <p class="actions"><slot name="link"></slot></p>',
  "</article>",
].join("\n");
const quote = '<article>\n  <slot name="title"><h3>Untitled quote</h3></slot>\n  <slot name="body"><blockquote class="quote">No quote yet.</blockquote></slot>\n</article>\n';
// A look with a note slot of its own and its title as an h2.
const feature = '<article>\n  <slot name="note"><p>Featured</p></slot>\n  <slot name="title"><h2 class="big">Untitled</h2></slot>\n  <slot name="photo"><img src="/images/none.svg" alt=""></slot>\n  <slot name="cta"><a class="btn" href="#">More</a></slot>\n</article>\n';

const filled = [
  "<card-project>",
  '        <img slot="image" src="/images/harbour.svg" alt="A kiln">',
  '        <p slot="note">Ceramics studio · 2025</p>',
  '        <h3 slot="title">Harbour <em>Lane</em> Pottery</h3>',
  '        <p slot="body" class="body">A quiet portfolio for a working potter.</p>',
  '        <a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>',
  "      </card-project>",
].join("\n");

test("swapping keeps content by role, in the new look's own elements; the title links the card where the look has no link slot", () => {
  const swap = cardSwap({ card: filled, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote });
  assert.equal(swap.markup, [
    "<card-quote>",
    '        <h3 slot="title"><a href="/work/harbour-lane-pottery/">Harbour <em>Lane</em> Pottery</a></h3>',
    '        <blockquote slot="body" class="quote">A quiet portfolio for a working potter.</blockquote>',
    "      </card-quote>",
  ].join("\n"));
  // What card-quote has no place for is listed, and kept.
  assert.deepEqual(swap.notShown, ["image (no image slot)", "note (no note slot)"]);
  assert.deepEqual(swap.kept.image, { src: "/images/harbour.svg", alt: "A kiln" });
  assert.deepEqual(swap.kept.other, { note: ['<p slot="note">Ceramics studio · 2025</p>'] });
});

test("what was kept aside comes back on a swap to a look with a place for it: the card is as it was", () => {
  const away = cardSwap({ card: filled, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote });
  const back = cardSwap({ card: away.markup, template: quote, look: { tag: "card-project", label: "card-project" }, lookTemplate: project, kept: away.kept });
  assert.equal(back.markup, filled);
  assert.deepEqual(back.notShown, []);
  // Without what was kept, only the card's own content comes back: its title, body and link (from the title).
  const lost = cardSwap({ card: away.markup, template: quote, look: { tag: "card-project", label: "card-project" }, lookTemplate: project });
  assert.equal(lost.markup, [
    "<card-project>",
    '        <img slot="image" src="/images/placeholder.svg" alt="">',
    '        <p slot="note">Project</p>',
    '        <h3 slot="title">Harbour <em>Lane</em> Pottery</h3>',
    '        <p slot="body" class="body">A quiet portfolio for a working potter.</p>',
    '        <a slot="link" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>',
    "      </card-project>",
  ].join("\n"));
});

test("the card is read back as it is now: an edit made in one look carries over, over what was kept", () => {
  const away = cardSwap({ card: filled, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote });
  const edited = away.markup.replace("A quiet portfolio for a working potter.", "Bowls, mugs and kilns.");
  const back = cardSwap({ card: edited, template: quote, look: { tag: "card-project", label: "card-project" }, lookTemplate: project, kept: away.kept });
  assert.equal(back.markup, filled.replace("A quiet portfolio for a working potter.", "Bowls, mugs and kilns."));
});

test("fallback text is not content: a blank card swaps to the new look's blank card, nothing listed", () => {
  const blank = "<card-project>\n  <img slot=\"image\" src=\"/images/placeholder.svg\" alt=\"\">\n  <p slot=\"note\">Project</p>\n  <h3 slot=\"title\">Untitled project</h3>\n  <p slot=\"body\" class=\"body\">No description yet.</p>\n</card-project>";
  assert.deepEqual(readCardContent(blank, project), { other: {} });
  const swap = cardSwap({ card: blank, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote });
  assert.equal(swap.markup, '<card-quote>\n  <h3 slot="title">Untitled quote</h3>\n  <blockquote slot="body" class="quote">No quote yet.</blockquote>\n</card-quote>');
  assert.deepEqual(swap.notShown, []);
  // White space differences are still the fallback.
  assert.deepEqual(readCardContent(blank.replace("Untitled project", " Untitled\n   project "), project), { other: {} });
});

test("other slots carry by name, first; roles go to the look's own role slots, whatever they are called", () => {
  const swap = cardSwap({ card: filled, template: project, look: { tag: "card-feature", label: "card-feature" }, lookTemplate: feature });
  assert.equal(swap.markup, [
    "<card-feature>",
    '        <p slot="note">Ceramics studio · 2025</p>',
    '        <h2 slot="title" class="big">Harbour <em>Lane</em> Pottery</h2>',
    '        <img slot="photo" src="/images/harbour.svg" alt="A kiln">',
    '        <a slot="cta" class="btn" href="/work/harbour-lane-pottery/">Read about Harbour Lane Pottery</a>',
    "      </card-feature>",
  ].join("\n"));
  assert.deepEqual(swap.notShown, ["body (no text slot)"]);
});

test("the unnamed slot's content carries to a look that has one, and is listed for one that has not", () => {
  const card = '<card-project>\n  <h3 slot="title">Oak</h3>\n  <ul class="tags"><li>Wood</li></ul>\n</card-project>';
  const away = cardSwap({ card, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote });
  assert.deepEqual(away.notShown, ["content (no slot for it)"]);
  assert.ok(!away.markup.includes("Wood"));
  const back = cardSwap({ card: away.markup, template: quote, look: { tag: "card-project", label: "card-project" }, lookTemplate: project, kept: away.kept });
  // Each other slot the card did not fill gets its fresh copy, as Add card writes it.
  assert.equal(back.markup, [
    "<card-project>",
    '  <img slot="image" src="/images/placeholder.svg" alt="">',
    '  <p slot="note">Project</p>',
    '  <h3 slot="title">Oak</h3>',
    '  <p slot="body" class="body">No description yet.</p>',
    '  <ul class="tags"><li>Wood</li></ul>',
    "</card-project>",
  ].join("\n"));
});

test("the start tag keeps its other attributes; the looks' attributes give way to the new look's", () => {
  const card = '<card-project slot="first" id="oak" data-layout="centered" data-featured>\n  <h3 slot="title">Oak</h3>\n</card-project>';
  const variants = ["data-layout", "data-featured"];
  const wide = cardSwap({ card, template: project, look: { tag: "card-project", attribute: { name: "data-layout", value: "wide" }, label: "card-project · wide" }, lookTemplate: project, variants });
  assert.match(wide.markup, /^<card-project slot="first" id="oak" data-layout="wide">\n/);
  const quoted = cardSwap({ card, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote, variants });
  assert.match(quoted.markup, /^<card-quote slot="first" id="oak">\n  <h3 slot="title">Oak<\/h3>\n/);
  const bare = cardSwap({ card: quoted.markup, template: quote, look: { tag: "card-project", attribute: { name: "data-featured", value: true }, label: "card-project · featured" }, lookTemplate: project, variants });
  assert.match(bare.markup, /^<card-project slot="first" id="oak" data-featured>\n/);
  // A card written on one line stays on one.
  assert.equal(cardSwap({ card: '<card-project><h3 slot="title">Oak</h3></card-project>', template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote }).markup,
    '<card-quote><h3 slot="title">Oak</h3><blockquote slot="body" class="quote">No quote yet.</blockquote></card-quote>');
});

test("a fill keeps aside the page's facts its look has no slot for: a swap to a look with one shows them", () => {
  const page = '<!doctype html><html><head><title>Harbour · Larkspur</title><meta name="description" content="A quiet portfolio."><meta property="og:image" content="/images/harbour.svg"></head><body><main><h1>Harbour Lane Pottery</h1></main></body></html>';
  const { rows } = cardFill({ template: quote, page: { route: "/work/harbour/", source: page } });
  const blank = '<card-quote>\n  <h3 slot="title">Untitled quote</h3>\n  <blockquote slot="body" class="quote">No quote yet.</blockquote>\n</card-quote>';
  const filledQuote = cardFillMarkup(blank, quote, rows);
  assert.equal(filledQuote, '<card-quote>\n  <h3 slot="title"><a href="/work/harbour/">Harbour Lane Pottery</a></h3>\n  <blockquote slot="body" class="quote">A quiet portfolio.</blockquote>\n</card-quote>');
  const kept = cardFillContent(rows);
  assert.deepEqual(kept, { other: {}, title: "Harbour Lane Pottery", body: "A quiet portfolio.", link: { href: "/work/harbour/" }, image: { src: "/images/harbour.svg" } });
  const swap = cardSwap({ card: filledQuote, template: quote, look: { tag: "card-project", label: "card-project" }, lookTemplate: project, kept });
  assert.equal(swap.markup, [
    "<card-project>",
    '  <img slot="image" src="/images/harbour.svg" alt="">',
    '  <p slot="note">Project</p>',
    '  <h3 slot="title">Harbour Lane Pottery</h3>',
    '  <p slot="body" class="body">A quiet portfolio.</p>',
    '  <a slot="link" href="/work/harbour/">Read about Harbour Lane Pottery</a>',
    "</card-project>",
  ].join("\n"));
});

test("formatting around a whole title or body is content: it carries over", () => {
  const card = '<card-project>\n  <h3 slot="title"><em>Oak</em></h3>\n  <p slot="body" class="body"><strong>All of it.</strong></p>\n</card-project>';
  const swap = cardSwap({ card, template: project, look: { tag: "card-quote", label: "card-quote" }, lookTemplate: quote });
  assert.equal(swap.markup, '<card-quote>\n  <h3 slot="title"><em>Oak</em></h3>\n  <blockquote slot="body" class="quote"><strong>All of it.</strong></blockquote>\n</card-quote>');
});

test("content carried to a slot of its name stays that slot's, by name, when its role there differs: an edit there is what comes back", () => {
  const away = cardSwap({ card: filled, template: project, look: { tag: "card-feature", label: "card-feature" }, lookTemplate: feature });
  // In card-feature the note slot is the body's place: it holds the note.
  const edited = away.markup.replace("Ceramics studio · 2025", "Stoneware · 2026");
  const back = cardSwap({ card: edited, template: feature, look: { tag: "card-project", label: "card-project" }, lookTemplate: project, kept: away.kept });
  assert.equal(back.markup, filled.replace("Ceramics studio · 2025", "Stoneware · 2026"));
});
