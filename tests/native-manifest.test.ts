import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  parseNativeManifest,
  nativeManifestPaths,
  nativeDefaultRoute,
} from "../src/native-manifest.ts";

function ok(text: string, files: string[] = []) {
  const result = parseNativeManifest(text, files);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.ok ? result.manifest : undefined!;
}

function fail(text: string, files: string[] = []) {
  const result = parseNativeManifest(text, files);
  assert.equal(result.ok, false, "expected validation failure");
  return result.ok ? "" : result.error;
}

test("accepts the native-starter fixture manifest", () => {
  const text = readFileSync(resolve("fixtures/native-starter/.astro-editor/native.json"), "utf8");
  const manifest = ok(text);
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.routes["/"], "src/pages/index.html");
  assert.deepEqual(manifest.routes["/about/"], "src/pages/about.html");
  assert.equal(manifest.components["site-header"], "src/components/site-header/site-header.html");
  assert.deepEqual(manifest.styles, ["src/styles/site.css"]);
  assert.equal(nativeDefaultRoute(manifest), "/");
  assert.deepEqual(
    nativeManifestPaths(manifest).sort(),
    [
      "src/components/card-note/card-note.html",
      "src/components/feature-block/feature-block.html",
      "src/components/project-card/project-card.html",
      "src/components/site-button/site-button.html",
      "src/components/site-footer/site-footer.html",
      "src/components/site-header/site-header.html",
      "src/pages/about.html",
      "src/pages/index.html",
      "src/styles/site.css",
    ],
  );
});

test("accepts a flat component path", () => {
  const manifest = ok(
    '{"version":1,"routes":{"/":"src/pages/index.html"},"components":{"header-bar":"src/components/header-bar.html"}}',
  );
  assert.equal(manifest.components["header-bar"], "src/components/header-bar.html");
});

test("accepts a per-component folder path", () => {
  const manifest = ok(
    '{"version":1,"routes":{"/":"src/pages/index.html"},"components":{"header-bar":"src/components/header-bar/header-bar.html"}}',
  );
  assert.equal(manifest.components["header-bar"], "src/components/header-bar/header-bar.html");
});

test("rejects reserved custom-element names", () => {
  assert.match(
    fail('{"version":1,"routes":{"/":"src/pages/index.html"},"components":{"annotation-xml":"src/components/annotation-xml.html"}}'),
    /reserved/,
  );
});

test("defaults optional components and styles to empty", () => {
  const manifest = ok('{"version":1,"routes":{"/":"src/pages/index.html"}}');
  assert.deepEqual(manifest.components, {});
  assert.deepEqual(manifest.styles, []);
});

test("accepts a route written with its file, title and description", () => {
  const manifest = ok(
    '{"version":1,"routes":{"/":"src/pages/index.html","/about/":{"file":"src/pages/about.html","title":"About","description":"Who we are."}}}',
  );
  assert.equal(manifest.routes["/about/"], "src/pages/about.html");
  assert.deepEqual(manifest.pages, { "/about/": { title: "About", description: "Who we are." } });
  assert.deepEqual(nativeManifestPaths(manifest).sort(), ["src/pages/about.html", "src/pages/index.html"]);
});

test("rejects a route object with a bad page file or a non-string title", () => {
  assert.match(fail('{"version":1,"routes":{"/":{"file":"src/index.html","title":"Home"}}}'), /src\/pages.*"file"/);
  assert.match(fail('{"version":1,"routes":{"/":{"file":"src/pages/index.html","title":3}}}'), /"title" must be a string/);
  assert.match(fail('{"version":1,"routes":{"/about/":{"title":3}}}', ["src/pages/index.html", "src/pages/about.html"]), /"title" must be a string/);
});

test("rejects unsupported version", () => {
  assert.match(fail('{"version":2,"routes":{"/":"src/pages/index.html"}}'), /version/);
});

test("rejects invalid JSON", () => {
  assert.match(fail("{not json"), /valid JSON/);
});

test("requires a home page, derived or mapped", () => {
  assert.match(fail('{"version":1,"routes":{"/about/":"src/pages/about.html"}}'), /no home page/);
  assert.match(fail('{"version":1}', ["src/pages/about.html"]), /no home page/);
  assert.match(fail('{"version":1,"routes":{"/":{"title":"Home"}}}'), /no home page/);
  assert.match(fail('{"version":1,"routes":[]}', ["src/pages/index.html"]), /"routes" must be an object/);
});

const pageFiles = [
  "src/pages/index.html",
  "src/pages/about.html",
  "src/pages/404.html",
  "src/pages/work/index.html",
  "src/pages/work/fern-and-kettle.html",
  "src/pages/_drafts/idea.html",
  "src/pages/_partial.html",
  "src/pages/notes.txt",
  "src/components/site-header/site-header.html",
  "README.md",
];

