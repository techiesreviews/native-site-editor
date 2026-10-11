import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionParent,
  insertAfterEdit,
  itemCopy,
  itemFill,
  itemNoun,
  itemTitle,
  leafSummary,
  pageBodyCopy,
  textLeaves,
} from "../src/page-builder/card-grid.ts";
import { readSource } from "../src/page-builder/source-tree.ts";
import { slotFallbacks } from "../src/page-builder/card-fill.ts";
import { rewriteRouteLinks } from "../src/native-page-moves.ts";

const card = (title: string, slug: string, note = "Cafe · 2025") => `<card-project>
          <p slot="note">${note}</p>
          <h3 slot="title">${title}</h3>
          <p slot="body" class="body">What we did for ${title}.</p>
          <a slot="link" href="/work/${slug}/">Read about ${title}</a>
        </card-project>`;

const grid = `<div class="cards">
        ${card("Fern &amp; Kettle", "fern-and-kettle")}
        ${card("Harbour Lane", "harbour-lane", "Ceramics · 2024")}
      </div>`;

const template = `<article>
  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>
  <slot name="title"><h3>Untitled project</h3></slot>
  <slot name="body"><p class="body">No description yet.</p></slot>
  <p class="actions"><slot name="link"></slot></p>
</article>`;

test("items are named by a word of their tag or classes", () => {
  assert.equal(itemNoun("card-project"), "card");
  assert.equal(itemNoun("project-card"), "card");
  assert.equal(itemNoun("team-member"), "member");
  assert.equal(itemNoun("li"), "item");
  assert.equal(itemNoun("a"), "link");
  assert.equal(itemNoun("div.tile"), "tile");
  assert.equal(itemNoun("div.col"), "item");
});

test("a grid whose items link to different pages under one parent is a collection", () => {
  assert.equal(collectionParent(["/work/a/", "/work/b/", undefined]), "/work/");
  assert.equal(collectionParent(["/work/a/", "/blog/b/"]), undefined);
  assert.equal(collectionParent(["/work/a/", "/work/a/"]), undefined);
  assert.equal(collectionParent(["/work/a/"]), undefined);
  assert.equal(collectionParent(["/about/", "/contact/"]), undefined);
  assert.equal(collectionParent(["/work/a.html", "/work/b.html"]), undefined);
});

test("the source tree follows start and end tags and records implied ends", () => {
  const tree = readSource(grid);
  assert.equal(tree.exact, true);
  assert.equal(tree.children().length, 1);
  const root = tree.at([0])!;
  assert.equal(tree.children(root).length, 2);
  assert.deepEqual(tree.children(tree.at([0, 0])).map(child => tree.view.name(child)), ["p", "h3", "p", "a"]);
  assert.equal(readSource("<ul><li>a<li>b</ul>").exact, false);
  const voids = readSource("<p>a<br>b<img src=x></p>");
  assert.equal(voids.children(voids.at([0])).length, 2);
});

test("text leaves are elements holding text and inline markup only", () => {
  const html = `<article><h3>Title <em>here</em></h3><div><p>One <a href="/x/">link</a></p><img src="/a.png" alt=""></div></article>`;
  const tree = readSource(html);
  const leaves = textLeaves(tree);
  assert.deepEqual(leaves.map((leaf) => tree.view.name(leaf)), ["h3", "p"]);
  // A price struck through is part of its line: the paragraph is one leaf.
  const price = `<article><p>Was <del>£40</del> <ins>£30</ins></p></article>`;
  const priceTree = readSource(price);
  assert.deepEqual(textLeaves(priceTree).map(leaf => priceTree.view.name(leaf)), ["p"]);
});

test("a new card copies the last one with its text reset to the template's fallbacks", () => {
  const tree = readSource(grid);
  const item = tree.at([0, 1])!;
  const { fallbacks } = slotFallbacks(template);
  assert.deepEqual(fallbacks, { note: "Project", title: "Untitled project", body: "No description yet." });
  const copy = itemCopy(tree, item, { noun: "card", href: "", isLinked: (href) => href === "/work/harbour-lane/", fallbacks });
  assert.equal(copy, `<card-project>
          <p slot="note">Project</p>
          <h3 slot="title">Untitled project</h3>
          <p slot="body" class="body">No description yet.</p>
          <a slot="link" href="">Read about Untitled project</a>
        </card-project>`);
});

test("a card for a new page is titled and links to it, the title swapped in its link text", () => {
  const tree = readSource(grid);
  const item = tree.at([0, 0])!;
  assert.equal(itemTitle(tree, item), "Fern & Kettle");
  const copy = itemCopy(tree, item, { noun: "card", title: "Oak & Ash", href: "/work/oak-ash/", isLinked: () => true, fallbacks: slotFallbacks(template).fallbacks });
  assert.match(copy!, /<h3 slot="title">Oak &amp; Ash<\/h3>/);
  assert.match(copy!, /<a slot="link" href="\/work\/oak-ash\/">Read about Oak &amp; Ash<\/a>/);
  assert.match(copy!, /<p slot="note">Project<\/p>/);
});

