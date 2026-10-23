import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  editNativeRedirects,
  groupRouteChanges,
  isRouteWithin,
  movedRoute,
  parentRoute,
  planPageMove,
  rewriteRouteLinks,
} from "../src/native-page-moves.ts";
import { deriveNativeRoutes } from "../shared/native-routes.ts";
import { pageAddressProblem } from "../shared/site-rules.ts";

const plan = (files: string[], from: string, to: string) => {
  const result = planPageMove({ files, routes: deriveNativeRoutes(files), from, to });
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.ok ? result.value : (undefined as never);
};
const error = (files: string[], from: string, to: string) => {
  const result = planPageMove({ files, routes: deriveNativeRoutes(files), from, to });
  return result.ok ? "" : result.error;
};
const moves = (value: { moves: { from: string; to: string }[] }) => Object.fromEntries(value.moves.map((move) => [move.from, move.to]));

test("routes: parents, and whole parts only", () => {
  assert.equal(parentRoute("/a/b/"), "/a/");
  assert.equal(parentRoute("/a/b.html"), "/a/");
  assert.equal(parentRoute("/a/"), "/");
  assert.equal(parentRoute("/404.html"), "/");
  assert.equal(parentRoute("/"), "/");
  assert.equal(isRouteWithin("/about/us/", "/about/"), true);
  assert.equal(isRouteWithin("/about/notes.html", "/about/"), true);
  assert.equal(isRouteWithin("/about/", "/about/"), true);
  assert.equal(isRouteWithin("/about-us/", "/about/"), false);
  assert.equal(isRouteWithin("/about/", "/"), false);
  assert.equal(movedRoute("/work/", "/about/"), "/work/about/");
  assert.equal(movedRoute("/", "/work/notes.html"), "/notes.html");
});

test("a folder page's URL change moves its whole folder: subpages, single-file pages and images along", () => {
  const files = [
    "index.html",
    "about/index.html",
    "about/us/index.html",
    "about/team/index.html",
    "about/team/lex/index.html",
    "about/notes.html",
    "about/logo.svg",
    "contact/index.html",
    "styles/site.css",
  ];
  const renamed = plan(files, "/about/", "/company/");
  assert.equal(renamed.file, "about/index.html");
  assert.equal(renamed.target, "company/index.html");
  assert.deepEqual(moves(renamed), {
    "about/index.html": "company/index.html",
    "about/us/index.html": "company/us/index.html",
    "about/team/index.html": "company/team/index.html",
    "about/team/lex/index.html": "company/team/lex/index.html",
    "about/notes.html": "company/notes.html",
    "about/logo.svg": "company/logo.svg",
  });
  assert.deepEqual(renamed.routes, [
    ["/about/", "/company/"],
    ["/about/us/", "/company/us/"],
    ["/about/team/", "/company/team/"],
    ["/about/team/lex/", "/company/team/lex/"],
    ["/about/notes.html", "/company/notes.html"],
  ]);
  // Under another page: into its folder; the routes after are exactly the ones planned.
  const under = plan(files, "/about/team/", "/contact/team/");
  assert.deepEqual(moves(under), { "about/team/index.html": "contact/team/index.html", "about/team/lex/index.html": "contact/team/lex/index.html" });
  const after = deriveNativeRoutes(files.map((file) => moves(under)[file] ?? file));
  assert.equal(after["/contact/team/lex/"], "contact/team/lex/index.html");
  assert.equal(after["/about/"], "about/index.html");
});

test("a single-file page moves alone: to <url>index.html for a folder URL, or the file an .html URL names", () => {
  const files = ["index.html", "notes.html", "work/index.html", "work/logo.svg"];
  assert.deepEqual(moves(plan(files, "/notes.html", "/notes/")), { "notes.html": "notes/index.html" });
  assert.deepEqual(moves(plan(files, "/notes.html", "/work/notes.html")), { "notes.html": "work/notes.html" });
  // A folder page with nothing else in its folder can become a single file; with anything else, not.
  assert.deepEqual(moves(plan(["index.html", "about/index.html"], "/about/", "/about.html")), { "about/index.html": "about.html" });
  assert.match(error(files, "/work/", "/work.html"), /other files in its folder/);
});

