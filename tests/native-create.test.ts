import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  nativeNewPagePath,
  nativePageTemplate,
  nativeRegistration,
  newFilePath,
  newFolderPath,
  normalizeRoute,
  routeHeading,
} from "../src/native-create.ts";
import { registerNativeFile, type NativeRegistration } from "../src/native-page-meta.ts";
import { parseNativeManifest } from "../src/native-manifest.ts";

const fixture = readFileSync(resolve("fixtures/native-starter/.astro-editor/native.json"), "utf8");
const starterHome = readFileSync(resolve("fixtures/native-starter/src/pages/index.html"), "utf8");
const routingHome = readFileSync(resolve("fixtures/native-routing/src/pages/index.html"), "utf8");

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

test("a typed URL becomes a route", () => {
  assert.equal(value(normalizeRoute("/videos/intro/")), "/videos/intro/");
  assert.equal(value(normalizeRoute("videos/intro")), "/videos/intro/");
  assert.equal(value(normalizeRoute("#/videos/intro")), "/videos/intro/");
  assert.equal(value(normalizeRoute(" / ")), "/");
  assert.ok(error(normalizeRoute("")));
  assert.ok(error(normalizeRoute("/a//b/")));
  assert.ok(error(normalizeRoute("/my page/")));
  assert.match(error(normalizeRoute("/_drafts/x/")), /start with _/);
  assert.ok(error(normalizeRoute("/../x/")));
});

test("a new page's file is <route>.html, or <route>/index.html when that folder exists", () => {
  const none = () => false;
  assert.equal(value(nativeNewPagePath("/videos/intro/", none)), "src/pages/videos/intro.html");
  assert.equal(value(nativeNewPagePath("/about/", none)), "src/pages/about.html");
  assert.equal(value(nativeNewPagePath("/", none)), "src/pages/index.html");
  const existing = new Set(["src/pages/videos/intro"]);
  assert.equal(value(nativeNewPagePath("/videos/intro/", (folder) => existing.has(folder))), "src/pages/videos/intro/index.html");
  // `/a/index/` would be the file of `/a/`.
  assert.ok(error(nativeNewPagePath("/a/index/", none)));
});

test("a route's last part is its default heading", () => {
  assert.equal(routeHeading("/videos/intro/"), "Intro");
  assert.equal(routeHeading("/videos/my-first_clip/"), "My first clip");
  assert.equal(routeHeading("/"), "Home");
});

test("a new page keeps the home page outside <main> and replaces its content with a section and a heading", () => {
  const page = nativePageTemplate(starterHome, "Intro & <more>");
  assert.ok(page.startsWith(
    '<site-header data-key="header"></site-header>\n<main class="page" data-key="main">\n' +
    '  <section class="hero" data-key="hero">\n    <h1 data-key="title">Intro &amp; &lt;more&gt;</h1>\n  </section>\n</main>',
  ));
  assert.ok(page.endsWith(starterHome.slice(starterHome.indexOf("</main>"))));
  assert.ok(!page.includes("hero-title"));
  assert.equal(page.match(/<h1/g)?.length, 1);
  assert.equal(page.match(/<section/g)?.length, 1);
  assert.ok(nativePageTemplate(routingHome, "Intro").startsWith(
    '<main class="page" data-key="main">\n  <section class="hero" data-key="hero">\n    <h1 data-key="title">Intro</h1>\n  </section>\n</main>',
  ));
});

test("the new page's section copies the home page's first section in <main>, without its id", () => {
  // The starter's shape: attributes kept, the id dropped, the key replaced.
  const starter = '<site-header data-key="header"></site-header>\n<main class="page" id="main" data-key="main">\n' +
    '  <section class="hero flow" id="top" data-key="intro">\n    <h1 data-key="hero-title">Hi</h1>\n  </section>\n' +
    '  <section class="work flow" id="work" data-key="work"></section>\n</main>\n<site-footer></site-footer>\n';
  assert.equal(
    nativePageTemplate(starter, "About"),
    '<site-header data-key="header"></site-header>\n<main class="page" id="main" data-key="main">\n' +
    '  <section class="hero flow" data-key="hero">\n    <h1 data-key="title">About</h1>\n  </section>\n</main>\n<site-footer></site-footer>\n',
  );
  // Unkeyed: no keys added, a section's own key dropped; the home page's indentation step is kept.
  const unkeyed = "<main class=\"x\">\n    <div class=\"wrap\"><section class=\"inner\">a</section></div>\n    <section class='band' data-key=\"b\" id=b>b</section>\n</main>\n";
  assert.equal(
    nativePageTemplate(unkeyed, "Intro"),
    "<main class=\"x\">\n    <section class='band'>\n        <h1>Intro</h1>\n    </section>\n</main>\n",
  );
  // No <section> directly in <main> (nested ones do not count): a bare one.
  const nested = "<main data-key=\"main\">\n  <div><section class=\"deep\">x</section></div>\n  <section-list></section-list>\n</main>";
  assert.equal(
    nativePageTemplate(nested, "Intro"),
    "<main data-key=\"main\">\n  <section data-key=\"hero\">\n    <h1 data-key=\"title\">Intro</h1>\n  </section>\n</main>",
  );
  // A <main> indented inside a wrapper keeps its indentation; no data-key, none added.
  const wrapped = "<div>\n  <main id=\"main\" class=\"x\">\n    <p>Old</p>\n  </main>\n</div>\n";
  assert.equal(
    nativePageTemplate(wrapped, "Intro"),
    "<div>\n  <main id=\"main\" class=\"x\">\n    <section>\n      <h1>Intro</h1>\n    </section>\n  </main>\n</div>\n",
  );
});

