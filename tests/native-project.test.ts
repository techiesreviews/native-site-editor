import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  isNativeComponentTag,
  isNativeProject,
  nativeConventionComponents,
  nativePageBody,
  nativePageHead,
  nativePageStylesheets,
  nativePageWithDetail,
  nativePageWithDetails,
  nativePageUrl,
  nativePageWithUrl,
  nativeSitePaths,
  nativeSiteSettings,
  resolveNativeProject,
} from "../shared/native-project.ts";

const site = [
  "index.html",
  "about/index.html",
  "notes/first/index.html",
  "notes.html",
  "404.html",
  "_drafts/idea.html",
  "components/components.js",
  "components/site-header/site-header.html",
  "components/site-header/site-header.css",
  "components/promo-card/promo-card.html",
  "components/flat-note.html",
  "styles/site.css",
  "images/logo.svg",
  ".editor/config.json",
  "README.md",
];

test("a repository is a native site when it has index.html at its root", () => {
  assert.equal(isNativeProject(["README.md", "index.html"]), true);
  assert.equal(isNativeProject(["src/pages/index.html", "about/index.html", ".astro-editor/native.json"]), false);
  assert.equal(isNativeProject([]), false);
});

test("pages and components are found where they are", () => {
  const result = resolveNativeProject(site);
  assert.ok(result.ok);
  assert.deepEqual(result.site.routes, {
    "/": "index.html",
    "/404.html": "404.html",
    "/about/": "about/index.html",
    "/notes.html": "notes.html",
    "/notes/first/": "notes/first/index.html",
  });
  assert.deepEqual(result.site.components, {
    "flat-note": "components/flat-note.html",
    "promo-card": "components/promo-card/promo-card.html",
    "site-header": "components/site-header/site-header.html",
  });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(nativeSitePaths(result.site).slice(0, 2), ["index.html", "404.html"]);
  assert.deepEqual(resolveNativeProject(["about/index.html"]), { ok: false, error: "The site has no home page: add index.html." });
});

test("components: valid, unreserved tags only; a folder beats a flat file of the same tag", () => {
  const { components, warnings } = nativeConventionComponents([
    "components/site-header/site-header.html",
    "components/site-header.html",
    "components/header/header.html", // no dash
    "components/Big-Card/Big-Card.html", // uppercase
    "components/font-face/font-face.html", // reserved
    "components/annotation-xml.html", // reserved
    "components/promo-card/card.html", // name differs from its folder
    "components/deep/nested/x-y.html",
    "components/info-box/info-box.css",
    "components/news-item.html",
    "src/components/old-card/old-card.html",
  ]);
  assert.deepEqual(components, {
    "news-item": "components/news-item.html",
    "site-header": "components/site-header/site-header.html",
  });
  assert.deepEqual(warnings, [
    "components/site-header.html and components/site-header/site-header.html both give the component <site-header>; components/site-header/site-header.html is used. Remove or rename one.",
  ]);
  assert.equal(isNativeComponentTag("site-header"), true);
  assert.equal(isNativeComponentTag("font-face"), false);
});

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>About &amp; contact</title>
  <meta name="description" content="Who we are.">
  <meta property="og:title" content="About &amp; contact">
  <meta property="og:description" content="Who we are.">
  <link rel="stylesheet" href="/styles/site.css">
  <link rel="stylesheet" href="../styles/print.css" media="print">
  <link rel="alternate stylesheet" href="/styles/dark.css">
  <link rel="stylesheet" href="https://fonts.example/a.css">
  <link rel="icon" href="/images/logo.svg">
  <script type="module" src="/components/components.js"></script>
</head>
<body class="about">
  <main><h1>About</h1></main>
