import test from "node:test";
import assert from "node:assert/strict";
import { forgetPages, heldPages, pictureVerdict, siteFile, siteItems, type InboxPage, type InboxPart } from "../src/inbox/site-items.ts";

// The edit bar's verdict stands in: an absent alt or an unmarked empty one is not described yet.
const rules = {
  picture: (_page: string, _src: string, alt: string | undefined) => alt ? "described" as const : "missing" as const,
  file: (_page: string, src: string) => src.startsWith("/images/") ? src.slice(1) : undefined,
};
const page = (file: string, source: string | undefined, label = "Home", route = "/"): InboxPage => ({ file, label, route, source });
const head = (title: string) => `<!doctype html><html><head><title>${title}</title></head><body>`;

test("a picture without a description is one item per page and file, with Decorative when it is a repository file", () => {
  const items = siteItems([
    page("index.html", `${head("Home")}<img src="/images/team.jpg"><img src="/images/team.jpg"><img src="/images/logo.svg" alt="Logo"></body>`),
    page("about/index.html", `${head("About")}<img src="https://example.com/x.jpg"></body>`, "About", "/about/"),
  ], rules);
  assert.deepEqual(items.map(({ kind, what, where, page, media, wave }) => ({ kind, what, where, page, media, wave })), [
    { kind: "picture", what: "Picture without a description", where: "Home page", page: "index.html", media: "images/team.jpg", wave: "Decorative" },
    { kind: "picture", what: "Picture without a description", where: "About page", page: "about/index.html", media: undefined, wave: undefined },
  ]);
  // The spot: the first such picture's tag.
  const source = `${head("Home")}<img src="/images/team.jpg">`;
  assert.equal(siteItems([page("index.html", source)], rules)[0].at, source.indexOf("<img"));
});

test("a picture with no address is not a description to write (the edit bar's No image), and described ones are not listed", () => {
  assert.deepEqual(siteItems([page("index.html", `${head("Home")}<img src=""><img alt="Logo" src="/images/logo.svg"><img></body>`)], rules), []);
});

test("a page whose title is missing or empty is an item at its address; a page not read yet is skipped", () => {
  const items = siteItems([
    page("index.html", `${head("Home")}</body>`),
    page("blog/new.html", `${head("  ")}</body>`, "blog/new.html", "/blog/new"),
    page("contact.html", "<!doctype html><html><head></head><body><h1>Contact</h1></body>", "Contact", "/contact"),
    page("later.html", undefined, "Later", "/later"),
  ], rules);
  assert.deepEqual(items.map(({ kind, what, where, page }) => ({ kind, what, where, page })), [
    { kind: "title", what: "Page without a title", where: "/blog/new", page: "blog/new.html" },
    { kind: "title", what: "Page without a title", where: "/contact", page: "contact.html" },
  ]);
});

test("a title inside the page's body (an SVG's) does not count as the page's title", () => {
  const items = siteItems([page("index.html", `<!doctype html><html><head></head><body><svg><title>Icon</title></svg></body>`)], rules);
  assert.deepEqual(items.map(item => item.kind), ["title"]);
});

test("each item has a key of its own, so the list and the dots follow it", () => {
  const items = siteItems([page("index.html", `<html><head></head><body><img src="/images/a.jpg"><img src="/images/b.jpg"></body>`)], rules);
  assert.equal(new Set(items.map(item => item.key)).size, items.length);
});

test("a picture's file counts only when the site holds it, so a broken picture offers no Decorative", () => {
  const held = new Set(["images/team.jpg"]);
  assert.equal(siteFile("/images/team.jpg", "about/index.html", undefined, path => held.has(path)), "images/team.jpg");
  assert.equal(siteFile("../images/team.jpg", "about/index.html", undefined, path => held.has(path)), "images/team.jpg");
  assert.equal(siteFile("/images/gone.jpg", "index.html", undefined, path => held.has(path)), undefined);
  assert.equal(siteFile("https://example.com/x.jpg", "index.html", undefined, () => true), undefined);
});

test("a picture's verdict is the edit bar's Alt text warning, unknown only while a stored picture's Media rules load", () => {
  // No alt attribute: "Alt text missing", known at once, wherever the picture comes from.
  assert.equal(pictureVerdict(undefined, undefined, true), "missing");
  assert.equal(pictureVerdict(undefined, undefined, false), "missing");
  // A picture stored in the site waits for its Media record.
  assert.equal(pictureVerdict("A desk", undefined, true), undefined);
  assert.equal(pictureVerdict("A desk", "described", true), "described");
  assert.equal(pictureVerdict("", "decorative", true), "decorative");
  assert.equal(pictureVerdict("", "described", true), "missing");
  assert.equal(pictureVerdict("A desk", "missing", true), "missing");
  // A picture from another address has no record: its alt text alone decides, never "unknown".
  assert.equal(pictureVerdict("A desk", undefined, false), "described");
  assert.equal(pictureVerdict("", undefined, false), "missing");
});

