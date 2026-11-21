import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import test from "node:test";
import { createGuestEdits, guestBoldPlan, guestHeadingPlan, guestLinkPlan, guestSizePlan, guestSourcePaths, guestUploadFolder, sameGuestElement, type GuestEditsPorts } from "../src/guest-edits";
import { GUEST_NOT_KEPT } from "../src/guest-changes";
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
  const edits = [...result.edits.get("index.html") as { start: number; end: number; text: string }[]].sort((a, b) => b.start - a.start);
  return edits.reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
};

// A page of text: its heading, a plain line and a bold line, by their last step 0, 1 and 2.
const text = `<!doctype html><html><body><main><h1 class="hero">Fresh <em>bread</em></h1><p>Daily</p><p> <strong>Open</strong> </p></main></body></html>`;
const elements = (source: string, node: number[]) => {
  const tag = startTags(source).filter(tag => /^(?:h[1-6]|p)$/.test(tag.name))[node.at(-1)!];
  const close = tag ? source.indexOf(`</${tag.name}>`, tag.end) : -1;
  return tag && close >= 0 ? { tag, close: { start: close, end: close + tag.name.length + 3 } } : undefined;
};
// The host bar's "the whole element is one bold element" (the real one reads the markup in a browser page).
const whole = (inner: string, tags: string[]) => {
  const found = /^(\s*)<(\w+)>([^<]*)<\/\2>\s*$/.exec(inner);
  if (!found || !tags.includes(found[2]!)) return undefined;
  const open = found[1]!.length, openEnd = open + found[2]!.length + 2, closeAt = openEnd + found[3]!.length;
  return { open, openEnd, closeAt, closeEnd: closeAt + found[2]!.length + 3 };
};
const heading = [0, 1, 0, 0], line = [0, 1, 0, 1], bold = [0, 1, 0, 2];

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
  assert.deepEqual(guestLinkPlan("index.html", link, "/about.html", page, locate)(reads({ "index.html": changed })), { refuse: "The link changed before your change arrived." });
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
  const written: PlanResult[] = [];
  const ports: GuestEditsPorts = {
    site: () => ({ routes: { "/": "index.html", "/menu/": "menu.html", "/404/": "404.html" } }),
    source: path => ({ "index.html": current } as Record<string, string>)[path],
    sources: () => ({ "index.html": current, "components/card.html": "<p>card</p>", "styles.css": ".text-large { font-size: 22px }" }),
    edits: {
      run: async (plan, options): Promise<Outcome> => {
        calls.push(["run", options]);
        const result = await plan(reads({ "index.html": current, "styles.css": ".text-large { font-size: 22px }" }));
        if (!("edits" in result)) return { ok: false, reason: "refused", message: result.refuse };
        written.push(result);
        return { ok: true, status: "applied" };
      },
      stamp: () => stamp,
    },
    routeTitle: route => (route === "/" ? "Home" : undefined),
    pictures: () => ["images/bread.jpg", "images/cake.png"],
    pictureReader: async () => async path => new Blob([path], { type: "image/png" }),
    image: async (target, change, proof) => { calls.push(["image", target, change]); proofs.push(proof); return true; },
    thumbnail: async url => { thumbnailed.push(url); return `small:${await resolveObjectURL(url)?.text()}`; },
    styles: () => ["styles.css"],
    wholeWrapper: whole,
    locate,
    ...over,
  };
  return { edits: createGuestEdits(ports), calls, proofs, thumbnailed, written };
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
  assert.equal(await edits.change({ kind: "picture", ...at, file: "images/not-there.png" }, page), "That picture is not one of the site's.", "only the site's pictures");
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
  const moved = "The picture changed before your change arrived.";
  const changed = fake({}, page.replace("bread.jpg", "cake.png"));
  assert.equal(await changed.edits.change({ kind: "upload", ...at, file }, page), moved);
  assert.equal(await changed.edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), moved);
  assert.deepEqual(changed.calls, []);
  const gone = fake({}, "<!doctype html><html><body><main></main></body></html>");
  assert.equal(await gone.edits.change({ kind: "crop", ...at, edit: square, recrop: false }, page), moved);
  assert.deepEqual(gone.calls, []);
  const elsewhere = page.replace("<main>", "<main><p>New</p>");
  const kept = fake({}, elsewhere);
  assert.equal(await kept.edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), true, "a change elsewhere on the page keeps it");
  assert.deepEqual(kept.proofs, [{ stamp, source: elsewhere }]);
});

test("why Lex's tab could not place a guest's picture is the guest's answer, a plain refusal the usual one", async () => {
  const at = { path: "index.html", node: [0, 1, 0, 1] };
  const said = fake({ image: async () => "The repository changed. Choose an image again." });
  assert.equal(await said.edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), "The repository changed. Choose an image again.");
  const plain = fake({ image: async () => false });
  assert.equal(await plain.edits.change({ kind: "picture", ...at, file: "images/cake.png" }, page), GUEST_NOT_KEPT);
});

