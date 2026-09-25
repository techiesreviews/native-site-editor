import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  editNativeRedirects,
  folderToLeaf,
  isRouteWithin,
  leafToFolder,
  parentRoute,
  planPageMove,
  rewriteRouteLinks,
} from "../src/native-page-moves.ts";
import { deriveNativeRoutes } from "../shared/native-routes.ts";
import { mappedNativeRoutes, moveNativeEntries, rekeyNativeRoutes } from "../src/native-page-meta.ts";

const routesOf = (files: string[]) => deriveNativeRoutes(files).routes;
const plan = (files: string[], from: string, to: string) => {
  const result = planPageMove({ files, routes: routesOf(files), from, to });
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.ok ? result.value : (undefined as never);
};
const error = (files: string[], from: string, to: string) => {
  const result = planPageMove({ files, routes: routesOf(files), from, to });
  return result.ok ? "" : result.error;
};
const moves = (value: { moves: { from: string; to: string }[] }) => Object.fromEntries(value.moves.map((move) => [move.from, move.to]));

test("routes: parents, and whole parts only", () => {
  assert.equal(parentRoute("/a/b/"), "/a/");
  assert.equal(parentRoute("/a/"), "/");
  assert.equal(parentRoute("/"), "/");
  assert.equal(isRouteWithin("/about/us/", "/about/"), true);
  assert.equal(isRouteWithin("/about/", "/about/"), true);
  assert.equal(isRouteWithin("/about-us/", "/about/"), false);
  assert.equal(isRouteWithin("/about/", "/"), false);
});

test("a page with no subpages is x.html; its first subpage makes it x/index.html, its last one gone makes it x.html again", () => {
  const files = ["src/pages/index.html", "src/pages/about.html", "src/pages/work/index.html", "src/pages/work/fern.html"];
  assert.deepEqual(leafToFolder("/about/", "src/pages/about.html", files), { from: "src/pages/about.html", to: "src/pages/about/index.html" });
  assert.equal(leafToFolder("/work/", "src/pages/work/index.html", files), undefined);
  assert.equal(leafToFolder("/", "src/pages/index.html", files), undefined);
  // Only the index left in the folder: back to a file.
  assert.deepEqual(folderToLeaf("/work/", ["src/pages/index.html", "src/pages/work/index.html"]), { from: "src/pages/work/index.html", to: "src/pages/work.html" });
  // Anything else in the folder keeps it (a subpage, an image, a partial).
  assert.equal(folderToLeaf("/work/", files), undefined);
  assert.equal(folderToLeaf("/work/", ["src/pages/work/index.html", "src/pages/work/logo.png"]), undefined);
  // x.html taken: left alone.
  assert.equal(folderToLeaf("/work/", ["src/pages/work/index.html", "src/pages/work.html"]), undefined);
});