</body>
</html>
`;

test("a page is its <body>: the preview renders that range, and indexes count from it", () => {
  const { start, end } = nativePageBody(page);
  assert.equal(page.slice(start, end), "\n  <main><h1>About</h1></main>\n");
  // A template, or a document with no <body> tag, is all page after its head.
  assert.deepEqual(nativePageBody("<section><h2>Hi</h2></section>"), { start: 0, end: 30 });
  // </header> is not </head>, nor </htmlx> an end of the document.
  assert.deepEqual(nativePageBody("<header><a href=\"/\">Home</a></header>"), { start: 0, end: 37 });
  const bare = "<!doctype html><head><title>x</title></head><main></main>";
  assert.equal(bare.slice(nativePageBody(bare).start), "<main></main>");
});

test("the head gives the title, the description and the stylesheets, resolved against the page's path", () => {
  assert.deepEqual(nativePageHead(page), { title: "About & contact", description: "Who we are." });
  assert.deepEqual(nativePageHead("<main></main>"), {});
  assert.deepEqual(nativePageStylesheets(page, "about/index.html"), ["styles/site.css", "styles/print.css"]);
  assert.deepEqual(nativePageStylesheets('<head><link href="site.css" rel="stylesheet"></head>', "work/notes.html"), ["work/site.css"]);
  // Links in the body are not the page's stylesheets.
  assert.deepEqual(nativePageStylesheets('<head></head><body><link rel="stylesheet" href="/x.css"></body>', "index.html"), []);
});

test("page details are written in the head, og tags along, as small an edit as can be", () => {
  const retitled = nativePageWithDetail(page, "title", "Company <info> & more");
  assert.match(retitled, /<title>Company &lt;info> &amp; more<\/title>/);
  assert.match(retitled, /<meta property="og:title" content="Company <info> &amp; more">/);
  assert.equal(nativePageHead(retitled).title, "Company <info> & more");
  const described = nativePageWithDetail(page, "description", 'Say "hi"');
  assert.match(described, /<meta name="description" content="Say &quot;hi&quot;">/);
  assert.match(described, /<meta property="og:description" content="Say &quot;hi&quot;">/);
  assert.equal(nativePageHead(described).description, 'Say "hi"');
  // Emptied, the tags stay with empty values; the rest of the document is as it was.
  const emptied = nativePageWithDetails(page, { title: "", description: "" });
  assert.match(emptied, /<title><\/title>/);
  assert.match(emptied, /<meta name="description" content="">/);
  assert.equal(emptied.replace(/<title>.*<\/title>/, "").replace(/content="[^"]*"/g, ""), page.replace(/<title>.*<\/title>/, "").replace(/content="[^"]*"/g, ""));
  assert.equal(nativePageWithDetail(page, "title", "About & contact"), page);
});

test("a missing title or description is added in the head, indented like it", () => {
  const bare = "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n</head>\n<body></body>\n</html>\n";
  const titled = nativePageWithDetail(bare, "title", "Hello");
  assert.equal(titled, "<!doctype html>\n<html>\n<head>\n  <title>Hello</title>\n  <meta charset=\"utf-8\">\n</head>\n<body></body>\n</html>\n");
  const described = nativePageWithDetail(titled, "description", "World");
  assert.equal(described, "<!doctype html>\n<html>\n<head>\n  <title>Hello</title>\n  <meta name=\"description\" content=\"World\">\n  <meta charset=\"utf-8\">\n</head>\n<body></body>\n</html>\n");
  // No description is added for an empty value.
  assert.equal(nativePageWithDetail(titled, "description", ""), titled);
  // CRLF files keep their line endings; a single-quoted or bare value is rewritten quoted.
  assert.equal(nativePageWithDetail("<head>\r\n  <meta charset=utf-8>\r\n</head>", "title", "A"), "<head>\r\n  <title>A</title>\r\n  <meta charset=utf-8>\r\n</head>");
  assert.equal(nativePageWithDetail("<head><meta name=description content='x'></head>", "description", "y"), "<head><meta name=description content=\"y\"></head>");
});

test("the fixture's pages are full documents with a title and the shared stylesheet", () => {
  for (const path of ["index.html", "about/index.html"]) {
    const source = readFileSync(`fixtures/native-starter/${path}`, "utf8");
    assert.ok(nativePageHead(source).title, path);
    assert.deepEqual(nativePageStylesheets(source, path), ["styles/site.css"], path);
  }
});

test("the site settings are .editor/config.json's site name and http(s) address", () => {
  const config = (site: unknown) => JSON.stringify({ site });
  assert.deepEqual(nativeSiteSettings(config({ name: " Larkspur ", url: "https://larkspur.example" })), { name: "Larkspur", url: "https://larkspur.example/" });
  assert.deepEqual(nativeSiteSettings(config({ name: "No url" })), { name: "No url" });
  for (const text of [config({ url: "javascript:alert(1)" }), config({ url: "larkspur.example" }), config("x"), JSON.stringify({ url: "https://top.example" }), "{not json", undefined])
    assert.deepEqual(nativeSiteSettings(text), {}, String(text));
  assert.equal(nativePageUrl("https://larkspur.example/", "/about/"), "https://larkspur.example/about/");
  assert.equal(nativePageUrl("https://larkspur.example/x/", "/"), "https://larkspur.example/x/");
  assert.equal(nativePageUrl(undefined, "/about/"), undefined);
});

test("a page's own address sets its canonical link and og:url, or removes both", () => {
  const head = [
    "<!doctype html>",
    "<head>",
    "  <title>Home</title>",
    '  <link rel="canonical" href="https://a.example/">',
    '  <meta property="og:title" content="Home">',
    "  <meta property='og:url' content=https://a.example/>",
    '  <link rel="stylesheet" href="/styles/site.css">',
    "</head>",
    "<body></body>",
    "",
  ].join("\n");
  const moved = nativePageWithUrl(head, "https://a.example/about/");
  assert.match(moved, /<link rel="canonical" href="https:\/\/a\.example\/about\/">/);
  assert.match(moved, /<meta property='og:url' content="https:\/\/a\.example\/about\/">/);
  assert.equal(moved.split("\n").length, head.split("\n").length);
  const gone = nativePageWithUrl(head, undefined);
  assert.equal(gone, head.replace('  <link rel="canonical" href="https://a.example/">\n', "").replace("  <meta property='og:url' content=https://a.example/>\n", ""));
  // Nothing is added to a page that has neither, and the body's links are not the head's.
  const bare = '<head><title>x</title></head><body><link rel="canonical" href="/x/"></body>';
  assert.equal(nativePageWithUrl(bare, "https://a.example/x/"), bare);
});
