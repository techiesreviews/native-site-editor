import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { contentHash, exportNativeSite, imageDimensions, pageMeta, type FileContent } from "../shared/native-export.ts";
import { withSlottedRules } from "../shared/slotted-css.ts";

const fixture = "fixtures/native-starter";

function fixtureFiles(root = fixture) {
  const files: Record<string, FileContent> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(root, full);
        files[path] = /\.(html|css|json)$/.test(name) ? readFileSync(full, "utf8") : new Uint8Array(readFileSync(full));
      }
    }
  };
  walk(root);
  return files;
}

const site = JSON.stringify({
  name: "Native Studio",
  url: "https://example.test/",
  description: "A studio.",
  themeColor: "#2f6d3a",
  image: "src/images/studio-desk.svg",
  locale: "en_GB",
});

const text = (value: FileContent | undefined) => {
  assert.ok(value !== undefined);
  return typeof value === "string" ? value : new TextDecoder().decode(value);
};

test("exports the fixture as one document per route with expanded components and hashed assets", () => {
  const files = fixtureFiles();
  files[".astro-editor/site.json"] = site;
  const { files: out, log } = exportNativeSite({ files });
  assert.deepEqual(Object.keys(out).filter((path) => path.endsWith("index.html")).sort(), ["about/index.html", "index.html"]);
  const home = text(out["index.html"]);
  const about = text(out["about/index.html"]);

  const css = `/* src/styles/site.css */\n${text(files["src/styles/site.css"])}`;
  const cssName = `site.${contentHash(css)}.css`;
  assert.equal(text(out[`assets/${cssName}`]), css);
  assert.ok(home.includes(`<link rel="stylesheet" href="/assets/${cssName}">`));

  // Components become declarative shadow DOM that links the site stylesheet
  // and the component's own, whose rules also style what a page slots in;
  // nested components expand too.
  const headerCss = withSlottedRules(text(files["src/components/site-header/site-header.css"]));
  assert.ok(headerCss.includes(".site-nav a:hover, .site-nav ::slotted(a:hover) {"));
  const headerName = `site-header.${contentHash(headerCss)}.css`;
  assert.equal(text(out[`assets/${headerName}`]), headerCss);
  assert.ok(home.includes(`<site-header><template shadowrootmode="open"><link rel="stylesheet" href="/assets/${cssName}"><link rel="stylesheet" href="/assets/${headerName}">`));
  assert.ok(/<project-card[^>]*><template shadowrootmode="open">[\s\S]*<card-note[^>]*><template shadowrootmode="open">/.test(home));
  assert.ok(!home.includes("#/about/"), "hash routes become paths");
  assert.ok(home.includes('href="/about/"'));
  assert.ok(home.includes('<a href="/" aria-current="page">Home</a>'));
  assert.ok(about.includes('<a href="/about/" aria-current="page">About</a>'));
  assert.ok(about.includes('<a href="/">Home</a>'));

  // Images are copied under hashed names, referenced with size attributes.
  const placeholder = files["src/images/placeholder.svg"] as Uint8Array;
  const imageName = `placeholder.${contentHash(placeholder)}.svg`;
  assert.deepEqual(out[`assets/images/${imageName}`], placeholder);
  const size = imageDimensions(placeholder, ".svg");
  assert.ok(size);
  assert.ok(home.includes(`<img class="hero-image" src="/assets/images/${imageName}" width="${size.width}" height="${size.height}">`));
  assert.ok(!/hero-image[^>]*loading="lazy"/.test(home), "the first section's image is not lazy");

  // Head: title from the h1 with the site name, description from the first p.
  assert.ok(home.includes("<title>A native browser preview · Native Studio</title>"));
  assert.ok(home.includes('<meta name="description" content="Edit plain HTML, CSS, and shared component templates'));
  assert.ok(home.includes('<link rel="canonical" href="https://example.test/">'));
  assert.ok(about.includes('<link rel="canonical" href="https://example.test/about/">'));
  assert.ok(home.includes('<meta property="og:locale" content="en_GB">'));
  assert.ok(home.includes('<html lang="en-GB">'));
  assert.ok(home.includes(`<meta property="og:image" content="https://example.test/assets/images/studio-desk.${contentHash(files["src/images/studio-desk.svg"])}.svg">`));
  assert.ok(home.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(!/<script(?! type="application\/ld\+json")/.test(home), "no script beyond JSON-LD data");

  assert.ok(text(out["_headers"]).includes("/assets/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable"));
  assert.deepEqual(log.slice(0, 3), [
    "/ -> index.html",
    "/about/ -> about/index.html",
    "assets -> 2 images, 5 stylesheets, _headers, sitemap.xml, robots.txt",
  ]);
});

test("manifest route metadata wins over the page comment and the h1", () => {
  const files = fixtureFiles();
  const manifest = JSON.parse(text(files[".astro-editor/native.json"]));
  manifest.routes["/about/"] = { file: "src/pages/about.html", title: "About us", description: "From the manifest." };
  files[".astro-editor/native.json"] = JSON.stringify(manifest);
  files["src/pages/index.html"] = "<!--\ntitle: From the comment\ndescription: Comment description.\n-->\n" + text(files["src/pages/index.html"]);
  const { files: out } = exportNativeSite({ files, siteUrl: "https://example.test" });
  const home = text(out["index.html"]);
  const about = text(out["about/index.html"]);
  // No site.json: the site name is the home page heading.
  assert.ok(home.includes("<title>From the comment · A native browser preview</title>"));
  assert.ok(home.includes('<meta name="description" content="Comment description.">'));
  assert.ok(!home.includes("From the comment\ndescription"), "the comment is stripped from the output");
  assert.ok(about.includes("<title>About us · A native browser preview</title>"));
  assert.ok(about.includes('<meta name="description" content="From the manifest.">'));
  assert.ok(about.includes('<meta property="og:title" content="About us · A native browser preview">'));
});

test("works without site.json or a site URL, leaving canonical and og:url out", () => {
  const { files: out } = exportNativeSite({ files: fixtureFiles() });
  const home = text(out["index.html"]);
  assert.ok(home.includes("<title>A native browser preview</title>"));
  assert.ok(!home.includes('rel="canonical"'));
  assert.ok(!home.includes("og:url"));
  assert.ok(home.includes('<meta name="twitter:card" content="summary">'));
});

test("fails closed on an unclosed component, a missing image and a bad manifest", () => {
  const files = fixtureFiles();
  files["src/pages/about.html"] = "<site-header data-key=\"h\"><main>oops</main>";
  assert.throws(() => exportNativeSite({ files }), /Unclosed <site-header>/);
  const missing = fixtureFiles();
  missing["src/pages/about.html"] = '<img src="src/images/nope.png">';
  assert.throws(() => exportNativeSite({ files: missing }), /Missing image src\/images\/nope.png/);
  const bad = fixtureFiles();
  bad[".astro-editor/native.json"] = '{"version":2}';
  assert.throws(() => exportNativeSite({ files: bad }), /version/);
});

test("reads page comments and image headers", () => {
  assert.deepEqual(pageMeta("<!--\ntitle: Hi\n-->\n<h1>x</h1>"), { meta: { title: "Hi" }, body: "<h1>x</h1>" });
  assert.deepEqual(pageMeta("<h1>x</h1>").meta, {});
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0x40, 0, 0, 0, 0xc8]);
  assert.deepEqual(imageDimensions(png, ".png"), { width: 320, height: 200 });
  assert.deepEqual(imageDimensions(new TextEncoder().encode('<svg viewBox="0 0 640 360"></svg>'), ".svg"), { width: 640, height: 360 });
  assert.equal(imageDimensions(new Uint8Array(4), ".jpg"), null);
});

