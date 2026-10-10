import assert from "node:assert/strict";
import test from "node:test";
import { cardFill, cardFillMarkup, itemPageFill, pageTitle } from "../src/page-builder/card-fill.ts";

const template = `<article>
  <card-note><slot name="note" slot="text"><p>Project</p></slot></card-note>
  <slot name="title"><h3>Untitled project</h3></slot>
  <slot name="body"><p class="body">No description yet.</p></slot>
  <slot></slot>
  <p class="actions"><slot name="link"></slot></p>
</article>`;
const description = "A one-page site for a neighbourhood cafe, with a printable menu the owners update themselves each morning.";
const source = `<!doctype html><html lang="en-GB"><head>
<title>Fern &amp; Kettle · Larkspur Studio</title>
<meta name="description" content="${description}">
<meta property="og:image" content="https://example.test/images/social-card.png">
</head><body><site-header></site-header>
<main class="page" id="main"><section class="hero flow">
<card-note><p slot="text">Cafe · Identity and site · 2025</p></card-note>
<h1>Fern &amp; Kettle</h1>
<p class="lead">A one-page site with a menu the owners change themselves.</p>
</section></main><site-footer></site-footer></body></html>`;
const route = "/work/fern-and-kettle/";
const fill = (html = source, card = template, siteUrl?: string) => cardFill({ template: card, page: { route, source: html }, siteUrl }).rows;

test("a full starter card maps facts, matches its note and omits the empty default slot", () => {
  assert.deepEqual(fill(), [
    { slot: "note", label: "Note", role: "other", from: "matched", status: "filled", text: "Cafe · Identity and site · 2025", matched: "<card-note>" },
    { slot: "title", label: "Title", role: "title", from: "h1", status: "filled", text: "Fern & Kettle" },
    { slot: "body", label: "Body", role: "body", from: "meta description", status: "filled", text: description },
    { slot: "link", label: "Link", role: "link", from: "address", status: "filled", href: route, text: "Read about Fern & Kettle" },
    { label: "Image", role: "image", from: "not used", status: "not-used", src: "https://example.test/images/social-card.png" },
  ]);
  assert.deepEqual(fill().map(row => row.from), ["matched", "h1", "meta description", "address", "not used"]);
});

test("image slots strip only the site's origin, retaining query and fragment", () => {
  const card = `${template}<slot name="image"><img src="/placeholder.svg" alt=""></slot>`;
  assert.equal(fill(source, card, "https://example.test/subpath/").find(row => row.role === "image")?.src, "/images/social-card.png");
  assert.equal(fill(source, card).find(row => row.role === "image")?.src, "https://example.test/images/social-card.png");
  for (const image of ["https://example.test.evil/images/a.png", "https://other.test/a.png", "/images/a.png", "not a URL"]) {
    const page = source.replace("https://example.test/images/social-card.png", image);
    assert.equal(fill(page, card, "https://example.test").find(row => row.role === "image")?.src, image);
  }
  const page = source.replace("social-card.png", "social-card.png?size=2&amp;mode=wide#preview");
  assert.equal(fill(page, card, "https://example.test").find(row => row.role === "image")?.src, "/images/social-card.png?size=2&mode=wide#preview");
});

test("main h1 wins over an earlier h1; outside main h1 is the next choice", () => {
  const page = source.replace("<site-header>", "<h1>Outside</h1><site-header>");
  assert.equal(fill(page).find(row => row.role === "title")?.text, "Fern & Kettle");
  const outside = page.replace("<h1>Fern &amp; Kettle</h1>", "");
  assert.equal(fill(outside).find(row => row.role === "title")?.text, "Outside");
});

test("no h1 uses the document title without the site suffix; no title uses the address", () => {
  const page = source.replace("<h1>Fern &amp; Kettle</h1>", "");
  for (const separator of [" · ", " | ", " – ", " — ", " - "]) {
    const title = fill(page.replace(" · Larkspur Studio", `${separator}Larkspur Studio`)).find(row => row.role === "title");
    assert.equal(title?.from, "<title>");
    assert.equal(title?.text, "Fern & Kettle");
  }
  const noTitle = page.replace(/<title>.*?<\/title>/, "");
  const title = fill(noTitle).find(row => row.role === "title");
  assert.equal(title?.from, "address");
  assert.equal(title?.text, "fern-and-kettle");
});