test("a guest's heading level renames the heading's start and close tags, as the host bar's Heading level does", () => {
  const r = reads({ "index.html": text });
  const result = guestHeadingPlan("index.html", heading, "h3", text, elements)(r);
  assert.match(apply(text, result), /<h3 class="hero">Fresh <em>bread<\/em><\/h3>/);
  assert.equal("done" in result && result.done, "Heading level H3");
  assert.deepEqual(guestHeadingPlan("index.html", line, "h2", text, elements)(r), { refuse: "The heading could not be found in the source." }, "not a heading");
  const changed = text.replace('class="hero"', 'class="intro"');
  assert.deepEqual(guestHeadingPlan("index.html", heading, "h2", text, elements)(reads({ "index.html": changed })), { refuse: "The heading changed before your change arrived." });
});

test("a guest's text size is the site's own size class, else its variable, else the bar's own scale, as the host bar writes it", () => {
  const css = (sheet: string) => reads({ "index.html": text, "styles.css": sheet });
  assert.match(apply(text, guestSizePlan("index.html", heading, "text-large", text, ["styles.css"], elements)(css(".text-large { font-size: 22px }"))), /<h1 class="hero text-large">/);
  assert.match(apply(text, guestSizePlan("index.html", line, "--text-l", text, ["styles.css"], elements)(css(":root { --text-l: 18px }"))), /<p style="font-size: var\(--text-l\)">Daily<\/p>/);
  const inline = guestSizePlan("index.html", line, "l", text, ["styles.css"], elements)(css(""));
  assert.match(apply(text, inline), /<p style="font-size: 1\.25rem">Daily<\/p>/);
  assert.equal("done" in inline && inline.done, "Text size L");
  const sized = text.replace("<p>Daily", '<p style="font-size: 1.25rem">Daily');
  const back = guestSizePlan("index.html", line, "default", sized, ["styles.css"], elements)(reads({ "index.html": sized }));
  assert.match(apply(sized, back), /<p>Daily<\/p>/);
  assert.equal("done" in back && back.done, "Default text size");
  assert.deepEqual(guestSizePlan("index.html", line, "text-huge", text, ["styles.css"], elements)(css(".text-large { font-size: 22px }")), { refuse: "That size is not one of the site's." });
  assert.deepEqual(guestSizePlan("index.html", line, "default", text, ["styles.css"], elements)(css("")), { refuse: "That text is that size already." });
});

test("a guest's bold makes the whole element's text bold or not, as the host bar's B does with no text selected", () => {
  const r = reads({ "index.html": text });
  const on = guestBoldPlan("index.html", line, true, text, whole, elements)(r);
  assert.match(apply(text, on), /<p><strong>Daily<\/strong><\/p>/);
  assert.equal("done" in on && on.done, "Bold on");
  const off = guestBoldPlan("index.html", bold, false, text, whole, elements)(r);
  assert.match(apply(text, off), /<p> Open <\/p>/);
  assert.equal("done" in off && off.done, "Bold off");
  assert.deepEqual(guestBoldPlan("index.html", bold, true, text, whole, elements)(r), { refuse: "That text is bold already." });
  assert.deepEqual(guestBoldPlan("index.html", line, false, text, whole, elements)(r), { refuse: "That text is not bold." });
  const changed = text.replace("<p>Daily", '<p class="note">Daily');
  assert.deepEqual(guestBoldPlan("index.html", line, true, text, whole, elements)(reads({ "index.html": changed })), { refuse: "The text changed before your change arrived." });
});

test("a guest's heading, size and bold are each one Undo step of Lex's, and a refusal says why", async () => {
  const { edits, calls, written } = fake({ locate: elements }, text);
  assert.equal(await edits.change({ kind: "heading", path: "index.html", node: heading, level: "h2" }, text), true);
  assert.equal(await edits.change({ kind: "size", path: "index.html", node: heading, size: "text-large" }, text), true);
  assert.equal(await edits.change({ kind: "bold", path: "index.html", node: line, on: true }, text), true);
  assert.deepEqual(calls, [["run", { anchor: "index.html" }], ["run", { anchor: "index.html" }], ["run", { anchor: "index.html" }]]);
  assert.deepEqual(written.map(result => "done" in result && result.done), ["Heading level H2", "Text size Large", "Bold on"]);
  assert.equal(await edits.change({ kind: "heading", path: "index.html", node: line, level: "h2" }, text), "The heading could not be found in the source.");
  // The bar offers the page's own sizes.
  assert.deepEqual(edits.context("index.html").sizes, { kind: "class", sizes: [{ value: "text-large", label: "Large" }] });
});
