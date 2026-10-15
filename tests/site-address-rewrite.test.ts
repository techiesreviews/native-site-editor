import assert from "node:assert/strict";
import { test } from "node:test";
import { moveSiteAddress, siteSettingsWithMove, planSiteAddressRewrite, planSiteAddressRewriteInSlices, siteAddressConfirm, siteAddressDone, siteAddressFiles, siteFolderChanges } from "../src/page-builder/site-address-rewrite.ts";

const PROJECT = "https://user.github.io/my-site/";
const OWN = "https://example.com/";
// Extra paths are files whose text has no addresses.
const files = (sources: Record<string, string>, extra: string[] = []) => ({ paths: [...Object.keys(sources), ...extra], source: (path: string) => sources[path] ?? (extra.includes(path) ? "" : undefined) });
const plan = (from: string, to: string, sources: Record<string, string>, extra: string[] = []) => planSiteAddressRewrite({ from, to, ...files(sources, extra) });

const page = (prefix: string, origin = "https://user.github.io") => `<!doctype html>
<head>
  <link rel="stylesheet" href="${prefix}/styles/site.css">
  <link rel="canonical" href="${origin}${prefix}/about/">
  <meta property="og:image" content="${origin}${prefix}/media/hero.webp">
  <script type="module" src="${prefix}/components/components.js"></script>
</head>
<body>
  <a href="${prefix}/">Home</a> <a href="${prefix}/about/#team">About</a> <a href="https://elsewhere.test/about/">Out</a>
  <img src="${prefix}/media/hero.webp" srcset="${prefix}/media/hero.webp 1x, ${prefix}/media/hero%20big.webp 2x" alt="">
  <a href="https://user.github.io/other-site/x/">Another project site</a> <a href="notes/">Relative</a>
</body>`;
const site = (prefix: string, origin?: string) => ({
  "index.html": page(prefix, origin),
  "styles/site.css": `@import "${prefix}/styles/base.css";\nbody { background: url(${prefix}/media/hero.webp); }\n`,
  "styles/base.css": "p { color: red; }\n",
  "about/index.html": `<p><a href="${prefix}/">Back</a></p>`,
});
const binaries = ["media/hero.webp", "media/hero big.webp", "components/components.js"];

test("the folder changes only when the decoded path part differs", () => {
  assert.equal(siteFolderChanges("", PROJECT), true);
  assert.equal(siteFolderChanges(PROJECT, OWN), true);
  assert.equal(siteFolderChanges(PROJECT, "https://user.github.io/new-site/"), true);
  assert.equal(siteFolderChanges(PROJECT, "https://www.example.com/my-site"), false);
  assert.equal(siteFolderChanges("https://x.test/caf%C3%A9/", "https://y.test/café/index.html"), false);
  assert.equal(siteFolderChanges("", OWN), false);
  assert.deepEqual(siteAddressFiles([".editor/config.json", "CNAME", "index.html", "media/a.webp", "_redirects", "a.js", "README.md"]), ["index.html", "_redirects", "a.js", "README.md"]);
});

test("adding a folder prefixes every root address and full own address", () => {
  const before = site("", "https://example.com");
  const result = plan(OWN, PROJECT, before, binaries);
  assert.equal(result.missing, undefined);
  assert.deepEqual(result, plan(OWN, PROJECT, before, binaries), "the plan is pure");
  assert.deepEqual(Object.fromEntries(result.edits), {
    "index.html": page("/my-site"),
    "styles/site.css": site("/my-site")["styles/site.css"],
    "about/index.html": site("/my-site")["about/index.html"],
  });
  // Stylesheet, canonical, og:image, loader, two links, img, two srcset, CSS @import and url(), Back.
  assert.equal(result.count, 12);
  assert.equal(siteAddressConfirm(result), "This updates 12 links in 3 files to the new address. Undo is available.");
  assert.equal(siteAddressDone(result), "Site settings applied as drafts. Updated 12 links in 3 files to the new address. Publish to keep them.");
});

test("a site with no address before gains the prefix on root links; full addresses stay (no known host)", () => {
  const before = site("", "https://example.com");
  const result = plan("", PROJECT, before, binaries);
  const index = result.edits.get("index.html")!;
  assert.match(index, /href="\/my-site\/styles\/site\.css"/);
  assert.match(index, /href="https:\/\/example\.com\/about\/"/);
  assert.match(index, /content="https:\/\/example\.com\/media\/hero\.webp"/);
});