test("without fallbacks the copy says placeholders by kind and keeps slots", () => {
  const html = `<ul>
  <li class="post"><h2><a href="/blog/a/">First</a></h2><p>Intro to the first.</p><span slot="tag">News</span></li>
  <li class="post"><h2><a href="/blog/b/">Second</a></h2><p>Intro.</p><span slot="tag">Notes</span></li>
</ul>`;
  const tree = readSource(html);
  const item = tree.at([0, 1])!;
  const copy = itemCopy(tree, item, { noun: "post", href: "" });
  assert.equal(copy, `<li class="post"><h2><a href="">New post</a></h2><p>A sentence or two about this post.</p><span slot="tag">Text</span></li>`);
  const plain = `<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>`;
  const plainTree = readSource(plain);
  assert.equal(itemCopy(plainTree, plainTree.at([0, 1])!, { noun: "item" }), "<li>New item</li>");
});

test("the copy goes on its own line after the item, indented like it", () => {
  const html = `<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>`;
  const tree = readSource(html);
  const item = tree.at([0, 1])!;
  const edit = insertAfterEdit(html, item, "<li>New item</li>");
  const next = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
  assert.equal(next, `<ul>\n  <li>One</li>\n  <li>Two</li>\n  <li>New item</li>\n</ul>`);
  const inline = `<ul><li>One</li><li>Two</li></ul>`;
  const last = readSource(inline).at([0, 1])!;
  const after = insertAfterEdit(inline, last, "<li>New</li>");
  assert.equal(inline.slice(0, after.start) + after.text + inline.slice(after.end), `<ul><li>One</li><li>Two</li>\n<li>New</li></ul>`);
});

const page = (title: string, note: string, lead: string, brief: string) => `<!doctype html>
<html><head><title>${title} · Studio</title></head>
<body>
  <main>
    <section class="hero">
      <card-note><p slot="text">${note}</p></card-note>
      <h1>${title}</h1>
      <p class="lead">${lead}</p>
    </section>
    <section class="prose">
      <h2>The brief</h2>
      <p>${brief}</p>
      <p><a href="/#work">Back to all work</a> or <a href="/work/${title.toLowerCase()}/#top">top</a></p>
    </section>
  </main>
</body></html>`;

test("a new subpage keeps what its siblings share and resets what each says", () => {
  const sibling = page("Fern", "Cafe", "A cafe site.", "Fern opened with a chalkboard.");
  const other = page("Harbour", "Pottery", "A potter's site.", "The studio sold its work.");
  const main = { start: sibling.indexOf("<main>") + 6, end: sibling.indexOf("</main>") };
  const otherMain = { start: other.indexOf("<main>") + 6, end: other.indexOf("</main>") };
  const copy = pageBodyCopy(readSource(sibling, { from: main.start, to: main.end }), leafSummary(readSource(other, { from: otherMain.start, to: otherMain.end })), {
    title: "Oak & Ash", from: "/work/fern/", to: "/work/oak-ash/", oldTitle: "Fern",
    fallback: (tag, slot) => (tag === "card-note" && slot === "text" ? "Note" : undefined),
  })!;
  assert.match(copy, /<p slot="text">Note<\/p>/);
  assert.match(copy, /<h1>Oak &amp; Ash<\/h1>/);
  assert.match(copy, /<p class="lead">A sentence or two about Oak &amp; Ash.<\/p>/);
  assert.match(copy, /<h2>The brief<\/h2>/);
  assert.match(copy, /<p>A sentence or two about Oak &amp; Ash.<\/p>/);
  // The paragraph both say stays, its link to the sibling itself now to the new page.
  assert.match(copy, /<p><a href="\/#work">Back to all work<\/a> or <a href="\/work\/oak-ash\/#top">top<\/a><\/p>/);
  // The head is left to the caller.
  assert.match(copy, /<title>Fern · Studio<\/title>/);
});

test("with one sibling, headings and paragraphs with links stay and self links follow the new page", () => {
  const sibling = page("Fern", "Cafe", "A cafe site.", "Fern opened.");
  const main = { start: sibling.indexOf("<main>") + 6, end: sibling.indexOf("</main>") };
  const copy = pageBodyCopy(readSource(sibling, { from: main.start, to: main.end }), undefined, { title: "Oak", from: "/work/fern/", to: "/work/oak/", oldTitle: "Fern" })!;
  assert.match(copy, /<h2>The brief<\/h2>/);
  assert.match(copy, /<a href="\/#work">Back to all work<\/a> or <a href="\/work\/oak\/#top">top<\/a>/);
  assert.match(copy, /<p>A sentence or two about Oak.<\/p>/);
});

