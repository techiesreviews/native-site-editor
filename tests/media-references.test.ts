import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaUsageIndex, rewriteMediaReferences, scanMediaReferences, scanMediaUrlTokens } from "../src/page-builder/media-references";

test("URL tokens and references retain attribute origin while CSS text has none", () => {
  const source = '<meta property="og:image" content="/images/share.png"><img src="/images/a.png" srcset="/images/b.png 2x"><a href="/file.pdf">File</a><video poster="/images/poster.png"></video><div style="background:url(/images/c.png)"></div><style>.a{background:url(/images/d.png)}</style>';
  const attributes = ["content", "src", "srcset", "href", "poster", "style", undefined];
  assert.deepEqual(scanMediaUrlTokens("index.html", source).map(ref => ref.tag), ["meta", "img", "img", "a", "video", "div", undefined]);
  assert.deepEqual(scanMediaUrlTokens("index.html", source).map(ref => ref.attribute), attributes);
  assert.deepEqual(scanMediaReferences("index.html", source).map(ref => ref.attribute), attributes);
  assert.equal(scanMediaReferences("styles/site.css", '.a{background:url(/images/a.png)}')[0].attribute, undefined);
  // The existing index still includes sharing pictures in its page traversal.
  assert.deepEqual(mediaUsageIndex(["images/share.png"], { "index.html": source }, ["index.html"])["images/share.png"].pages, ["index.html"]);
});

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

test("lazy attributes, preload srcsets, object data and SVG hrefs are references and rewrite", () => {
  const source = '<img data-src="/a.png" data-srcset="/a.png 1x, /b.png 2x"><link imagesrcset="/a.png 1x"><object data="/a.png"></object><svg><image xlink:href="/a.png"/></svg><div data="/a.png"></div>';
  const refs = scanMediaReferences("index.html", source);
  assert.deepEqual(refs.map(ref => ref.attribute), ["data-src", "data-srcset", "data-srcset", "imagesrcset", "data", "xlink:href"]);
  assert.equal(rewriteMediaReferences("index.html", source, "a.png", "renamed.png").match(/\/renamed.png/g)?.length, 5);
});
test("full own addresses resolve for usage but rewriting leaves them unchanged", () => {
  const source = '<meta property="og:image" content="https://www.native.example/images/a.png"><img src="//native.example/images/a.png"><img src="https://outside.example/images/a.png">';
  assert.deepEqual(scanMediaReferences("index.html", source, { origins: ["http://native.example"] }).map(ref => ref.path), ["images/a.png", "images/a.png"]);
  assert.equal(rewriteMediaReferences("index.html", source, "images/a.png", "images/b.png"), source);
});
test("template HTML uses each page address, paired CSS uses its own address", () => {
  const sources = {
    "index.html": "<my-card></my-card>", "nested/index.html": "<my-card></my-card>",
    "components/card.html": '<img src="images/a.png"><div style="background:url(images/b.png)"></div><style>.x{background:url(images/c.png)}</style>',
    "components/card.css": '.x{background:url(images/d.png)}',
  };
  const paths = ["images/a.png", "nested/images/a.png", "images/b.png", "nested/images/b.png", "images/c.png", "nested/images/c.png", "components/images/d.png"];
  const usage = mediaUsageIndex(paths, sources, ["index.html", "nested/index.html"], { "my-card": "components/card.html" });
  for (const path of paths.slice(0, 6)) assert.deepEqual(usage[path].pages, [path.startsWith("nested/") ? "nested/index.html" : "index.html"]);
  assert.deepEqual(usage["components/images/d.png"].pages, ["index.html", "nested/index.html"]);
});

test("rename recognises both root spellings and writes a prefixed new address with suffixes", () => {
  const source = '<img src="/my-site/media/a.png?x=1&amp;y=2#photo"><img srcset="/media/a.png 1x, /my-site/media/a.png 2x">';
  assert.equal(rewriteMediaReferences("index.html", source, "media/a.png", "media/new photo.png", "/my-site"),
    '<img src="/my-site/media/new%20photo.png?x=1&amp;y=2#photo"><img srcset="/my-site/media/new%20photo.png 1x, /my-site/media/new%20photo.png 2x">');
  assert.equal(rewriteMediaReferences("styles/site.css", '.hero{background:url(/my-site/media/a.png)}', "media/a.png", "media/b.png", "/my-site"), '.hero{background:url(/my-site/media/b.png)}');
});

test("a prefix without a site does not make outside hosts local files", () => {
  assert.deepEqual(scanMediaReferences("index.html", '<iframe src="https://youtube.com/embed/aqz-KE-bpKQ"></iframe>', undefined, "/my-site"), []);
  assert.deepEqual(scanMediaReferences("index.html", '<img src="https://user.github.io/my-site/media/a.webp">', { prefix: "/my-site", origins: ["https://user.github.io"] }).map(ref => ref.path), ["media/a.webp"]);
});
