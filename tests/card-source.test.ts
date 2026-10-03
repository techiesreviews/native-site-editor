import assert from "node:assert/strict";
import test from "node:test";
import { linkRoute } from "../src/page-builder/card-source.ts";

const context = { route: "/work/", routes: { "/": "index.html", "/work/": "work/index.html", "/work/a/": "work/a/index.html" }, isSection: () => false };

test("a card's link is a route of the site, relative links resolved against the page", () => {
  assert.equal(linkRoute("a/", context), "/work/a/");
  assert.equal(linkRoute("/work/new/", context), "/work/new/");
  assert.equal(linkRoute("b/", context), "/work/b/");
});

test("review: links never give a path outside the site's folders", () => {
  assert.equal(linkRoute("/work/../../bad/a/", context), "/bad/a/");
  assert.equal(linkRoute("/work/%2e%2e/x/", context), "/x/");
  assert.equal(linkRoute("/work/_parts/", context), undefined);
  assert.equal(linkRoute("https://example.com/work/a/", context), undefined);
  assert.equal(linkRoute("//example.com/a/", context), undefined);
  assert.equal(linkRoute("/work/a.html", context), undefined);
});