test("review: a duplicated card still leaves a collection of two different pages", () => {
  assert.equal(collectionParent(["/work/a/", "/work/b/", "/work/b/"]), "/work/");
  assert.equal(collectionParent(["/work/a/", "/work/a/"]), undefined);
});

test("review: scripts and styles are not text to reset", () => {
  const html = `<main><h1>Fern</h1><style>p { color: red }</style><p>Fern opened.</p><script>console.log("x")</script></main>`;
  const copy = pageBodyCopy(readSource(html, { from: 6, to: html.length - 7 }), undefined, { title: "Oak", from: "/work/fern/", to: "/work/oak/" })!;
  assert.match(copy, /<style>p \{ color: red \}<\/style>/);
  assert.match(copy, /<script>console.log\("x"\)<\/script>/);
  assert.match(copy, /<p>A sentence or two about Oak.<\/p>/);
});

test("review: an unquoted link address is rewritten as a whole quoted attribute", () => {
  const html = `<div><article class=card><h3>Old</h3><a href=/work/old/ class=button>More</a></article><article class=card><h3>B</h3></article></div>`;
  const tree = readSource(html);
  const item = tree.at([0, 0])!;
  assert.equal(itemCopy(tree, item, { noun: "card", href: "", isLinked: () => true }),
    `<article class=card><h3>New card</h3><a href="" class=button>More</a></article>`);
  const page = `<main><a href=/work/old/#x class=b>Self</a></main>`;
  assert.match(pageBodyCopy(readSource(page, { from: 6, to: page.length - 7 }), undefined, { title: "N", from: "/work/old/", to: "/work/new/" })!, /<a href="\/work\/new\/#x" class=b>/);
});

test("a card's link follows its page's URL change", () => {
  const changed = rewriteRouteLinks(grid, "/work/harbour-lane/", "/projects/harbour-lane/");
  assert.equal(changed.count, 1);
  assert.match(changed.text, /href="\/projects\/harbour-lane\/"/);
});

test("filling a plain card without a page link adds a title link and keeps the copy's other text", () => {
  const card = '<article class="quote"><h3>New card</h3><p>A sentence or two about this card.</p></article>';
  assert.deepEqual(itemFill(card, "card", "Oak & Ash", "/work/oak/"), {
    markup: '<article class="quote"><h3><a href="/work/oak/">Oak &amp; Ash</a></h3><p>A sentence or two about this card.</p></article>',
    added: true,
  });
});

test("filling an existing whole-title link replaces its href and text without nesting", () => {
  assert.deepEqual(itemFill('<article><h3><a class="title" href="#old">Old</a></h3></article>', "card", "Oak", "/work/oak/"), {
    markup: '<article><h3><a class="title" href="/work/oak/">Oak</a></h3></article>', added: true,
  });
});

test("a plain card's own emptied page link is filled, leaving its title unlinked and other addresses alone", () => {
  assert.deepEqual(itemFill('<article><h3>New card</h3><p><a href="">Read about New card</a> <a href="/about/">About</a></p></article>', "card", "Oak", "/work/oak/"), {
    markup: '<article><h3>Oak</h3><p><a href="/work/oak/">Read about Oak</a> <a href="/about/">About</a></p></article>', added: false,
  });
});

test("a text-only collection item keeps its existing title fill without adding a link", () => {
  assert.deepEqual(itemFill("<li>New item</li>", "item", "Oak", "/work/oak/"), {
    markup: "<li>Oak</li>", added: false,
  });
});

test("a link around the card's heading is pointed at the page, never nested; a bare href is filled too", () => {
  assert.deepEqual(itemFill('<article><a href="https://example.org/"><h3>New card</h3></a></article>', "card", "Oak", "/work/oak/"), {
    markup: '<article><a href="/work/oak/"><h3>Oak</h3></a></article>', added: true,
  });
  assert.deepEqual(itemFill('<article><h3><a class="t" href>New card</a></h3></article>', "card", "Oak", "/work/oak/"), {
    markup: '<article><h3><a class="t" href="/work/oak/">Oak</a></h3></article>', added: true,
  });
  // A heading with more than its link becomes one link of the page's title.
  assert.deepEqual(itemFill('<article><h3><a href="#x">Old</a> and more</h3></article>', "card", "Oak", "/work/oak/"), {
    markup: '<article><h3><a href="/work/oak/">Oak</a></h3></article>', added: true,
  });
});