test("missing description and image keep role fallbacks, without unused rows", () => {
  const page = source.replace(/<meta[^>]+>/g, "");
  assert.deepEqual(fill(page).find(row => row.role === "body"), {
    slot: "body", label: "Body", role: "body", from: "kept", status: "kept", text: "No description yet.",
  });
  assert.ok(!fill(page).some(row => row.from === "not used"));
  const card = `${template}<slot name="image"><img src="/placeholder.svg"></slot>`;
  assert.equal(fill(page, card).find(row => row.role === "image")?.src, "/placeholder.svg");
  assert.equal(fill(page, card).find(row => row.role === "image")?.from, "kept");
});

test("body uses the last text slot before the title when none follow it", () => {
  const card = `<slot name="earlier"><p>Earlier</p></slot><slot name="quote"><p>Quote</p></slot>
    <slot name="heading"><h3>Who said it</h3></slot><slot name="link"></slot>`;
  assert.equal(fill(source, card).find(row => row.role === "body")?.slot, "quote");
  assert.equal(fill(source, card).find(row => row.role === "body")?.text, description);
});

test("other slots prefer the component match, respect forwarding and match class tokens in main", () => {
  const card = `<slot name="title"><h3>Title</h3></slot><slot name="body"><p>Body</p></slot>
    <card-note><slot name="note" slot="text"><p class="tag extra">Fallback</p></slot></card-note>
    <slot name="tag_line"><p class="tag extra">Fallback tag</p></slot>
    <slot name="badge"><card-badge>Fallback badge</card-badge></slot>`;
  const page = `<body><p class="tag">Outside</p><main>
    <p class="not-tag">Wrong</p><p class="extra tag"> Class &amp; <b>text</b> </p>
    <card-note><p slot="other">Ignore</p><p slot="text"> Component &#38;\n text </p></card-note>
    <card-badge><span>Badge &amp; text</span></card-badge>
  </main></body>`;
  const rows = fill(page, card);
  assert.equal(rows.find(row => row.slot === "note")?.text, "Component & text");
  assert.equal(rows.find(row => row.slot === "note")?.matched, "<card-note>");
  assert.equal(rows.find(row => row.slot === "tag_line")?.text, "Class & text");
  assert.equal(rows.find(row => row.slot === "tag_line")?.matched, ".tag");
  assert.equal(rows.find(row => row.slot === "tag_line")?.label, "Tag line");
  assert.equal(rows.find(row => row.slot === "badge")?.text, "Badge & text");
  assert.equal(rows.find(row => row.slot === "badge")?.matched, "<card-badge>");
  const unmatched = fill("<main></main><card-note>Outside main</card-note>", card);
  assert.equal(unmatched.find(row => row.slot === "note")?.from, "kept");
  assert.equal(unmatched.find(row => row.slot === "note")?.text, "Fallback");
  const second = fill(`<main><p class="extra">Second class</p></main>`, card);
  assert.equal(second.find(row => row.slot === "tag_line")?.matched, ".extra");
  assert.equal(second.find(row => row.slot === "tag_line")?.text, "Second class");
  const noMain = fill("<body><p class='tag'>Body match</p></body>", card);
  assert.equal(noMain.find(row => row.slot === "tag_line")?.text, "Body match");
});

test("a card without a link slot requests a link around its title", () => {
  const rows = fill(source, `<slot name="title"><h3>Title</h3></slot>`);
  assert.deepEqual(rows[1], { label: "Link", role: "link", from: "address", status: "added", href: route, text: "Fern & Kettle" });
  assert.deepEqual(rows.map(row => row.from), ["h1", "address", "not used", "not used"]);
  assert.equal(rows[2].text, description);
  const noTitle = fill(source, `<slot></slot>`);
  assert.equal(noTitle[0].role, "link");
  assert.equal(noTitle[0].from, "not used");
  assert.equal(noTitle[0].status, "not-used");
});