test("a URL change is refused for the home page, into its own subtree, onto a taken URL or file, or an invalid URL", () => {
  const files = ["index.html", "about/index.html", "about/us/index.html", "contact/index.html", "company/us/index.html", "x", "notes.html"];
  assert.equal(error(files, "/", "/home/"), "The home page's URL is always /.");
  assert.equal(error(files, "/about/", "/about/us/deep/"), "A page cannot go under itself or its own subpages.");
  assert.equal(error(files, "/about/", "/contact/"), "The URL /contact/ is taken by contact/index.html.");
  // Its subpage would land on a taken URL.
  assert.equal(error(files, "/about/", "/company/"), "The URL /company/us/ is taken by company/us/index.html.");
  assert.equal(error(files, "/about/", "/about/"), "That is the page's URL now.");
  assert.equal(error(files, "/contact/", "/x/contact/"), "x is a file, so nothing can go in it.");
  assert.equal(error(files, "/contact/", "/notes.html/contact/"), "notes.html is a file, so nothing can go in it.");
  assert.equal(error(files, "/nope/", "/x/"), "No page has the URL /nope/.");
  assert.equal(error(files, "/contact/", "/components/contact/"), "No page file can give the URL /components/contact/.");
  const warned = plan(["index.html", "missing/index.html"], "/missing/", "/404.html");
  assert.deepEqual(warned.warnings, ["/404.html is the page shown for addresses the site does not have."]);
});

test("a new URL meets the address rule; an existing one stays and can be renamed to a strict one", () => {
  const files = ["index.html", "About_Us.v2/index.html", "About_Us.v2/team/index.html", "Old_Folder/index.html", "contact/index.html"];
  const words = pageAddressProblem("About_Us.v2");
  assert.equal(error(files, "/contact/", "/About_Us.v3/"), words);
  assert.equal(error(files, "/contact/", "/New_Folder/contact/"), words);
  assert.equal(error(files, "/contact/", "/Contact.html"), words);
  // An existing address moves under another page and keeps its name; folders already there stay.
  assert.deepEqual(moves(plan(files, "/About_Us.v2/", "/contact/About_Us.v2/")), {
    "About_Us.v2/index.html": "contact/About_Us.v2/index.html",
    "About_Us.v2/team/index.html": "contact/About_Us.v2/team/index.html",
  });
  assert.equal(plan(files, "/contact/", "/Old_Folder/contact/").target, "Old_Folder/contact/index.html");
  // Renamed to a strict address, its subpages follow.
  assert.deepEqual(plan(files, "/About_Us.v2/", "/about-us/").routes, [["/About_Us.v2/", "/about-us/"], ["/About_Us.v2/team/", "/about-us/team/"]]);
});