test("template parts the page leaves empty are left out of the export", () => {
  const files = fixtureFiles();
  const home = text(exportNativeSite({ files }).files["index.html"]);
  // No card passes a link, so the actions paragraph is not in any card.
  assert.equal(home.includes("project-card__actions"), false);
  files["src/pages/index.html"] = text(files["src/pages/index.html"]).replace(
    `<span slot="title">Reusable cards</span>`,
    `<span slot="title">Reusable cards</span>\n      <a slot="link" href="#/about/">See the project</a>`,
  );
  const withLink = text(exportNativeSite({ files }).files["index.html"]);
  assert.equal(withLink.split("project-card__actions").length - 1, 1);
});

/** The export of the fixture with these shared stylesheets listed and these files added. */
function exportStyles(added: Record<string, FileContent>, styles = ["src/styles/site.css"]) {
  const files = fixtureFiles();
  const manifest = JSON.parse(text(files[".astro-editor/native.json"]));
  manifest.styles = styles;
  files[".astro-editor/native.json"] = JSON.stringify(manifest);
  Object.assign(files, added);
  const { files: out, log } = exportNativeSite({ files });
  const siteFile = Object.keys(out).find((path) => /^assets\/site\.[0-9a-f]{10}\.css$/.test(path))!;
  return { out, log, siteFile, css: text(out[siteFile]), warnings: log.filter((line) => line.startsWith("warning:")) };
}
const cssAssets = (out: Record<string, FileContent>) =>
  Object.keys(out).filter((path) => path.endsWith(".css")).map((path) => path.replace(/\.[0-9a-f]{10}\.css$/, "")).sort();

