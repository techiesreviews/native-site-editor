import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import test from "node:test";
import { createGuestEdits, guestLinkPlan, guestSourcePaths, guestUploadFolder, sameGuestElement, type GuestEditsPorts } from "../src/guest-edits";
import type { Outcome, PlanResult, Reads, Stamp } from "../src/guarded-edit";
import { startTags } from "../shared/html-source";

const page = `<!doctype html><html><body><main><a class="btn" href="/menu.html">Menu</a><img src="images/bread.jpg" alt=""></main></body></html>`;
const reads = (files: Record<string, string>): Reads => ({ source: path => files[path], exists: path => path in files } as Reads);
// The page's elements by their last step: 0 the link, 1 the picture (the real reader needs a browser page).
const locate = (source: string, node: number[]) => {
  const tag = startTags(source).find(tag => tag.name === (node.at(-1) === 0 ? "a" : "img"));
  return tag && { tag };
};
const apply = (source: string, result: PlanResult) => {
  assert.ok("edits" in result && result.edits, JSON.stringify(result));
  const [edit] = result.edits.get("index.html") as { start: number; end: number; text: string }[];
  return source.slice(0, edit.start) + edit.text + source.slice(edit.end);
};

test("a guest's link address is written on that link of the page, with the site's prefix on a site address", () => {
  const link = [0, 1, 0, 0];
  assert.match(apply(page, guestLinkPlan("index.html", link, "/about.html", page, locate)(reads({ "index.html": page }))), /<a class="btn" href="\/about\.html">Menu<\/a>/);
  const config = JSON.stringify({ site: { url: "https://example.com/shop/" } });
  assert.match(apply(page, guestLinkPlan("index.html", link, "/about.html", page, locate)(reads({ "index.html": page, ".editor/config.json": config }))), /href="\/shop\/about\.html"/);
  assert.match(apply(page, guestLinkPlan("index.html", link, "https://x.org/", page, locate)(reads({ "index.html": page, ".editor/config.json": config }))), /href="https:\/\/x\.org\/"/);
  assert.deepEqual(guestLinkPlan("index.html", [0, 1, 0, 1], "/x.html", page, locate)(reads({ "index.html": page })), { refuse: "The link could not be found in the source." }, "not a link");
  assert.deepEqual(guestLinkPlan("gone.html", link, "/x.html", page, locate)(reads({})), { refuse: "The link could not be found in the source." });
});

test("a guest's link change is refused when the link they saw has changed since", () => {
  const link = [0, 1, 0, 0];
  const changed = page.replace('href="/menu.html"', 'href="/order.html"');
  assert.deepEqual(guestLinkPlan("index.html", link, "/about.html", page, locate)(reads({ "index.html": changed })), { refuse: "The link changed before the guest's change arrived." });
  const elsewhere = page.replace("<main>", "<main><p>New</p>");
  assert.match(apply(elsewhere, guestLinkPlan("index.html", link, "/about.html", page, locate)(reads({ "index.html": elsewhere }))), /href="\/about\.html"/, "a change elsewhere on the page keeps it");
});

test("the element a guest saw is the same one only with the same start tag in the same place among its like", () => {
  const img = [0, 1, 0, 1];
  assert.equal(sameGuestElement(page, page, img, "img", locate), true);
  assert.equal(sameGuestElement(page, page.replace("<main>", "<main><p>New</p>"), img, "img", locate), true, "a change elsewhere");
  assert.equal(sameGuestElement(page, page.replace("bread.jpg", "cake.png"), img, "img", locate), false, "its tag changed");
  assert.equal(sameGuestElement(page, page, img, "a", locate), false, "not the kind asked for");
  // The first picture of the page is now a copy put before it: the same tag, standing one later among its like.
  const copy = `<img src="images/bread.jpg" alt="">`;
  const twice = page.replace("<main>", `<main>${copy}`);
  const second = (source: string, node: number[]) => {
    const tags = startTags(source).filter(tag => tag.name === "img");
    const tag = node.at(-1) === 1 ? tags.at(-1) : tags[0];
    return tag && { tag };
  };
  assert.equal(sameGuestElement(page, twice, img, "img", second), false, "an earlier copy was put in");
});

test("a guest's upload goes to the folder holding most of the site's pictures, else images", () => {
  assert.equal(guestUploadFolder(["assets/a.png", "assets/b.png", "photos/c.jpg", "logo.svg"]), "assets");
  assert.equal(guestUploadFolder(["logo.svg"]), "images");
  assert.equal(guestUploadFolder([]), "images");
});

test("a guest's image popup reads the page, the media records, the settings and the components only", () => {
  assert.deepEqual(guestSourcePaths("index.html", ["index.html", "about.html", "components/card.html", "Components/Hero/hero.css", "styles.css"]),
    ["index.html", ".editor/media.json", ".editor/config.json", "components/card.html", "Components/Hero/hero.css"]);
});