for (const [title, kept] of [
  ["Caf&eacute; Rio", "Caf&eacute; Rio"],
  ["Fern <em>&amp;</em> Kettle", "Fern &amp; Kettle"],
  ["Caf&eacute;", "Caf&#233;"],
  ["Caf&eacute;", "Caf&eacute"],
  ["Tea &amp; Cake", "Tea &#38; Cake"],
]) {
  test(`copies replace decoded title ${title} in kept text ${kept}`, () => {
    const card = `<article><h3>${title}</h3><p><a href="/old/" title="${kept}">Read about ${kept}</a> and ${kept}</p></article>`;
    const tree = readSource(card);
    assert.equal(itemCopy(tree, tree.at([0])!, { noun: "card", title: "Oak & Ash" }),
      `<article><h3>Oak &amp; Ash</h3><p><a href="/old/" title="${kept}">Read about Oak &amp; Ash</a> and Oak &amp; Ash</p></article>`);
    const page = `<main><h1>${title}</h1><h2>Read about ${kept}</h2><p><a href="/old/">${kept}</a></p></main>`;
    const pageTree = readSource(page);
    const oldTitle = itemTitle(tree, tree.at([0])!);
    assert.equal(pageBodyCopy(pageTree, undefined, { title: "Oak & Ash", oldTitle, from: "/old/", to: "/new/" }),
      '<main><h1>Oak &amp; Ash</h1><h2>Read about Oak &amp; Ash</h2><p><a href="/new/">Oak &amp; Ash</a></p></main>');
  });
}

test("title replacement stays within each text node and preserves comments and formatting", () => {
  const tree = readSource('<article><h3>Old title</h3><a title="Old title"><em>Old title</em><!--Old title--> Old <b>title</b> &copy;</a></article>');
  assert.equal(itemCopy(tree, tree.at([0])!, { noun: "card", title: "New" }),
    '<article><h3>New</h3><a title="Old title"><em>New</em><!--Old title--> Old <b>title</b> &copy;</a></article>');
});

test("Add card writes decoded slot fallbacks escaped once and matches decoded slot names", () => {
  const fallbacks = slotFallbacks('<slot name="title"><h3>Caf&eacute; &amp; name</h3></slot><slot name="caf&eacute;"><p>Caf&eacute; note</p></slot><slot name="empty"> </slot>').fallbacks;
  assert.deepEqual(fallbacks, { title: "Café & name", café: "Café note" });
  const tree = readSource('<card-x><h3 slot="title">Old</h3><p slot="caf&#233;">Old note</p></card-x>');
  assert.equal(itemCopy(tree, tree.at([0])!, { noun: "card", fallbacks }),
    '<card-x><h3 slot="title">Café &amp; name</h3><p slot="caf&#233;">Café note</p></card-x>');
});

test("a slot's fallback includes a nested slot and the text after it", () => {
  const fallbacks = slotFallbacks('<slot name="title"><h3><slot name="t2">Inner</slot> tail</h3></slot>').fallbacks;
  assert.deepEqual(fallbacks, { title: "Inner tail", t2: "Inner" });
  const tree = readSource('<card-x><h3 slot="title">Old</h3></card-x>');
  assert.equal(itemCopy(tree, tree.at([0])!, { noun: "card", fallbacks }), '<card-x><h3 slot="title">Inner tail</h3></card-x>');
});

test("a closed outer range does not make a malformed inner tree safe to copy", () => {
  const source = '<div><span>A</div>';
  const tree = readSource(source);
  assert.ok(tree.range(tree.at([0])!));
  assert.equal(tree.exact, false);
  assert.equal(itemCopy(tree, tree.at([0])!, { noun: "card" }), undefined);
  assert.equal(itemFill(source, "card", "New", "/new/"), undefined);
  assert.equal(pageBodyCopy(tree, undefined, { title: "New", from: "/old/", to: "/new/" }), undefined);
  assert.equal(leafSummary(tree), undefined);
});

test("a peer's title can be read despite an implied end tag inside the card", () => {
  const page = '<body><main><card-x><h3 slot="title">Caf&eacute; Rio</h3><p>Unclosed<div>After</div></card-x><card-x><h3 slot="title">Blank</h3></card-x></main></body>';
  const tree = readSource(page, { page: true });
  assert.equal(tree.exact, false);
  assert.equal(itemTitle(tree, tree.at([0, 0])!), "Café Rio");
});

for (const newline of ["\n", "\r\n", "&#10;"]) {
  test(`kept text maps titles after a pre's omitted newline ${JSON.stringify(newline)}`, () => {
    const tree = readSource(`<main><h1>Caf&eacute;</h1><pre>${newline}Read about Caf&#233; <a href="/#all">All</a></pre></main>`);
    assert.equal(pageBodyCopy(tree, undefined, { title: "New", oldTitle: "Café", from: "/old/", to: "/new/" }),
      `<main><h1>New</h1><pre>${newline}Read about New <a href="/#all">All</a></pre></main>`);
  });
}