test("repository stylesheets a shared sheet imports are inlined in place, recursively and once each", () => {
  const { out, css, log, warnings, siteFile } = exportStyles({
    "src/styles/site.css": `@import "a.css";\n@import url(parts/b.css);\n.site {}\n`,
    "src/styles/a.css": `@import "./parts/b.css";\n.a {}\n`,
    "src/styles/parts/b.css": ".b {}",
  });
  assert.equal(css, `/* src/styles/site.css */\n/* src/styles/a.css */\n/* src/styles/parts/b.css */\n.b {}\n.a {}\n.site {}\n`);
  // No file of its own for an inlined stylesheet: the site loads one stylesheet.
  assert.ok(!cssAssets(out).some((path) => /assets\/(a|b)$/.test(path)), cssAssets(out).join());
  const home = text(out["index.html"]);
  assert.equal(home.split("<template")[0].split(`<link rel="stylesheet"`).length - 1, 1);
  assert.ok(home.includes(`<link rel="stylesheet" href="/${siteFile}">`));
  assert.deepEqual(warnings, []);
  assert.ok(log.includes("assets -> 2 images, 5 stylesheets, _headers"), log.join("\n"));
});

test("an import's layer, supports() and media become blocks around the inlined file", () => {
  const { css } = exportStyles({
    "src/styles/site.css": [
      `@layer x, y;`,
      `@import "a.css" layer(x);`,
      `@import "b.css" layer;`,
      `@import "c.css" print;`,
      `@import "d.css" supports(display: grid);`,
      `@import "e.css" layer(y) supports(not (display: grid)) (min-width: 40em);`,
      `.site {}`,
    ].join("\n"),
    "src/styles/a.css": `@layer inner;\n@import "parts/f.css" layer(inner);\n.a {}`,
    "src/styles/parts/f.css": ".f {}",
    "src/styles/b.css": ".b {}",
    "src/styles/c.css": ".c {}",
    "src/styles/d.css": ".d {}",
    "src/styles/e.css": ".e {}",
  });
  assert.equal(
    css,
    [
      `@layer x, y;`,
      `/* src/styles/site.css */`,
      // A file's own leading layer statements stay inside its block; nested layers compose (x.inner).
      `@layer x {\n/* src/styles/a.css */\n@layer inner;\n@layer inner {\n/* src/styles/parts/f.css */\n.f {}\n}\n.a {}\n}`,
      `@layer {\n/* src/styles/b.css */\n.b {}\n}`,
      `@media print {\n/* src/styles/c.css */\n.c {}\n}`,
      `@supports (display: grid) {\n/* src/styles/d.css */\n.d {}\n}`,
      // Conditions wrap the layer, as css-cascade-5 declares an imported layer.
      `@media (min-width: 40em) {\n@supports not (display: grid) {\n@layer y {\n/* src/styles/e.css */\n.e {}\n}\n}\n}`,
      `.site {}`,
    ].join("\n"),
  );
});

test("url()s in every stylesheet resolve from the file they are written in", () => {
  const font = new Uint8Array([1, 2, 3]);
  const { out, css, warnings } = exportStyles({
    "src/styles/site.css": `@import "parts/b.css";\n.hero { background: url(../images/studio-desk.svg); }\n`,
    "src/styles/parts/b.css": [
      `@font-face { font-family: Body; src: url("../../fonts/body.woff2?v=2") format("woff2"); }`,
      `.b { background: url('../../images/studio-desk.svg#part'); }`,
      `.c { background: url(../../public/og.png), url(/root.png), url(data:image/gif;base64,R0lGOD), url("https://cdn.example/x.png"); }`,
      `.d { mask: url(#mask); content: "url(../not-a-url.png)"; } /* url(../comment.png) */`,
      `.e { background: url(../../images/gone.png); }`,
    ].join("\n"),
    "src/fonts/body.woff2": font,
    "src/public/og.png": new Uint8Array([4]),
  });
  const image = Object.keys(out).find((path) => /^assets\/images\/studio-desk\.[0-9a-f]{10}\.svg$/.test(path))!;
  const fontFile = `assets/body.${contentHash(font)}.woff2`;
  assert.deepEqual(out[fontFile], font);
  assert.ok(css.includes(`src: url("/${fontFile}?v=2") format("woff2");`));
  assert.ok(css.includes(`.b { background: url("/${image}#part"); }`));
  assert.ok(css.includes(`.c { background: url("/og.png"), url(/root.png), url(data:image/gif;base64,R0lGOD), url("https://cdn.example/x.png"); }`));
  assert.ok(css.includes(`.d { mask: url(#mask); content: "url(../not-a-url.png)"; } /* url(../comment.png) */`));
  assert.ok(css.includes(`.hero { background: url("/${image}"); }`));
  assert.deepEqual(warnings, ["warning: src/styles/parts/b.css refers to ../../images/gone.png, which is missing."]);
});