test("roles use the first eligible slot, heading before title name, and named title as fallback", () => {
  const card = `<slot name="title"><p>Named title</p></slot><slot name="heading"><h4>Heading</h4></slot>
    <slot name="body"><p>Body</p></slot><slot name="more"><p>More</p></slot>
    <slot name="image"><img src="/one.png"></slot><slot name="photo"><img src="/two.png"></slot>
    <slot name="link"></slot><slot name="action"><a href="/kept/">Kept link</a></slot>`;
  const rows = fill(source, card);
  assert.deepEqual(rows.map(row => row.role), ["other", "title", "body", "other", "image", "other", "link", "other"]);
  assert.equal(rows[5].src, "/two.png");
  assert.equal(rows[7].href, "/kept/");
  assert.equal(rows[7].text, "Kept link");
  assert.equal(fill(source, `<slot name="title">Untitled</slot>`)[0].from, "h1");
});

test("metadata decodes entities and collapses whitespace without treating attribute text as markup", () => {
  const page = `<meta name="description" content="  Fern &amp; Kettle\n uses &lt;menus&gt;.  "><h1> Fern\n &amp; <em>Kettle</em> </h1>`;
  assert.equal(fill(page).find(row => row.role === "title")?.text, "Fern & Kettle");
  assert.equal(fill(page).find(row => row.role === "body")?.text, "Fern & Kettle uses <menus>.");
});

test("default content stays kept and duplicate slot names use the first fallback", () => {
  const card = `<slot><h3>Default &amp; content</h3></slot>
    <slot name="title"><h3>Title</h3></slot><slot name="body"><p>First &amp; fallback</p></slot>
    <slot name="body"><p>Second fallback</p></slot>`;
  const rows = fill("<main><h1>Page title</h1></main>", card);
  assert.deepEqual(rows.map(row => row.slot), ["", "title", "body", undefined]);
  assert.equal(rows[0].role, "other");
  assert.equal(rows[0].text, "Default & content");
  assert.equal(rows[0].from, "kept");
  assert.equal(rows[2].text, "First & fallback");
});

test("an empty component match falls through to the class match, then the fallback", () => {
  const card = `<slot name="title"><h3>Title</h3></slot><slot name="body"><p>Body</p></slot>
    <card-note><slot name="note" slot="text"><p class="tag">Fallback</p></slot></card-note>`;
  const page = `<main><p class="tag">Class text</p><card-note><p slot="text"></p></card-note></main>`;
  const note = fill(page, card).find(row => row.slot === "note");
  assert.equal(note?.matched, ".tag");
  assert.equal(note?.text, "Class text");
  const bare = fill(`<main><card-note><p slot="text"> </p></card-note></main>`, card).find(row => row.slot === "note");
  assert.equal(bare?.from, "kept");
  assert.equal(bare?.text, "Fallback");
});

// Writing the fill (slice 53): the card's markup as Add card left it, filled from the rows.
const fresh = [
  "<card-project>",
  '        <p slot="note">Project</p>',
  '        <h3 slot="title">Untitled project</h3>',
  '        <p slot="body" class="body">No description yet.</p>',
  "      </card-project>",
].join("\n");
const write = (card: string, html = source, tpl = template, siteUrl?: string) => cardFillMarkup(card, tpl, fill(html, tpl, siteUrl));

test("a fresh starter card takes the page's note, title and description, and gets its link in template order", () => {
  assert.equal(write(fresh), [
    "<card-project>",
    '        <p slot="note">Cafe · Identity and site · 2025</p>',
    '        <h3 slot="title">Fern &amp; Kettle</h3>',
    `        <p slot="body" class="body">${description}</p>`,
    '        <a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>',
    "      </card-project>",
  ].join("\n"));
  // Kept slots stay as written: no description keeps the card's own body.
  assert.match(write(fresh, source.replace(/<meta name="description"[^>]+>/, "")), /<p slot="body" class="body">No description yet\.<\/p>/);
});

test("an existing link, image and nested text element are filled in place; srcset goes with the old image", () => {
  const card = `<slot name="image"><img src="/placeholder.svg" alt=""></slot>${template}`;
  const markup = [
    "<card-project>",
    '  <img slot="image" src="/old.png" srcset="/old-2x.png 2x" sizes="50vw" alt="A photo">',
    '  <div slot="title"><h3>Old</h3></div>',
    '  <p slot="link"><a class="btn" href="/old/">Old link</a></p>',
    "</card-project>",
  ].join("\n");
  // The note goes before the next slot's element in template order (the title), the body before the link.
  assert.equal(write(markup, source, card, "https://example.test"), [
    "<card-project>",
    '  <img slot="image" src="/images/social-card.png" alt="A photo">',
    '  <p slot="note">Cafe · Identity and site · 2025</p>',
    '  <div slot="title"><h3>Fern &amp; Kettle</h3></div>',
    `  <p slot="body" class="body">${description}</p>`,
    '  <p slot="link"><a class="btn" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a></p>',
    "</card-project>",
  ].join("\n"));
});

