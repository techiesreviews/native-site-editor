import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeText, hasHeadField, readHeadSettings, upsertHeadTag, withPageField, withSearchHidden } from "../src/page-builder/site-head";

const page = `<!doctype html>\n<html><head>\n  <meta charset="utf-8">\n  <title>Home &amp; garden</title>\n  <meta name='description' content='Hello'>\n  <link rel="stylesheet" href="/styles/site.css">\n</head><body><p>Keep me</p></body></html>`;

test("head upsert retains quotes, whitespace and all unrelated source", () => {
  assert.equal(upsertHeadTag(page, "description", "Tom's & flowers"), page.replace("content='Hello'", "content='Tom&#39;s &amp; flowers'"));
});
test("head fields insert in metadata order before styles/scripts", () => {
  const next = upsertHeadTag(upsertHeadTag(upsertHeadTag(page, "og:image", "/images/card.png"), "canonical", "https://example.com/"), "robots", "noindex");
  assert.ok(next.indexOf('name="robots"') < next.indexOf('rel="canonical"'));
  assert.ok(next.indexOf('rel="canonical"') < next.indexOf('property="og:image"'));
  assert.ok(next.indexOf('property="og:image"') < next.indexOf('rel="stylesheet"'));
  assert.ok(next.endsWith('</head><body><p>Keep me</p></body></html>'));
});
test("CRLF and indentation survive inserted metadata", () => {
  const html = page.replace(/\n/g, "\r\n").replace(/  </g, "\t<");
  const next = upsertHeadTag(html, "theme-color", "#123456");
  assert.ok(next.includes('\r\n\t<meta name="theme-color" content="#123456">\r\n'));
  assert.ok(!/(?<!\r)\n/.test(next));
});
test("head reads escaped text and never edits body lookalikes", () => {
  const html = page.replace("<p>", '<meta name="description" content="Body"><p>');
  const next = upsertHeadTag(html, "description", "Changed");
  assert.equal(readHeadSettings(next).title, "Home & garden");
  assert.equal(readHeadSettings(next).description, "Changed");
  assert.ok(next.includes('content="Body"'));
});
test("missing mirrors link to title/description, distinct social values stay independent", () => {
  const linked = withPageField(page, "title", "Welcome");
  assert.equal(readHeadSettings(linked)["og:title"], "Welcome");
  const custom = upsertHeadTag(linked, "og:title", "Share me");
  assert.equal(readHeadSettings(withPageField(custom, "title", "Changed"))["og:title"], "Share me");
  assert.equal(readHeadSettings(withPageField(custom, "title", "Changed", true))["og:title"], "Changed");
  assert.equal(readHeadSettings(withPageField(linked, "title", "Changed", false))["og:title"], "Welcome");
});
test("head upsert is idempotent, clears empty optional tags, escapes attributes", () => {
  const next = upsertHeadTag(page, "og:image", 'https://example.com/a?x="a"&b=2');
  assert.equal(upsertHeadTag(next, "og:image", 'https://example.com/a?x="a"&b=2'), next);
  assert.equal(upsertHeadTag(next, "og:image", ""), page);
  assert.equal(readHeadSettings(next)["og:image"], 'https://example.com/a?x="a"&b=2');
});
test("robots toggling preserves unrelated crawler directives", () => {
  assert.equal(withSearchHidden("index, follow, max-image-preview:large", true), "noindex, follow, max-image-preview:large");
  assert.equal(withSearchHidden("noindex, nofollow", false), "nofollow");
  assert.equal(withSearchHidden("none", false), "nofollow");
});
test("changing favicon drops stale MIME type while preserving sizes", () => {
  const html = upsertHeadTag(page, "icon", "/favicon.svg").replace('href="/favicon.svg"', 'href="/favicon.svg" type="image/svg+xml" sizes="any"');
  const next = upsertHeadTag(html, "icon", "/favicon.png");
  assert.ok(!next.includes('type="image/svg+xml"'));
  assert.ok(next.includes('sizes="any"'));
});
test("head edits refuse malformed head or title instead of corrupting source", () => {
  assert.throws(() => upsertHeadTag("<body>Hello</body>", "title", "Title"), /complete <head>/);
  assert.throws(() => upsertHeadTag("<head><title>Broken</head>", "title", "Title"), /incomplete/);
});
test("ambiguous head closing text fails closed rather than inserting metadata in a script", () => {
  const html = '<head><script>const markup = "</head>";</script><title>Home</title></head><body>Keep</body>';
  assert.throws(() => upsertHeadTag(html, "description", "Changed"), /complete <head>/);
});
test("head tag names require exact closing boundaries", () => {
  assert.throws(() => upsertHeadTag('<head><title>Home</title></header><body>Keep</body>', "description", "Changed"), /complete <head>/);
});
test("unrelated meta names do not impersonate title or link fields", () => {
  const html = '<head><meta name="title" content="Custom title"><meta name="icon" content="Custom icon"><meta name="canonical" content="Custom canonical"><title>Home</title></head>';
  const next = upsertHeadTag(upsertHeadTag(upsertHeadTag(html, "title", "Changed"), "icon", "/favicon.svg"), "canonical", "https://example.com/");
  assert.ok(next.includes('<meta name="title" content="Custom title">'));
  assert.ok(next.includes('<meta name="icon" content="Custom icon">'));
  assert.ok(next.includes('<meta name="canonical" content="Custom canonical">'));
  assert.equal(readHeadSettings(next).title, "Changed");
  assert.equal(readHeadSettings(next).icon, "/favicon.svg");
});
test("HTML5 named references include non-ASCII and multi-codepoint values", () => {
  assert.equal(decodeText("Caf&eacute; &copy; &Afr; &NotEqualTilde; &acE;"), "Café © 𝔄 ≂̸ ∾̳");
  assert.equal(decodeText("&Eacute; &eacute; &EACUTE;"), "É é &EACUTE;");
  assert.equal(decodeText("&constructor; &toString; &unknown;"), "&constructor; &toString; &unknown;");
  assert.equal(decodeText("&CounterClockwiseContourIntegral;"), "∳");
});
test("HTML5 numeric references handle astral, invalid and C1 values", () => {
  assert.equal(decodeText("&#x1F600; &#128512;"), "😀 😀");
  assert.equal(decodeText("&#0; &#xD800; &#1114112;"), "� � �");
  assert.equal(decodeText("&#128; &#x82; &#159;"), "€ ‚ Ÿ");
  assert.equal(decodeText("&#233 &#xE9 rest"), "é é rest");
});
test("semicolonless named references follow text and attribute ambiguity rules", () => {
  assert.equal(decodeText("&notit; &copy= &copycat &copy!"), "¬it; ©= ©cat ©!");
  assert.equal(decodeText("&notit; &copy= &copycat &copy!", true), "&notit; &copy= &copycat ©!");
  assert.equal(decodeText("&notin; &copy;=", true), "∉ ©=");
});
test("unchanged named-entity metadata keeps original bytes", () => {
  const html = '<head><title>Caf&eacute; &copy;</title><meta name="description" content="Caf&eacute; &NotEqualTilde;"></head>';
  const values = readHeadSettings(html);
  assert.equal(values.title, "Café ©");
  assert.equal(values.description, "Café ≂̸");
  assert.equal(upsertHeadTag(upsertHeadTag(html, "title", values.title), "description", values.description), html);
  assert.ok(upsertHeadTag(html, "title", "Café & tea").includes("<title>Café &amp; tea</title>"));
});


test("authored field presence shares exact head-writer matching, including empty tags", () => {
  const html = page.replace('</head>', `<meta title="property=og:title" property='og:title' content=''><meta property="og&#58;description" content="Literal encoded key"></head>`);
  assert.equal(hasHeadField(html, 'og:title'), true);
  assert.equal(readHeadSettings(html)['og:title'], '');
  assert.equal(hasHeadField(html, 'og:description'), false);
  assert.equal(hasHeadField(page.replace('<p>', '<meta property="og:title" content="Body"><p>'), 'og:title'), false);
  assert.equal(hasHeadField(page.replace('</head>', '<meta title="property=og:title" name="other" content="Fake"></head>'), 'og:title'), false);
});