test("an external import stays at the head of the bundle, with the layer and conditions of the imports around it", () => {
  const { css, warnings } = exportStyles({
    "src/styles/site.css": `@layer a;\n@import "tokens.css" layer(a) supports(display: grid);\n@import "https://fonts.example/css";\n.site {}\n`,
    "src/styles/tokens.css": `@import url("https://fonts.example/more.css") screen;\n.tokens {}\n`,
  });
  assert.equal(
    css,
    `@layer a;\n@import url("https://fonts.example/more.css") layer(a) supports(display: grid) screen;\n@import "https://fonts.example/css";\n` +
      `/* src/styles/site.css */\n@supports (display: grid) {\n@layer a {\n/* src/styles/tokens.css */\n.tokens {}\n}\n}\n.site {}\n`,
  );
  // The unlayered one moves ahead of tokens.css, which it followed.
  assert.deepEqual(warnings, [
    "warning: src/styles/site.css imports https://fonts.example/css outside a layer after other styles; in site.css that import moves ahead of them.",
  ]);
});

test("a component stylesheet's imports are inlined into its own file", () => {
  const files = fixtureFiles();
  const card = text(files["src/components/project-card/project-card.css"]);
  files["src/components/project-card/project-card.css"] = `@import "../../styles/parts/shared.css" layer(shared);\n` + card;
  files["src/styles/parts/shared.css"] = ".shared { background: url(../../images/studio-desk.svg); }";
  const { files: out } = exportNativeSite({ files });
  const cardFile = Object.keys(out).find((path) => /^assets\/project-card\.[0-9a-f]{10}\.css$/.test(path))!;
  const image = Object.keys(out).find((path) => /^assets\/images\/studio-desk\./.test(path))!;
  assert.equal(text(out[cardFile]), withSlottedRules(`@layer shared {\n.shared { background: url("/${image}"); }\n}\n` + card));
  assert.ok(!cssAssets(out).includes("assets/shared"));
});

test("the starter's site.css of imports exports one stylesheet with the rules of the old bundle, in order", () => {
  const layers = "@layer tokens, elements, layout, sections;";
  const parts: Record<string, string> = {
    "src/styles/tokens.css": `/* The layer order. */\n${layers}\n\n@layer tokens {\n  :root { --ink: #20231f; }\n}\n`,
    "src/styles/elements.css": `@layer elements {\n  body { margin: 0; color: var(--ink); }\n}\n`,
    "src/styles/layout.css": `@layer layout {\n  .flow > * + * { margin-top: 1em; }\n}\n`,
    "src/styles/sections.css": `@layer sections {\n  .intro { padding: 2em; }\n  @media (min-width: 40em) { .intro { padding: 4em; } }\n}\n`,
  };
  const listed = exportStyles(parts, Object.keys(parts));
  const siteCss = `/* Shared styles. */\n${layers}\n@import url("tokens.css");\n@import url("elements.css");\n@import url("layout.css");\n@import url("sections.css");\n`;
  const imported = exportStyles({ ...parts, "src/styles/site.css": siteCss });
  assert.ok(!imported.css.includes("@import"));
  assert.deepEqual(cssAssets(imported.out).filter((path) => !path.startsWith("assets/project-card") && !path.startsWith("assets/card-note")),
    cssAssets(listed.out).filter((path) => !path.startsWith("assets/project-card") && !path.startsWith("assets/card-note")));
  assert.ok(!cssAssets(imported.out).some((path) => /assets\/(tokens|elements|layout|sections)$/.test(path)));
  // Top-level statements and blocks, comments and whitespace aside, with a repeated layer statement once.
  const rules = (css: string) => {
    const found: string[] = [];
    let depth = 0, start = 0;
    const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (let index = 0; index < source.length; index++) {
      if (source[index] === "{") depth++;
      else if (source[index] === "}" && --depth === 0 || source[index] === ";" && depth === 0) {
        found.push(source.slice(start, index + 1).replace(/\s+/g, " ").trim());
        start = index + 1;
      }
    }
    return found.filter((rule, index) => rule !== found[index - 1]);
  };
  assert.deepEqual(rules(imported.css), rules(listed.css));
  assert.equal(rules(imported.css)[0], layers);
  assert.deepEqual(imported.warnings, []);
});

test("fails closed on a missing or circular stylesheet import", () => {
  const missing = fixtureFiles();
  missing["src/styles/site.css"] = `@import "gone.css";\n` + text(missing["src/styles/site.css"]);
  assert.throws(() => exportNativeSite({ files: missing }), /src\/styles\/site.css imports src\/styles\/gone.css, which is missing/);
  const circular = fixtureFiles();
  circular["src/styles/site.css"] = `@import "sections.css";\n` + text(circular["src/styles/site.css"]);
  circular["src/styles/sections.css"] = `@import "site.css";\n.filler {}`;
  assert.throws(() => exportNativeSite({ files: circular }), /sections.css imports src\/styles\/site.css, which imports it back/);
  // Deeper down, and a file importing itself, fail the same way instead of inlining forever.
  circular["src/styles/sections.css"] = `@import "parts/a.css";\n.filler {}`;
  circular["src/styles/parts/a.css"] = `@import "../sections.css" layer(x);`;
  assert.throws(() => exportNativeSite({ files: circular }), /parts\/a.css imports src\/styles\/sections.css, which imports it back/);
  circular["src/styles/sections.css"] = `@import "sections.css";`;
  assert.throws(() => exportNativeSite({ files: circular }), /sections.css imports src\/styles\/sections.css, which imports it back/);
});