test("changing and removing the folder move prefixed and plain root links alike", () => {
  const before = site("/my-site");
  before["about/index.html"] = `<p><a href="/my-site/">Back</a> <a href="/about/">Plain</a> <a href="/my-site-other/">Not ours</a></p>`;
  const moved = plan(PROJECT, "https://user.github.io/new-site/", before, binaries);
  assert.equal(moved.edits.get("index.html"), page("/new-site"));
  assert.equal(moved.edits.get("about/index.html"), `<p><a href="/new-site/">Back</a> <a href="/new-site/about/">Plain</a> <a href="/new-site/my-site-other/">Not ours</a></p>`);
  const removed = plan(PROJECT, OWN, before, binaries);
  assert.equal(removed.edits.get("index.html"), page("", "https://example.com"));
  assert.equal(removed.edits.get("about/index.html"), `<p><a href="/">Back</a> <a href="/about/">Plain</a> <a href="/my-site-other/">Not ours</a></p>`);
  // Removing the address: root links lose the folder; full addresses have no new host and stay.
  const cleared = plan(PROJECT, "", before, binaries);
  assert.match(cleared.edits.get("index.html")!, /<link rel="canonical" href="https:\/\/user\.github\.io\/my-site\/about\/">/);
  assert.match(cleared.edits.get("index.html")!, /<a href="\/about\/#team">/);
});

test("outside links, other project sites, relative links and the same-folder case stay byte for byte", () => {
  const before = site("/my-site");
  const result = plan(PROJECT, "https://user.github.io/new-site/", before, binaries);
  const index = result.edits.get("index.html")!;
  assert.match(index, /href="https:\/\/elsewhere\.test\/about\/"/);
  assert.match(index, /href="https:\/\/user\.github\.io\/other-site\/x\/"/);
  assert.match(index, /href="notes\/"/);
  assert.equal(plan(PROJECT, "https://www.example.com/my-site/", before, binaries).edits.size, 0);
  assert.equal(plan("", OWN, site(""), binaries).count, 0);
});

test("links already under the new folder are not doubled, unless the site has a folder of that name", () => {
  const sources = { "index.html": `<a href="/my-site/about/">A</a> <a href="/about/">B</a>` };
  assert.equal(plan("", PROJECT, sources).edits.get("index.html"), `<a href="/my-site/about/">A</a> <a href="/my-site/about/">B</a>`);
  assert.equal(plan("", PROJECT, sources, ["my-site/about/index.html"]).edits.get("index.html"), `<a href="/my-site/my-site/about/">A</a> <a href="/my-site/about/">B</a>`);
});

test("scripts and plain text move only addresses naming a page or file", () => {
  const sources = {
    "app.js": `const page = "/about/", parts = path.split("/"), re = /\\s+/g, gone = "/missing/", hero = '/my-site/media/hero.webp';\n`,
    "sitemap.xml": "<url><loc>https://user.github.io/my-site/about/</loc></url><url><loc>https://user.github.io/other/</loc></url>",
    "notes.txt": "Read /about/ and / or https://user.github.io/my-site/media/hero.webp.",
    "notes/paths.txt": "Pages: work/<slug>/index.html is /work/<slug>/; about/index.html   /about/. See [About](/my-site/about/) and `href=\"/my-site/about/\"`.",
    "_headers": "/my-site/media/*\n  Cache-Control: max-age=3600\n  Link: </my-site/styles/site.css>; rel=preload\n",
    "_redirects": "# moved\n/my-site/old/ /my-site/about/ 301\n/my-site/gone https://elsewhere.test/ 302\n",
    ".editor/config.json": `{ "site": { "url": "${PROJECT}", "routes": { "/about/": "about/index.html" } } }`,
  };
  const result = plan(PROJECT, OWN, sources, ["about/index.html", "media/hero.webp", "styles/site.css"]);
  assert.equal(result.edits.get("app.js"), `const page = "/about/", parts = path.split("/"), re = /\\s+/g, gone = "/missing/", hero = '/media/hero.webp';\n`);
  assert.equal(result.edits.get("sitemap.xml"), "<url><loc>https://example.com/about/</loc></url><url><loc>https://user.github.io/other/</loc></url>");
  assert.equal(result.edits.get("notes.txt"), "Read /about/ and / or https://example.com/media/hero.webp.");
  // Prose about paths stays; quoted strings and Markdown links move.
  assert.equal(result.edits.get("notes/paths.txt"), "Pages: work/<slug>/index.html is /work/<slug>/; about/index.html   /about/. See [About](/about/) and `href=\"/about/\"`.");
  assert.equal(plan("", PROJECT, { "notes/paths.txt": "work/<slug>/index.html and about/index.html   /about/" }, ["index.html", "about/index.html"]).count, 0);
  assert.equal(result.edits.get("_headers"), "/media/*\n  Cache-Control: max-age=3600\n  Link: </styles/site.css>; rel=preload\n");
  assert.equal(result.edits.get("_redirects"), "# moved\n/old/ /about/ 301\n/gone https://elsewhere.test/ 302\n");
  assert.equal(result.edits.has(".editor/config.json"), false);
});

