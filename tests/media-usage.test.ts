import { test } from "node:test";
import assert from "node:assert/strict";
import { mediaUsageFor, mediaUsageRecords, mediaUsageState } from "../src/page-builder/media-usage";
import { mediaUsageIndex } from "../src/page-builder/media-references";

test("distinct pages count repeated mentions and responsive members once, in input order", () => {
  const records = mediaUsageRecords({
    media: ["media/photo.jpg", "media/photo-480w.webp", "media/photo-960.webp", "media/originals/photo.png"],
    sources: {
      "index.html": '<img src="/media/photo.jpg"><img src="/media/photo.jpg" srcset="/media/photo-480w.webp 480w">',
      "small.html": '<img srcset="/media/photo-480w.webp 480w">',
      "large.html": '<img srcset="/media/photo-960.webp 960w">',
      "original.html": '<a href="/media/originals/photo.png">Download</a>',
    },
    pages: ["large.html", "small.html", "index.html", "original.html", "index.html"],
  });
  assert.equal(records.families.length, 1);
  const family = mediaUsageFor(records, "media/photo-480w.webp");
  assert.equal(family.main, "media/photo.jpg");
  assert.deepEqual(family.members, ["media/photo.jpg", "media/photo-480w.webp", "media/photo-960.webp", "media/originals/photo.png"]);
  assert.equal(mediaUsageFor(records, "media/originals/photo.png"), family);
  assert.deepEqual(family.pages, ["large.html", "small.html", "index.html", "original.html"]);
  assert.deepEqual(family.otherUses, []);
  assert.equal(mediaUsageState(family), "used-on-pages");
});

test("unlinked stylesheet mentions are other uses only, deduplicated across family members", () => {
  const records = mediaUsageRecords({
    media: ["images/photo.jpg", "images/photo-480w.webp"],
    sources: {
      "index.html": "<p>No pictures</p>",
      "styles/unused.css": '.a{background:url(/images/photo.jpg)} .b{background:url(/images/photo-480w.webp)}',
    },
    pages: ["index.html"],
  });
  const family = mediaUsageFor(records, "images/photo.jpg");
  assert.deepEqual(family.pages, []);
  assert.deepEqual(family.otherUses, [{ file: "styles/unused.css", kind: "stylesheet" }]);
  assert.equal(mediaUsageState(family), "other-uses-only");
});

test("nested components, sibling styles, linked sheets and cyclic imports reach pages and retain each mention location", () => {
  const records = mediaUsageRecords({
    media: ["assets/logo.svg"],
    sources: {
      "index.html": "<site-header></site-header><site-header></site-header>",
      "about.html": '<link rel="stylesheet" href="/styles/a.css">',
      "components/header.html": "<brand-image></brand-image>",
      "components/header.css": '@import "/styles/a.css";',
      "components/brand.html": '<img src="/assets/logo.svg"><img src="/assets/logo.svg">',
      "styles/a.css": '@import "b.css"; .a{background:url(/assets/logo.svg)}',
      "styles/b.css": '@import "a.css"; .b{background:url(/assets/logo.svg)}',
      "fragment.html": '<img src="/assets/logo.svg">',
    },
    pages: ["about.html", "index.html"],
    components: { "site-header": "components/header.html", "brand-image": "components/brand.html" },
  });
  const family = mediaUsageFor(records, "assets/logo.svg");
  assert.deepEqual(family.pages, ["about.html", "index.html"]);
  assert.deepEqual(family.otherUses, [
    { file: "components/brand.html", kind: "component" },
    { file: "styles/a.css", kind: "stylesheet" },
    { file: "styles/b.css", kind: "stylesheet" },
    { file: "fragment.html", kind: "file" },
  ]);
});

test("sharing tags are other uses even on pages and placed components", () => {
  const records = mediaUsageRecords({
    media: ["images/share.png", "images/visible.png"],
    sources: {
      "index.html": '<meta property="og:image" content="/images/share.png"><meta name="twitter:image" content="/images/share.png"><share-card></share-card>',
      "components/share.html": '<meta itemprop="image" content="/images/share.png"><meta property="og:image" content="/images/visible.png"><img src="/images/visible.png">',
    },
    pages: ["index.html"],
    components: { "share-card": "components/share.html" },
  });
  const sharing = mediaUsageFor(records, "images/share.png");
  assert.deepEqual(sharing.pages, []);
  assert.deepEqual(sharing.otherUses, [
    { file: "index.html", kind: "sharing" },
    { file: "components/share.html", kind: "sharing" },
  ]);
  assert.equal(mediaUsageState(sharing), "other-uses-only");
  const visible = mediaUsageFor(records, "images/visible.png");
  assert.deepEqual(visible.pages, ["index.html"]);
  assert.deepEqual(visible.otherUses, [
    { file: "components/share.html", kind: "sharing" },
    { file: "components/share.html", kind: "component" },
  ]);
});

test("any unreadable source makes every family unchecked, including ignored source types", () => {
  for (const file of ["missing.html", "settings.json", "node_modules/missing.css"]) {
    const records = mediaUsageRecords({
      media: ["images/photo.jpg", "images/photo-480w.webp", "media/brochure.pdf"],
      sources: { "index.html": '<img src="/images/photo.jpg">', [file]: undefined, "also-missing.css": undefined },
      pages: ["index.html"],
    });
    assert.deepEqual(records.unreadable, [file, "also-missing.css"]);
    assert.equal(records.families.length, 2);
    for (const family of records.families) {
      assert.equal(family.checked, false);
      assert.deepEqual(family.pages, family.members.includes("images/photo.jpg") ? ["index.html"] : []);
      assert.deepEqual(family.otherUses, []);
      assert.equal(mediaUsageState(family), "not-checked");
    }
  }
});