const withSite = (extra: Record<string, unknown> = {}) => {
  const files = fixtureFiles();
  files[".astro-editor/site.json"] = JSON.stringify({ ...JSON.parse(site), ...extra });
  return files;
};
const routeEntry = (files: Record<string, FileContent>, route: string, entry: unknown) => {
  const manifest = JSON.parse(text(files[".astro-editor/native.json"]));
  manifest.routes[route] = entry;
  files[".astro-editor/native.json"] = JSON.stringify(manifest);
};

test("a slot the page fills is exported without its fallback; an empty slot keeps it", () => {
  const files = fixtureFiles();
  files["src/pages/about.html"] = `<project-card><span slot="title">Filled</span></project-card>`;
  const about = text(exportNativeSite({ files }).files["about/index.html"]);
  assert.ok(about.includes('<slot name="title"></slot>'));
  assert.ok(!about.includes("Untitled project"));
  assert.ok(about.includes('<slot name="body">No description yet.</slot>'), "the body slot is empty, so its fallback stays");
  // The template's own card-note fills that component's default slot.
  assert.ok(!about.includes("Shared note"));
  files["src/pages/about.html"] = `<card-note></card-note><card-note> </card-note>`;
  assert.equal(text(exportNativeSite({ files }).files["about/index.html"]).split("<slot>Shared note</slot>").length - 1, 2);
});

test("data-key attributes are left out of the export", () => {
  const files = fixtureFiles();
  files["src/pages/about.html"] = `<p data-key="a" class="x">Text about data-key="b"</p><img data-key='c' src="src/images/placeholder.svg" alt="">`;
  const about = text(exportNativeSite({ files }).files["about/index.html"]);
  assert.ok(!text(exportNativeSite({ files: fixtureFiles() }).files["index.html"]).includes("data-key"));
  assert.ok(about.includes('<p class="x">Text about data-key="b"</p>'), "text that mentions data-key is untouched");
  assert.ok(/<img src="\/assets\/images\/placeholder\.\w+\.svg" alt=""/.test(about));
});

test("the locale becomes a BCP 47 lang attribute", () => {
  assert.ok(text(exportNativeSite({ files: withSite({ locale: "pt_BR" }) }).files["index.html"]).includes('<html lang="pt-BR">'));
  assert.ok(text(exportNativeSite({ files: fixtureFiles() }).files["index.html"]).includes('<html lang="en">'));
});

test("the /404/ route is written to 404.html, kept out of the sitemap and not indexed", () => {
  const files = withSite();
  files["src/pages/404.html"] = `<site-header></site-header><main><h1>Page not found</h1><p>Try the <a href="#/">home page</a>.</p></main>`;
  routeEntry(files, "/404/", "src/pages/404.html");
  const { files: out, log } = exportNativeSite({ files });
  assert.equal(out["404/index.html"], undefined);
  const page = text(out["404.html"]);
  assert.ok(page.includes("<title>Page not found · Native Studio</title>"));
  assert.ok(page.includes('<a href="/">home page</a>'));
  assert.ok(page.includes('<meta name="robots" content="noindex">'));
  assert.ok(!page.includes('rel="canonical"'));
  assert.ok(!text(out["sitemap.xml"]).includes("404"));
  assert.ok(log.includes("/404/ -> 404.html"));
});

test("pages are routed by their folders, with metadata-only manifest entries and no file", () => {
  const files = withSite();
  files[".astro-editor/native.json"] = JSON.stringify({
    version: 1,
    routes: {
      "/work/fern-and-kettle/": { title: "Fern & Kettle", description: "A café in Frome." },
      "/gone/": { title: "Gone" },
    },
    components: JSON.parse(text(files[".astro-editor/native.json"])).components,
    styles: ["src/styles/site.css"],
  });
  files["src/pages/work/index.html"] = `<main><h1>Work</h1><a href="#/work/fern-and-kettle/">Fern</a></main>`;
  files["src/pages/work/fern-and-kettle.html"] = `<site-header></site-header><main><h1>Fern and Kettle</h1></main>`;
  files["src/pages/_parts/draft.html"] = `<main><h1>Not a page</h1></main>`;
  files["src/pages/404.html"] = `<main><h1>Page not found</h1></main>`;
  const { files: out, log } = exportNativeSite({ files });
  assert.deepEqual(
    Object.keys(out).filter((path) => path.endsWith(".html")).sort(),
    ["404.html", "about/index.html", "index.html", "work/fern-and-kettle/index.html", "work/index.html"],
  );
  const fern = text(out["work/fern-and-kettle/index.html"]);
  assert.ok(fern.includes("<title>Fern &amp; Kettle · Native Studio</title>"));
  assert.ok(fern.includes('<meta name="description" content="A café in Frome.">'));
  assert.ok(fern.includes('<link rel="canonical" href="https://example.test/work/fern-and-kettle/">'));
  assert.ok(text(out["work/index.html"]).includes('<a href="/work/fern-and-kettle/">Fern</a>'));
  assert.ok(text(out["sitemap.xml"]).includes("<loc>https://example.test/work/fern-and-kettle/</loc>"));
  assert.ok(log.includes("/work/fern-and-kettle/ -> work/fern-and-kettle/index.html"));
  assert.ok(log.some((line) => /^warning: native.json has metadata for \/gone\/, but no page gives that route/.test(line)));
  // A file and a folder's index on one route: the index wins, with a warning.
  files["src/pages/work.html"] = `<main><h1>Old work</h1></main>`;
  const conflict = exportNativeSite({ files });
  assert.ok(text(conflict.files["work/index.html"]).includes("<h1>Work</h1>"));
  assert.ok(conflict.log.some((line) => line.startsWith("warning: src/pages/work.html and src/pages/work/index.html both give the route /work/")));
});

