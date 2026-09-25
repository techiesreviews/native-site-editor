import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  buildNativePagesTree,
  firstHeadingText,
  nativeNewTarget,
  nativePageLabel,
  slugify,
  type NativeCollectionNode,
  type NativeTreeNode,
} from "../src/native-pages.ts";
import {
  addedNativeRouteEntries,
  editNativePageMeta,
  removeNativeRouteEntry,
  sameNativeJson,
  unpairNativeRoutes,
} from "../src/native-page-meta.ts";
import { parseNativeManifest, nativeOrphanWarning } from "../src/native-manifest.ts";

const routingManifest = readFileSync(resolve("fixtures/native-routing/.astro-editor/native.json"), "utf8");

// A tree as lines: "label route [flags]", indented two spaces per level.
function outline(site: NativeCollectionNode): string[] {
  const lines: string[] = [];
  const flags = (node: NativeTreeNode) => {
    const out: string[] = [];
    if (node.isNew) out.push("new");
    if (node.kind === "page" && node.unusedFor) out.push(`unused for ${node.unusedFor}`);
    if (node.kind === "collection") out.push(`${node.pageCount} pages`, node.overview ? `overview ${node.overview.file}` : "no overview");
    return out.length ? ` [${out.join(", ")}]` : "";
  };
  const walk = (collection: NativeCollectionNode, depth: number) => {
    for (const child of collection.children) {
      lines.push(`${"  ".repeat(depth)}${child.label} ${child.route}${flags(child)}`);
      if (child.kind === "collection") walk(child, depth + 1);
    }
  };
  if (site.overview) lines.push(`${site.overview.label} ${site.overview.route}${flags(site.overview)}`);
  walk(site, 0);
  return lines;
}

const routesOf = (files: string[], manifest = '{ "version": 1 }') => {
  const parsed = parseNativeManifest(manifest, files);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  return parsed.ok ? parsed.manifest : (undefined as never);
};

test("the site's pages as a tree: collections are folders, their index.html the overview; home first, 404 last", () => {
  const files = [
    "src/pages/index.html",
    "src/pages/404.html",
    "src/pages/about.html",
    "src/pages/contact.html",
    "src/pages/work/index.html",
    "src/pages/work/fern-and-kettle.html",
    "src/pages/work/zebra.html",
    "src/pages/work/archive/old.html",
    "src/pages/videos/tutorials/index.html",
    "src/pages/_parts/note.html",
    "src/pages/logo.svg",
  ];
  const manifest = routesOf(files, JSON.stringify({ version: 1, routes: { "/work/fern-and-kettle/": { title: "Fern & Kettle" }, "/contact/": { title: "Get in touch" } } }));
  const headings: Record<string, string> = { "src/pages/about.html": "About us", "src/pages/index.html": "Welcome", "src/pages/work/index.html": "Our work" };
  const site = buildNativePagesTree({
    files,
    routes: manifest.routes,
    titles: Object.fromEntries(Object.entries(manifest.pages).map(([route, meta]) => [route, meta.title])),
    heading: (file) => headings[file],
  });
  assert.deepEqual(outline(site), [
    "Home /",
    "About us /about/",
    "Get in touch /contact/",
    "Our work /work/ [2 pages, overview src/pages/work/index.html]",
    "  Fern & Kettle /work/fern-and-kettle/",
    "  Zebra /work/zebra/",
    "  Archive /work/archive/ [1 pages, no overview]",
    "    Old /work/archive/old/",
    "Videos /videos/ [0 pages, no overview]",
    "  Tutorials /videos/tutorials/ [0 pages, overview src/pages/videos/tutorials/index.html]",
    "Page not found /404/",
  ]);
  assert.equal(site.overview?.special, "home");
  const last = site.children.at(-1);
  assert.equal(last?.kind === "page" && last.special, "notFound");
});