test("without <main> in the home page, a new page is a minimal <main> with a section", () => {
  const minimal = '<main id="main">\n  <section>\n    <h1>Intro</h1>\n  </section>\n</main>\n';
  assert.equal(nativePageTemplate("<section><h1>Home</h1></section>", "Intro"), minimal);
  assert.equal(nativePageTemplate(undefined, "Intro"), minimal);
  assert.equal(nativePageTemplate("<main><p>never closed</p>", "Intro"), minimal);
  // A custom element whose name starts with "main" is not <main>.
  assert.equal(nativePageTemplate("<main-nav></main-nav>", "Intro"), minimal);
});

test("stylesheets directly in src/styles and component templates by tag register", () => {
  assert.deepEqual(nativeRegistration("src/styles/print.css"), { kind: "style", path: "src/styles/print.css" });
  assert.deepEqual(nativeRegistration("src/components/promo-box/promo-box.html"), { kind: "component", tag: "promo-box", path: "src/components/promo-box/promo-box.html" });
  for (const path of [
    "src/styles/parts/x.css",
    "src/styles/notes.md",
    "src/components/promo-box/other.html",
    "src/components/promo/promo.html",
    "src/components/font-face/font-face.html",
    "src/components/Promo-Box/Promo-Box.html",
    "src/components/promo-box.html",
    "src/pages/x.html",
  ])
    assert.equal(nativeRegistration(path), undefined, path);
});

function register(text: string, entry: NativeRegistration) {
  const result = registerNativeFile(text, entry);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) throw new Error(result.error);
  if (result.edit) assert.equal(text.slice(0, result.edit.start) + result.edit.text + text.slice(result.edit.end), result.text);
  const parsed = parseNativeManifest(result.text, ["src/pages/index.html"]);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  return { ...result, manifest: parsed.ok ? parsed.manifest : (undefined as never) };
}

test("a new stylesheet is appended to styles in a one-line diff", () => {
  const result = register(fixture, { kind: "style", path: "src/styles/print.css" });
  assert.deepEqual(result.manifest.styles, ["src/styles/site.css", "src/styles/print.css"]);
  assert.ok(result.text.includes('"styles": ["src/styles/site.css", "src/styles/print.css"]'));
  assert.equal(result.text.split("\n").length, fixture.split("\n").length);
  // Already there: nothing to do.
  assert.equal(register(result.text, { kind: "style", path: "src/styles/print.css" }).edit, null);
});

test("a stylesheet joins a one-per-line styles array on its own line, and an empty or missing one", () => {
  const multi = '{\n  "version": 1,\n  "styles": [\n    "src/styles/a.css"\n  ]\n}\n';
  assert.equal(register(multi, { kind: "style", path: "src/styles/b.css" }).text, '{\n  "version": 1,\n  "styles": [\n    "src/styles/a.css",\n    "src/styles/b.css"\n  ]\n}\n');
  assert.equal(register('{ "version": 1, "styles": [] }', { kind: "style", path: "src/styles/b.css" }).text, '{ "version": 1, "styles": ["src/styles/b.css"] }');
  assert.equal(register('{\n  "version": 1\n}\n', { kind: "style", path: "src/styles/b.css" }).text, '{\n  "version": 1,\n  "styles": ["src/styles/b.css"]\n}\n');
});

test("a new component is added to components on its own line, or with a new components object", () => {
  const result = register(fixture, { kind: "component", tag: "promo-box", path: "src/components/promo-box/promo-box.html" });
  assert.equal(result.manifest.components["promo-box"], "src/components/promo-box/promo-box.html");
  assert.ok(result.text.includes('"site-button": "src/components/site-button/site-button.html",\n    "promo-box": "src/components/promo-box/promo-box.html"\n  },'));
  assert.equal(result.text.split("\n").length, fixture.split("\n").length + 1);
  assert.equal(register(result.text, { kind: "component", tag: "promo-box", path: "src/components/promo-box/promo-box.html" }).edit, null);
  const bare = register('{\n  "version": 1,\n  "styles": []\n}\n', { kind: "component", tag: "promo-box", path: "src/components/promo-box/promo-box.html" });
  assert.equal(bare.text, '{\n  "version": 1,\n  "styles": [],\n  "components": { "promo-box": "src/components/promo-box/promo-box.html" }\n}\n');
});

test("a tag already naming another file, or a manifest that is not JSON, is refused", () => {
  const taken = registerNativeFile(fixture, { kind: "component", tag: "site-button", path: "src/components/site-button/other.html" });
  assert.equal(taken.ok, false);
  assert.equal(registerNativeFile("{ nope", { kind: "style", path: "src/styles/a.css" }).ok, false);
  assert.equal(registerNativeFile('{ "version": 1, "styles": "x" }', { kind: "style", path: "src/styles/a.css" }).ok, false);
});
