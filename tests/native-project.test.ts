import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  isNativeProject,
  nativeConventionComponents,
  nativeConventionStyles,
  nativePageComment,
  nativePageCommentEdit,
  nativePageWithCommentTitle,
  nativePageWithDetails,
  nativePageWithTitle,
  nativePageInfo,
  resolveNativeProject,
} from "../shared/native-project.ts";

const site = [
  "src/pages/index.html",
  "src/pages/about.html",
  "src/pages/notes/first.html",
  "src/components/site-header/site-header.html",
  "src/components/site-header/site-header.css",
  "src/components/promo-card/promo-card.html",
  "src/components/flat-note.html",
  "src/styles/site.css",
  "src/styles/base.css",
  "src/styles/layout.css",
  "src/images/logo.svg",
];

function resolved(paths: string[], text?: string) {
  const result = resolveNativeProject(paths, text);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result;
}

test("a repository is native with a manifest or a home page", () => {
  assert.equal(isNativeProject([".astro-editor/native.json"]), true);
  assert.equal(isNativeProject(["README.md", "src/pages/index.html"]), true);
  assert.equal(isNativeProject(["src/pages/about.html", "src/index.html", "package.json"]), false);
  assert.equal(isNativeProject([]), false);
});

test("with no manifest, pages, components and styles are all found by convention", () => {
  const { manifest, warnings, orphans } = resolved(site);
  assert.deepEqual(manifest.routes, {
    "/": "src/pages/index.html",
    "/about/": "src/pages/about.html",
    "/notes/first/": "src/pages/notes/first.html",
  });
  assert.deepEqual(manifest.pages, {});
  assert.deepEqual(manifest.components, {
    "flat-note": "src/components/flat-note.html",
    "promo-card": "src/components/promo-card/promo-card.html",
    "site-header": "src/components/site-header/site-header.html",
  });
  assert.deepEqual(manifest.styles, ["src/styles/site.css"]);
  assert.deepEqual(manifest.explicit, { manifest: false, styles: false });
  assert.deepEqual(warnings, []);
  assert.deepEqual(orphans, []);
});

test("with no manifest and no home page, the error names the home page only", () => {
  const result = resolveNativeProject(["src/pages/about.html"]);
  assert.deepEqual(result, { ok: false, error: "The site has no home page: add src/pages/index.html." });
});

test("styles: site.css alone when it exists, else every stylesheet directly in src/styles in name order", () => {
  assert.deepEqual(nativeConventionStyles(site), ["src/styles/site.css"]);
  assert.deepEqual(
    nativeConventionStyles(["src/styles/theme.css", "src/styles/base.css", "src/styles/parts/x.css", "src/styles/notes.txt", "src/styles/Z.css", "src/other.css"]),
    ["src/styles/Z.css", "src/styles/base.css", "src/styles/theme.css"],
  );
  assert.deepEqual(nativeConventionStyles(["src/pages/index.html"]), []);
});

test("components: valid, unreserved tags only; a folder beats a flat file of the same tag", () => {
  const { components, warnings } = nativeConventionComponents([
    "src/components/site-header/site-header.html",
    "src/components/site-header.html",
    "src/components/header/header.html", // no dash
    "src/components/Big-Card/Big-Card.html", // uppercase
    "src/components/font-face/font-face.html", // reserved
    "src/components/annotation-xml.html", // reserved
    "src/components/promo-card/card.html", // name differs from its folder
    "src/components/deep/nested/x-y.html",
    "src/components/_parts/part-a.html",
    "src/components/info-box/info-box.css",
    "src/components/news-item.html",
  ]);
  assert.deepEqual(components, {
    "news-item": "src/components/news-item.html",
    "site-header": "src/components/site-header/site-header.html",
  });
  assert.deepEqual(warnings, [
    "src/components/site-header.html and src/components/site-header/site-header.html both give the component <site-header>; src/components/site-header/site-header.html is used. Rename one, or name the component's file in native.json.",
  ]);
});

