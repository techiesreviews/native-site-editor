import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildNativePagesTree,
  firstHeadingText,
  nativeLinkSuggestions,
  nativeNewTarget,
  nativePageLabel,
  slugify,
  nativeSubpageCount,
  nativeTreePages,
  type NativePageNode,
  type NativeSiteTree,
} from "../src/native-pages.ts";
import { deriveNativeRoutes } from "../shared/native-routes.ts";

// A tree as lines: "label route [flags]", indented two spaces per level.
function outline(site: NativeSiteTree): string[] {
  const lines: string[] = [];
  const flags = (node: NativePageNode) => {
    const out: string[] = [];
    if (node.isNew) out.push("new");
    if (!node.file) out.push("no page");
    if (node.file && node.children.length) out.push(`page ${node.file}`);
    return out.length ? ` [${out.join(", ")}]` : "";
  };
  const walk = (node: NativePageNode, depth: number) => {
    lines.push(`${"  ".repeat(depth)}${node.label} ${node.route}${flags(node)}`);
    for (const child of node.children) walk(child, depth + 1);
  };
  if (site.home) lines.push(`${site.home.label} ${site.home.route}${flags(site.home)}`);
  for (const node of site.children) walk(node, 0);
  return lines;
}

test("the site's pages as one tree: a page's subpages are under it, a folder with no page is a row with none; home first, 404 last", () => {
  const files = [
    "index.html",
    "404.html",
    "about/index.html",
    "contact/index.html",
    "work/index.html",
    "work/fern-and-kettle/index.html",
    "work/zebra/index.html",
    "work/notes.html",
    "work/archive/old/index.html",
    "videos/tutorials/index.html",
    "_parts/note.html",
    "components/site-header/site-header.html",
    "images/logo.svg",
  ];
  const routes = deriveNativeRoutes(files);
  const headings: Record<string, string> = { "about/index.html": "About us", "index.html": "Welcome", "work/index.html": "Our work" };
  const site = buildNativePagesTree({
    routes,
    titles: { "/work/fern-and-kettle/": "Fern & Kettle", "/contact/": "Get in touch", "/work/": "" },
    heading: (file) => headings[file],
  });
  assert.deepEqual(outline(site), [
    "Home /",
    "About us /about/",
    "Get in touch /contact/",
    "Our work /work/ [page work/index.html]",
    "  Archive /work/archive/ [no page]",
    "    Old /work/archive/old/",
    "  Fern & Kettle /work/fern-and-kettle/",
    "  Notes /work/notes.html",
    "  Zebra /work/zebra/",
    "Videos /videos/ [no page]",
    "  Tutorials /videos/tutorials/",
    "Page not found /404.html",
  ]);
  assert.equal(site.home?.special, "home");
  assert.equal(site.children.at(-1)?.special, "notFound");
  const work = site.children.find((node) => node.route === "/work/")!;
  assert.equal(nativeSubpageCount(work), 4);
  assert.deepEqual(nativeTreePages(site).map((node) => node.route), ["/", "/about/", "/contact/", "/work/", "/work/archive/", "/work/archive/old/", "/work/fern-and-kettle/", "/work/notes.html", "/work/zebra/", "/videos/", "/videos/tutorials/", "/404.html"]);
});

test("new drafts are marked, and a row with no page is new when everything under it is", () => {
  const files = ["index.html", "work/index.html", "work/new-case/index.html", "videos/intro/index.html", "videos/my-first-video/index.html"];
  const drafted = new Set(["work/new-case/index.html", "videos/intro/index.html", "videos/my-first-video/index.html"]);
  const site = buildNativePagesTree({ routes: deriveNativeRoutes(files), isNew: (file) => drafted.has(file) });
  assert.deepEqual(outline(site), [
    "Home /",
    "Videos /videos/ [new, no page]",
    "  Intro /videos/intro/ [new]",
    "  My first video /videos/my-first-video/ [new]",
    "Work /work/ [page work/index.html]",
    "  New case /work/new-case/ [new]",
  ]);
});

test("the first h1's text labels a page", () => {
  assert.equal(firstHeadingText('<main><h1 data-key="title">Fern &amp; <em>Kettle</em>\n </h1><h1>x</h1></main>'), "Fern & Kettle");
  assert.equal(firstHeadingText("<main><h2>No</h2></main>"), undefined);
  assert.equal(firstHeadingText("<h1>  </h1>"), undefined);
  assert.equal(firstHeadingText(undefined), undefined);
  assert.equal(firstHeadingText("<h10>no</h10><h1 class=a>Yes</h1>"), "Yes");
});