test("a page's URL change moves its file, its whole subtree, and the parents it leaves and joins", () => {
  const files = [
    "src/pages/index.html",
    "src/pages/about/index.html",
    "src/pages/about/us.html",
    "src/pages/about/team/index.html",
    "src/pages/about/team/lex.html",
    "src/pages/about/logo.svg",
    "src/pages/contact.html",
    "src/pages/work/index.html",
    "src/pages/work/fern.html",
  ];
  const renamed = plan(files, "/about/", "/company/");
  assert.equal(renamed.target, "src/pages/company/index.html");
  assert.deepEqual(moves(renamed), {
    "src/pages/about/index.html": "src/pages/company/index.html",
    "src/pages/about/us.html": "src/pages/company/us.html",
    "src/pages/about/team/index.html": "src/pages/company/team/index.html",
    "src/pages/about/team/lex.html": "src/pages/company/team/lex.html",
    "src/pages/about/logo.svg": "src/pages/company/logo.svg",
  });
  assert.deepEqual(renamed.routes, [
    ["/about/", "/company/"],
    ["/about/team/", "/company/team/"],
    ["/about/team/lex/", "/company/team/lex/"],
    ["/about/us/", "/company/us/"],
  ]);

  // Under a page with no subpages: that page becomes a folder.
  const under = plan(files, "/work/fern/", "/contact/fern/");
  assert.deepEqual(moves(under), {
    "src/pages/work/fern.html": "src/pages/contact/fern.html",
    "src/pages/contact.html": "src/pages/contact/index.html",
    // /work/ lost its last subpage.
    "src/pages/work/index.html": "src/pages/work.html",
  });
  assert.deepEqual(under.converted, { route: "/contact/", from: "src/pages/contact.html", to: "src/pages/contact/index.html" });
  assert.deepEqual(under.collapsed, { route: "/work/", from: "src/pages/work/index.html", to: "src/pages/work.html" });
  // The routes after are exactly the ones planned.
  const after = routesOf(files.map((file) => moves(under)[file] ?? file));
  assert.equal(after["/contact/fern/"], "src/pages/contact/fern.html");
  assert.equal(after["/contact/"], "src/pages/contact/index.html");
  assert.equal(after["/work/"], "src/pages/work.html");

  // A folder index with nothing else in it becomes a file where it goes; the top level needs no parent.
  const leaf = plan(files, "/about/team/lex/", "/lex/");
  assert.deepEqual(moves(leaf), { "src/pages/about/team/lex.html": "src/pages/lex.html", "src/pages/about/team/index.html": "src/pages/about/team.html" });
  // Into a folder with pages and no page of its own: it becomes that folder's index.
  const into = plan(["src/pages/index.html", "src/pages/news/a.html", "src/pages/old.html"], "/old/", "/news/");
  assert.deepEqual(moves(into), { "src/pages/old.html": "src/pages/news/index.html" });
});

test("a URL change is refused for the home page, into its own subtree, onto a taken URL or file, or an invalid URL", () => {
  const files = ["src/pages/index.html", "src/pages/about/index.html", "src/pages/about/us.html", "src/pages/contact.html", "src/pages/company/us.html", "src/pages/x"];
  assert.equal(error(files, "/", "/home/"), "The home page's URL is always /.");
  assert.equal(error(files, "/about/", "/about/us/deep/"), "A page cannot go under itself or its own subpages.");
  assert.equal(error(files, "/about/", "/contact/"), "The URL /contact/ is taken by src/pages/contact.html.");
  // Its subpage would land on a taken URL.
  assert.equal(error(files, "/about/", "/company/"), "The URL /company/us/ is taken by src/pages/company/us.html.");
  assert.equal(error(files, "/about/", "/about/"), "That is the page's URL now.");
  assert.equal(error(files, "/about/", "/a/index/"), "No page file can give the URL /a/index/.");
  assert.equal(error(files, "/contact/", "/x/contact/"), "src/pages/x is a file, so nothing can go in it.");
  assert.equal(error(files, "/nope/", "/x/"), "No page has the URL /nope/.");
  const warned = plan(["src/pages/index.html", "src/pages/missing.html"], "/missing/", "/404/");
  assert.deepEqual(warned.warnings, ["/404/ is the page shown for addresses the site does not have."]);
});

