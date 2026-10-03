import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionParent,
  elementTree,
  insertAfterEdit,
  itemCopy,
  itemKind,
  itemNoun,
  itemTitle,
  leafSummary,
  pageBodyCopy,
  repeatedRun,
  slotFallbacks,
  textLeaves,
} from "../src/page-builder/card-grid.ts";
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

test("an item's kind is its custom element, or its tag and sorted classes for an item tag", () => {
  assert.equal(itemKind("card-project", undefined), "card-project");
  assert.equal(itemKind("li", ""), "li");
  assert.equal(itemKind("div", "card  featured"), "div.card.featured");
  assert.equal(itemKind("div", "featured card"), "div.card.featured");
  assert.equal(itemKind("p", "lead"), undefined);
  assert.equal(itemKind("section", ""), undefined);
  assert.equal(itemKind("section-feature", "", true), undefined);
});

test("a grid is two or more children of one kind, the largest group winning", () => {
  assert.deepEqual(repeatedRun(["card-project", "card-project"]), { kind: "card-project", indexes: [0, 1] });
  assert.deepEqual(repeatedRun([undefined, "li", "li", "li"]), { kind: "li", indexes: [1, 2, 3] });
  assert.deepEqual(repeatedRun(["div.a", "div.b", "div.b", "div.a", "div.a"]), { kind: "div.a", indexes: [0, 3, 4] });
  assert.equal(repeatedRun(["div.a", "div.b", undefined]), undefined);
  assert.equal(repeatedRun([]), undefined);
});

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

test("the element tree follows start and end tags and refuses implied ends", () => {
  const tree = elementTree(grid)!;
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children.length, 2);
  assert.deepEqual(tree[0].children[0].children.map((child) => child.name), ["p", "h3", "p", "a"]);
  assert.equal(elementTree("<ul><li>a<li>b</ul>"), undefined);
  assert.equal(elementTree("<p>a<br>b<img src=x></p>")![0].children.length, 2);
});

test("text leaves are elements holding text and inline markup only", () => {
  const html = `<article><h3>Title <em>here</em></h3><div><p>One <a href="/x/">link</a></p><img src="/a.png" alt=""></div></article>`;
  const leaves = textLeaves(html, elementTree(html)!);
  assert.deepEqual(leaves.map((leaf) => leaf.name), ["h3", "p"]);
});

test("a new card copies the last one with its text reset to the template's fallbacks", () => {
  const item = elementTree(grid)![0].children[1];
  const { fallbacks, optional } = slotFallbacks(template);
  assert.deepEqual(fallbacks, { note: "Project", title: "Untitled project", body: "No description yet." });
  const copy = itemCopy(grid, item, { noun: "card", href: "", isLinked: (href) => href === "/work/harbour-lane/", fallbacks, optional });
  assert.equal(copy, `<card-project>
          <p slot="note">Project</p>
          <h3 slot="title">Untitled project</h3>
          <p slot="body" class="body">No description yet.</p>
          <a slot="link" href="">Read about Untitled project</a>
        </card-project>`);
});

test("a card for a new page is titled and links to it, the title swapped in its link text", () => {
  const item = elementTree(grid)![0].children[0];
  assert.equal(itemTitle(grid, item), "Fern & Kettle");
  const copy = itemCopy(grid, item, { noun: "card", title: "Oak & Ash", href: "/work/oak-ash/", isLinked: () => true, fallbacks: slotFallbacks(template).fallbacks });
  assert.match(copy!, /<h3 slot="title">Oak &amp; Ash<\/h3>/);
  assert.match(copy!, /<a slot="link" href="\/work\/oak-ash\/">Read about Oak &amp; Ash<\/a>/);
  assert.match(copy!, /<p slot="note">Project<\/p>/);
});

test("without fallbacks the copy says placeholders by kind; optional slots are left out", () => {
  const html = `<ul>
  <li class="post"><h2><a href="/blog/a/">First</a></h2><p>Intro to the first.</p><span slot="tag">News</span></li>
  <li class="post"><h2><a href="/blog/b/">Second</a></h2><p>Intro.</p><span slot="tag">Notes</span></li>
</ul>`;
  const item = elementTree(html)![0].children[1];
  const copy = itemCopy(html, item, { noun: "post", href: "", optional: new Set(["tag"]) });
  assert.equal(copy, `<li class="post"><h2><a href="">New post</a></h2><p>A sentence or two about this post.</p></li>`);
  const plain = `<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>`;
  assert.equal(itemCopy(plain, elementTree(plain)![0].children[1], { noun: "item" }), "<li>New item</li>");
});

test("the copy goes on its own line after the item, indented like it", () => {
  const html = `<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>`;
  const item = elementTree(html)![0].children[1];
  const edit = insertAfterEdit(html, item, "<li>New item</li>");
  const next = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
  assert.equal(next, `<ul>\n  <li>One</li>\n  <li>Two</li>\n  <li>New item</li>\n</ul>`);
  const inline = `<ul><li>One</li><li>Two</li></ul>`;
  const last = elementTree(inline)![0].children[1];
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
  const copy = pageBodyCopy(sibling, main, leafSummary(other, otherMain), {
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
  const copy = pageBodyCopy(sibling, main, undefined, { title: "Oak", from: "/work/fern/", to: "/work/oak/", oldTitle: "Fern" })!;
  assert.match(copy, /<h2>The brief<\/h2>/);
  assert.match(copy, /<a href="\/#work">Back to all work<\/a> or <a href="\/work\/oak\/#top">top<\/a>/);
  assert.match(copy, /<p>A sentence or two about Oak.<\/p>/);
});

test("a card's link follows its page's URL change", () => {
  const changed = rewriteRouteLinks(grid, "/work/harbour-lane/", "/projects/harbour-lane/");
  assert.equal(changed.count, 1);
  assert.match(changed.text, /href="\/projects\/harbour-lane\/"/);
});
