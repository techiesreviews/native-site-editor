import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deriveNativeRoutes, isFolderRoute, nativeLinkFragment, nativeLinkTarget, nativePageRoute, nativeRouteFile } from "../shared/native-routes.ts";

test("a page's route is its path: index.html is its folder's, any other .html file is itself", () => {
  assert.equal(nativePageRoute("index.html"), "/");
  assert.equal(nativePageRoute("about/index.html"), "/about/");
  assert.equal(nativePageRoute("work/fern-and-kettle/index.html"), "/work/fern-and-kettle/");
  assert.equal(nativePageRoute("404.html"), "/404.html");
  assert.equal(nativePageRoute("notes.html"), "/notes.html");
  assert.equal(nativePageRoute("work/notes.v2.html"), "/work/notes.v2.html");
  assert.equal(nativePageRoute("index/index.html"), "/index/");
  assert.equal(nativePageRoute("components.html"), "/components.html");
});

test("components, node_modules, names starting with . or _ and other files are not pages", () => {
  for (const path of [
    "components/site-header/site-header.html",
    "components/site-header.html",
    "node_modules/pkg/index.html",
    "_draft.html",
    "_parts/header.html",
    "work/_wip/index.html",
    ".editor/index.html",
    ".github/page.html",
    "notes.txt",
    "about.HTML",
    "about us.html",
    "../secret.html",
    "a//b.html",
    "café.html",
  ])
    assert.equal(nativePageRoute(path), undefined, path);
});

test("a route's file is the inverse of its route", () => {
  for (const path of ["index.html", "about/index.html", "a/b/index.html", "404.html", "work/notes.html"])
    assert.equal(nativeRouteFile(nativePageRoute(path)!), path);
  assert.equal(isFolderRoute("/about/"), true);
  assert.equal(isFolderRoute("/notes.html"), false);
});

test("derivation takes a plain list of paths, in route order", () => {
  const routes = deriveNativeRoutes([
    "work/index.html",
    "README.md",
    "index.html",
    "work.html",
    "components/site-footer/site-footer.html",
    "index.html",
  ]);
  assert.deepEqual(routes, { "/": "index.html", "/work.html": "work.html", "/work/": "work/index.html" });
  assert.deepEqual(deriveNativeRoutes([]), {});
});

test("a link goes to a page by its root path, relative path, or without its trailing slash", () => {
  const routes = { "/": "index.html", "/about/": "about/index.html", "/about/team/": "about/team/index.html", "/notes.html": "notes.html" };
  assert.equal(nativeLinkTarget("/about/", "/", routes), "/about/");
  assert.equal(nativeLinkTarget("/about/#contact", "/", routes), "/about/");
  assert.equal(nativeLinkTarget("/about?x=1", "/", routes), "/about/");
  assert.equal(nativeLinkTarget("/about/index.html", "/", routes), "/about/");
  assert.equal(nativeLinkTarget("team/", "/about/", routes), "/about/team/");
  assert.equal(nativeLinkTarget("../", "/about/team/", routes), "/about/");
  assert.equal(nativeLinkTarget("notes.html", "/", routes), "/notes.html");
  assert.equal(nativeLinkTarget("/", "/about/", routes), "/");
  for (const href of ["#top", "", "https://example.com/about/", "//example.com/", "mailto:a@b.c", "/missing/", "javascript:alert(1)"])
    assert.equal(nativeLinkTarget(href, "/", routes), undefined, href);
});

test("a link's fragment is the id it names, decoded", () => {
  assert.equal(nativeLinkFragment("/about/#contact"), "contact");
  assert.equal(nativeLinkFragment("../#caf%C3%A9"), "café");
  assert.equal(nativeLinkFragment("/about/#%E0%A4%A"), "%E0%A4%A");
  assert.equal(nativeLinkFragment("/about/"), undefined);
  assert.equal(nativeLinkFragment("/about/#"), undefined);
});
