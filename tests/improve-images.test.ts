import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { improveImagesPlan, IMPROVE_HEAVY_BYTES } from "../src/page-builder/improve-images";
import { parseMediaRecords } from "../shared/media-records";

type Input = Parameters<typeof improveImagesPlan>[0];
const root = join(import.meta.dirname, "fixtures/improve-images");
function fixture(): Input {
  const sources: Record<string, string> = {};
  const read = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) read(file); else sources[relative(root, file)] = readFileSync(file, "utf8");
    }
  };
  read(root);
  return { sources, pages: ["index.html", "articles/resources/index.html", "articles/stacking-cards/index.html", "articles/notch-menu/index.html"], components: Object.fromEntries(["site-header", "site-footer", "site-shell", "card-tutorial"].map(tag => [tag, `components/${tag}/${tag}.html`])), files: JSON.parse(sources["facts.json"]), records: parseMediaRecords(sources[".editor/media.json"]), site: { origins: ["https://techies.review"] } };
}
const rowAt = (plan: ReturnType<typeof improveImagesPlan>, file: string) => {
  const row = plan.rows.find(row => row.file === file);
  assert.ok(row, file); return row;
};
const pictureAt = (row: ReturnType<typeof rowAt>, key: string) => {
  const picture = row.pictures.find(p => p.key === key);
  assert.ok(picture, key); return picture;
};