test("a picture shown through srcset or a <picture>'s source is judged as the edit bar does, with no Decorative", () => {
  const items = siteItems([page("index.html", `${head("Home")}<img srcset="/images/a.jpg 1x, /images/a@2x.jpg 2x"><picture><source srcset="/images/b.webp"><img></picture><picture><source srcset="/images/c.webp"><img alt="C"></picture></body>`)], rules);
  assert.deepEqual(items.map(({ kind, media, wave }) => ({ kind, media, wave })), [
    { kind: "picture", media: undefined, wave: undefined },
    { kind: "picture", media: undefined, wave: undefined },
  ]);
  assert.equal(new Set(items.map(item => item.key)).size, 2);
});

test("an item says whether every use of its file on the page waits, so Decorative never clears another use's words", () => {
  const [some] = siteItems([page("index.html", `${head("Home")}<img alt="The team" src="/images/team.jpg"><img src="/images/team.jpg"></body>`)], rules);
  assert.equal(some.allUses, false);
  const [every] = siteItems([page("index.html", `${head("Home")}<img src="/images/team.jpg"><img src="/images/team.jpg"></body>`)], rules);
  assert.equal(every.allUses, true);
});

test("a picture offering Decorative carries the page text it was found in", () => {
  const text = `${head("Home")}<img src="/images/team.jpg"></body>`;
  assert.equal(siteItems([page("index.html", text)], rules)[0].found, text);
});

test("a picture inside an inactive <template> shows nothing and is not listed; one in a declarative shadow root is", () => {
  const items = siteItems([page("index.html", `${head("Home")}<template id="card"><img src="/images/a.jpg"></template><div><template shadowrootmode="open"><img src="/images/b.jpg"></template></div></body>`)], rules);
  assert.deepEqual(items.map(item => item.media), ["images/b.jpg"]);
});

test("a use inside an inactive <template> with words keeps Decorative to the waiting use alone", () => {
  const [item] = siteItems([page("index.html", `${head("Home")}<template><img alt="The team" src="/images/team.jpg"></template><img src="/images/team.jpg"></body>`)], rules);
  assert.equal(item.allUses, false);
});

test("template and picture rules read the page's elements, not its text: comments and scripts do not count", () => {
  const items = siteItems([page("index.html", `${head("Home")}<!-- <template> --><script>let t = "<template>";</script><img src="/images/a.jpg"><picture><source srcset="/images/b.webp"><span><img></span></picture></body>`)], rules);
  // The picture after the comment and script is listed; an img nested deeper than the <picture>'s child is the edit bar's "No image".
  assert.deepEqual(items.map(item => item.media ?? "none"), ["images/a.jpg"]);
});

test("the page's title is read from its elements: a commented-out or scripted title does not count", () => {
  const items = siteItems([
    page("index.html", `<!doctype html><html><head><!-- <title>Old</title> --></head><body></body></html>`),
    page("about.html", `<!doctype html><html><head><script>const t = "<title>x</title>";</script></head><body></body></html>`, "About", "/about"),
    page("ok.html", `<!doctype html><html><head><title>Fine</title></head><body></body></html>`, "Ok", "/ok"),
  ], rules);
  assert.deepEqual(items.map(item => item.page), ["index.html", "about.html"]);
});

test("pages no longer listed are let go: a switched site's pages leave memory (TOOLS-264 B3)", () => {
  siteItems([page("index.html", `${head("Home")}</body>`), page("about/index.html", `${head("About")}</body>`, "About", "/about/")], rules);
  assert.equal(heldPages(), 2);
  siteItems([page("shop/index.html", `${head("Shop")}</body>`, "Shop", "/shop/")], rules);
  assert.equal(heldPages(), 1);
  // No site open, or another loading: the Inbox lets go of them all (src/inbox/inbox.ts never lists then).
  forgetPages();
  assert.equal(heldPages(), 0);
});

// ---- TOOLS-253: the four new checks (site-quality ticket 41) ----

const part = (file: string, tag: string, source: string, pages: string[], name = tag): InboxPart => ({ file, tag, name, pages, source });

test("a picture inside a shared part without a description is one item, with the part's name and every page it changes", () => {
  const header = `<header><img src="/images/logo.svg"><a href="/">Home</a></header>`;
  const items = siteItems([page("index.html", `${head("Home")}<site-header></site-header></body>`)], rules,
    [part("components/site-header/site-header.html", "site-header", header, ["index.html", "about/index.html"], "Site header")]);
  assert.deepEqual(items.map(({ kind, what, where, page, media, wave, shared, fix }) => ({ kind, what, where, page, media, wave, shared, fix })), [
    { kind: "picture", what: "Picture without a description", where: "Site header", page: "components/site-header/site-header.html", media: "images/logo.svg",
      wave: "Decorative", fix: "alt", shared: { tag: "site-header", name: "Site header", pages: ["index.html", "about/index.html"] } },
  ]);
  assert.equal(items[0].at, header.indexOf("<img"));
  assert.equal(items[0].found, header);
});