test("a card without a link slot gets its title wrapped in a link to the page, no class", () => {
  const card = `<article><slot name="title"><h3>Title</h3></slot><slot name="body"><p>Body</p></slot></article>`;
  const markup = '<card-plain>\n  <h3 slot="title">Title</h3>\n  <p slot="body">Body</p>\n</card-plain>';
  assert.equal(write(markup, source, card), `<card-plain>\n  <h3 slot="title"><a href="/work/fern-and-kettle/">Fern &amp; Kettle</a></h3>\n  <p slot="body">${description}</p>\n</card-plain>`);
  // A title that already holds a link has that link pointed at the page.
  const linked = '<card-plain><h3 slot="title"><a href="#">Title</a></h3></card-plain>';
  assert.equal(write(linked, source, card), `<card-plain><h3 slot="title"><a href="/work/fern-and-kettle/">Fern &amp; Kettle</a></h3><p slot="body">${description}</p></card-plain>`);
});

test("an empty card gets its slots' elements before its end tag, from the fallbacks' shapes", () => {
  assert.equal(write("<card-project>\n</card-project>"), [
    "<card-project>",
    '  <p slot="note">Cafe · Identity and site · 2025</p>',
    '  <h3 slot="title">Fern &amp; Kettle</h3>',
    `  <p slot="body" class="body">${description}</p>`,
    '  <a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a>',
    "</card-project>",
  ].join("\n"));
  assert.equal(write("<card-project></card-project>", source.replace(/<card-note>.*<\/card-note>/, "")),
    `<card-project><h3 slot="title">Fern &amp; Kettle</h3><p slot="body" class="body">${description}</p><a slot="link" href="/work/fern-and-kettle/">Read about Fern &amp; Kettle</a></card-project>`);
});

test("text with markup characters is escaped, and the unnamed slot's content stays", () => {
  const page = source.replace("<h1>Fern &amp; Kettle</h1>", "<h1>A &lt;b&gt; &quot;tag&quot;</h1>");
  const card = fresh.replace("      </card-project>", "        <p>My own words</p>\n      </card-project>");
  const out = write(card, page);
  assert.match(out, /<h3 slot="title">A &lt;b&gt; "tag"<\/h3>/);
  assert.match(out, /<p>My own words<\/p>/);
});

test("a title of a line break, or a link with more after it, becomes the page's title (and link) alone", () => {
  const card = `<article><slot name="title"><h3>Title</h3></slot></article>`;
  assert.equal(write('<card-plain><h3 slot="title"><br></h3></card-plain>', source, card),
    '<card-plain><h3 slot="title"><a href="/work/fern-and-kettle/">Fern &amp; Kettle</a></h3></card-plain>');
  assert.equal(write('<card-plain><h3 slot="title"><a class="more" href="#">Old</a> and more</h3></card-plain>', source, card),
    '<card-plain><h3 slot="title"><a class="more" href="/work/fern-and-kettle/">Fern &amp; Kettle</a></h3></card-plain>');
  const linked = `${template.replace("<h3>Untitled project</h3>", "<h3>Untitled</h3>")}`;
  assert.match(write('<card-project><p slot="link"><a href="#">Old</a> and more</p></card-project>', source, linked),
    /<p slot="link"><a href="\/work\/fern-and-kettle\/">Read about Fern &amp; Kettle<\/a><\/p>/);
});

test("a matched component's slot without an element gets the fallback's element, not a span", () => {
  const card = `<article><slot name="title"><h3>Title</h3></slot><slot name="badge"><card-badge class="pill">Old badge</card-badge></slot></article>`;
  const page = source.replace("<h1>", "<card-badge>New badge</card-badge><h1>");
  assert.equal(write("<card-x></card-x>", page, card),
    '<card-x><h3 slot="title"><a href="/work/fern-and-kettle/">Fern &amp; Kettle</a></h3><card-badge class="pill" slot="badge">New badge</card-badge></card-x>');
});