test("downloads, videos, root images and paths filtered from image families remain represented", () => {
  const media = ["media/brochure.pdf", "assets/logo.svg", "clip.mp4", "media/custom.bin", "media/brochure.pdf"];
  const records = mediaUsageRecords({
    media,
    sources: { "index.html": '<a href="/media/brochure.pdf">Download</a><img src="/assets/logo.svg"><video src="/clip.mp4"></video><a href="/media/custom.bin">File</a>' },
    pages: ["index.html"],
  });
  assert.equal(records.families.length, 4);
  for (const path of media) assert.deepEqual(mediaUsageFor(records, path).pages, ["index.html"]);
});

test("unknown paths are not checked while checked files without mentions have no uses found", () => {
  const records = mediaUsageRecords({ media: ["unused.png"], sources: { "index.html": "<p>Hello</p>" }, pages: ["index.html"] });
  const unknown = mediaUsageFor(records, "new.png");
  assert.deepEqual(unknown, { main: "new.png", members: ["new.png"], checked: false, pages: [], otherUses: [] });
  assert.equal(mediaUsageState(unknown), "not-checked");
  assert.equal(mediaUsageState(mediaUsageFor(records, "unused.png")), "no-uses-found");
  assert.equal(records.families.length, 1);
});

test("reach is text; scripts and data count, node_modules stays excluded", () => {
  const records = mediaUsageRecords({
    media: ["images/a.png"],
    sources: {
      "index.html": '<script src="/script.js"></script><link href="/node_modules/site.css"><a href="/settings.json">Settings</a>',
      "script.js": '<img src="/images/a.png">',
      "settings.json": '<img src="/images/a.png">',
      "node_modules/site.css": '.a{background:url(/images/a.png)}',
      "node_modules/template.html": '<img src="/images/a.png">',
    },
    pages: ["index.html"],
  });
  assert.equal(records.reach, "text");
  assert.deepEqual(records.unreadable, []);
  assert.deepEqual(mediaUsageFor(records, "images/a.png").otherUses, [{ file: "script.js", kind: "script" }, { file: "settings.json", kind: "data" }]);
});

test("a link to another page does not place that page's pictures on the linking page", () => {
  const sources = {
    "index.html": '<a href="/about.html">About</a><link rel="stylesheet" href="/styles/site.css">',
    "about.html": '<img src="/images/photo.jpg">',
    "styles/site.css": ".a{color:red}",
  };
  const records = mediaUsageRecords({ media: ["images/photo.jpg"], sources, pages: ["index.html", "about.html"] });
  assert.deepEqual(mediaUsageFor(records, "images/photo.jpg").pages, ["about.html"]);
  assert.deepEqual(mediaUsageIndex(["images/photo.jpg"], sources, ["index.html", "about.html"])["images/photo.jpg"].pages, ["about.html"]);
});

test("a page or component template missing from the scan leaves every family unchecked", () => {
  const cases = [
    { sources: {}, components: {} },
    { sources: { "index.html": "<site-card></site-card>" }, components: { "site-card": "components/card.html" } },
  ];
  for (const { sources, components } of cases) {
    const records = mediaUsageRecords({ media: ["images/photo.jpg"], sources, pages: ["index.html"], components });
    assert.deepEqual(records.unreadable, Object.keys(sources).length ? ["components/card.html"] : ["index.html"]);
    assert.equal(mediaUsageState(mediaUsageFor(records, "images/photo.jpg")), "not-checked");
  }
});

test("a download link to a stylesheet applies none of its pictures, a stylesheet link and a style-block import do", () => {
  const sources = {
    "download.html": '<a href="/styles/theme.css">Download the stylesheet</a>',
    "linked.html": '<link rel="stylesheet" href="/styles/theme.css">',
    "imported.html": '<style>@import "/styles/theme.css";</style>',
    "styles/theme.css": ".hero{background:url(/images/hero.jpg)}",
  };
  const records = mediaUsageRecords({ media: ["images/hero.jpg"], sources, pages: ["download.html", "linked.html", "imported.html"] });
  assert.deepEqual(mediaUsageFor(records, "images/hero.jpg").pages, ["linked.html", "imported.html"]);
});

test("pending text keeps all families unchecked and retains found uses", () => {
  const records = mediaUsageRecords({ media: ["images/a.png", "unused.png"], files: ["index.html", "app.js", ".editor/media.json", "binary.png"], sources: { "index.html": '<img src="/images/a.png">' }, pages: ["index.html"] });
  assert.deepEqual(records.pending, ["app.js"]);
  assert.equal(records.reach, "text");
  assert.deepEqual(mediaUsageFor(records, "images/a.png").pages, ["index.html"]);
  assert.ok(records.families.every(family => mediaUsageState(family) === "not-checked"));
});
test("wide kinds and own-domain sharing stay distinct from page uses", () => {
  const records = mediaUsageRecords({ media: ["images/a.png"], pages: ["index.html"], site: { origins: ["https://native.example"] }, sources: {
    "index.html": '<meta property="og:image" content="https://native.example/images/a.png">',
    "app.js": '"/images/a.png"', "data.json": '"a.png"', "sitemap.xml": "a.png", "AGENTS.md": "a.png", "_redirects": "a.png",
  } });
  assert.deepEqual(records.pending, []);
  assert.deepEqual(records.families[0].pages, []);
  assert.deepEqual(records.families[0].otherUses.map(use => use.kind), ["sharing", "script", "data", "feed", "notes", "settings"]);
  assert.equal(records.families[0].checked, true);
});
