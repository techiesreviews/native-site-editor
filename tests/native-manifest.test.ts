import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  parseNativeManifest,
  nativeManifestPaths,
  nativeDefaultRoute,
} from "../src/native-manifest.ts";

function ok(text: string) {
  const result = parseNativeManifest(text);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.ok ? result.manifest : undefined!;
}

function fail(text: string) {
  const result = parseNativeManifest(text);
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
      "src/components/project-card/project-card.html",
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

test("rejects unsupported version", () => {
  assert.match(fail('{"version":2,"routes":{"/":"src/pages/index.html"}}'), /version/);
});

test("rejects invalid JSON", () => {
  assert.match(fail("{not json"), /valid JSON/);
});

test("requires a home route", () => {
  assert.match(fail('{"version":1,"routes":{"/about/":"src/pages/about.html"}}'), /home route/);
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