test("a picture's sources go with its old image", () => {
  const card = `<slot name="image"><img src="/placeholder.svg" alt=""></slot>${template}`;
  const markup = [
    "<card-project>",
    '  <picture slot="image">',
    '    <source srcset="/old.webp" type="image/webp">',
    '    <img src="/old.jpg" alt="">',
    "  </picture>",
    "</card-project>",
  ].join("\n");
  assert.match(write(markup, source, card, "https://example.test"), /<picture slot="image">\n {4}<img src="\/images\/social-card\.png" alt="">\n {2}<\/picture>/);
});

test("an image's fill leaves a video's sources beside it, and a fallback's own slot attribute is replaced", () => {
  const card = `<slot name="image"><img src="/placeholder.svg" alt=""></slot>${template}`;
  const markup = '<card-project><figure slot="image"><img src="/old.jpg" alt=""><video><source src="/film.mp4"></video></figure></card-project>';
  assert.match(write(markup, source, card, "https://example.test"), /<figure slot="image"><img src="\/images\/social-card\.png" alt=""><video><source src="\/film\.mp4"><\/video><\/figure>/);
  const forwarded = `<article><slot name="title"><h3>Title</h3></slot><slot name="badge"><card-badge slot="inner">Old badge</card-badge></slot></article>`;
  const page = source.replace("<h1>", "<card-badge>New badge</card-badge><h1>");
  assert.match(write("<card-x></card-x>", page, forwarded), /<card-badge slot="badge">New badge<\/card-badge>/);
});

test("an empty unnamed slot has no row; text or image fallbacks keep their row", () => {
  assert.ok(!fill(source, '<slot>  </slot>').some(row => row.slot === ""));
  assert.equal(fill(source, '<slot><p>Extra content</p></slot>')[0].text, "Extra content");
  assert.equal(fill(source, '<slot><img src="/kept.png"></slot>')[0].src, "/kept.png");
});

const plainFacts = (page: string) => cardFill({
  template: '<slot name="title"><h3>Title</h3></slot><slot name="body"><p></p></slot><slot name="image"><img src="" alt=""></slot><slot name="link"></slot>',
  page: { route: "/oak/", source: page }, siteUrl: "https://example.org",
}).rows;

test("plain page fill uses the first paragraph leaf after its title and the first image, with real source rows", () => {
  const card = '<article><p>Before</p><h3>New card</h3><div><p>Body <em>placeholder</em></p></div><p>After</p><picture><source srcset="old.webp"><img src="old.jpg" srcset="old-2.jpg 2x" sizes="100vw" alt="Keep me"></picture><img src="other.jpg"><video><source src="movie.mp4"></video></article>';
  const facts = plainFacts('<meta name="description" content="Oak &amp; Ash"><meta property="og:image" content="https://example.org/images/oak.jpg"><h1>Oak</h1>');
  const result = itemPageFill(card, "card", "Oak", "/oak/", facts)!;
  assert.equal(result.markup, '<article><p>Before</p><h3><a href="/oak/">Oak</a></h3><div><p>Oak &amp; Ash</p></div><p>After</p><picture><img src="/images/oak.jpg" alt="Keep me"></picture><img src="other.jpg"><video><source src="movie.mp4"></video></article>');
  assert.deepEqual(result.rows.filter(row => row.role === "body" || row.role === "image").map(row => [row.from, row.status]), [["meta description", "filled"], ["og:image", "filled"]]);
});

for (const description of [false, true]) for (const image of [false, true]) {
  test(`plain fill keeps each missing page fact independently: description=${description}, image=${image}`, () => {
    const facts = plainFacts(`<h1>Oak</h1>${description ? '<meta name="description" content="Description">' : ""}${image ? '<meta property="og:image" content="/new.jpg">' : ""}`);
    const result = itemPageFill('<article><h3>New card</h3><p>Custom <em>body</em></p><picture><source srcset="old.webp"><img src="old.jpg" srcset="old-2.jpg 2x" sizes="100vw" alt="Old"></picture></article>', "card", "Oak", "/oak/", facts)!;
    assert.ok(result.markup.includes(description ? '<p>Description</p>' : '<p>Custom <em>body</em></p>'));
    assert.ok(result.markup.includes(image ? '<picture><img src="/new.jpg" alt="Old"></picture>' : '<picture><source srcset="old.webp"><img src="old.jpg" srcset="old-2.jpg 2x" sizes="100vw" alt="Old"></picture>'));
    assert.equal(result.rows.find(row => row.role === "body")!.status, description ? "filled" : "kept");
    assert.equal(result.rows.find(row => row.role === "image")!.status, image ? "filled" : "kept");
  });
}

