import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { contentHash, exportNativeSite, imageDimensions, pageMeta, type FileContent } from "../shared/native-export.ts";

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
  // and the component's own; nested components expand too.
  const headerCss = text(files["src/components/site-header/site-header.css"]);
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

test("stylesheets a shared sheet imports become hashed assets the import points at", () => {
  const files = fixtureFiles();
  files["src/styles/site.css"] =
    `@import url("sections.css") layer(sections) supports(display: grid) screen;\n@import "https://fonts.example/css";\n` +
    text(files["src/styles/site.css"]);
  files["src/styles/sections.css"] = `@import "./parts/deep.css" layer(deep);\n` + text(files["src/styles/sections.css"]);
  files["src/styles/parts/deep.css"] = ".deep { color: red; }";
  const { files: out, log } = exportNativeSite({ files });
  const deepName = `deep.${contentHash(".deep { color: red; }")}.css`;
  assert.equal(text(out[`assets/${deepName}`]), ".deep { color: red; }");
  const sections = text(files["src/styles/sections.css"]).replace(`"./parts/deep.css"`, `url("/assets/${deepName}")`);
  const sectionsName = `sections.${contentHash(sections)}.css`;
  assert.equal(text(out[`assets/${sectionsName}`]), sections);
  const site = text(out[Object.keys(out).find((path) => /^assets\/site\.\w+\.css$/.test(path))!]);
  // The layer, supports() and media stay; the external import is untouched.
  assert.ok(site.startsWith(`@import url("/assets/${sectionsName}") layer(sections) supports(display: grid) screen;\n@import "https://fonts.example/css";\n`));
  // Only the manifest's stylesheets are linked; imports load through them.
  const home = text(out["index.html"]);
  assert.ok(home.includes(`<link rel="stylesheet" href="/assets/site.`));
  assert.ok(!home.includes(`href="/assets/${sectionsName}"`));
  assert.ok(log.includes("assets -> 2 images, 7 stylesheets, _headers"));
});

test("fails closed on a missing or circular stylesheet import", () => {
  const missing = fixtureFiles();
  missing["src/styles/site.css"] = `@import "gone.css";\n` + text(missing["src/styles/site.css"]);
  assert.throws(() => exportNativeSite({ files: missing }), /src\/styles\/site.css imports src\/styles\/gone.css, which is missing/);
  const circular = fixtureFiles();
  circular["src/styles/site.css"] = `@import "sections.css";\n` + text(circular["src/styles/site.css"]);
  circular["src/styles/sections.css"] = `@import "site.css";\n.filler {}`;
  assert.throws(() => exportNativeSite({ files: circular }), /sections.css imports src\/styles\/site.css, which imports it back/);
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
  const moreUrl = `/assets/more.${contentHash(".more {}")}.css`;
  // Imports lead the file, after the first file's layer order statement.
  assert.equal(
    text(out[siteFile]),
    `@layer base, extra;\n@import url("${moreUrl}") layer(extra);\n/* src/styles/site.css */\n@layer base { p { color: red; } }\n\n/* src/styles/extra.css */\n@layer extra { p { color: blue; } }\n`,
  );
  const home = text(out["index.html"]);
  assert.equal(home.split(`href="/${siteFile}"`).length - 1, 1 + home.split("<template shadowrootmode").length - 1);
  assert.equal(home.split("<style").length - 1, 0, "component styles are files, not inline");
  // Component sheets are preloaded from the head of the pages that use them.
  const cardName = `project-card.${contentHash(text(files["src/components/project-card/project-card.css"]))}.css`;
  assert.ok(home.includes(`<link rel="preload" href="/assets/${cardName}" as="style">`));
  assert.ok(!text(out["about/index.html"]).includes(cardName));
  assert.ok(!log.some((line) => line.startsWith("warning:")), "a layered import needs no warning");
  files["src/styles/extra.css"] = `@import "parts/more.css";\n`;
  assert.ok(exportNativeSite({ files }).log.some((line) => line.startsWith("warning: src/styles/extra.css is not first")));
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
    ["assets/base.css", "assets/layout.css", "assets/promo-card.css", "assets/site-header.css", "assets/site.css"],
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
  // The shared stylesheet is site.css alone; the files it imports are assets it points at.
  const siteCss = text(Object.entries(out).find(([path]) => /^assets\/site\.[0-9a-f]{10}\.css$/.test(path))![1]);
  assert.ok(!siteCss.includes("src/styles/base.css"));
  assert.match(siteCss, /@import url\("\/assets\/base\.[0-9a-f]{10}\.css"\) layer\(base\);/);
});
