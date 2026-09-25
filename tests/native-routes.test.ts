import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deriveNativeRoutes, nativePageRoute } from "../shared/native-routes.ts";

test("a page's route is its path under src/pages", () => {
  assert.equal(nativePageRoute("src/pages/index.html"), "/");
  assert.equal(nativePageRoute("src/pages/about.html"), "/about/");
  assert.equal(nativePageRoute("src/pages/404.html"), "/404/");
  assert.equal(nativePageRoute("src/pages/work/index.html"), "/work/");
  assert.equal(nativePageRoute("src/pages/work/fern-and-kettle.html"), "/work/fern-and-kettle/");
  assert.equal(nativePageRoute("src/pages/a/b/c.v2.html"), "/a/b/c.v2/");
  assert.equal(nativePageRoute("src/pages/index/index.html"), "/index/");
});

test("names starting with _ and other files are not pages", () => {
  for (const path of [
    "src/pages/_draft.html",
    "src/pages/_parts/header.html",
    "src/pages/work/_wip/index.html",
    "src/pages/notes.txt",
    "src/pages/about.HTML",
    "src/pages/about us.html",
    "src/pages/../secret.html",
    "src/pages/a//b.html",
    "src/pages/.html",
    "src/components/site-header.html",
    "pages/index.html",
    "src/pages/café.html",
  ])
    assert.equal(nativePageRoute(path), undefined, path);
});

test("derivation takes a plain list of paths and reports routes two files give", () => {
  const { routes, warnings } = deriveNativeRoutes([
    "src/pages/work.html",
    "README.md",
    "src/pages/index.html",
    "src/pages/work/index.html",
    "src/pages/index.html",
  ]);
  assert.deepEqual(routes, { "/": "src/pages/index.html", "/work/": "src/pages/work/index.html" });
  assert.deepEqual(Object.keys(routes), ["/", "/work/"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^src\/pages\/work\.html and src\/pages\/work\/index\.html both give the route \/work\//);
  assert.deepEqual(deriveNativeRoutes([]), { routes: {}, warnings: [] });
});
