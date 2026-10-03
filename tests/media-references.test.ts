import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaUsageIndex, rewriteMediaReferences, scanMediaReferences } from "../src/page-builder/media-references";

test("HTML references ignore comments and script strings and decode complete entities", () => {
  const source = '<!-- <img src="/images/fake.png"> --><script>const html = \'<img src="/images/fake.png">\';</script><img src="/images/caf&eacute;.png?x=1&amp;y=2" alt="Caf&eacute; &copy;">';
  const refs = scanMediaReferences("index.html", source);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].path, "images/café.png");
  assert.equal(refs[0].alt, "Café ©");
  const next = rewriteMediaReferences("index.html", source, "images/café.png", "images/tea & cake.png");
  assert.ok(next.includes('src="/images/tea%20%26%20cake.png?x=1&amp;y=2"'));
  assert.ok(next.includes('alt="Caf&eacute; &copy;"'));
  assert.ok(next.includes('<script>const html = \'<img src="/images/fake.png">\';</script>'));
});
test("srcset scans data URL boundaries, encoded names and descriptors without corrupting neighbours", () => {
  const source = '<img srcset="data:image/png;base64,AAAA 1x, /images/caf&eacute;.png 2x, /images/other.png 3x" src="/images/other.png">';
  assert.deepEqual(scanMediaReferences("index.html", source).map((ref) => ref.path), ["images/other.png", "images/café.png", "images/other.png"]);
  const next = rewriteMediaReferences("index.html", source, "images/café.png", "images/new.png");
  assert.equal(next, source.replace("/images/caf&eacute;.png", "/images/new.png"));
});
test("CSS token scan ignores comments and string lookalikes, follows imports and escaped paths", () => {
  const source = '/* url(/images/fake.png) */\n.x { content: "url(/images/fake.png)"; background: url("../images/caf\\e9 .png"); }\n@import "other.css"; .y { background: url(../images/other.png); }';
  assert.deepEqual(scanMediaReferences("styles/site.css", source).map((ref) => ref.path), ["images/café.png", "styles/other.css", "images/other.png"]);
  const next = rewriteMediaReferences("styles/site.css", source, "images/café.png", "images/new.png");
  assert.ok(next.includes('background: url("/images/new.png")'));
  assert.ok(next.includes('content: "url(/images/fake.png)"'));
});
test("inline styles decode HTML entities while style blocks keep CSS ampersands literal", () => {
  const source = '<div style="background:url(&quot;/images/a.png?x=1&amp;y=2&quot;)"></div><style>.x{background:url("/images/a.png?x=1&y=2")}</style>';
  const next = rewriteMediaReferences("index.html", source, "images/a.png", "images/b.png");
  assert.equal(next, '<div style="background:url(&quot;/images/b.png?x=1&amp;y=2&quot;)"></div><style>.x{background:url("/images/b.png?x=1&y=2")}</style>');
});
test("semicolonless attribute ambiguity remains a literal path", () => {
  const source = '<img src="/images/&copy=literal.png" srcset="/images/&copy=literal.png 1x">';
  assert.deepEqual(scanMediaReferences("index.html", source).map((ref) => ref.path), ["images/&copy=literal.png", "images/&copy=literal.png"]);
});
test("quoted attribute lookalikes and descriptive meta text are not rewritten", () => {
  const source = '<meta name="description" content="/images/a.png"><meta property="og:image" content="/images/a.png"><img data-note=\' src="/images/a.png" \' src="/images/b.png">';
  const next = rewriteMediaReferences("index.html", source, "images/a.png", "images/new.png");
  assert.equal(next, source.replace('property="og:image" content="/images/a.png"', 'property="og:image" content="/images/new.png"'));
});
test("CSS string quote escapes survive URL rewriting", () => {
  const source = `.x { background:url('/images/a.png?label=it\\'s'); }`;
  const next = rewriteMediaReferences("styles/site.css", source, "images/a.png", "images/b.png");
  assert.equal(next, `.x { background:url('/images/b.png?label=it\\'s'); }`);
});
test("image-set quoted images and escaped url function names count as references", () => {
  const source = '.x{background:image-set("/images/a.png" type("image/png") 1x, url(/images/b.png) 2x)} .y{background:u\\72l(/images/a.png)}';
  assert.deepEqual(scanMediaReferences("styles/site.css", source).map((ref) => ref.path), ["images/a.png", "images/b.png", "images/a.png"]);
  const usage = mediaUsageIndex(["images/a.png"], { "index.html": '<link rel="stylesheet" href="/styles/site.css">', "styles/site.css": source }, ["index.html"]);
  assert.deepEqual(usage["images/a.png"].pages, ["index.html"]);
  const next = rewriteMediaReferences("styles/site.css", source, "images/a.png", "images/new.png");
  assert.ok(next.includes('image-set("/images/new.png" type("image/png")'));
  assert.ok(next.includes('u\\72l(/images/new.png)'));
});
test("style closing tags need an exact boundary and cannot expose fake HTML image tags", () => {
  const source = '<style>.x{content:"</styleish><img src=\'/images/fake.png\'>";background:url(/images/a.png)}</style><img src="/images/b.png">';
  assert.deepEqual(scanMediaReferences("index.html", source).map((ref) => ref.path), ["images/a.png", "images/b.png"]);
  const next = rewriteMediaReferences("index.html", source, "images/a.png", "images/new.png");
  assert.ok(next.includes('background:url(/images/new.png)'));
  assert.ok(next.includes('</styleish><img src=\'/images/fake.png\'>'));
});
test("script close-name lookalikes keep fake images inside raw script text", () => {
  const source = '<script>const html = "</scriptish><img src=\'/images/fake.png\'>";</script><img src="/images/real.png">';
  assert.deepEqual(scanMediaReferences("index.html", source).map((ref) => ref.path), ["images/real.png"]);
  assert.equal(rewriteMediaReferences("index.html", source, "images/fake.png", "images/new.png"), source);
});
test("usage traverses nested components and cyclic CSS imports once per page", () => {
  const sources = {
    "index.html": '<site-header></site-header><site-header></site-header>',
    "about/index.html": '<link rel="stylesheet" href="/styles/a.css">',
    "components/site-header/site-header.html": '<brand-image></brand-image>',
    "components/site-header/site-header.css": '@import "/styles/a.css";',
    "components/brand-image/brand-image.html": '<img src="/images/a.png" alt="Brand">',
    "styles/a.css": '@import "b.css"; .x{background:url(/images/a.png)}',
    "styles/b.css": '@import "a.css";',
  };
  const usage = mediaUsageIndex(["images/a.png", "images/unused.png"], sources, ["index.html", "about/index.html"], { "site-header": "components/site-header/site-header.html", "brand-image": "components/brand-image/brand-image.html" });
  assert.deepEqual(usage["images/a.png"].pages, ["index.html", "about/index.html"]);
  assert.deepEqual(usage["images/a.png"].alts, ["Brand"]);
  assert.deepEqual(usage["images/unused.png"].files, []);
});

