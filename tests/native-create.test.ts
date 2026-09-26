import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  nativePageTemplate,
  newFilePath,
  newFolderPath,
  normalizeRoute,
  routeHeading,
} from "../src/native-create.ts";
import { nativePageBody, nativePageHead, nativePageStylesheets } from "../shared/native-project.ts";

const starterHome = readFileSync(resolve("fixtures/native-starter/index.html"), "utf8");

const value = <T>(result: { ok: true; value: T } | { ok: false; error: string }) => {
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.ok ? result.value : (undefined as never);
};
const error = (result: { ok: boolean; error?: string }) => {
  assert.equal(result.ok, false);
  return result.error ?? "";
};

test("a new file's name joins its folder, and a / makes folders", () => {
  assert.equal(value(newFilePath("src/styles", "print.css")), "src/styles/print.css");
  assert.equal(value(newFilePath("", "docs/notes.md")), "docs/notes.md");
  assert.equal(value(newFilePath("src", "  a/b/c.txt ")), "src/a/b/c.txt");
  assert.equal(value(newFolderPath("src", "media/")), "src/media");
});

test("unsafe or unusable names are refused", () => {
  for (const name of ["", "  ", "a//b", "../x", "a/./b", "a/../b", "sp ace.md", "a\\b", "q?.md", "a/.git/x", ".git"])
    assert.ok(error(newFilePath("src", name)), name);
  assert.match(error(newFilePath("", "notes.md/")), /empty part/);
  assert.match(error(newFilePath(".github", "workflows/deploy.yml")), /workflows/);
  assert.match(error(newFilePath("src/images", "logo.png")), /Only text files/);
  assert.match(error(newFilePath("src", "font.WOFF2")), /Only text files/);
  assert.match(error(newFolderPath("src", "")), /folder name/);
  assert.match(error(newFilePath("", "a/".repeat(600) + "b")), /too long/);
});

test("a typed URL becomes a route: a folder's, unless it names an .html file", () => {
  assert.equal(value(normalizeRoute("/videos/intro/")), "/videos/intro/");
  assert.equal(value(normalizeRoute("videos/intro")), "/videos/intro/");
  assert.equal(value(normalizeRoute("/videos/intro/index.html")), "/videos/intro/");
  assert.equal(value(normalizeRoute("notes.html")), "/notes.html");
  assert.equal(value(normalizeRoute("/index.html")), "/");
  assert.equal(value(normalizeRoute(" / ")), "/");
  assert.ok(error(normalizeRoute("")));
  assert.ok(error(normalizeRoute("/a//b/")));
  assert.ok(error(normalizeRoute("/my page/")));
  assert.ok(error(normalizeRoute("#/videos/")));
  assert.match(error(normalizeRoute("/_drafts/x/")), /start with _/);
  assert.match(error(normalizeRoute("/.well-known/x/")), /start with _ or \./);
  assert.match(error(normalizeRoute("/components/x/")), /not for pages/);
  assert.ok(error(normalizeRoute("/../x/")));
});

test("a route's last part is its default heading", () => {
  assert.equal(routeHeading("/videos/intro/"), "Intro");
  assert.equal(routeHeading("/videos/my-first_clip/"), "My first clip");
  assert.equal(routeHeading("/notes.html"), "Notes");
  assert.equal(routeHeading("/"), "Home");
});

test("a new page is the home page's document with the new title, no description and an empty <main>", () => {
  const page = nativePageTemplate(starterHome, "Intro & <more>");
  assert.deepEqual(nativePageHead(page), { title: "Intro & <more>", description: "" });
  assert.match(page, /<meta property="og:title" content="Intro &amp; <more>">/);
  assert.match(page, /<meta property="og:description" content="">/);
  assert.deepEqual(nativePageStylesheets(page, "intro/index.html"), ["styles/site.css"]);
  const { start, end } = nativePageBody(page);
  assert.equal(page.slice(start, end), '\n<site-header data-key="header"></site-header>\n<main class="page" data-key="main">\n</main>\n<site-footer data-key="footer"></site-footer>\n');
  // Everything outside the title, the description and <main> is the home page's.
  assert.ok(page.startsWith(starterHome.slice(0, starterHome.indexOf("<title>"))));
  assert.ok(page.endsWith(starterHome.slice(starterHome.indexOf("</main>"))));
});

test("an indented <main> keeps its indentation; without one, the body gets a <main>; without a home page, a minimal document", () => {
  const wrapped = "<!doctype html>\n<head><title>Home</title></head>\n<body>\n  <div>\n    <main id=\"main\" class=\"x\">\n      <p>Old</p>\n    </main>\n  </div>\n</body>\n";
  assert.equal(
    nativePageTemplate(wrapped, "Intro"),
    "<!doctype html>\n<head><title>Intro</title></head>\n<body>\n  <div>\n    <main id=\"main\" class=\"x\">\n    </main>\n  </div>\n</body>\n",
  );
  assert.equal(
    nativePageTemplate("<head><title>Home</title></head>\n<body>\n<section><h1>Home</h1></section>\n</body>", "Intro"),
    "<head><title>Intro</title></head>\n<body>\n  <main>\n  </main>\n</body>",
  );
  for (const home of [undefined, "<main><p>never closed</p>", "<main-nav></main-nav>"]) {
    const page = nativePageTemplate(home, "Intro");
    assert.equal(nativePageHead(page).title, "Intro", String(home));
    assert.match(page, /<body>\n  <main>\n  <\/main>\n<\/body>/, String(home));
  }
});