test("sitemap.xml and robots.txt come from the routes and site.json, unless the repository supplies them", () => {
  const { files: out } = exportNativeSite({ files: withSite({ contentSignals: { search: "yes", "ai-input": "yes", "ai-train": "no" } }) });
  assert.equal(
    text(out["sitemap.xml"]),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.test/</loc></url>
  <url><loc>https://example.test/about/</loc></url>
</urlset>
`,
  );
  assert.equal(
    text(out["robots.txt"]),
    "User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\n\nSitemap: https://example.test/sitemap.xml\n",
  );
  // No site URL: neither file, since both need absolute URLs.
  const bare = exportNativeSite({ files: fixtureFiles() }).files;
  assert.equal(bare["sitemap.xml"], undefined);
  assert.equal(bare["robots.txt"], undefined);
  // The repository's own robots.txt (under src/public/) wins.
  const files = withSite();
  files["src/public/robots.txt"] = "User-agent: *\nDisallow: /drafts/\n";
  files["src/public/.well-known/security.txt"] = "Contact: mailto:a@example.test\n";
  const own = exportNativeSite({ files });
  assert.equal(text(own.files["robots.txt"]), "User-agent: *\nDisallow: /drafts/\n");
  assert.ok(own.files[".well-known/security.txt"]);
  assert.ok(own.log.includes("assets -> 2 images, 5 stylesheets, _headers, sitemap.xml, 2 public files"));
  assert.throws(() => exportNativeSite({ files: withSite({ contentSignals: { search: true } }) }), /contentSignals/);
  const clash = withSite();
  clash["src/public/index.html"] = "<p>no</p>";
  assert.throws(() => exportNativeSite({ files: clash }), /src\/public\/index.html would overwrite the exported index.html/);
});

test("src/public/_redirects reaches the site root as it is, for Cloudflare's static assets", () => {
  const files = withSite();
  files["src/public/_redirects"] = "/about/ /company/ 301\n/about/us/ /company/us/ 301\n";
  const { files: out } = exportNativeSite({ files });
  assert.equal(text(out["_redirects"]), "/about/ /company/ 301\n/about/us/ /company/us/ 301\n");
  assert.ok(out["_headers"]);
});

test("indexable: false asks search engines to stay away", () => {
  const { files: out } = exportNativeSite({ files: withSite({ indexable: false }) });
  assert.ok(text(out["_headers"]).includes("/*\n  Cache-Control: max-age=0, must-revalidate\n"));
  assert.ok(text(out["_headers"]).includes("  X-Robots-Tag: noindex, nofollow\n"));
  assert.ok(text(out["index.html"]).includes('<meta name="robots" content="noindex">'));
  assert.ok(text(out["about/index.html"]).includes('<meta name="robots" content="noindex">'));
  assert.equal(text(out["robots.txt"]), "User-agent: *\nAllow: /\n");
  const indexed = exportNativeSite({ files: withSite() }).files;
  assert.ok(!text(indexed["_headers"]).includes("X-Robots-Tag"));
  assert.ok(!text(indexed["index.html"]).includes('name="robots"'));
  assert.throws(() => exportNativeSite({ files: withSite({ indexable: "no" }) }), /"indexable" must be true or false/);
});

test("_headers carries the security headers, allowing inline styles only when a page has them", () => {
  const headers = text(exportNativeSite({ files: fixtureFiles() }).files["_headers"]);
  assert.ok(headers.includes(
    "  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'\n" +
      "  X-Content-Type-Options: nosniff\n" +
      "  Referrer-Policy: strict-origin-when-cross-origin\n" +
      "  Permissions-Policy: camera=(), microphone=(), geolocation=()\n",
  ));
  assert.ok(!headers.includes("Strict-Transport-Security"), "HSTS is left to the Cloudflare zone");
  const files = fixtureFiles();
  files["src/pages/about.html"] = `<p style="color: red">Red</p>`;
  assert.ok(text(exportNativeSite({ files }).files["_headers"]).includes("style-src 'self' 'unsafe-inline';"));
});

test("site.json organization becomes Organization and WebSite JSON-LD on the home page; a route may add its own", () => {
  const files = withSite({
    organization: {
      type: "ProfessionalService",
      email: "hello@example.test",
      telephone: "+44 20 7946 0000",
      address: { streetAddress: "1 Lane", addressLocality: "Leeds", addressCountry: "GB" },
      areaServed: "GB",
      foundingDate: "2019",
      sameAs: ["https://social.example/studio"],
      logo: "src/images/placeholder.svg",
    },
  });
  routeEntry(files, "/about/", { file: "src/pages/about.html", jsonLd: { "@context": "https://schema.org", "@type": "AboutPage", name: "About </script>" } });
  const { files: out } = exportNativeSite({ files });
  const blocks = (html: string) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const [home] = blocks(text(out["index.html"]));
  const logo = `https://example.test/assets/images/placeholder.${contentHash(files["src/images/placeholder.svg"])}.svg`;
  assert.deepEqual(home, {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfessionalService",
        "@id": "https://example.test/#organization",
        name: "Native Studio",
        url: "https://example.test/",
        description: "A studio.",
        logo,
        email: "hello@example.test",
        telephone: "+44 20 7946 0000",
        foundingDate: "2019",
        areaServed: "GB",
        sameAs: ["https://social.example/studio"],
        address: { "@type": "PostalAddress", streetAddress: "1 Lane", addressLocality: "Leeds", addressCountry: "GB" },
      },
      {
        "@type": "WebSite",
        name: "Native Studio",
        url: "https://example.test/",
        description: "A studio.",
        inLanguage: "en-GB",
        publisher: { "@id": "https://example.test/#organization" },
      },
    ],
  });
  const about = text(out["about/index.html"]);
  assert.ok(about.includes("About \\u003c/script>"), "a closing tag in the data cannot end the script element");
  assert.deepEqual(blocks(about), [{ "@context": "https://schema.org", "@type": "AboutPage", name: "About </script>" }]);
  // Without an organization, the home page still gets WebSite.
  assert.equal(blocks(text(exportNativeSite({ files: withSite() }).files["index.html"]))[0]["@graph"][0]["@type"], "WebSite");
  const bad = fixtureFiles();
  routeEntry(bad, "/about/", { file: "src/pages/about.html", jsonLd: "nope" });
  assert.throws(() => exportNativeSite({ files: bad }), /"jsonLd" must be an object or an array of objects/);
  const typed = text(exportNativeSite({ files: withSite({ organization: { "@type": "LocalBusiness" } }) }).files["index.html"]);
  assert.ok(typed.includes('"@graph":[{"@type":"LocalBusiness"'), "@type works as well as type");
  assert.throws(() => exportNativeSite({ files: withSite({ organization: { sameAs: "x" } }) }), /"sameAs" must be an array/);
});