for (const card of ['<article><p>Before</p><h3>New card</h3></article>', '<li>New item</li>']) {
  test(`plain fill without a body/image place reports not used: ${card}`, () => {
    const result = itemPageFill(card, "item", "Oak", "/oak/", plainFacts('<h1>Oak</h1><meta name="description" content="Unused"><meta property="og:image" content="/unused.jpg">'))!;
    assert.equal(result.rows.find(row => row.role === "body")!.status, "not-used");
    assert.equal(result.rows.find(row => row.role === "image")!.status, "not-used");
    assert.ok(!result.markup.includes("Unused"));
    assert.ok(!result.markup.includes("unused.jpg"));
  });
}

test("a paragraph holding the card's link is its link, not its text: the description goes to the next one, else is not used", () => {
  const facts = plainFacts('<h1>Oak</h1><meta name="description" content="Description">');
  const linked = itemPageFill('<article><h3>New card</h3><p><a href="">Read about New card</a></p></article>', "card", "Oak", "/oak/", facts)!;
  assert.equal(linked.markup, '<article><h3>Oak</h3><p><a href="/oak/">Read about Oak</a></p></article>');
  assert.equal(linked.rows.find(row => row.role === "link")!.status, "filled");
  assert.equal(linked.rows.find(row => row.role === "body")!.status, "not-used");
  const after = itemPageFill('<article><h3>New card</h3><p><a href="">Read about New card</a></p><p>Body</p></article>', "card", "Oak", "/oak/", facts)!;
  assert.equal(after.markup, '<article><h3>Oak</h3><p><a href="/oak/">Read about Oak</a></p><p>Description</p></article>');
});

test("text-only collection fills omit body/image rows when neither facts nor places exist", () => {
  const result = itemPageFill("<li>New item</li>", "item", "Oak", "/oak/", plainFacts("<h1>Oak</h1>"))!;
  assert.equal(result.markup, "<li>Oak</li>");
  assert.deepEqual(result.rows.map(row => row.role), ["title", "link"]);
});

test("an empty paragraph after the title is the plain card's text place too", () => {
  const result = itemPageFill('<article><h3>New card</h3><p></p><p>Second</p></article>', "card", "Oak", "/oak/", plainFacts('<h1>Oak</h1><meta name="description" content="Description">'))!;
  assert.equal(result.markup, '<article><h3><a href="/oak/">Oak</a></h3><p>Description</p><p>Second</p></article>');
  assert.equal(result.rows.find(row => row.role === "body")!.status, "filled");
});

for (const heading of ["<h1>Caf&eacute; Rio</h1>", "<title>Caf&eacute; Rio · Site</title>"]) {
  test(`page titles and fill text decode character references from ${heading}`, () => {
    const page = `<html><head><meta name="description" content="Caf&eacute; by the river."></head><body>${heading}<card-note><p slot="text">Caf&eacute; note</p></card-note></body></html>`;
    assert.equal(pageTitle(page, route).title, "Café Rio");
    const rows = fill(page);
    assert.equal(rows.find(row => row.role === "title")?.text, "Café Rio");
    assert.equal(rows.find(row => row.role === "link")?.text, "Read about Café Rio");
    assert.equal(rows.find(row => row.role === "body")?.text, "Café by the river.");
    assert.equal(rows.find(row => row.slot === "note")?.text, "Café note");
    const markup = cardFillMarkup('<card-project></card-project>', template, rows);
    assert.ok(markup.includes("Café Rio"));
    assert.ok(markup.includes("Café by the river."));
    assert.ok(!markup.includes("&amp;eacute;"));
  });
}

test("kept fallback text decodes character references", () => {
  const rows = fill('<h1>Page</h1>', template.replace("Project", "Caf&eacute; note").replace("No description yet.", "Caf&eacute; body"));
  assert.equal(rows.find(row => row.slot === "note")?.text, "Café note");
  assert.equal(rows.find(row => row.role === "body")?.text, "Café body");
});