const stamp: Stamp = { holds: () => true, changed: () => undefined };
const square = { shape: "square" as const, focus: { x: 20, y: 30 }, cut: { turn: 0 as const, zoom: 1, rect: { x: 0, y: 0, w: 1, h: 1 } } };

function fake(over: Partial<GuestEditsPorts> = {}, current = page) {
  const calls: unknown[] = [];
  const proofs: unknown[] = [];
  const thumbnailed: string[] = [];
  const ports: GuestEditsPorts = {
    site: () => ({ routes: { "/": "index.html", "/menu/": "menu.html", "/404/": "404.html" } }),
    source: path => ({ "index.html": current } as Record<string, string>)[path],
    sources: () => ({ "index.html": current, "components/card.html": "<p>card</p>", "styles.css": "a{}" }),
    edits: {
      run: async (plan, options): Promise<Outcome> => { calls.push(["run", options]); const result = await plan(reads({ "index.html": current })); return "edits" in result ? { ok: true, status: "applied" } : { ok: false, reason: "refused", message: "no" }; },
      stamp: () => stamp,
    },
    routeTitle: route => (route === "/" ? "Home" : undefined),
    pictures: () => ["images/bread.jpg", "images/cake.png"],
    pictureReader: async () => async path => new Blob([path], { type: "image/png" }),
    image: async (target, change, proof) => { calls.push(["image", target, change]); proofs.push(proof); return true; },
    thumbnail: async url => { thumbnailed.push(url); return `small:${await resolveObjectURL(url)?.text()}`; },
    locate,
    ...over,
  };
  return { edits: createGuestEdits(ports), calls, proofs, thumbnailed };
}

test("guests are offered the site's pages and pictures, and small copies only of the site's pictures", async () => {
  const { edits, thumbnailed } = fake();
  const context = edits.context("index.html");
  assert.deepEqual(context.pictures, ["images/bread.jpg", "images/cake.png"]);
  assert.deepEqual(context.links.slice(0, 2), [{ label: "Home (/)", value: "/" }, { label: "/menu/", value: "/menu/" }]);
  // Read through Media's own reader (never the page's pictures, which the mirror sends guests), and let go once small.
  assert.deepEqual(await edits.pictures(["images/cake.png", "secret/notes.png"]), { "images/cake.png": "small:images/cake.png" });
  assert.equal(thumbnailed.length, 1);
  assert.equal(resolveObjectURL(thumbnailed[0]!), undefined);
  assert.deepEqual(Object.keys(edits.sources("index.html")), ["index.html", "components/card.html"]);
});

test("a guest's change is written through Lex's own writes: links as a step, pictures, crops and uploads by the image popup", async () => {
  const { edits, calls, proofs } = fake();
  const at = { path: "index.html", node: [0, 1, 0, 1] };
  assert.equal(await edits.change({ kind: "link", path: "index.html", node: [0, 1, 0, 0], href: "/menu/" }, page), true);
  assert.deepEqual(calls.shift(), ["run", { anchor: "index.html" }]);
  assert.equal(await edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), true);
  assert.deepEqual(calls.shift(), ["image", at, { file: "images/cake.png" }]);
  assert.equal(await edits.change({ kind: "picture", ...at, file: "images/not-there.png" }, page), false, "only the site's pictures");
  assert.equal(calls.length, 0);
  const edit = square;
  assert.equal(await edits.change({ kind: "crop", ...at, edit, recrop: true }, page), true);
  assert.deepEqual(calls.shift(), ["image", at, { edit, recrop: true }]);
  const file = new File(["x"], "new.png", { type: "image/png" });
  assert.equal(await edits.change({ kind: "upload", ...at, file }, page), true);
  assert.deepEqual(calls, [["image", at, { upload: file, folder: "images" }]], "saved and placed by the popup in one go");
  assert.deepEqual(proofs, [{ stamp, source: page }, { stamp, source: page }, { stamp, source: page }], "each checked against the load and page of the check");
});

test("a guest's picture change is refused, writing nothing, when the picture they saw has changed or moved", async () => {
  const at = { path: "index.html", node: [0, 1, 0, 1] };
  const file = new File(["x"], "a.png", { type: "image/png" });
  const changed = fake({}, page.replace("bread.jpg", "cake.png"));
  assert.equal(await changed.edits.change({ kind: "upload", ...at, file }, page), false);
  assert.equal(await changed.edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), false);
  assert.deepEqual(changed.calls, []);
  const gone = fake({}, "<!doctype html><html><body><main></main></body></html>");
  assert.equal(await gone.edits.change({ kind: "crop", ...at, edit: square, recrop: false }, page), false);
  assert.deepEqual(gone.calls, []);
  const elsewhere = page.replace("<main>", "<main><p>New</p>");
  const kept = fake({}, elsewhere);
  assert.equal(await kept.edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), true, "a change elsewhere on the page keeps it");
  assert.deepEqual(kept.proofs, [{ stamp, source: elsewhere }]);
});