test("social metadata uses the full title, the image alt and a raster image's size, and warns about SVG images", () => {
  const files = withSite({ image: "src/images/card.png", imageAlt: "A desk & a mug" });
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0xb0, 0, 0, 2, 0x76]);
  files["src/images/card.png"] = png;
  const { files: out, log } = exportNativeSite({ files });
  const about = text(out["about/index.html"]);
  assert.ok(about.includes('<meta property="og:title" content="About this project · Native Studio">'));
  assert.ok(about.includes('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">'));
  assert.ok(about.includes('<meta property="og:image:alt" content="A desk &amp; a mug">'));
  assert.ok(!log.some((line) => line.startsWith("warning:")));
  const svg = exportNativeSite({ files: withSite() });
  const home = text(svg.files["index.html"]);
  assert.ok(!home.includes("og:image:width"), "an SVG's size is not given");
  assert.deepEqual(svg.log.filter((line) => line.startsWith("warning:")), [
    "warning: the social image src/images/studio-desk.svg is an SVG, which Facebook, LinkedIn, X, Slack and WhatsApp do not show; use a PNG or JPEG (1200×630).",
  ]);
});

test("shared stylesheets are joined into one site stylesheet, linked once per document and shadow root", () => {
  const files = fixtureFiles();
  const manifest = JSON.parse(text(files[".astro-editor/native.json"]));
  manifest.styles = ["src/styles/site.css", "src/styles/extra.css"];
  files[".astro-editor/native.json"] = JSON.stringify(manifest);
  files["src/styles/site.css"] = "@layer base, extra;\n@layer base { p { color: red; } }\n";
  files["src/styles/extra.css"] = `@import "parts/more.css" layer(extra);\n@layer extra { p { color: blue; } }\n`;
  files["src/styles/parts/more.css"] = ".more {}";
  const { files: out, log } = exportNativeSite({ files });
  const siteFile = Object.keys(out).find((path) => /^assets\/site\.\w+\.css$/.test(path))!;
  // The first file's layer order leads; an imported file is inlined where its import stands.
  assert.equal(
    text(out[siteFile]),
    `@layer base, extra;\n/* src/styles/site.css */\n@layer base { p { color: red; } }\n\n/* src/styles/extra.css */\n@layer extra {\n/* src/styles/parts/more.css */\n.more {}\n}\n@layer extra { p { color: blue; } }\n`,
  );
  const home = text(out["index.html"]);
  assert.equal(home.split(`href="/${siteFile}"`).length - 1, 1 + home.split("<template shadowrootmode").length - 1);
  assert.equal(home.split("<style").length - 1, 0, "component styles are files, not inline");
  // Component sheets are preloaded from the head of the pages that use them.
  const cardName = `project-card.${contentHash(withSlottedRules(text(files["src/components/project-card/project-card.css"])))}.css`;
  assert.ok(home.includes(`<link rel="preload" href="/assets/${cardName}" as="style">`));
  assert.ok(!text(out["about/index.html"]).includes(cardName));
  assert.ok(!log.some((line) => line.startsWith("warning:")), "a layered import needs no warning");
  // An external import in a later file moves ahead of the files before it: unlayered, that gets a warning.
  files["src/styles/extra.css"] = `@import "https://fonts.example/css" layer(extra);\n`;
  assert.ok(!exportNativeSite({ files }).log.some((line) => line.startsWith("warning:")));
  files["src/styles/extra.css"] = `@import "https://fonts.example/css";\n`;
  assert.ok(exportNativeSite({ files }).log.some((line) => line.startsWith("warning: src/styles/extra.css imports https://fonts.example/css outside a layer")));
});