test("a page's label on its own is the Pages tab's: title, else first heading, else its URL; other files have none", () => {
  const routes = { "/": "index.html", "/about/": "about/index.html", "/work/fern/": "work/fern/index.html", "/404.html": "404.html" };
  const heading = (file: string) => (file === "about/index.html" ? "About us" : undefined);
  const label = (file: string, titles: Record<string, string | undefined> = {}) => nativePageLabel(file, { routes, titles, heading });
  assert.equal(label("about/index.html", { "/about/": " Our studio " }), "Our studio");
  assert.equal(label("about/index.html", { "/about/": "" }), "About us");
  assert.equal(label("work/fern/index.html"), "Fern");
  assert.equal(label("index.html", { "/": "Larkspur" }), "Home");
  assert.equal(label("404.html"), "Page not found");
  assert.equal(label("styles/site.css"), undefined);
  assert.equal(label("_parts/note.html"), undefined);
  // Same as the tree's.
  const tree = buildNativePagesTree({ routes, heading });
  const about = tree.children.find((node) => node.file === "about/index.html");
  assert.equal(about?.label, label("about/index.html"));
});

test("slugify: lowercase, diacritics stripped, anything else one dash", () => {
  assert.equal(slugify("My first video"), "my-first-video");
  assert.equal(slugify("  Crème brûlée — 2026!  "), "creme-brulee-2026");
  assert.equal(slugify("Fern & Kettle"), "fern-kettle");
  assert.equal(slugify("Straße Ærø"), "strasse-aero");
  assert.equal(slugify("日本語"), "");
  assert.equal(slugify("---"), "");
  assert.equal(slugify("a".repeat(100)).length, 80);
});

test("a new page is <parent>/<slug>/index.html, under any folder page; a single-file page has no subpages", () => {
  const value = <T>(result: { ok: true; value: T } | { ok: false; error: string }) => {
    assert.ok(result.ok, result.ok ? "" : result.error);
    return result.ok ? result.value : (undefined as never);
  };
  assert.deepEqual(value(nativeNewTarget("/", "about")), { route: "/about/", file: "about/index.html" });
  assert.deepEqual(value(nativeNewTarget("/videos/", "my-first-video")), { route: "/videos/my-first-video/", file: "videos/my-first-video/index.html" });
  assert.deepEqual(value(nativeNewTarget("/about/", "team")), { route: "/about/team/", file: "about/team/index.html" });
  assert.match(nativeNewTarget("/notes.html", "x").ok ? "" : (nativeNewTarget("/notes.html", "x") as { error: string }).error, /single file/);
  for (const slug of ["", "  ", "_draft", ".hidden", "a b", "a/b", "-x", "x-", "é"])
    assert.equal(nativeNewTarget("/videos/", slug).ok, false, slug);
  assert.equal(nativeNewTarget("/", "components").ok, false);
});

test("a new page is refused where the URL or the path is taken", () => {
  const files = ["index.html", "work/index.html", "work/fern/index.html", "videos/tutorials/index.html"];
  const routes = deriveNativeRoutes(files);
  const taken = {
    route: (route: string) => routes[route],
    exists: (path: string) => files.some((file) => file === path || file.startsWith(`${path}/`)),
  };
  const error = (result: { ok: boolean; error?: string }) => (result.ok ? "" : result.error ?? "");
  assert.equal(error(nativeNewTarget("/", "work", taken)), "The URL /work/ is taken by work/index.html.");
  assert.equal(error(nativeNewTarget("/work/", "fern", taken)), "The URL /work/fern/ is taken by work/fern/index.html.");
  // A folder with no page of its own has no route, but its URL is still taken.
  assert.equal(error(nativeNewTarget("/", "videos", taken)), "The URL /videos/ is taken: videos is already there.");
  assert.equal(nativeNewTarget("/videos/", "intro", taken).ok, true);
});

test("a link's Address suggests every page but the not-found page", () => {
  const titles: Record<string, string> = { "/": "Home", "/about/": "About" };
  assert.deepEqual(nativeLinkSuggestions(["/", "/about/", "/notes.html", "/404.html"], (route) => titles[route]), [
    { label: "Home (/)", value: "/" },
    { label: "About (/about/)", value: "/about/" },
    { label: "/notes.html", value: "/notes.html" },
  ]);
});