test("root links to a moved page and everything under its folder follow it, in HTML and CSS; nothing else changes", () => {
  const source = [
    '<nav><a href="/about/">About</a> <a href="/about/us/">Us</a> <a href=\'/about/#team\'>Team</a> <a href=/about>Bare</a></nav>',
    '<a href="/about-us/">Not it</a> <a href="/aboutus/">Nor this</a> <a href="/">Home</a> <a href="https://x.test/about/">Elsewhere</a>',
    '<a href="/about/?q=1">Query</a> <a href="//cdn.test/about/">Protocol-relative</a> <a class="x" href = "/about/us/#a">Spaced</a>',
    '<img src="/about/team.jpg" alt=""> <a href="/about/index.html">Index</a> <a href="about/">Relative</a>',
    "<p>href=\"/work/\" in prose, /about/ as text</p>",
  ].join("\n");
  const result = rewriteRouteLinks(source, "/about/", "/company/");
  assert.equal(result.count, 8);
  assert.equal(result.text, [
    '<nav><a href="/company/">About</a> <a href="/company/us/">Us</a> <a href=\'/company/#team\'>Team</a> <a href=/company>Bare</a></nav>',
    '<a href="/about-us/">Not it</a> <a href="/aboutus/">Nor this</a> <a href="/">Home</a> <a href="https://x.test/about/">Elsewhere</a>',
    '<a href="/company/?q=1">Query</a> <a href="//cdn.test/about/">Protocol-relative</a> <a class="x" href = "/company/us/#a">Spaced</a>',
    '<img src="/company/team.jpg" alt=""> <a href="/company/index.html">Index</a> <a href="about/">Relative</a>',
    "<p>href=\"/work/\" in prose, /about/ as text</p>",
  ].join("\n"));
  // Only the paths change: the edits are that small.
  assert.deepEqual(result.edits[0], { start: source.indexOf("/about/"), end: source.indexOf("/about/") + "/about/".length, text: "/company/" });
  assert.equal(rewriteRouteLinks(source, "/", "/x/").count, 0);
  // CSS url()s under the folder follow too.
  assert.equal(rewriteRouteLinks('.hero { background: url("/about/bg.png") } .x { background: url(/about-us/a.png) }', "/about/", "/company/").text,
    '.hero { background: url("/company/bg.png") } .x { background: url(/about-us/a.png) }');
  // A single-file page: its own path only.
  assert.equal(rewriteRouteLinks('<a href="/notes.html#x">N</a><a href="/notes.htmlx">No</a>', "/notes.html", "/notes/").text, '<a href="/notes/#x">N</a><a href="/notes.htmlx">No</a>');
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

test("_redirects for a single-file page: its own line, no bare form", () => {
  assert.equal(editNativeRedirects(undefined, "/notes.html", "/notes/", ["/notes.html"]), "/notes.html /notes/ 301\n");
  assert.equal(editNativeRedirects("/old.html /notes.html 301\n", "/notes.html", "/notes/", []), "/old.html /notes/ 301\n");
});

test("file moves group into subtree changes only when every subpage moved along", () => {
  const routes = ["/", "/about/", "/about/team/", "/work/", "/work/a/"];
  assert.deepEqual(groupRouteChanges(routes, [["/about/", "/company/"], ["/about/team/", "/company/team/"]]), [{ from: "/about/", to: "/company/", subtree: true }]);
  // The page alone moved (its subpage stayed): only its own URL changes.
  assert.deepEqual(groupRouteChanges(routes, [["/about/", "/company/"]]), [{ from: "/about/", to: "/company/", subtree: false }]);
  assert.deepEqual(groupRouteChanges(routes, [["/work/a/", "/a/"]]), [{ from: "/work/a/", to: "/a/", subtree: true }]);
});

test("an exact route change leaves links and redirects under it alone", () => {
  const source = '<a href="/about/">A</a><a href="/about/team/">T</a><a href="/about/#x">X</a>';
  const exact = rewriteRouteLinks(source, "/about/", "/company/", false);
  assert.equal(exact.text, '<a href="/company/">A</a><a href="/about/team/">T</a><a href="/company/#x">X</a>');
  assert.equal(exact.count, 2);
  assert.equal(
    editNativeRedirects("/old/ /about/team/ 301\n/about/team/x/ /y/ 301\n", "/about/", "/company/", ["/about/"], false),
    "/old/ /about/team/ 301\n/about/team/x/ /y/ 301\n/about/ /company/ 301\n",
  );
});

test("sub-folder links read both root spellings and write prefixed paths only", () => {
  const paths = ["/about/", "/about/us/", "/about", "/about/index.html", "/about/?q=1#team", "/my-site/about/", "/my-site/about/us/", "/my-site/about", "/my-site/about/index.html#top", "/my-site-other/about/", "/about-us/", "https://host/my-site/about/"];
  const source = paths.map(path => `<a href=" ${path}">A</a>`).join("\n");
  const rewritten = rewriteRouteLinks(source, "/about/", "/company/", true, "/my-site");
  const expected = ["/my-site/company/", "/my-site/company/us/", "/my-site/company", "/my-site/company/index.html", "/my-site/company/?q=1#team", "/my-site/company/", "/my-site/company/us/", "/my-site/company", "/my-site/company/index.html#top", ...paths.slice(9)];
  assert.equal(rewritten.text, expected.map(path => `<a href=" ${path}">A</a>`).join("\n"));
  for (const edit of rewritten.edits) assert.match(source.slice(edit.start, edit.end), /^\/[^?#" ]+$/);
  assert.equal(rewriteRouteLinks(source, "/about/", "/company/", true, "").text,
    paths.map(path => `<a href=" ${path.startsWith("/about") && !path.startsWith("/about-us") ? path.replace("/about", "/company") : path}">A</a>`).join("\n"));
  assert.equal(rewriteRouteLinks('a{background:url(/my-site/about/team%23one.png)}', "/about/", "/company/", true, "/my-site").text,
    'a{background:url(/my-site/company/team%23one.png)}');
  assert.equal(rewriteRouteLinks('<a href="/my-site/about/us/"><a href="/about/index.html">', "/about/", "/company/", false, "/my-site").text,
    '<a href="/my-site/about/us/"><a href="/my-site/company/index.html">');
});

test("a prefix is read decoded, on boundaries, and stripped only once", () => {
  assert.equal(rewriteRouteLinks('<a href="/caf%c3%a9/about/">', "/about/", "/company/", true, "/caf%C3%A9").text, '<a href="/caf%C3%A9/company/">');
  const source = '<a href="/my-site/"><a href="/my-site/my-site/"><a href="/my-site/my-site/team/">';
  assert.equal(rewriteRouteLinks(source, "/my-site/", "/company/", true, "/my-site").text,
    '<a href="/my-site/"><a href="/my-site/company/"><a href="/my-site/company/team/">');
  assert.equal(rewriteRouteLinks('<a href="/about/">', "/about/", "/my-site/", true, "/my-site").text, '<a href="/my-site/my-site/">');
  assert.equal(editNativeRedirects(undefined, "/my-site/", "/company/", ["/my-site/"], true, "/my-site"), "/my-site/my-site/ /my-site/company/ 301\n");
});

test("sub-folder redirects merge plain and prefixed chains, loops and duplicate sources", () => {
  const source = ["# Leave /about/ alone", " /legacy/\t/about/?q=1#top  302", "/my-site/older/ /my-site/about/us/ 301", "/company/ /about/ 301", "/my-site/company/ /about/ 301", "/about/ /elsewhere/ 302", "/my-site/about/ /elsewhere/ 302", "/my-site-other/ /untouched/ 301", "/about-us/ /untouched/ 301", ""].join("\r\n");
  assert.equal(editNativeRedirects(source, "/about/", "/company/", ["/about/", "/about/us/"], true, "/my-site"),
    ["# Leave /about/ alone", " /legacy/\t/my-site/company/?q=1#top  302", "/my-site/older/ /my-site/company/us/ 301", "/my-site-other/ /untouched/ 301", "/about-us/ /untouched/ 301", "/my-site/about/ /my-site/company/ 301", "/my-site/about/us/ /my-site/company/us/ 301", ""].join("\r\n"));
  for (const old of ["/about/", "/my-site/about/"]) {
    assert.equal(editNativeRedirects(`${old} /my-site/company/ 301\n`, "/company/", "/about/", [], true, "/my-site"), "");
  }
  assert.equal(editNativeRedirects(source, "/about/", "/company/", ["/about/"], true, ""),
    ["# Leave /about/ alone", " /legacy/\t/company/?q=1#top  302", "/my-site/older/ /my-site/about/us/ 301", "/my-site/company/ /company/ 301", "/my-site/about/ /elsewhere/ 302", "/my-site-other/ /untouched/ 301", "/about-us/ /untouched/ 301", "/about/ /company/ 301", ""].join("\r\n"));
});