test("spellings outside the folder survive: entities, CSS escapes, percent case, queries", () => {
  const sources = {
    "index.html": `<a href="/caf%c3%a9/a%20b/?x=1&amp;y=2#top">A</a><style>.x { background: url("/caf\\e9/m.webp"); }</style><div style="background: url(&quot;/café/n.webp&quot;)"></div>`,
  };
  const result = plan("https://u.github.io/caf%C3%A9/", "https://u.github.io/new/", sources);
  assert.equal(result.edits.get("index.html"), `<a href="/new/a%20b/?x=1&amp;y=2#top">A</a><style>.x { background: url("/new/m.webp"); }</style><div style="background: url(&quot;/new/n.webp&quot;)"></div>`);
  assert.equal(result.count, 3);
});

test("an unread text file stops the plan; the sliced plan matches the whole one", async () => {
  const missing = planSiteAddressRewrite({ from: "", to: PROJECT, paths: ["index.html", "b.html"], source: path => path === "index.html" ? `<a href="/x">` : undefined });
  assert.deepEqual({ missing: missing.missing, count: missing.count, size: missing.edits.size }, { missing: "b.html", count: 0, size: 0 });
  const sources = site("", "https://example.com");
  let pauses = 0;
  const sliced = await planSiteAddressRewriteInSlices({ from: OWN, to: PROJECT, ...files(sources, binaries), slice: 0, pause: async () => { pauses++; } });
  assert.deepEqual(sliced, plan(OWN, PROJECT, sources, binaries));
  // With no time allowed per slice, the plan gives the page its turn after every text file.
  assert.equal(pauses, siteAddressFiles(Object.keys(sources).concat(binaries)).length);
});

test("the home page's full address moves in og:url and sitemaps, whichever way the folder changes", () => {
  const home = (origin: string) => ({
    "index.html": `<meta property="og:url" content="${origin}">`,
    "sitemap.xml": `<url><loc>${origin}</loc></url><url><loc>${origin}about/</loc></url>`,
    "robots.txt": `Sitemap: ${origin}sitemap.xml\n`,
  });
  const extra = ["about/index.html"];
  for (const [from, to] of [[OWN, PROJECT], [PROJECT, "https://user.github.io/new-site/"], [PROJECT, OWN]]) {
    const result = plan(from, to, home(from), extra);
    assert.deepEqual(Object.fromEntries(result.edits), home(to), `${from} → ${to}`);
    assert.equal(result.count, 4);
  }
});

test("Site settings' stored default image moves like the pages' copies of it", () => {
  const paths = ["media/share.jpg"];
  assert.equal(moveSiteAddress("https://user.github.io/my-site/media/share.jpg", { from: PROJECT, to: OWN, paths }), "https://example.com/media/share.jpg");
  assert.equal(moveSiteAddress("/media/share.jpg", { from: OWN, to: PROJECT, paths }), "/my-site/media/share.jpg");
  assert.equal(moveSiteAddress("https://elsewhere.test/share.jpg", { from: PROJECT, to: OWN, paths }), "https://elsewhere.test/share.jpg");
  assert.equal(moveSiteAddress("/my-site/media/share.jpg", { from: PROJECT, to: "https://www.example.com/my-site/", paths }), "/my-site/media/share.jpg");
  assert.equal(moveSiteAddress("", { from: PROJECT, to: OWN, paths }), "");
});

test("the home page moves as an address field's value, never as a script's string", () => {
  const sources = {
    "manifest.webmanifest": `{ "start_url": "/", "scope": "/", "name": "/" }`,
    "index.html": `<form action="/"><button formaction='/'>Go</button></form><script>const parts = path.split("/"); const home = "/";</script>`,
  };
  const added = plan(OWN, PROJECT, sources);
  assert.equal(added.edits.get("manifest.webmanifest"), `{ "start_url": "/my-site/", "scope": "/my-site/", "name": "/" }`);
  assert.equal(added.edits.get("index.html"), `<form action="/my-site/"><button formaction='/my-site/'>Go</button></form><script>const parts = path.split("/"); const home = "/";</script>`);
  const removed = plan(PROJECT, OWN, Object.fromEntries(Object.entries(Object.fromEntries(added.edits))));
  assert.deepEqual(Object.fromEntries(removed.edits), sources);
  const changed = plan(PROJECT, "https://user.github.io/new/", Object.fromEntries(added.edits));
  assert.equal(changed.edits.get("manifest.webmanifest"), `{ "start_url": "/new/", "scope": "/new/", "name": "/" }`);
});