test("new drafts are marked, and a collection is new when everything in it is", () => {
  const files = ["src/pages/index.html", "src/pages/work/index.html", "src/pages/work/new-case.html", "src/pages/videos/index.html", "src/pages/videos/my-first-video.html"];
  const drafted = new Set(["src/pages/work/new-case.html", "src/pages/videos/index.html", "src/pages/videos/my-first-video.html"]);
  const site = buildNativePagesTree({ files, routes: routesOf(files).routes, isNew: (file) => drafted.has(file) });
  assert.deepEqual(outline(site), [
    "Home /",
    "Videos /videos/ [new, 1 pages, overview src/pages/videos/index.html]",
    "  My first video /videos/my-first-video/ [new]",
    "Work /work/ [1 pages, overview src/pages/work/index.html]",
    "  New case /work/new-case/ [new]",
  ]);
});

test("a file beside a folder's index on one route shows as not used; a file the manifest maps shows at its route", () => {
  const files = ["src/pages/index.html", "src/pages/work.html", "src/pages/work/index.html", "src/pages/old-about.html"];
  const manifest = routesOf(files, JSON.stringify({ version: 1, routes: { "/about/": { file: "src/pages/old-about.html", title: "About" } } }));
  const site = buildNativePagesTree({ files, routes: manifest.routes, titles: { "/about/": "About" } });
  assert.deepEqual(outline(site), [
    "Home /",
    "About /about/",
    "Work /work/ [unused for src/pages/work/index.html]",
    "Work /work/ [0 pages, overview src/pages/work/index.html]",
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
  const routes = { "/": "src/pages/index.html", "/about/": "src/pages/about.html", "/work/fern/": "src/pages/work/fern.html", "/404/": "src/pages/404.html" };
  const heading = (file: string) => (file === "src/pages/about.html" ? "About us" : undefined);
  const label = (file: string, titles: Record<string, string | undefined> = {}) => nativePageLabel(file, { routes, titles, heading });
  assert.equal(label("src/pages/about.html", { "/about/": " Our studio " }), "Our studio");
  assert.equal(label("src/pages/about.html", { "/about/": "" }), "About us");
  assert.equal(label("src/pages/work/fern.html"), "Fern");
  assert.equal(label("src/pages/index.html", { "/": "Larkspur" }), "Home");
  assert.equal(label("src/pages/404.html"), "Page not found");
  assert.equal(label("src/styles/site.css"), undefined);
  assert.equal(label("src/pages/_parts/note.html"), undefined);
  // Same as the tree's.
  const tree = buildNativePagesTree({ files: Object.values(routes), routes, heading });
  const about = tree.children.find((node) => node.kind === "page" && node.file === "src/pages/about.html");
  assert.equal(about?.label, label("src/pages/about.html"));
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

test("a new page is <collection>/<slug>.html; a new collection is <collection>/<slug>/index.html", () => {
  const value = <T>(result: { ok: true; value: T } | { ok: false; error: string }) => {
    assert.ok(result.ok, result.ok ? "" : result.error);
    return result.ok ? result.value : (undefined as never);
  };
  assert.deepEqual(value(nativeNewTarget("page", "", "about")), { route: "/about/", file: "src/pages/about.html" });
  assert.deepEqual(value(nativeNewTarget("page", "videos", "my-first-video")), { route: "/videos/my-first-video/", file: "src/pages/videos/my-first-video.html" });
  assert.deepEqual(value(nativeNewTarget("collection", "", "videos")), { route: "/videos/", file: "src/pages/videos/index.html", folder: "src/pages/videos" });
  assert.deepEqual(value(nativeNewTarget("collection", "videos", "tutorials")), { route: "/videos/tutorials/", file: "src/pages/videos/tutorials/index.html", folder: "src/pages/videos/tutorials" });
  for (const slug of ["", "  ", "index", "_draft", ".hidden", "a b", "a/b", "-x", "x-", "é"])
    assert.equal(nativeNewTarget("page", "videos", slug).ok, false, slug);
});

test("a new page or collection is refused where the URL or the path is taken", () => {
  const files = ["src/pages/index.html", "src/pages/work/index.html", "src/pages/work/fern.html", "src/pages/videos/tutorials/index.html"];
  const routes = routesOf(files).routes;
  const taken = {
    route: (route: string) => routes[route],
    exists: (path: string) => files.some((file) => file === path || file.startsWith(`${path}/`)),
  };
  const error = (result: { ok: boolean; error?: string }) => (result.ok ? "" : result.error ?? "");
  assert.equal(error(nativeNewTarget("page", "", "work", taken)), "The URL /work/ is taken by src/pages/work/index.html.");
  assert.equal(error(nativeNewTarget("collection", "work", "fern", taken)), "The URL /work/fern/ is taken by src/pages/work/fern.html.");
  // A folder with no overview has no route, but its URL is still the collection's.
  assert.equal(error(nativeNewTarget("page", "", "videos", taken)), "The URL /videos/ is taken: src/pages/videos is already there.");
  assert.equal(error(nativeNewTarget("collection", "", "videos", taken)), "The URL /videos/ is taken: src/pages/videos is already there.");
  assert.equal(nativeNewTarget("page", "videos", "intro", taken).ok, true);
});

test("creating a page and undoing it: the title entry it added goes with it, and the manifest is GitHub's again", () => {
  const base = routingManifest;
  // The creation writes the page's title as a metadata-only entry.
  const created = editNativePageMeta(base, "/videos/", "title", "Videos");
  assert.ok(created.ok && created.edit);
  const withPage = created.ok ? created.text : "";
  assert.deepEqual(addedNativeRouteEntries(base, withPage), ["/videos/"]);
  // Discarded or undone, the page takes its entry: the text is the base, byte for byte.
  assert.equal(unpairNativeRoutes(base, withPage, ["/videos/"]), base);
  // Another page's edit in the same draft stays; the entry GitHub has stays.
  const described = editNativePageMeta(withPage, "/work/fern-and-kettle/", "description", "A café");
  assert.ok(described.ok);
  const both = described.ok ? described.text : "";
  const undone = unpairNativeRoutes(base, both, ["/videos/", "/work/fern-and-kettle/"]);
  assert.equal(JSON.parse(undone).routes["/videos/"], undefined);
  assert.deepEqual(JSON.parse(undone).routes["/work/fern-and-kettle/"], { title: "Fern & Kettle", description: "A café" });
  // Nothing added for a route: nothing removed.
  assert.equal(unpairNativeRoutes(base, base, ["/work/fern-and-kettle/"]), base);
});

test("a manifest with no routes gets them back to none when its only new page is undone", () => {
  const base = '{\n  "version": 1,\n  "styles": ["src/styles/site.css"]\n}\n';
  const created = editNativePageMeta(base, "/videos/", "title", "Videos");
  const text = created.ok ? created.text : "";
  assert.match(text, /"routes": \{ "\/videos\/": \{ "title": "Videos" \} \}/);
  assert.equal(unpairNativeRoutes(base, text, ["/videos/"]), base);
  assert.equal(sameNativeJson('{"version":1,"routes":{}}', '{ "version": 1 }'), true);
  assert.equal(sameNativeJson('{"a":1,"b":2}', '{"b":2,"a":1}'), true);
  assert.equal(sameNativeJson('{"a":1}', '{"a":2}'), false);
});

test("removing a route's entry keeps the rest of the manifest as written", () => {
  const text = '{\n  "version": 1,\n  "routes": {\n    "/a/": { "title": "A" },\n    "/b/": "src/pages/b.html"\n  }\n}\n';
  const first = removeNativeRouteEntry(text, "/a/");
  assert.ok(first.ok);
  assert.equal(first.ok && first.text, '{\n  "version": 1,\n  "routes": {\n    "/b/": "src/pages/b.html"\n  }\n}\n');
  const last = removeNativeRouteEntry(first.ok ? first.text : "", "/b/");
  assert.equal(last.ok && last.text, '{\n  "version": 1,\n  "routes": {}\n}\n');
  const none = removeNativeRouteEntry(text, "/c/");
  assert.equal(none.ok && none.edit, null);
});

test("metadata for a route no page gives is an orphan the preview can offer to fix", () => {
  const parsed = parseNativeManifest(JSON.stringify({ version: 1, routes: { "/videos/": { title: "Videos" } } }), ["src/pages/index.html"]);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.ok && parsed.orphans, ["/videos/"]);
  assert.deepEqual(parsed.ok && parsed.warnings, [nativeOrphanWarning("/videos/")]);
  assert.equal(nativeOrphanWarning("/videos/"), 'native.json has metadata for /videos/, but no page gives that route; add src/pages/videos.html or give the entry a "file".');
});