test("a manifest with no components or styles is completed by convention", () => {
  const { manifest } = resolved(site, JSON.stringify({ version: 1, routes: { "/about/": { title: "About us" } } }));
  assert.deepEqual(manifest.pages, { "/about/": { title: "About us" } });
  assert.equal(Object.keys(manifest.components).length, 3);
  assert.deepEqual(manifest.styles, ["src/styles/site.css"]);
  assert.deepEqual(manifest.explicit, { manifest: true, styles: false });
});

test("manifest components win for their tag and their file; listed styles replace the convention", () => {
  const text = JSON.stringify({
    version: 1,
    components: {
      "site-header": "src/components/promo-card/promo-card.html",
      "fancy-note": "src/components/flat-note.html",
    },
    styles: ["src/styles/base.css", "src/styles/layout.css"],
  });
  const { manifest } = resolved(site, text);
  assert.deepEqual(manifest.components, {
    "site-header": "src/components/promo-card/promo-card.html",
    "fancy-note": "src/components/flat-note.html",
  });
  assert.deepEqual(manifest.styles, ["src/styles/base.css", "src/styles/layout.css"]);
  assert.deepEqual(manifest.explicit, { manifest: true, styles: true });

  // An empty list is a list: no shared stylesheets.
  assert.deepEqual(resolved(site, '{"version":1,"styles":[]}').manifest.styles, []);
});

test("a component the manifest names takes no two-files warning; one left to convention does", () => {
  const paths = [...site, "src/components/site-header.html"];
  assert.equal(resolved(paths).warnings.length, 1);
  assert.deepEqual(resolved(paths, '{"version":1,"components":{"site-header":"src/components/site-header.html"}}').warnings, []);
});

test("a manifest's errors and route warnings pass through", () => {
  assert.deepEqual(resolveNativeProject(site, "{"), { ok: false, error: "native.json is not valid JSON." });
  assert.equal(resolveNativeProject(site, '{"version":1,"components":{"font-face":"src/components/x.html"}}').ok, false);
  const result = resolved(site, '{"version":1,"routes":{"/gone/":{"title":"Gone"}}}');
  assert.deepEqual(result.orphans, ["/gone/"]);
  assert.equal(result.warnings.length, 1);
});

test("a page's leading comment gives its metadata; the manifest's wins", () => {
  const page = "<!--\ntitle: From the comment\ndescription: Said in the page.\n-->\n<main><h1>Heading</h1></main>";
  assert.deepEqual(nativePageComment(page), {
    meta: { title: "From the comment", description: "Said in the page." },
    body: "<main><h1>Heading</h1></main>",
  });
  assert.deepEqual(nativePageComment("<main><!-- title: late --></main>").meta, {});
  assert.deepEqual(nativePageComment("  <!-- title: One line -->\n<p>x</p>").meta, { title: "One line" });

  assert.deepEqual(nativePageInfo({}, "/", page), { title: "From the comment", description: "Said in the page." });
  assert.deepEqual(nativePageInfo({ "/": { title: "Manifest" } }, "/", page), { title: "Manifest", description: "Said in the page." });
  assert.deepEqual(nativePageInfo({ "/": { title: "", description: "Manifest says" } }, "/", page), { title: "From the comment", description: "Manifest says" });
  assert.deepEqual(nativePageInfo({ "/about/": { title: "About" } }, "/", "<main></main>"), {});
  assert.deepEqual(nativePageInfo({ "/": { title: "Only" } }, "/", undefined), { title: "Only" });
});

test("a copy's title is written into its leading comment's title line only", () => {
  assert.equal(nativePageWithCommentTitle("<!--\ntitle: Notes\ndescription: All -->\n<main></main>", "Notes (copy)"), "<!--\ntitle: Notes (copy)\ndescription: All -->\n<main></main>");
  assert.equal(nativePageWithCommentTitle("<!-- title: Home -->\n<h1>Home</h1>", "Home (copy)"), "<!-- title: Home (copy) -->\n<h1>Home</h1>");
  assert.equal(nativePageWithCommentTitle("<!-- description: x -->\n<h1>A</h1>", "A (copy)"), "<!-- description: x -->\n<h1>A</h1>");
  assert.equal(nativePageWithCommentTitle("<h1>A</h1><!-- title: late -->", "A (copy)"), "<h1>A</h1><!-- title: late -->");
  assert.equal(nativePageWithCommentTitle("<!-- title: A -->", "B --> <script>"), "<!-- title: B - <script> -->");
  assert.equal(nativePageComment(nativePageWithCommentTitle("<!-- title: A -->", "B --> x")).meta.title, "B - x");
});

