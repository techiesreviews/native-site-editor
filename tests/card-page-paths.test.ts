import assert from "node:assert/strict";
import test from "node:test";
import { cardFolderChoices, cardPageFolders, mixedParent, planCardPage, cardPrefixRequest } from "../src/page-builder/cards.ts";

// The new page a card grid's "Add card" makes: its existing folder or a
// new folder there (src/page-builder/cards.ts).
const routes = {
  "/": "index.html",
  "/work/": "work/index.html",
  "/work/a/": "work/a/index.html",
  "/work/b/": "work/b/index.html",
  "/work/studio/x/": "work/studio/x/index.html",
  "/works/old/": "works/old/index.html",
  "/about.html": "about.html",
};
const files = new Set(Object.values(routes));
const exists = (path: string) => files.has(path) || [...files].some((file) => file.startsWith(`${path}/`));
const folders = cardPageFolders(routes);
const plan = (request: { title: string; parent: string; newFolder?: string }) => planCardPage({ routes, exists, folders }, request);

test("the site's folders are every folder a page is in, and those above it", () => {
  assert.deepEqual(folders, ["/", "/work/", "/work/a/", "/work/b/", "/work/studio/", "/work/studio/x/", "/works/", "/works/old/"]);
  assert.deepEqual(cardFolderChoices(folders, "/work/").slice(0, 2), ["/work/", "/"]);
});

test("a page goes in the chosen existing folder or subfolder", () => {
  assert.deepEqual(plan({ title: "Oak & Ash", parent: "/work/" }), { ok: true, value: { route: "/work/oak-ash/", file: "work/oak-ash/index.html" } });
  assert.deepEqual(plan({ title: "Oak", parent: "/work/studio/" }), { ok: true, value: { route: "/work/studio/oak/", file: "work/studio/oak/index.html" } });
  assert.deepEqual(plan({ title: "Oak", parent: "/" }), { ok: true, value: { route: "/oak/", file: "oak/index.html" } });
});

test("a new folder makes its page inside it; the page's file makes the folder", () => {
  assert.deepEqual(plan({ title: "Oak", parent: "/work/", newFolder: "chairs" }), { ok: true, value: { route: "/work/chairs/oak/", file: "work/chairs/oak/index.html" } });
  assert.match(plan({ title: "Oak", parent: "/work/", newFolder: " " }).ok ? "" : (plan({ title: "Oak", parent: "/work/", newFolder: " " }) as { error: string }).error, /folder's name/);
});

test("invalid, hidden, reserved, unknown or taken paths are refused", () => {
  const refused = (request: { title: string; parent: string; newFolder?: string }) => {
    const result = plan(request);
    assert.equal(result.ok, false, JSON.stringify(request));
    return result.ok ? "" : result.error;
  };
  assert.match(refused({ title: "A", parent: "/work/" }), /taken/);
  assert.match(refused({ title: "Oak", parent: "/work/../" }), /not a folder/);
  assert.match(refused({ title: "Oak", parent: "/work//" }), /not a folder/);
  assert.match(refused({ title: "Oak", parent: "/_hidden/" }), /not a folder/);
  assert.match(refused({ title: "Oak", parent: "work/" }), /not a folder/);
  assert.match(refused({ title: "Oak", parent: "/about.html" }), /not a folder/);
  assert.match(refused({ title: "Oak", parent: "/nowhere/" }), /no folder/);
  assert.match(refused({ title: "Oak", parent: "/work/", newFolder: "studio" }), /taken/);
  assert.match(refused({ title: "Oak", parent: "/work/", newFolder: "../x" }), /folder's name/);
  assert.match(refused({ title: "Oak", parent: "/work/", newFolder: ".git" }), /folder's name/);
  assert.match(refused({ title: "Oak", parent: "/", newFolder: "components" }), /not for pages/);
  assert.match(refused({ title: "  ", parent: "/work/" }), /title/);
  assert.match(refused({ title: "!!", parent: "/work/" }), /no URL/);
});

test("after a page from another folder joins a grid, its default folder stays explicit; a list of sections gets none", () => {
  assert.equal(mixedParent(routes, ["/work/a/", "/work/b/", "/works/old/"]), "/work/");
  // Each folder holding one card's page only: the last card's folder, explicitly.
  assert.equal(mixedParent(routes, ["/work/a/", "/works/old/"]), "/works/");
  assert.equal(mixedParent(routes, ["/works/old/", "/work/a/"]), "/work/");
  // A menu of top-level pages, or one linked page, is not a list of pages.
  assert.equal(mixedParent(routes, ["/", "/work/", "/about.html"]), undefined);
  assert.equal(mixedParent(routes, ["/work/a/", "/work/a/", "/work/zz/"]), undefined);
});

test("typed prefixes use existing folders or one new segment under the longest allowed parent", () => {
  const allowed = cardFolderChoices(folders, "/work/");
  assert.deepEqual(cardPrefixRequest("Oak", "/work/studio/", allowed, true), { ok: true, value: { title: "Oak", parent: "/work/studio/" } });
  const fresh = cardPrefixRequest("Oak", "/work/studio/chairs/", allowed, true);
  assert.deepEqual(fresh, { ok: true, value: { title: "Oak", parent: "/work/studio/", newFolder: "chairs" } });
  assert.deepEqual(fresh.ok && plan(fresh.value), { ok: true, value: { route: "/work/studio/chairs/oak/", file: "work/studio/chairs/oak/index.html" } });
  for (const prefix of ["", "/work/chairs/tall/", "/work/../", "work/", "/work//", "/work/.git/"]) {
    assert.equal(cardPrefixRequest("Oak", prefix, allowed, true).ok, false, prefix);
  }
  assert.equal(cardPrefixRequest("Oak", "/work/chairs/", allowed, false).ok, false);
});
