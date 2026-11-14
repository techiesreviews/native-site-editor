import test from "node:test";
import assert from "node:assert/strict";
import { siteFile, siteItems, type InboxPage } from "../src/inbox/site-items.ts";

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