test("routes every page under src/pages by where it is, without a routes object", () => {
  const result = parseNativeManifest('{"version":1}', pageFiles);
  assert.ok(result.ok);
  assert.deepEqual(result.manifest.routes, {
    "/": "src/pages/index.html",
    "/404/": "src/pages/404.html",
    "/about/": "src/pages/about.html",
    "/work/": "src/pages/work/index.html",
    "/work/fern-and-kettle/": "src/pages/work/fern-and-kettle.html",
  });
  assert.deepEqual(result.warnings, []);
  assert.equal(nativeDefaultRoute(result.manifest), "/");
});

test("a metadata-only entry titles the derived route and maps no file", () => {
  const manifest = ok(
    '{"version":1,"routes":{"/work/fern-and-kettle/":{"title":"Fern & Kettle","description":"A café.","jsonLd":{"@type":"CreativeWork"}}}}',
    pageFiles,
  );
  assert.equal(manifest.routes["/work/fern-and-kettle/"], "src/pages/work/fern-and-kettle.html");
  assert.deepEqual(manifest.pages["/work/fern-and-kettle/"], { title: "Fern & Kettle", description: "A café.", jsonLd: { "@type": "CreativeWork" } });
  assert.equal(ok('{"version":1,"routes":{"/about/":{}}}', pageFiles).routes["/about/"], "src/pages/about.html");
});

test("an explicit file wins over the derived route, and a mapped file is routed only where mapped", () => {
  const manifest = ok(
    '{"version":1,"routes":{"/about/":{"file":"src/pages/work/index.html","title":"About"},"/work/kettle/":"src/pages/work/fern-and-kettle.html"}}',
    pageFiles,
  );
  assert.equal(manifest.routes["/about/"], "src/pages/work/index.html");
  assert.equal(manifest.routes["/work/kettle/"], "src/pages/work/fern-and-kettle.html");
  // work/index.html and fern-and-kettle.html are mapped, so /work/ and
  // /work/fern-and-kettle/ are gone; about.html lost its route to the map.
  assert.deepEqual(Object.keys(manifest.routes), ["/", "/404/", "/about/", "/work/kettle/"]);
  assert.ok(!Object.values(manifest.routes).includes("src/pages/about.html"));
  // The old form alone still works with no file list at all.
  assert.deepEqual(ok('{"version":1,"routes":{"/":"src/pages/index.html","/x/":"src/pages/y.html"}}').routes, { "/": "src/pages/index.html", "/x/": "src/pages/y.html" });
});

test("two files on one route: the folder's index wins with a warning, unless the manifest maps the route", () => {
  const files = ["src/pages/index.html", "src/pages/work.html", "src/pages/work/index.html"];
  const result = parseNativeManifest('{"version":1}', files);
  assert.ok(result.ok);
  assert.equal(result.manifest.routes["/work/"], "src/pages/work/index.html");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /src\/pages\/work\.html and src\/pages\/work\/index\.html both give the route \/work\/; src\/pages\/work\/index\.html is used/);
  // The same with the files listed the other way round.
  const reversed = parseNativeManifest('{"version":1}', [...files].reverse());
  assert.ok(reversed.ok);
  assert.deepEqual(reversed.manifest.routes, result.manifest.routes);
  const mapped = parseNativeManifest('{"version":1,"routes":{"/work/":"src/pages/work.html"}}', files);
  assert.ok(mapped.ok);
  assert.equal(mapped.manifest.routes["/work/"], "src/pages/work.html");
  assert.deepEqual(mapped.warnings, []);
});

test("metadata for a route no file gives is ignored with a warning", () => {
  const result = parseNativeManifest('{"version":1,"routes":{"/gone/":{"title":"Gone"}}}', pageFiles);
  assert.ok(result.ok);
  assert.ok(!Object.hasOwn(result.manifest.routes, "/gone/"));
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /metadata for \/gone\/, but no page gives that route; add src\/pages\/gone\.html/);
});

test("rejects routes outside src/pages or wrong extension", () => {
  assert.match(fail('{"version":1,"routes":{"/":"src/pages/index.astro"}}'), /src\/pages/);
  assert.match(fail('{"version":1,"routes":{"/":"public/index.html"}}'), /src\/pages/);
});

test("rejects path traversal", () => {
  assert.match(fail('{"version":1,"routes":{"/":"src/pages/../secret.html"}}'), /src\/pages/);
});

test("rejects a component tag without a dash", () => {
  assert.match(
    fail('{"version":1,"routes":{"/":"src/pages/index.html"},"components":{"header":"src/components/header.html"}}'),
    /custom-element name/,
  );
});

test("rejects component paths outside src/components", () => {
  assert.match(
    fail('{"version":1,"routes":{"/":"src/pages/index.html"},"components":{"site-header":"src/pages/site-header.html"}}'),
    /src\/components/,
  );
});

test("rejects non-css style entries", () => {
  assert.match(
    fail('{"version":1,"routes":{"/":"src/pages/index.html"},"styles":["src/styles/site.scss"]}'),
    /src\/styles/,
  );
});