test("settings applied with a nested folder change move every address exactly once", () => {
  const from = PROJECT, to = "https://user.github.io/my-site/new/";
  const head = (icon: string, image: string) => `<head>\n<link rel="icon" href="${icon}">\n<meta property="og:image" content="${image}">\n</head>\n`;
  const old = "https://user.github.io/my-site/media/share.jpg";
  const sources: Record<string, string> = {
    "index.html": head("/my-site/favicon.svg", old) + `<a href="/my-site/about/">About</a>`,
    "about/index.html": head("/my-site/favicon.svg", "https://elsewhere.test/own.jpg"),
    ".editor/config.json": `{ "site": { "url": "${from}", "socialImage": "${old}" } }\n`,
  };
  const paths = [...Object.keys(sources), "favicon.svg", "media/share.jpg", "media/new-social.jpg"];
  const input = { from, to, paths, source: (path: string) => sources[path] ?? "", config: sources[".editor/config.json"], pages: ["index.html", "about/index.html"],
    before: { name: "Site", favicon: "/my-site/favicon.svg", socialImage: old } };
  const plan = planSiteAddressRewrite({ from, to, paths, source: input.source });
  // A sharing copy made for the new address is written as it is.
  const fresh = "https://user.github.io/my-site/new/media/new-social.jpg";
  const shared = siteSettingsWithMove({ ...input, plan, values: { name: "Site", favicon: "/my-site/favicon.svg", socialImage: fresh, url: to }, imageIsNew: true });
  assert.equal(shared.edits.get("index.html"), head("/my-site/new/favicon.svg", fresh) + `<a href="/my-site/new/about/">About</a>`);
  assert.equal(shared.edits.get("about/index.html"), head("/my-site/new/favicon.svg", "https://elsewhere.test/own.jpg"));
  assert.match(shared.config, new RegExp(`"socialImage": "${fresh}"`));
  // Typed values in the old address's form (unchanged, or a new root image) move once with the rest.
  const typed = siteSettingsWithMove({ ...input, plan, values: { name: "Site", favicon: "/my-site/favicon.svg", socialImage: "/my-site/media/new-social.jpg", url: to } });
  assert.equal(typed.edits.get("index.html"), head("/my-site/new/favicon.svg", "/my-site/new/media/new-social.jpg") + `<a href="/my-site/new/about/">About</a>`);
  assert.match(typed.config, /"socialImage": "\/my-site\/new\/media\/new-social\.jpg"/);
  assert.match(typed.config, /"url": "https:\/\/user\.github\.io\/my-site\/new\/"/);
  const kept = siteSettingsWithMove({ ...input, plan, values: { ...input.before, url: to } });
  assert.equal(kept.edits.get("index.html"), head("/my-site/new/favicon.svg", "https://user.github.io/my-site/new/media/share.jpg") + `<a href="/my-site/new/about/">About</a>`);
  assert.match(kept.config, /"socialImage": "https:\/\/user\.github\.io\/my-site\/new\/media\/share\.jpg"/);
});

test("Markdown links and images move; its prose and code spans stay", () => {
  const md = (prefix: string) => `# Notes\nSee [About](${prefix}/about/), [Home](${prefix}/) and ![Hero](${prefix}/media/hero.webp "Hero").\n<a href="${prefix}/about/">About</a>\nPages: work/<slug>/index.html is /work/<slug>/; about/index.html   /about/; code \`/about/\` stays.\n`;
  const extra = ["about/index.html", "media/hero.webp"];
  for (const [from, to, a, b] of [[OWN, PROJECT, "", "/my-site"], [PROJECT, "https://user.github.io/new/", "/my-site", "/new"], [PROJECT, OWN, "/my-site", ""]]) {
    const result = plan(from, to, { "notes.md": md(a) }, extra);
    assert.equal(result.edits.get("notes.md"), md(b), `${from} → ${to}`);
    assert.equal(result.count, 4);
  }
});

test("unquoted address attributes move, the home page too", () => {
  const html = (prefix: string) => `<form action=${prefix}/about/><button formaction=${prefix || ""}/>Go</button></form><script>let x=/about/; y = a/b;</script>`;
  const result = plan(OWN, PROJECT, { "index.html": html("") }, ["about/index.html"]);
  assert.equal(result.edits.get("index.html"), `<form action=/my-site/about/><button formaction=/my-site/>Go</button></form><script>let x=/about/; y = a/b;</script>`);
  assert.equal(plan(PROJECT, OWN, { "index.html": result.edits.get("index.html")! }, ["about/index.html"]).edits.get("index.html"), html(""));
});
