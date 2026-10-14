import test from "node:test";
import assert from "node:assert/strict";
import { isMediaTextFile, mediaMentions, mediaOwnOrigins } from "../src/page-builder/media-mentions";

const media = ["images/a.png", "images/1.png", "images/21.png", "images/my photo.png", "other/a.png"];
test("raw site mentions cover every text kind, escapes and inline scripts", () => {
  const cases = [
    ["app.js", "`${location.origin}/images/a.png`", "script"],
    ["data.json", '{"image":"\\/images\\/a.png?width=2#top"}', "data"],
    ["index.html", '<script type="application/ld+json">{"image":"/images/a.png"}</script>', "sharing"],
    ["inline.html", '<script>const image="/images/a.png"</script>', "script"],
    ["sitemap.xml", "<loc>https://www.native.example/images/a.png</loc>", "feed"],
    ["news.rss", "<enclosure url='/images/a.png'/>", "feed"],
    ["news.atom", "<link href='/images/a.png'/>", "feed"],
    ["_redirects", "/old /images/a.png 301", "settings"],
    ["_headers", "/images/a.png\n  Cache-Control: public", "settings"],
    ["AGENTS.md", "Keep `a.png`", "notes"],
    ["README", "a.png", "notes"],
    ["picture.svg", '<svg><image xlink:href="/images/a.png"/></svg>', "file"],
    ["site.webmanifest", '{"icons":[{"src":"/images/a.png"}]}', "data"],
    [".editor/config.json", '{"image":"/images/a.png"}', "settings"],
    ["theme.css", '/* a.png */', "stylesheet"],
  ];
  for (const [file, source, kind] of cases) {
    const uses = mediaMentions({ media, sources: { [file]: source }, site: { origins: ["https://native.example"] } });
    assert.deepEqual(uses.get("images/a.png"), [{ file, kind }], file);
  }
});
test("boundaries, suffixes, bare duplicate names and percent encodings", () => {
  const scan = (source: string) => mediaMentions({ media, sources: { "README.md": source } });
  assert.equal(scan("21.png").has("images/1.png"), false);
  assert.equal(scan("banana.png").size, 0);
  assert.deepEqual([...scan("a.png").keys()], ["images/a.png", "other/a.png"]);
  assert.deepEqual([...scan("../images/a.png?q=1#x").keys()], ["images/a.png"]);
  assert.equal(scan("/images/my%20photo.png").has("images/my photo.png"), true);
  assert.equal(scan("Keep my photo.png.").has("images/my photo.png"), true);
  assert.equal(mediaMentions({ media: ["images/a&b.png"], sources: { "index.html": '<!-- /images/a&amp;b.png -->' } }).size, 1);
});
test("own hosts ignore www and scheme; unknown origins retain full addresses", () => {
  assert.deepEqual(mediaOwnOrigins("https://www.native.example/path", "other.example\n"), ["https://www.native.example", "https://other.example"]);
  for (const address of ["https://native.example/images/a.png", "//www.native.example/images/a.png", "http://native.example/images/a.png"]) {
    assert.equal(mediaMentions({ media, sources: { "data.json": address }, site: { origins: ["https://native.example"] } }).has("images/a.png"), true);
  }
  assert.equal(mediaMentions({ media, sources: { "data.json": "https://other.example/images/a.png" }, site: { origins: ["https://native.example"] } }).size, 0);
  assert.equal(mediaMentions({ media, sources: { "data.json": "https://other.example/images/a.png" } }).size, 1);
});
test("records, dependencies, git and binary files cannot supply mentions; SVG is text", () => {
  for (const path of [".editor/media.json", "node_modules/test.js", ".git/config", "a.png", "a.pdf", "a.woff2", "a.wasm", "a.docx", "a.zip", "a.mp4"]) {
    assert.equal(isMediaTextFile(path), false, path);
    assert.equal(mediaMentions({ media, sources: { [path]: "a.png" } }).size, 0);
  }
  for (const path of ["a.svg", "CNAME", "README", "AGENTS.md", "unknown.format"]) assert.equal(isMediaTextFile(path), true);
});

test("names holding spaces, parentheses or commas are still one mention", () => {
  const media = ["images/photo (1).jpg", "images/a, b.png", "images/1).jpg"];
  const sources = {
    "scripts/app.js": 'const hero = "/images/photo (1).jpg";',
    "notes.md": "See images/a%2C%20b.png for the banner.",
  };
  const found = mediaMentions({ media, sources });
  assert.deepEqual(found.get("images/photo (1).jpg"), [{ file: "scripts/app.js", kind: "script" }]);
  assert.deepEqual(found.get("images/a, b.png"), [{ file: "notes.md", kind: "notes" }]);
  assert.equal(found.has("images/1).jpg"), false);
});

test("XML entities and dot segments inside an address still name the file", () => {
  const media = ["images/a&b.png", "images/a.png"];
  const sources = {
    "sitemap.xml": "<image:loc>https://native.example/images/a&amp;b.png</image:loc>",
    "app.js": 'const image = "/images/unused/../a.png";',
  };
  const found = mediaMentions({ media, sources, site: { origins: ["https://native.example"] } });
  assert.deepEqual(found.get("images/a&b.png"), [{ file: "sitemap.xml", kind: "feed" }]);
  assert.deepEqual(found.get("images/a.png"), [{ file: "app.js", kind: "script" }]);
});
