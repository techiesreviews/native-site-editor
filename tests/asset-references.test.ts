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

test("a moving stylesheet with relative paths, or a file using another moving file, is refused", () => {
  assert.throws(() => planAssetReferenceRewrites({ "styles/site.css": ".a { background: url(../images/x.svg); }" }, [{ from: "styles/site.css", to: "css/site.css" }]), /relative paths/);
  assert.throws(() => planAssetReferenceRewrites({ "styles/site.css": ".a { background: url(/images/a.svg); }" }, [...move, { from: "styles/site.css", to: "css/site.css" }]), /moves with it/);
  // A moving page with relative links is fine: pages are not rebased here.
  assert.equal(planAssetReferenceRewrites({ "work/a/index.html": '<img src="../../images/c.svg">' }, [...move, { from: "work/a/index.html", to: "work/b/index.html" }]).size, 0);
});

test("a file in use by pages, stylesheets or the JSON recipe cannot be deleted", () => {
  const sidecar = JSON.stringify({ version: 1, pages: { "work/one/index.html": { fields: { photo: "/images/p.svg" } } }, collections: { c: { pagePath: "index.html", target: { path: [0], tag: "div", openingTagFingerprint: "<div>" }, folders: ["/work/"], sort: "", filter: "", limit: 6, template: '<img src="/images/t.svg">', fields: ["pic"], overrides: { "work/one/index.html": { pic: "/images/o.svg" } } } } });
  const sources = { "index.html": '<img src="/images/a.svg">', "styles/site.css": "a{background:url(/images/s.svg)}", ".editor/page-builder.json": sidecar };
  const users = assetUsers(sources, ["images/a.svg", "images/s.svg", "images/t.svg", "images/o.svg", "images/p.svg", "images/free.svg"]);
  assert.deepEqual(Object.fromEntries(users), {
    "images/a.svg": ["index.html"], "images/s.svg": ["styles/site.css"],
    "images/t.svg": [".editor/page-builder.json"], "images/o.svg": [".editor/page-builder.json"], "images/p.svg": [".editor/page-builder.json"],
  });
  assert.match(assetInUseProblem(users)!, /images\/a\.svg is used by index\.html;.*nothing was deleted\.$/);
  assert.equal(assetInUseProblem(assetUsers(sources, ["images/free.svg"])), undefined);
  // Deleted together with the page that uses it: nothing is left pointing at it.
  assert.equal(assetUsers({ "work/a/index.html": '<img src="/work/a/x.svg">' }, ["work/a/index.html", "work/a/x.svg"]).size, 0);
});
