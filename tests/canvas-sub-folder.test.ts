import assert from "node:assert/strict";
import { test } from "node:test";
import { canvasPath, canvasRoute } from "../src/components/canvas-path.ts";
import { nativeLinkTarget } from "../shared/native-routes.ts";
import { nativePageStylesheets } from "../shared/native-project.ts";
import { expandStyleImports, resolveImportPath, rewriteCssUrls } from "../shared/css-imports.ts";
import { mediaResolvePath, scanMediaReferences } from "../src/page-builder/media-references.ts";
import { nativeShownFiles } from "../src/native-boot.ts";
import { thumbnailDocument } from "../src/page-builder/thumbnail-doc.ts";

const prefix = "/my-site";
const site = { routes: { "/": "index.html", "/about/": "about/index.html" }, components: { "site-header": "components/site-header.html" } };

test("canvas addresses keep domain-root resolution and decode prefixed repository paths", () => {
  const cases: [string, string, string | undefined, string | undefined][] = [
    ["/media/x.png", "/", "media/x.png", "media/x.png"],
    ["/my-site/media/x.png?size=2#x", "/", "my-site/media/x.png", "media/x.png"],
    ["../../media/x.png", "/notes/first/", "media/x.png", "media/x.png"],
    ["image.png", "/about/", "about/image.png", "about/image.png"],
    ["image.png", "/my-site/about/", "my-site/about/image.png", "about/image.png"],
    ["/my-site/about/", "/", "my-site/about/", "about/"],
    ["/about/", "/", "about/", "about/"],
    ["/other-site/x.png", "/", "other-site/x.png", "other-site/x.png"],
    ["/my-sitex/", "/", "my-sitex/", "my-sitex/"],
    ["/my-site/media/caf%C3%A9%20%23%3F.svg", "/", "my-site/media/café %23%3F.svg", "media/café #?.svg"],
    ["/my-site/media/%zz.png", "/", undefined, undefined],
    ["https://elsewhere.invalid/x.png", "/", undefined, undefined],
    ["/my-site/", "/", "my-site/", ""],
  ];
  for (const [src, base, old, mapped] of cases) {
    assert.equal(canvasPath(src, base), old, src);
    assert.equal(canvasPath(src, base, ""), old, src);
    assert.equal(canvasPath(src, base, prefix), mapped, src);
  }
  assert.equal(canvasPath("/caf%c3%a9/media/x.svg", "/", "/café"), "media/x.svg");
});

test("canvas routes are the same addresses as root routes, for the current-page mark", () => {
  for (const [src, base, old, mapped] of [
    ["/my-site/notes/first-note/", "/", "/my-site/notes/first-note/", "/notes/first-note/"],
    ["/notes/first-note/", "/", "/notes/first-note/", "/notes/first-note/"],
    ["../", "/notes/first-note/", "/notes/", "/notes/"],
    ["/my-site", "/", "/my-site", "/"],
    ["/", "/about/", "/", "/"],
    ["/my-site/caf%C3%A9/", "/", "/my-site/café/", "/café/"],
  ] as const) {
    assert.equal(canvasRoute(src, base), old, src);
    assert.equal(canvasRoute(src, base, prefix), mapped, src);
  }
  assert.equal(canvasRoute("https://elsewhere.invalid/", "/", prefix), undefined);
  assert.equal(canvasRoute("/my-site/%zz/", "/", prefix), undefined);
});

test("canvas navigation accepts prefixed and existing root links", () => {
  for (const href of ["/my-site/about/", "/my-site/about", "/my-site/about/index.html#team", "/about/", "../about/"]) {
    assert.equal(nativeLinkTarget(href, "/notes/", site.routes, prefix), "/about/");
  }
  assert.equal(nativeLinkTarget("/my-site/", "/about/", site.routes, prefix), "/");
  for (const href of ["/my-sitex/about/", "/other-site/about/", "https://elsewhere.invalid/about/", "#team"])
    assert.equal(nativeLinkTarget(href, "/", site.routes, prefix), undefined);
  assert.equal(nativeLinkTarget("/my-site/about/", "/", site.routes), undefined);
  assert.equal(nativeLinkTarget("/about/", "/", site.routes, ""), "/about/");
});