test("a site with no manifest exports exactly as its manifest would have it", () => {
  const files = fixtureFiles();
  files[".astro-editor/site.json"] = site;
  const withManifest = exportNativeSite({ files });
  // The starter's manifest names what the conventions find: every page by its
  // place, every src/components/<tag>/<tag>.html, and src/styles/site.css.
  delete files[".astro-editor/native.json"];
  const without = exportNativeSite({ files });
  assert.deepEqual(without.files, withManifest.files);
  assert.deepEqual(without.log, withManifest.log);

  // src/site.json stands in for .astro-editor/site.json; the latter wins when both exist.
  delete files[".astro-editor/site.json"];
  files["src/site.json"] = site;
  assert.deepEqual(exportNativeSite({ files }).files, withManifest.files);
  files[".astro-editor/site.json"] = JSON.stringify({ name: "Elsewhere" });
  assert.ok(text(exportNativeSite({ files }).files["index.html"]).includes(" · Elsewhere</title>"));
  files[".astro-editor/site.json"] = "{";
  assert.throws(() => exportNativeSite({ files }), /\.astro-editor\/site\.json is not valid JSON/);
  delete files[".astro-editor/site.json"];
  files["src/site.json"] = "[]";
  assert.throws(() => exportNativeSite({ files }), /src\/site\.json must be a JSON object/);
});

test("exports the manifest-less conventions fixture: comment titles, convention components and site.css with its imports", () => {
  const files = fixtureFiles("fixtures/native-conventions");
  assert.equal(files[".astro-editor/native.json"], undefined);
  const { files: out, log } = exportNativeSite({ files });
  assert.deepEqual(Object.keys(out).filter((path) => path.endsWith(".html")).sort(), ["index.html", "notes/first-note/index.html"]);
  assert.deepEqual(
    Object.keys(out).filter((path) => path.startsWith("assets/")).map((path) => path.replace(/\.[0-9a-f]{10}\.css$/, ".css")).sort(),
    ["assets/promo-card.css", "assets/site-header.css", "assets/site.css"],
  );
  assert.ok(!log.some((line) => line.startsWith("warning:")), log.join("\n"));
  const home = text(out["index.html"]);
  assert.ok(home.includes("<title>Built by convention · Conventions</title>"));
  assert.ok(home.includes('<meta name="description" content="A site with no native.json: its pages, components and styles are found where they are.">'));
  assert.ok(home.includes('<html lang="en-GB">'));
  assert.ok(!home.includes("title: Built by convention"), "the page comment is not published");
  assert.ok(/<site-header><template shadowrootmode="open">/.test(home));
  assert.ok(/<promo-card><template shadowrootmode="open">/.test(home));
  assert.ok(text(out["notes/first-note/index.html"]).includes("<title>The first note · Conventions</title>"));
  assert.ok(text(out["sitemap.xml"]).includes("https://conventions.example/notes/first-note/"));
  // The shared stylesheet is site.css alone, with the files it imports inlined in their layers.
  const siteCss = text(Object.entries(out).find(([path]) => /^assets\/site\.[0-9a-f]{10}\.css$/.test(path))![1]);
  assert.ok(!siteCss.includes("@import"));
  assert.ok(siteCss.startsWith("@layer base, layout;\n/* src/styles/site.css */\n@layer base {\n/* src/styles/base.css */\n"), siteCss);
});