test("links to a moved page and its subtree follow it; nothing else changes", () => {
  const source = [
    '<nav><a href="#/about/">About</a> <a href="#/about/us/">Us</a> <a href=\'#/about/#team\'>Team</a> <a href=#/about>Bare</a></nav>',
    '<a href="#/about-us/">Not it</a> <a href="#/aboutus/">Nor this</a> <a href="#/">Home</a> <a href="https://x.test/about/">Elsewhere</a>',
    '<a href="/about/?q=1">Absolute</a> <a href="//cdn.test/about/">Protocol-relative</a> <a class="x" href = "/about/us/#a">Spaced</a>',
    "<p>href=\"#/work/\" in prose, #/about/ as text</p>",
  ].join("\n");
  const result = rewriteRouteLinks(source, "/about/", "/company/");
  assert.equal(result.count, 6);
  assert.equal(result.text, [
    '<nav><a href="#/company/">About</a> <a href="#/company/us/">Us</a> <a href=\'#/company/#team\'>Team</a> <a href=#/company>Bare</a></nav>',
    '<a href="#/about-us/">Not it</a> <a href="#/aboutus/">Nor this</a> <a href="#/">Home</a> <a href="https://x.test/about/">Elsewhere</a>',
    '<a href="/company/?q=1">Absolute</a> <a href="//cdn.test/about/">Protocol-relative</a> <a class="x" href = "/company/us/#a">Spaced</a>',
    "<p>href=\"#/work/\" in prose, #/about/ as text</p>",
  ].join("\n"));
  // Only the paths change: the edits are that small.
  assert.deepEqual(result.edits[0], { start: source.indexOf("/about/"), end: source.indexOf("/about/") + "/about/".length, text: "/company/" });
  assert.equal(rewriteRouteLinks(source, "/", "/x/").count, 0);
  assert.equal(rewriteRouteLinks("<a href=\"#/a/b/\">x</a>", "/a/b/", "/c/").text, "<a href=\"#/c/\">x</a>");
});

test("_redirects: a line per old URL, and no chains, loops or redirects hiding the new URL", () => {
  assert.equal(editNativeRedirects(undefined, "/about/", "/company/", ["/about/", "/about/us/"]), "/about/ /company/ 301\n/about/us/ /company/us/ 301\n");
  const existing = [
    "# Moved pages",
    "/old-about/ /about/ 301",
    "/team/  /about/us/#people  302",
    "/company/ /somewhere/ 301",
    "/about/ /elsewhere/ 301",
    "/blog/* /news/:splat 301",
    "",
  ].join("\r\n");
  assert.equal(editNativeRedirects(existing, "/about/", "/company/", ["/about/"]), [
    "# Moved pages",
    "/old-about/ /company/ 301",
    "/team/  /company/us/#people  302",
    "/blog/* /news/:splat 301",
    "/about/ /company/ 301",
    "",
  ].join("\r\n"));
  // Moving back: the line from the page's URL goes (it would hide it), none points at itself.
  assert.equal(editNativeRedirects("/about/ /company/ 301\n", "/company/", "/about/", []), "");
  assert.equal(editNativeRedirects("/about/ /company/ 301\n", "/company/", "/about/", ["/company/"]), "/company/ /about/ 301\n");
  // Nothing to redirect and nothing pointing at the old URL: the file as it is.
  assert.equal(editNativeRedirects("/x/ /y/ 301\n", "/about/", "/company/", []), "/x/ /y/ 301\n");
});

test("the manifest: metadata follows the moved files, and a route mapped to its file keeps its entry at the new URL", () => {
  const text = `{
  "version": 1,
  "routes": {
    "/about/": "src/pages/about.html",
    "/about/us/": { "title": "Us" },
    "/work/": { "title": "Work" }
  }
}
`;
  const routes = { "/": "src/pages/index.html", "/about/": "src/pages/about.html", "/about/us/": "src/pages/about/us.html", "/work/": "src/pages/work.html" };
  assert.deepEqual(mappedNativeRoutes(text), ["/about/"]);
  const moved = moveNativeEntries(text, routes, [
    { from: "src/pages/about.html", to: "src/pages/company/index.html" },
    { from: "src/pages/about/us.html", to: "src/pages/company/us.html" },
  ]);
  assert.ok(moved.ok);
  const rekeyed = rekeyNativeRoutes(moved.ok ? moved.text : "", [["/about/", "/company/"], ["/about/us/", "/company/us/"]]);
  assert.ok(rekeyed.ok);
  assert.deepEqual(JSON.parse(rekeyed.ok ? rekeyed.text : "{}").routes, {
    "/company/": "src/pages/company/index.html",
    "/work/": { title: "Work" },
    "/company/us/": { title: "Us" },
  });
  assert.equal(rekeyNativeRoutes(text, [["/nope/", "/x/"]]).ok && rekeyNativeRoutes(text, [["/nope/", "/x/"]]).text, text);
});