const sources: Record<string, string> = {
  ".editor/config.json": '{"site":{"url":"https://user.github.io/my-site/"}}',
  "index.html": '<html><head><link rel="stylesheet" href="/my-site/styles/site.css"></head><body><site-header></site-header></body></html>',
  "components/site-header.html": '<header><img src="/my-site/media/x.svg"></header>',
  "styles/site.css": '@import "/my-site/styles/base.css"; h1 { background: url("/my-site/media/caf%C3%A9.svg"); }',
  "styles/base.css": '@font-face { font-family: Test; src: url("/my-site/media/font.woff2"); }',
};

test("page sheets, imports and CSS URLs share prefix-aware resolution", () => {
  assert.deepEqual(nativePageStylesheets(sources["index.html"], "index.html", prefix), ["styles/site.css"]);
  assert.deepEqual(nativePageStylesheets(sources["index.html"], "index.html"), ["my-site/styles/site.css"]);
  for (const url of ["/my-site/styles/base.css", "/styles/base.css", "base.css"])
    assert.equal(resolveImportPath("styles/site.css", url, prefix), "styles/base.css");
  assert.equal(resolveImportPath("styles/site.css", "/my-site/media/caf%C3%A9.svg", prefix), "media/café.svg");
  assert.equal(resolveImportPath("styles/site.css", "/my-sitex/base.css", prefix), "my-sitex/base.css");
  assert.equal(resolveImportPath("styles/site.css", "https://elsewhere.invalid/base.css", prefix), undefined);
  const expanded = expandStyleImports(["styles/site.css"], path => sources[path], undefined, prefix);
  assert.deepEqual(expanded.errors, []);
  assert.deepEqual(expanded.imported, ["styles/base.css"]);
  assert.equal(rewriteCssUrls(sources["styles/base.css"], url => resolveImportPath("styles/base.css", url, prefix)), '@font-face { font-family: Test; src: url("media/font.woff2"); }');
});

test("only opt-in media scans strip the prefix, including fonts and encoded images", () => {
  assert.equal(mediaResolvePath("/my-site/media/x.svg", "index.html"), "my-site/media/x.svg");
  assert.equal(mediaResolvePath("/my-site/media/x.svg", "index.html", undefined, prefix), "media/x.svg");
  assert.equal(mediaResolvePath("../media/x.svg", "about/index.html", undefined, prefix), "media/x.svg");
  assert.deepEqual(scanMediaReferences("styles/site.css", sources["styles/site.css"], undefined, prefix).map(ref => ref.path), ["styles/base.css", "media/café.svg"]);
  assert.deepEqual(scanMediaReferences("styles/base.css", sources["styles/base.css"], undefined, prefix).map(ref => ref.path), ["media/font.woff2"]);
});

test("shown files follow prefixed stylesheets and imports as config arrives", () => {
  const read = (path: string) => sources[path];
  const shown = nativeShownFiles(site, ["index.html"], read, () => false, prefix);
  assert.deepEqual([...shown.files], ["index.html", "components/site-header.html", "styles/site.css", "styles/base.css"]);
  assert.ok(nativeShownFiles(site, ["index.html"], read, () => false).files.has("my-site/styles/site.css"));
});

test("component thumbnails follow the same address for styles, imports and images", () => {
  const doc = thumbnailDocument({ site, sources, componentStyles: {}, assets: { "media/x.svg": "data:image/svg+xml,test", "media/font.woff2": "data:font/woff2,test" }, route: "/" }, "<site-header></site-header>");
  assert.ok(doc.includes('src="data:image/svg+xml,test"'));
  assert.ok(doc.includes('url("data:font/woff2,test")'));
});