test("raw-text closing tags do not accept NBSP or vertical tab as HTML whitespace", () => {
  for (const delimiter of ["\u00a0", "\v"]) {
    const source = `<script>const fake = "</script${delimiter}><img src='/images/fake.png'>";</script><style>.x{content:"</style${delimiter}><img src='/images/fake.png'>";background:url(/images/a.png)}</style><img src="/images/real.png">`;
    assert.deepEqual(scanMediaReferences("index.html", source).map(ref => ref.path), ["images/a.png", "images/real.png"]);
    assert.equal(rewriteMediaReferences("index.html", source, "images/fake.png", "images/new.png"), source);
    assert.ok(rewriteMediaReferences("index.html", source, "images/a.png", "images/new.png").includes("background:url(/images/new.png)"));
  }
});
test("CSS hexadecimal function-name escapes consume CRLF as one whitespace pair", () => {
  const source = '.x{background:u\\72\r\nl(/images/a.png?keep=1#fragment)}';
  assert.deepEqual(scanMediaReferences("styles/site.css", source).map(ref => ref.path), ["images/a.png"]);
  assert.equal(rewriteMediaReferences("styles/site.css", source, "images/a.png", "images/new.png"), source.replace("/images/a.png", "/images/new.png"));
  const usage = mediaUsageIndex(["images/a.png"], { "index.html": '<link rel="stylesheet" href="/styles/site.css">', "styles/site.css": source }, ["index.html"]);
  assert.deepEqual(usage["images/a.png"].pages, ["index.html"]);
});