test("a picture on a page offers Fix with AI for its description", () => {
  const [item] = siteItems([page("index.html", `${head("Home")}<img src="/images/team.jpg"></body>`)], rules);
  assert.equal(item.fix, "alt");
  assert.equal(item.shared, undefined);
});

test("a link with no name is an item; text, a label, a title or a described picture inside name it", () => {
  const source = `${head("Home")}<a href="/new/"><svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg></a>`
    + `<a href="/a/">Bikes</a><a href="/b/" aria-label="Back"></a><a href="/c/" title="Cart"></a><a href="/d/"><img src="/images/x.svg" alt="Shop"></a><a id="top"></a></body>`;
  const items = siteItems([page("index.html", source)], rules);
  assert.deepEqual(items.map(({ kind, what, where, fix, at }) => ({ kind, what, where, fix, at })), [
    { kind: "link", what: "Link without a name", where: "Home page", fix: "name", at: source.indexOf(`<a href="/new/">`) },
  ]);
});

test("a link whose words say nothing (click here, read more) is an item that carries its words", () => {
  const source = `${head("Home")}<p>See <a href="/bikes/">click here</a> and <a href="/blog/"> Read  more </a>, or <a href="/shop/">the shop</a>.</p></body>`;
  const items = siteItems([page("index.html", source)], rules);
  assert.deepEqual(items.map(({ kind, what, fix, words, at }) => ({ kind, what, fix, words, at })), [
    { kind: "link", what: "Link that only says “click here”", fix: "words", words: "click here", at: source.indexOf(`<a href="/bikes/">`) },
    { kind: "link", what: "Link that only says “Read more”", fix: "words", words: "Read more", at: source.indexOf(`<a href="/blog/">`) },
  ]);
  assert.equal(new Set(items.map(item => item.key)).size, 2);
});

test("a vague link whose words sit inside other markup is listed without Fix with AI (its words are not one text to replace)", () => {
  const [item] = siteItems([page("index.html", `${head("Home")}<a href="/x/"><span>here</span></a></body>`)], rules);
  assert.equal(item.kind, "link");
  assert.equal(item.fix, undefined);
});

test("a heading that skips a level is an item with today's one-press fix and no Fix with AI", () => {
  const source = `${head("Home")}<h1>Bikes</h1><h2>Workshop</h2><h4>Opening hours</h4><h2>Shop</h2><h3>Fine</h3></body>`;
  const items = siteItems([page("index.html", source)], rules);
  assert.deepEqual(items.map(({ kind, what, where, level, fix, at }) => ({ kind, what, where, level, fix, at })), [
    { kind: "heading", what: "Heading skips a level", where: "Home page", level: { from: 4, to: 3 }, fix: undefined, at: source.indexOf("<h4>") },
  ]);
});

test("a video without subtitles is an item with No speech; one with subtitles, a muted one or one marked no speech is not", () => {
  const source = `${head("Home")}<video src="/media/fit.mp4" controls></video><video src="/media/b.mp4" controls><track kind="subtitles" src="/media/b.vtt"></video>`
    + `<video src="/media/c.mp4" controls><track kind="captions" src="/media/c.vtt"></video><video src="/media/loop.mp4" autoplay muted loop></video><video src="/media/d.mp4" controls data-no-speech></video></body>`;
  const items = siteItems([page("index.html", source)], rules);
  assert.deepEqual(items.map(({ kind, what, wave, fix, at }) => ({ kind, what, wave, fix, at })), [
    { kind: "video", what: "Video without subtitles", wave: "No speech", fix: undefined, at: source.indexOf("<video") },
  ]);
  assert.equal(items[0].found, source);
});

test("links and videos in a shared part carry its note too; headings in a part are judged on the page, not in the part", () => {
  const card = `<article><h4>Title</h4><a href="/more/">read more</a></article>`;
  const items = siteItems([page("index.html", `${head("Home")}<h2>Cards</h2><project-card></project-card></body>`)], rules,
    [part("components/project-card/project-card.html", "project-card", card, ["index.html"], "Project card")]);
  assert.deepEqual(items.map(({ kind, where, shared }) => ({ kind, where, pages: shared?.pages })), [
    { kind: "link", where: "Project card", pages: ["index.html"] },
  ]);
});

test("each new item's key stays the same while its cause does, so a fix's state follows it across checks", () => {
  const before = siteItems([page("index.html", `${head("Home")}<a href="/x/">click here</a><h2>A</h2><h4>B</h4></body>`)], rules);
  const after = siteItems([page("index.html", `${head("Home")}<p>New words above.</p><a href="/x/">click here</a><h2>A</h2><h4>B</h4></body>`)], rules);
  assert.deepEqual(after.map(item => item.key), before.map(item => item.key));
});
