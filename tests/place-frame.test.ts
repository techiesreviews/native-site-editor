import { test } from "node:test";
import assert from "node:assert/strict";
import { framePlace, readPlaceFrame, resetPlaceFocus, writePlaceFrame, type PlaceFramePorts, type PlaceShape } from "../src/page-builder/place-frame";
import { mediaAttribute } from "../src/page-builder/media-attributes";
import { startTags } from "../shared/html-source";
import { decodeHtmlEntities } from "../src/page-builder/html-entities";
import type { MediaRecords } from "../shared/media-records";
import type { MediaMeasured } from "../src/page-builder/media-markup";

const style = (text: string) => {
  const attr = mediaAttribute(text, startTags(text)[0], "style");
  return attr && decodeHtmlEntities(attr.value, true);
};
for (const [shape, ratio] of Object.entries({ square: "1 / 1", "4:3": "4 / 3", "16:9": "16 / 9", "4:5": "4 / 5" })) {
  test(`${shape} writes and reads a fixed cover shape`, () => {
    const text = writePlaceFrame('<img slot="photo" src="/a.webp">', { shape: shape as PlaceShape });
    assert.equal(style(text), `aspect-ratio: ${ratio}; object-fit: cover`);
    assert.equal(readPlaceFrame(text).shape, shape);
    assert.match(text, /slot="photo"/);
  });
}
test("focus rounds, clamps and removes centre without requiring a shape", () => {
  assert.equal(style(writePlaceFrame("<img>", { focus: { x: -3, y: 104 } })), "object-position: 0% 100%");
  assert.equal(style(writePlaceFrame("<img>", { focus: { x: 23.7, y: 41.2 } })), "object-position: 24% 41%");
  assert.equal(writePlaceFrame('<img style="object-position:20% 10%">', { focus: { x: 49.7, y: 50.1 } }), "<img>");
  assert.throws(() => writePlaceFrame("<img>", { focus: { x: NaN, y: 20 } }), /finite/);
});
test("Original clears all three even when a focus is also supplied; Free refuses", () => {
  assert.equal(writePlaceFrame('<img style="aspect-ratio:1;object-fit:cover;object-position:10% 20%">', { shape: "original", focus: { x: 3, y: 7 } }), "<img>");
  // Runtime consumers can bypass the TypeScript union, so Free also refuses at runtime.
  const free = JSON.parse('{"shape":"free"}');
  assert.throws(() => writePlaceFrame("<img>", free), /trimmed copy/);
});
test("unrelated CSS remains verbatim, including URL semicolons, strings, escapes and comments", () => {
  const before = `background:url('data:image/svg+xml;a;b'); --note: "a;b\\\"c"; /* keep ; */ color : red !important;`;
  const text = writePlaceFrame(`<img style='${before.replaceAll("'", "&#39;")}'>`, { shape: "square", focus: { x: 5, y: 95 } });
  assert.equal(style(text), `${before} aspect-ratio: 1 / 1; object-fit: cover; object-position: 5% 95%`);
});
test("managed duplicates collapse at first position, case and important are replaced, comments survive", () => {
  const text = writePlaceFrame('<img style="color:red; /* first */ ASPECT-RATIO:2!important; width:20px;aspect-ratio:3;OBJECT-FIT:contain !important;/* second */object-fit:fill">', { shape: "4:3" });
  assert.equal(style(text), "color:red; /* first */aspect-ratio: 4 / 3; width:20px;object-fit: cover;/* second */");
  assert.equal((style(text)?.match(/aspect-ratio/g) ?? []).length, 1);
});
test("comments inside managed declarations survive removal and quoted comment text remains unowned", () => {
  assert.equal(style(writePlaceFrame('<img style="object-/* note */position:5% 3%;color:red">', { shape: "original" })), "object-/* note */position:5% 3%;color:red");
  assert.equal(style(writePlaceFrame('<img style="object-position: /* keep */ 5% 3%; --s:\'/*string*/;\'">', { shape: "original" })), "/* keep */ --s:'/*string*/;'" );
});
test("attribute quoting, entities, missing/trailing semicolons and empty style", () => {
  for (const text of ['<img style=opacity:0.5>', "<img style='opacity:0.5'>", '<img style="opacity:0.5">']) {
    assert.equal(style(writePlaceFrame(text, { shape: "square" })), "opacity:0.5; aspect-ratio: 1 / 1; object-fit: cover");
  }
  assert.equal(style(writePlaceFrame('<img style="--text:&quot;a&amp;b;&quot;;">', { focus: { x: 20, y: 30 } })), '--text:"a&b;"; object-position: 20% 30%');
  assert.equal(writePlaceFrame('<img style=" ; ; object-fit: cover; ; ">', { shape: "original" }), "<img>");
  assert.equal(writePlaceFrame('<img style="/* keep */object-fit:cover">', { shape: "original" }), '<img style="/* keep */">');
});
test("reset helper retains shape and other style; empty change is a no-op", () => {
  const text = '<img style="aspect-ratio:1; object-fit:cover;object-position:20% 10%;color:red">';
  assert.equal(style(resetPlaceFocus(text)), "aspect-ratio:1; object-fit:cover;color:red");
  assert.equal(writePlaceFrame(text, {}), text);
});
test("read ratios by numeric value; unknown values or non-cover are other", () => {
  for (const [raw, expected] of [["1", "square"], ["1/1", "square"], ["4/3", "4:3"], ["1.3333", "4:3"], ["16 / 9", "16:9"], [".8", "4:5"]]) {
    assert.equal(readPlaceFrame(`<img style="aspect-ratio:${raw};object-fit:cover">`).shape, expected);
  }
  for (const raw of ["auto", "2/1", "auto 1/1"]) assert.deepEqual(readPlaceFrame(`<img style="aspect-ratio:${raw};object-fit:cover">`).shape, { kind: "other", value: raw });
  assert.deepEqual(readPlaceFrame('<img style="aspect-ratio:1;object-fit:contain">').shape, { kind: "other", value: "1" });
  assert.equal(readPlaceFrame("<img>").shape, "original");
});
test("read uses important cascade and keyword or percent focus; lengths keep raw value", () => {
  assert.equal(readPlaceFrame('<img style="aspect-ratio:1!important;aspect-ratio:2;object-fit:COVER">').shape, "square");
  for (const [raw, x, y] of [["left top", 0, 0], ["top right", 100, 0], ["center bottom", 50, 100], ["right", 100, 50], ["top", 50, 0], ["center", 50, 50], ["20% 30%", 20, 30], ["bottom left", 0, 100]]) {
    assert.deepEqual(readPlaceFrame(`<img style="object-position:${raw}">`).focus, { x, y });
  }
  assert.deepEqual(readPlaceFrame("<img>").focus, { x: 50, y: 50 });
  const length = readPlaceFrame('<img style="object-position:20px 30%">');
  assert.equal(length.focus, undefined); assert.equal(length.focusRaw, "20px 30%");
});
test("trimmed state resolves decoded src relative to the page and retains original source path", () => {
  const records = { version: 2, collections: [], files: { "media/a&b.webp": { trimmedFrom: { source: "media/original.webp", trim: { x: 0, y: 0, width: 1, height: 1 } } } } } satisfies MediaRecords;
  const read = readPlaceFrame('<img src="../media/a&amp;b.webp">', records, "about/index.html");
  assert.equal(read.trimmed, true); assert.equal(read.source, "media/original.webp");
  assert.equal(readPlaceFrame('<img src="/other.webp">', records).trimmed, false);
});