test("fixture rows own their markup, reach through nesting counts pages, labels and summaries are stable", () => {
  const input = fixture(), before = JSON.stringify(input), plan = improveImagesPlan(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(plan.rows.length, 7);
  const header = rowAt(plan, "components/site-header/site-header.html");
  assert.equal(header.reach, 4);
  assert.deepEqual(header.pages, input.pages);
  assert.match(header.summary, /^Site header, on 4 pages: 1 heavy picture/);
  assert.equal(rowAt(plan, "components/site-footer/site-footer.html").reach, 4);
  assert.equal(rowAt(plan, "components/card-tutorial/card-tutorial.html").reach, 1);
  assert.deepEqual(plan.rows.map(r => r.label), ["Site footer", "Site header", "Card tutorial", "Home", "Notch menu", "Resources", "Stacking cards"]);
  const home = rowAt(plan, "index.html");
  assert.ok(pictureAt(home, "images/heavy.jpg").changes.includes("lighten"));
  assert.equal(header.pictures.some(p => p.key === "images/heavy.jpg"), false);
  assert.equal(home.pictures.some(p => p.kind === "sharing"), false);
  for (const row of plan.rows) for (const picture of row.pictures) {
    assert.match(input.sources[row.file]!.slice(picture.tag.start, picture.tag.end), /^<(img|iframe|meta)\b[^]*>$/);
    assert.ok(input.sources[row.file]!.slice(picture.tag.start, picture.tag.end).includes(picture.address));
  }
});

test("all change kinds, adopted sets, affiliate links and must-not-touch cases", () => {
  const plan = improveImagesPlan(fixture()), home = rowAt(plan, "index.html"), notch = rowAt(plan, "articles/notch-menu/index.html");
  assert.deepEqual(pictureAt(home, "images/uploads/panel.jpg").adopted, ["images/uploads/panel-400.webp", "images/uploads/panel-800.webp", "images/uploads/panel-1200.webp"]);
  assert.deepEqual(pictureAt(home, "images/uploads/panel.jpg").changes, []);
  assert.deepEqual(home.leftAlone.map(p => p.reason), ["script", "structured-data", "structured-data"]);
  assert.ok(rowAt(plan, "components/card-tutorial/card-tutorial.html").leftAlone.some(p => p.reason === "template-fallback"));
  assert.deepEqual(pictureAt(notch, "images/wide.png").changes, ["lighten", "size", "sizes", "loading"]);
  assert.deepEqual(pictureAt(notch, "images/small.jpg").changes, ["copies", "size", "sizes", "loading"]);
  assert.deepEqual(pictureAt(notch, "images/icon.svg").changes, ["size"]);
  assert.deepEqual(pictureAt(notch, "images/placed.jpg").changes, []);
  assert.deepEqual(notch.leftAlone, [{ address: "/wp-content/sample.jpg", reason: "sample-code" }, { address: "/images/missing.jpg", reason: "missing" }]);
  const resources = rowAt(plan, "articles/resources/index.html");
  assert.equal(pictureAt(resources, "http://one.example/picture.jpg").host, "one.example");
  assert.equal(pictureAt(resources, "https://two.example/picture.png").address, "//two.example/picture.png");
  const affiliate = pictureAt(resources, "https://shop.greenshiftwp.com/banner.jpg");
  assert.equal(affiliate.link, "https://shop.greenshiftwp.com/buyfrom/27/");
  assert.equal(affiliate.ticked, false);
  assert.equal(resources.counts["bring-in"], 3);
  assert.match(resources.summary, /^Resources: 3 pictures from other websites/);
  const stacking = rowAt(plan, "articles/stacking-cards/index.html");
  assert.deepEqual(stacking.pictures.filter(p => p.key === "images/animation.gif").map(p => p.changes), [["loop"], ["first-frame"]]);
  assert.deepEqual(stacking.pictures.filter(p => p.videoId).map(p => p.videoId), ["abc_123", "123456?h=secret"]);
  assert.equal(stacking.pictures.some(p => p.address.includes("maps.google")), false);
  assert.equal(stacking.pictures.some(p => p.address.includes("youtu.be/done")), false);
  for (const value of Object.values(plan.totals)) assert.ok(value > 0);
  for (const kind of Object.keys(plan.totals) as (keyof typeof plan.totals)[]) assert.equal(plan.totals[kind], plan.rows.reduce((sum, row) => sum + row.counts[kind], 0));
});

function single(source: string, files: Input["files"] = {}, records = parseMediaRecords(undefined)) {
  return improveImagesPlan({ sources: { "index.html": source }, files, records, pages: ["index.html"], components: {}, site: { origins: ["https://own.example"] } });
}

test("remembered exclusions apply globally or per row; unticked-only rows stay visible with zero counts", () => {
  const input = fixture();
  const plan = improveImagesPlan(input);
  assert.equal(pictureAt(rowAt(plan, "articles/notch-menu/index.html"), "images/icon.svg").ticked, false);
  assert.equal(pictureAt(rowAt(plan, "components/card-tutorial/card-tutorial.html"), "images/icon.svg").ticked, true);
  const records = parseMediaRecords('{"version":2,"collections":[],"files":{},"leftAsIs":[{"picture":"https://other.example/a"}]}');
  const only = single('<img src="https://other.example/a">', {}, records);
  assert.equal(only.rows.length, 1);
  assert.equal(only.rows[0].count, 0);
  assert.equal(only.count, 0);
  assert.equal(only.totals["bring-in"], 0);
  assert.ok(only.rows[0].pictures[0].changes.includes("bring-in"));
});

test("heavy threshold, recipes, BMP/TIFF, static and unknown GIF facts, missing facts and own origins", () => {
  assert.equal(IMPROVE_HEAVY_BYTES, 204800);
  const source = '<img src="https://own.example/a.jpg"><img src="/b.bmp"><img src="/c.tiff"><img src="/d.gif"><img src="/e.gif"><img src="/unknown.jpg">';
  const files = { "a.jpg": { size: 204800, width: 2000 }, "b.bmp": { size: 1, width: 20 }, "c.tiff": { size: 1, width: 20 }, "d.gif": { size: 300000, width: 800, animated: false }, "e.gif": { size: 100, width: 800 }, "unknown.jpg": {} };
  for (const image of ["balanced", "smaller", "higher", "smallest"] as const) {
    const records = { ...parseMediaRecords(undefined), adding: { image } };
    const plan = single(source, files, records), row = plan.rows[0];
    assert.equal(pictureAt(row, "a.jpg").changes.includes("lighten"), image === "smaller");
    for (const key of ["b.bmp", "c.tiff", "d.gif"]) assert.ok(pictureAt(row, key).changes.includes("lighten"));
    assert.ok(pictureAt(row, "e.gif").changes.includes("loop"));
    assert.deepEqual(pictureAt(row, "unknown.jpg").changes, ["size", "loading"]);
    assert.deepEqual(plan.missingFacts, ["unknown.jpg"]);
  }
  assert.ok(single('<img src="/a.jpg">', { "a.jpg": { size: 204801, width: 1200 } }).rows[0].pictures[0].changes.includes("lighten"));
});

test("YouTube address forms, Vimeo hash, outside SVG, picture sources and video sources", () => {
  const addresses = ["https://youtube.com/embed/abc", "https://youtube.com/watch?v=abc", "https://youtu.be/abc", "https://youtube.com/shorts/abc", "//youtube-nocookie.com/embed/abc"];
  for (const address of addresses) assert.equal(single(`<iframe src="${address}"></iframe>`).rows[0].pictures[0].videoId, "abc");
  const plan = single('<img src="https://other.example/icon.svg"><picture><source srcset="https://other.example/a.webp 400w, https://other.example/b.webp 800w"><img srcset="https://other.example/c.jpg 800w"></picture><video><source src="https://other.example/clip.mp4"></video>');
  assert.deepEqual(plan.rows[0].pictures.map(p => p.key), ["https://other.example/icon.svg", "https://other.example/c.jpg"]);
  assert.deepEqual(plan.rows[0].pictures[0].changes, ["size"]);
  assert.ok(plan.rows[0].pictures[1].changes.includes("bring-in"));
});

test("hand-made sets in <picture> sources or an unrecognised srcset are adopted, never given copies", () => {
  const files = { "photo.jpg": { size: 100000, width: 1600, height: 900 }, "photo-small.webp": { size: 9000, width: 600, height: 338 }, "shot.png": { size: 100000, width: 1600, height: 900 }, "shot-mobile.webp": { size: 9000, width: 600, height: 338 } };
  const plan = single('<picture><source type="image/webp" srcset="/photo-small.webp 600w"><img src="/photo.jpg" width="1600" height="900" loading="lazy"></picture><img src="/shot.png" srcset="/shot-mobile.webp 600w, /shot.png 1600w" sizes="100vw" width="1600" height="900" loading="lazy"><img src="/photo.jpg" width="1600" height="900" loading="lazy">', files);
  const [inPicture, withSrcset, plain] = plan.rows[0].pictures;
  assert.deepEqual([inPicture.adopted, inPicture.changes], [["photo-small.webp"], []]);
  assert.deepEqual([withSrcset.adopted, withSrcset.changes], [["shot-mobile.webp"], []]);
  assert.deepEqual(plain.changes, ["copies", "sizes"]);
});

test("an id only counts as a script hook when the script names that exact id", () => {
  const plan = single('<div id="a"><img src="https://other.example/a"></div><script>document.querySelector("#abc")</script>');
  assert.equal(plan.rows[0].leftAlone.length, 0);
  assert.ok(plan.rows[0].pictures[0].changes.includes("bring-in"));
});

test("script hooks, inert containers and CSS backgrounds stay untouched", () => {
  for (const [hook, script] of [["id=hero", 'document.getElementById("hero")'], ["id=hero", 'document.querySelector("#hero")'], ["data-hero-picture", "node.dataset.heroPicture"], ["data-hero-picture", 'node.dataset["heroPicture"]']]) {
    const plan = single(`<div ${hook}><img src="https://other.example/a"></div><script>${script}</script><img src="https://other.example/b">`);
    assert.ok(plan.rows[0].leftAlone.some(p => p.reason === "script"));
    assert.equal(plan.rows[0].pictures.length, 1);
  }
  const plan = single(['pre', 'code', 'samp', 'kbd', 'xmp', 'textarea', 'template', 'noscript'].map(tag => `<${tag}><img src="https://other.example/sample"></${tag}>`).join("") + '<img data-src="https://other.example/lazy"><div style="background:url(https://other.example/bg)"></div><img src="https://other.example/work">');
  assert.equal(plan.rows[0].leftAlone.filter(p => p.reason === "sample-code").length, 8);
  assert.ok(plan.rows[0].leftAlone.some(p => p.reason === "script"));
  assert.equal(plan.rows[0].pictures.length, 1);
});

test("relative template addresses resolve against each showing page; cyclic and inert components do not inflate reach", () => {
  const plan = improveImagesPlan({ pages: ["index.html", "articles/index.html"], sources: { "index.html": "<test-card></test-card>", "articles/index.html": "<test-card></test-card><template><hidden-card></hidden-card></template>", "components/card.html": '<test-card></test-card><img src="local.jpg">', "components/hidden.html": '<img src="/hidden.jpg">' }, components: { "test-card": "components/card.html", "hidden-card": "components/hidden.html" }, files: { "local.jpg": { size: 300000, width: 800 }, "articles/local.jpg": { size: 300000, width: 800 }, "hidden.jpg": { size: 300000, width: 800 } }, records: parseMediaRecords(undefined) });
  const row = rowAt(plan, "components/card.html");
  assert.equal(row.reach, 2);
  assert.deepEqual(row.pictures.map(p => p.path), ["local.jpg", "articles/local.jpg"]);
  assert.equal(rowAt(plan, "components/hidden.html").reach, 0);
});

test("fallback labels, singular summaries, and largest srcset main do not depend on candidate order", () => {
  const records = parseMediaRecords(undefined);
  const input: Input = { sources: { "index.html": '<img src="https://other.example/a" width="1" height="1" sizes="100vw">', "articles/x/index.html": '<img srcset="https://other.example/large 1200w, https://other.example/small 400w" width="1" height="1" sizes="100vw">' }, pages: ["index.html", "articles/x/index.html"], components: {}, files: {}, records };
  const plan = improveImagesPlan(input);
  assert.equal(rowAt(plan, "index.html").summary, "Home: 1 picture from other websites");
  assert.equal(rowAt(plan, "articles/x/index.html").label, "/articles/x/");
  assert.equal(rowAt(plan, "articles/x/index.html").pictures[0].key, "https://other.example/large");
});

test("unknown partial raster facts do not suggest lighten or copies, including BMP and TIFF", () => {
  const files = { "a.bmp": { width: 3000 }, "b.tif": { size: 300000 }, "c.jpg": { width: 3000 }, "d.png": { size: 300000 } };
  const plan = single(Object.keys(files).map(path => `<img src="/${path}">`).join(""), files);
  assert.deepEqual(plan.missingFacts, Object.keys(files));
  for (const picture of plan.rows[0].pictures) assert.deepEqual(picture.changes, ["size", "loading"]);
});

test("missing facts are listed even when the picture's row has nothing else to change", () => {
  for (const facts of [{}, { width: 1200 }, { size: 300000 }]) {
    const plan = single('<img src="/a.jpg" width="1200" height="800" loading="lazy">', { "a.jpg": facts });
    assert.equal(plan.rows.length, 0);
    assert.deepEqual(plan.missingFacts, ["a.jpg"]);
  }
});

test("a picture whose own class a script selects is swapped in by script; a container class is not", () => {
  const files = { "a.jpg": { size: 300000, width: 1200, height: 800 } };
  const image = '<div class="media"><img class="hero shot" src="/a.jpg" width="1200" height="800" loading="lazy"></div>';
  for (const script of ['document.querySelector(".hero").src = next;', "document.querySelector(`section .shot`).srcset = next;", 'document.getElementsByClassName("hero")[0].src = next;']) {
    const inline = single(`${image}<script>${script}</script>`, files);
    assert.deepEqual(inline.rows, []);
    const external = improveImagesPlan({ sources: { "index.html": `${image}<script type="module" src="/scripts/swap.js"></script>`, "scripts/swap.js": script }, pages: ["index.html"], components: {}, files, records: parseMediaRecords(undefined) });
    assert.deepEqual(external.rows, []);
  }
  const kept = single(`${image}<script>document.querySelector(".media").classList.add("ready"); document.querySelector(".hero-title");</script>`, files);
  assert.deepEqual(kept.rows[0].pictures[0].changes, ["lighten", "sizes"]);
});