test("page details are written into the leading comment, made when missing", () => {
  assert.equal(nativePageWithTitle("<main></main>", "About"), "<!--\ntitle: About\n-->\n<main></main>");
  assert.equal(nativePageWithDetails("<main></main>", { title: "About", description: "Who we are." }), "<!--\ntitle: About\ndescription: Who we are.\n-->\n<main></main>");
  // A leading comment that is no metadata stays, after the new one.
  assert.equal(nativePageWithTitle("<!-- hero -->\n<main></main>", "A"), "<!--\ntitle: A\n-->\n<!-- hero -->\n<main></main>");
  // Unsafe text cannot end the comment or break its lines.
  assert.deepEqual(nativePageComment(nativePageWithDetails("<p></p>", { title: "A --> b", description: "x\ny" })).meta, { title: "A - b", description: "x y" });
  // Nothing to write, nothing made.
  assert.equal(nativePageCommentEdit("<main></main>", "title", "  "), null);
});

test("page details update in place, keep other keys, and go with an empty comment", () => {
  const page = "<!--\ntitle: About\nimage: src/images/about.png\n-->\n<main></main>";
  // A value replaced is the smallest edit: only the changed characters.
  assert.deepEqual(nativePageCommentEdit(page, "title", "About us"), { start: 17, end: 17, text: " us" });
  assert.equal(nativePageCommentEdit(page, "title", "About"), null);
  // A description goes after the title; other keys stay.
  assert.equal(nativePageWithDetails(page, { description: "Who" }), "<!--\ntitle: About\ndescription: Who\nimage: src/images/about.png\n-->\n<main></main>");
  // A title goes first.
  assert.equal(nativePageWithTitle("<!--\ndescription: D\n-->\n<p></p>", "T"), "<!--\ntitle: T\ndescription: D\n-->\n<p></p>");
  // Removing a line keeps the others; the comment goes when nothing is left.
  assert.equal(nativePageWithDetails(page, { title: "" }), "<!--\nimage: src/images/about.png\n-->\n<main></main>");
  assert.equal(nativePageWithDetails("<!--\ntitle: A\ndescription: B\n-->\n<main></main>", { title: "", description: "" }), "<main></main>");
  // One line stays one line with one field, and becomes one per line with two.
  assert.equal(nativePageWithTitle("<!-- title: Home -->\n<h1>Home</h1>", "Start"), "<!-- title: Start -->\n<h1>Home</h1>");
  assert.equal(nativePageWithDetails("<!-- title: Home -->\n<h1>Home</h1>", { description: "D" }), "<!--\ntitle: Home\ndescription: D\n-->\n<h1>Home</h1>");
  assert.equal(nativePageWithDetails("<!-- title: Home -->\n<h1>Home</h1>", { title: "" }), "<h1>Home</h1>");
  // Fields on the comment's own lines; CRLF files keep CRLF.
  assert.equal(nativePageWithDetails("<!--\ntitle: X -->\n<p></p>", { description: "D" }), "<!--\ntitle: X\ndescription: D\n-->\n<p></p>");
  assert.equal(nativePageWithDetails("<!--\r\ntitle: X\r\n-->\r\n<p></p>", { description: "D" }), "<!--\r\ntitle: X\r\ndescription: D\r\n-->\r\n<p></p>");
  assert.equal(nativePageWithTitle("<!--\ntitle:\n-->\n<p></p>", "Z"), "<!--\ntitle: Z\n-->\n<p></p>");
});