function fixture(tag = '<img src="/a.webp" srcset="/a.webp 1000w" sizes="auto, 80vw" loading="lazy">', measured?: MediaMeasured) {
  let source = `<section>${tag}<img sizes="auto, 40vw" loading="lazy" fetchpriority="high"></section>`;
  const calls: Parameters<PlaceFramePorts["change"]>[] = [];
  const measurements: Parameters<NonNullable<PlaceFramePorts["measureImage"]>>[] = [];
  const target = { path: "index.html", node: [0, 0] };
  const proof = { stamp: { holds: () => true, changed: () => undefined }, epoch: 1, source, expected: tag };
  const ports = {
    source: () => source, openFile: () => target.path, restoreFile: async () => {}, viewingVersion: () => false,
    locateElement: (text, node) => {
      const tags = startTags(text).filter(tag => tag.name === "img");
      return tags[node.at(-1) ?? 0] && { tag: tags[node.at(-1) ?? 0] };
    },
    measureImage: async (...args) => { measurements.push(args); return measured; },
    change: (...args) => { calls.push(args); return true; },
  } satisfies PlaceFramePorts;
  return { ports, target, proof, calls, measurements, mutate: (text: string) => { source = text; } };
}
test("shape measures the proposed style, writes lazy sizes, and applies other page priority in one change", async () => {
  const f = fixture(undefined, { sizes: "500px", firstScreen: false, large: false, images: [
    { node: [0, 0], firstScreen: false, large: false }, { node: [0, 1], firstScreen: true, large: true },
  ] });
  await framePlace(f.ports, f.target, { shape: "16:9" }, f.proof);
  assert.deepEqual(f.measurements, [["index.html", [0, 0], {}, undefined, "aspect-ratio: 16 / 9; object-fit: cover"]]);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][4], "Image shape changed");
  const edits = f.calls[0][2]; assert.equal(edits.length, 2);
  assert.match(edits[1].text, /sizes="auto, 500px"/); assert.match(edits[1].text, /loading="lazy"/);
  assert.doesNotMatch(edits[1].text, /fetchpriority/);
  assert.match(edits[0].text, /sizes="40vw"/); assert.match(edits[0].text, /fetchpriority="high"/); assert.doesNotMatch(edits[0].text, /loading=/);
  assert.equal(f.calls[0][0], "index.html"); // Only the page port can write: no records/upload port exists.
});
test("eager shape sizing drops auto; ordinary images do not gain sizes", async () => {
  for (const tag of [undefined, '<img slot="photo" src="/a.webp">']) {
    const f = fixture(tag, { sizes: "500px", firstScreen: true, large: true, images: [] });
    await framePlace(f.ports, f.target, { shape: "square" }, f.proof);
    const text = f.calls[0][2][0].text;
    assert.match(text, /fetchpriority="high"/); assert.doesNotMatch(text, /loading=/);
    if (tag) { assert.doesNotMatch(text, /sizes=/); assert.match(text, /slot="photo"/); }
    else assert.match(text, /sizes="500px"/);
  }
});
test("a hand-written image below the first screen keeps its loading", async () => {
  const f = fixture('<img src="/a.webp" class="hand">', { sizes: "500px", firstScreen: false, large: false, images: [] });
  await framePlace(f.ports, f.target, { shape: "16:9" }, f.proof);
  const text = f.calls[0][2].at(-1)!.text;
  assert.doesNotMatch(text, /loading=|sizes=|fetchpriority/); assert.match(text, /aspect-ratio: 16 \/ 9/);
});
test("measurement rejection or missing sizes keeps existing sizes", async () => {
  for (const fail of [true, false]) {
    const f = fixture(undefined, { firstScreen: false, large: false, images: [] });
    if (fail) f.ports.measureImage = async () => { throw new Error("No preview"); };
    await framePlace(f.ports, f.target, { shape: "4:5" }, f.proof);
    assert.equal(f.calls.length, 1); assert.match(f.calls[0][2][0].text, /sizes="auto, 80vw"/);
  }
});
test("focus only never measures and makes one change; no-op makes none", async () => {
  const f = fixture();
  await framePlace(f.ports, f.target, { focus: { x: 20, y: 30 } }, f.proof);
  assert.equal(f.measurements.length, 0); assert.equal(f.calls.length, 1); assert.equal(f.calls[0][4], "Focus point moved");
  await framePlace(f.ports, f.target, {}, f.proof); assert.equal(f.calls.length, 1);
});
test("Original measures with empty style stand-in", async () => {
  const f = fixture('<img style="aspect-ratio:1;object-fit:cover;object-position:20% 30%">');
  await framePlace(f.ports, f.target, { shape: "original" }, f.proof);
  assert.equal(f.measurements[0][4], ""); assert.equal(f.calls[0][2][0].text, "<img>");
});
test("component templates, stale page/tag and stale repository refuse before measurement or write", async () => {
  const f = fixture();
  await assert.rejects(framePlace(f.ports, { ...f.target, path: "components/card.html" }, { shape: "square" }, f.proof), /fallback/);
  f.mutate(f.proof.source + " ");
  await assert.rejects(framePlace(f.ports, f.target, { shape: "square" }, f.proof), /changed/);
  f.mutate(f.proof.source);
  await assert.rejects(framePlace(f.ports, f.target, { shape: "square" }, { ...f.proof, expected: "<img>" }), /changed/);
  f.proof.stamp.holds = () => false;
  await assert.rejects(framePlace(f.ports, f.target, { shape: "square" }, f.proof), /changed/);
  assert.equal(f.measurements.length, 0); assert.equal(f.calls.length, 0);
});
test("a page change during successful or failed measurement refuses; failed commit is reported", async () => {
  for (const fail of [true, false]) {
    const f = fixture();
    f.ports.measureImage = async () => { f.mutate("new source"); if (fail) throw new Error("No preview"); return undefined; };
    await assert.rejects(framePlace(f.ports, f.target, { shape: "square" }, f.proof), /changed/);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.ports.change = () => false;
  await assert.rejects(framePlace(f.ports, f.target, { focus: { x: 0, y: 0 } }, f.proof), /could not/);
});

test("restore keeps the captured proof; navigation during measurement refuses", async () => {
  const restored = fixture();
  let open = "other.html";
  restored.ports.openFile = () => open;
  restored.ports.restoreFile = async () => { open = "index.html"; restored.mutate("changed while restoring"); };
  await assert.rejects(framePlace(restored.ports, restored.target, { shape: "square" }, restored.proof), /changed/);
  assert.equal(restored.measurements.length, 0); assert.equal(restored.calls.length, 0);
  const moved = fixture();
  moved.ports.openFile = () => open;
  moved.ports.measureImage = async () => { open = "other.html"; return undefined; };
  await assert.rejects(framePlace(moved.ports, moved.target, { shape: "square" }, moved.proof), /page changed/);
  assert.equal(moved.calls.length, 0);
});
test("custom-property blocks keep their nested declarations; only top-level ones are the image's", () => {
  const block = "--theme: { color: red; object-fit: contain; aspect-ratio: 1 }";
  const tag = `<img src="/a.webp" style="${block}; color: blue">`;
  assert.equal(readPlaceFrame(tag).shape, "original");
  const square = writePlaceFrame(tag, { shape: "square", focus: { x: 10, y: 90 } });
  assert.equal(style(square), `${block}; color: blue; aspect-ratio: 1 / 1; object-fit: cover; object-position: 10% 90%`);
  assert.equal(readPlaceFrame(square).shape, "square");
  assert.equal(style(writePlaceFrame(square, { shape: "original" })), `${block}; color: blue;`);
});

test("looping video start tags take and read the same shape and focus declarations", () => {
  const tag = '<video slot="image" src="/media/v.mp4" controls muted loop playsinline style="border-radius:12px">';
  const framed = writePlaceFrame(tag, { shape: "16:9", focus: { x: 27, y: 73 } });
  assert.deepEqual(readPlaceFrame(framed), { shape: "16:9", focus: { x: 27, y: 73 }, trimmed: false, file: "media/v.mp4" });
  assert.match(framed, /border-radius:12px/);
  assert.match(framed, /controls muted loop playsinline/);
  assert.throws(() => writePlaceFrame('<video controls>', { shape: "square" }), /Choose an image place/);
});

test("Original in a shaped component writes auto and contain; component shape removes overrides keeping focus", () => {
  const own = '<img slot="image" style="color:red;aspect-ratio:1;object-fit:cover;object-position:20% 30%">';
  const original = writePlaceFrame(own, { shape: "original", originalUnderComponent: true });
  assert.match(style(original)!, /aspect-ratio: auto;/);
  assert.match(style(original)!, /object-fit: contain;/);
  assert.equal(readPlaceFrame(original, undefined, "index.html", true).shape, "original");
  const component = writePlaceFrame(own, { shape: "component" });
  assert.equal(style(component), "color:red;object-position:20% 30%");
  assert.equal(readPlaceFrame(component).focus?.x, 20);
  assert.equal(writePlaceFrame(original, { shape: "component" }), '<img slot="image" style="color:red;">');
});
