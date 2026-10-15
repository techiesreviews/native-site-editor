import { test } from "node:test";
import assert from "node:assert/strict";
import { assetInUseProblem, assetMoves, assetUsers, planAssetReferenceRewrites } from "../src/page-builder/asset-references.ts";

const move = [{ from: "images/a.svg", to: "images/b.svg" }];

test("a moved image is rewritten in every page and stylesheet that uses it, and nowhere else", () => {
  const sources = {
    "index.html": '<head><meta property="og:image" content="/images/a.svg"></head><img src="/images/a.svg" srcset="/images/a.svg 1x, /images/c.svg 2x"><img src="https://example.com/images/a.svg"><a href="images/a.svg?v=2#x">get</a>',
    "work/one/index.html": '<img src="../../images/a.svg" alt="">',
    "styles/site.css": '.hero { background: url("/images/a.svg"); }',
    "about/index.html": '<img src="/images/c.svg">',
  };
  const edits = planAssetReferenceRewrites(sources, move);
  assert.deepEqual([...edits.keys()].sort(), ["index.html", "styles/site.css", "work/one/index.html"]);
  assert.equal(edits.get("index.html"), '<head><meta property="og:image" content="/images/b.svg"></head><img src="/images/b.svg" srcset="/images/b.svg 1x, /images/c.svg 2x"><img src="https://example.com/images/a.svg"><a href="/images/b.svg?v=2#x">get</a>');
  assert.equal(edits.get("styles/site.css"), '.hero { background: url("/images/b.svg"); }');
  assert.match(edits.get("work/one/index.html")!, /src="\/images\/b\.svg"/);
});

test("page moves are left to Change URL, and nothing is read when only pages move", () => {
  assert.deepEqual(assetMoves([{ from: "work/a/index.html", to: "work/b/index.html" }]), []);
  assert.equal(planAssetReferenceRewrites({ "index.html": '<a href="/work/a/">a</a>' }, [{ from: "work/a/index.html", to: "work/b/index.html" }]).size, 0);
});

test("moved files keep relative paths only when they still point at the same file; links already rewritten are kept", () => {
  // A stylesheet moving away from the image it uses relatively: refused.
  assert.throws(() => planAssetReferenceRewrites({ "styles/site.css": ".a { background: url(../images/x.svg); }" }, [{ from: "styles/site.css", to: "css/deep/site.css" }, ...move]), /relative path.*nothing was moved/);
  // A page and its image moving together as a folder: the relative path still works and is kept;
  // an absolute one elsewhere follows, on top of the link edits already planned.
  const folder = [{ from: "work/a/index.html", to: "work/b/index.html" }, { from: "work/a/photo.svg", to: "work/b/photo.svg" }];
  const sources = {
    "work/a/index.html": '<head><meta property="og:image" content="/work/a/photo.svg"></head><img src="photo.svg">',
    "index.html": '<a href="/work/a/">A</a><img srcset="/work/a/photo.svg 2x" src="/work/a/photo.svg">',
    "styles/site.css": ".a{background:url(/work/a/photo.svg)}",
  };
  const base = new Map([["index.html", '<a href="/work/b/">A</a><img srcset="/work/a/photo.svg 2x" src="/work/a/photo.svg">']]);
  const edits = planAssetReferenceRewrites(sources, folder, base);
  assert.equal(edits.get("index.html"), '<a href="/work/b/">A</a><img srcset="/work/b/photo.svg 2x" src="/work/b/photo.svg">');
  assert.equal(edits.get("work/b/index.html"), '<head><meta property="og:image" content="/work/b/photo.svg"></head><img src="photo.svg">');
  assert.equal(edits.get("styles/site.css"), ".a{background:url(/work/b/photo.svg)}");
  assert.ok(!edits.has("work/a/index.html"));
  // A moving page whose relative image stays behind: refused.
  assert.throws(() => planAssetReferenceRewrites({ "work/a/index.html": '<img src="../../images/c.svg">' }, [{ from: "work/a/index.html", to: "work/a/deep/index.html" }, ...move]), /relative path/);
});

test("a file in use by pages or stylesheets cannot be deleted", () => {
  const sources = { "index.html": '<img src="/images/a.svg">', "styles/site.css": "a{background:url(/images/s.svg)}" };
  const users = assetUsers(sources, ["images/a.svg", "images/s.svg", "images/t.svg", "images/o.svg", "images/p.svg", "images/free.svg"]);
  assert.deepEqual(Object.fromEntries(users), {
    "images/a.svg": ["index.html"], "images/s.svg": ["styles/site.css"],
  });
  assert.equal(users.has("images/p.svg"), false);
  assert.match(assetInUseProblem(users)!, /images\/a\.svg is used by index\.html;.*nothing was deleted\.$/);
  assert.equal(assetInUseProblem(assetUsers(sources, ["images/free.svg"])), undefined);
  // Deleted together with the page that uses it: nothing is left pointing at it.
  assert.equal(assetUsers({ "work/a/index.html": '<img src="/work/a/x.svg">' }, ["work/a/index.html", "work/a/x.svg"]).size, 0);
});

test("wide users cover scripts, SVG, notes and own-domain sharing but exclude foreign hosts", () => {
  const users = assetUsers({
    "index.html": '<meta property="og:image" content="https://www.native.example/images/a.png">',
    "app.js": '"/images/a.png"', "AGENTS.md": "a.png", "embedded.svg": '<image href="/images/a.png"/>',
    "foreign.json": '"https://outside.example/images/a.png"', ".editor/media.json": '"images/a.png"',
  }, ["images/a.png"], { origins: ["https://native.example"] });
  assert.deepEqual(users.get("images/a.png"), ["index.html", "embedded.svg", "app.js", "AGENTS.md"]);
});

test("Files usage follows template-relative URLs against their page, including dot segments", () => {
  const users = assetUsers({
    "nested/index.html": '<my-card></my-card>',
    "components/card.html": '<img src="unused/../images/a.png">',
  }, ["nested/images/a.png"], { origins: [], pages: ["nested/index.html"], components: { "my-card": "components/card.html" } });
  assert.deepEqual(users.get("nested/images/a.png"), ["components/card.html"]);
});

test("file moves recognise prefixed root uses and write the new prefixed address", () => {
  const result = planAssetReferenceRewrites({ "index.html": '<img src="/my-site/images/a.svg"><img src="/images/a.svg">' }, move, new Map(), "/my-site");
  assert.equal(result.get("index.html"), '<img src="/my-site/images/b.svg"><img src="/my-site/images/b.svg">');
});

test("sub-folder in-use checks and rewrites recognise prefixed and legacy root addresses", () => {
  const sources = { "index.html": '<img src="/my-site/media/a.webp"><img src="/media/a.webp">', "notes.md": '/my-site/media/a.webp' };
  const users = assetUsers(sources, ["media/a.webp"], { prefix: "/my-site", origins: [] });
  assert.deepEqual(users.get("media/a.webp"), ["index.html", "notes.md"]);
  assert.match(assetInUseProblem(users)!, /media\/a.webp is used by index.html, notes.md/);
  const edits = planAssetReferenceRewrites(sources, [{ from: "media/a.webp", to: "media/b.webp" }], new Map(), "/my-site");
  assert.equal(edits.get("index.html"), '<img src="/my-site/media/b.webp"><img src="/my-site/media/b.webp">');
});
