import assert from "node:assert/strict";
import test from "node:test";
import { cardFolderChoices, cardFolderCovered, cardPageFolders, cardRecipeFolders, mixedParent, planCardPage } from "../src/page-builder/cards.ts";
import { EDITOR_PAGE_BUILDER_PATH, makeCollectionTarget } from "../src/page-builder/page-builder-document.ts";

// The new page a card grid's "Add card" makes: which folder it goes in, a
// new folder there, and what a generated listing's source folders allow
// (src/page-builder/cards.ts).
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
const plan = (request: { title: string; parent: string; newFolder?: string }, recipe?: string[]) => planCardPage({ routes, exists, folders, recipe }, request);

test("the site's folders are every folder a page is in, and those above it", () => {
  assert.deepEqual(folders, ["/", "/work/", "/work/a/", "/work/b/", "/work/studio/", "/work/studio/x/", "/works/", "/works/old/"]);
  assert.deepEqual(cardFolderChoices(folders, "/work/", undefined).slice(0, 2), ["/work/", "/"]);
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
  const refused = (request: { title: string; parent: string; newFolder?: string }, recipe?: string[]) => {
    const result = plan(request, recipe);
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

test("a generated listing takes pages only in its source folders, on a slash boundary", () => {
  assert.equal(cardFolderCovered(["/work/"], "/work/"), true);
  assert.equal(cardFolderCovered(["/work/"], "/work/studio/"), true);
  assert.equal(cardFolderCovered(["/work/"], "/works/"), false);
  assert.equal(cardFolderCovered(["/work/"], "/"), false);
  assert.deepEqual(cardFolderChoices(folders, "/work/", ["/work/"]), ["/work/", "/work/a/", "/work/b/", "/work/studio/", "/work/studio/x/"]);
  assert.equal(plan({ title: "Oak", parent: "/work/studio/" }, ["/work/"]).ok, true);
  assert.equal(plan({ title: "Oak", parent: "/work/", newFolder: "chairs" }, ["/work/"]).ok, true);
  const outside = plan({ title: "Oak", parent: "/works/" }, ["/work/"]);
  assert.deepEqual(outside, { ok: false, error: "This collection only includes /work/; update its source folders first." });
  assert.equal(plan({ title: "Oak", parent: "/", newFolder: "work2" }, ["/work/"]).ok, false);
});

test("after a page from another folder joins a grid, its default folder stays explicit; a list of sections gets none", () => {
  assert.equal(mixedParent(routes, ["/work/a/", "/work/b/", "/works/old/"]), "/work/");
  assert.equal(mixedParent(routes, ["/work/a/", "/works/old/"]), undefined);
  assert.equal(mixedParent(routes, ["/", "/work/", "/about.html"]), undefined);
  assert.equal(mixedParent(routes, ["/work/a/", "/work/a/", "/work/zz/"]), undefined);
});

const page = `<html><body><main><h2>Work</h2><div class="grid"><article><a href="/work/a/">A</a></article><article><a href="/work/b/">B</a></article></div></main></body></html>`;
const first = { start: page.indexOf("<article>"), end: page.indexOf("</article>") + 10 };
const record = (folders: string[]) => ({
  pagePath: "index.html", target: makeCollectionTarget(page, page.indexOf('<div class="grid"')), folders, sort: "", filter: "", limit: 500,
  template: `<article><a href="{url}">{title}</a></article>`, fields: [], overrides: {}, extra: { kept: true },
});
const sidecar = (folders: string[]) => JSON.stringify({ version: 1, pages: {}, collections: { work: record(folders) } }, null, 2);

test("a JSON recipe's folders come from the listing this grid is in", () => {
  assert.deepEqual(cardRecipeFolders("index.html", page, first, sidecar(["/work/"]), true), { folders: ["/work/"] });
  // Another page's record does not make this grid generated.
  assert.deepEqual(cardRecipeFolders("other.html", page, first, sidecar(["/work/"]), true), {});
  assert.deepEqual(cardRecipeFolders("index.html", page, first, undefined, false), {});
});

test("unloaded, unreadable or unlocatable recipes refuse instead of falling back to a hand-made grid", () => {
  assert.match(cardRecipeFolders("index.html", page, first, undefined, true).error ?? "", /Checking/);
  assert.match(cardRecipeFolders("index.html", page, first, "{ nope", true).error ?? "", new RegExp(EDITOR_PAGE_BUILDER_PATH.replace(/\./g, "\\.")));
  const moved = page.replace('class="grid"', 'class="grid other"');
  assert.match(cardRecipeFolders("index.html", moved, { start: moved.indexOf("<article>"), end: moved.indexOf("</article>") + 10 }, sidecar(["/work/"]), true).error ?? "", /could not be found/);
});

test("an inline legacy data-each recipe gives its folders", () => {
  const legacy = `<main><div data-each="/work/ /press/"><template><article><a href="{url}">{title}</a></article></template><article><a href="/work/a/">A</a></article><article><a href="/work/b/">B</a></article></div></main>`;
  const at = legacy.lastIndexOf("<article>");
  assert.deepEqual(cardRecipeFolders("index.html", legacy, { start: at, end: legacy.indexOf("</article>", at) + 10 }, undefined, false), { folders: ["/work/", "/press/"] });
});
