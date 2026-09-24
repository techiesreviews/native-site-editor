import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { contentHash, exportNativeSite, imageDimensions, pageMeta, type FileContent } from "../shared/native-export.ts";

const fixture = "fixtures/native-starter";

function fixtureFiles() {
  const files: Record<string, FileContent> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(fixture, full);
        files[path] = /\.(html|css|json)$/.test(name) ? readFileSync(full, "utf8") : new Uint8Array(readFileSync(full));
      }
    }
  };
  walk(fixture);
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

  const css = text(files["src/styles/site.css"]);
  const cssName = `site.${contentHash(css)}.css`;
  assert.equal(text(out[`assets/${cssName}`]), css);
  assert.ok(home.includes(`<link rel="stylesheet" href="/assets/${cssName}">`));

  // Components become declarative shadow DOM that links the shared sheet and
  // inlines the component's own stylesheet; nested components expand too.
  assert.ok(home.includes(`<site-header data-key="header"><template shadowrootmode="open"><link rel="stylesheet" href="/assets/${cssName}"><style>`));
  assert.ok(home.includes(".site-header"));
  assert.ok(/<project-card[^>]*><template shadowrootmode="open">[\s\S]*<card-note[^>]*><template shadowrootmode="open">/.test(home));
  assert.ok(!home.includes("#/about/"), "hash routes become paths");
  assert.ok(home.includes('href="/about/"'));
  assert.ok(home.includes('<a href="/" data-key="nav-home" aria-current="page">'));
  assert.ok(about.includes('<a href="/about/" data-key="nav-about" aria-current="page">'));
  assert.ok(!about.includes('href="/" data-key="nav-home" aria-current'));

  // Images are copied under hashed names, referenced with size attributes.
  const placeholder = files["src/images/placeholder.svg"] as Uint8Array;
  const imageName = `placeholder.${contentHash(placeholder)}.svg`;
  assert.deepEqual(out[`assets/images/${imageName}`], placeholder);
  const size = imageDimensions(placeholder, ".svg");
  assert.ok(size);
  assert.ok(home.includes(`<img class="hero-image" src="/assets/images/${imageName}" data-key="hero-image" width="${size.width}" height="${size.height}">`));
  assert.ok(!/hero-image[^>]*loading="lazy"/.test(home), "the first section's image is not lazy");

  // Head: title from the h1 with the site name, description from the first p.
  assert.ok(home.includes("<title>A native browser preview · Native Studio</title>"));
  assert.ok(home.includes('<meta name="description" content="Edit plain HTML, CSS, and shared component templates'));
  assert.ok(home.includes('<link rel="canonical" href="https://example.test/">'));
  assert.ok(about.includes('<link rel="canonical" href="https://example.test/about/">'));
  assert.ok(home.includes('<meta property="og:locale" content="en_GB">'));
  assert.ok(home.includes('<html lang="en">'));
  assert.ok(home.includes(`<meta property="og:image" content="https://example.test/assets/images/studio-desk.${contentHash(files["src/images/studio-desk.svg"])}.svg">`));
  assert.ok(home.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(!home.includes("<script"));

  assert.ok(text(out["_headers"]).includes("/assets/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable"));
  assert.deepEqual(log, ["/ -> index.html", "/about/ -> about/index.html", "assets -> 2 images, 1 stylesheets, _headers"]);
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
  assert.ok(about.includes('<meta property="og:title" content="About us">'));
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
