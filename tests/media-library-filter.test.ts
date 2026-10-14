import { test } from "node:test";
import assert from "node:assert/strict";
import { accepts, filterMediaLibrary, mediaFamilyUsage, mediaLibraryTags, mediaLibraryTiles } from "../src/page-builder/media-library-filter";
import type { MediaLibrary, MediaLibraryItem } from "../src/page-builder/media-picker";
import type { MediaLibraryFilter } from "../src/page-builder/media-library-filter";

const library = {
  key: "site",
  items: [
    { path: "images/B.jpg", size: 20, date: 10 },
    { path: "root.PNG", size: 10, date: 20 },
    { path: "images/a.webp", size: 20, date: 10 },
    { path: "images/sub/c.svg" },
  ],
  metadata: {
    "images/B.jpg": { alt: "Summer Portrait", tags: ["People", "summer"] },
    "root.PNG": { alt: "", tags: ["summer"] },
  },
  collections: [], usage: { "images/a.webp": { pages: ["index.html"], files: ["index.html"], alts: ["Golden SUNSET"] } },
} satisfies MediaLibrary;

function paths(options: Partial<MediaLibraryFilter> = {}, source: MediaLibrary = library) {
  return filterMediaLibrary(source, { query: "", folder: "", tag: "", sort: "name", ...options }).map(item => item.path);
}

test("search trims and ignores case across path, default alt, tags and usage alts", () => {
  assert.deepEqual(paths({ query: "  B.JPG  " }), ["images/B.jpg"]);
  assert.deepEqual(paths({ query: "  PORTRAIT  " }), ["images/B.jpg"]);
  assert.deepEqual(paths({ query: "pEoPlE" }), ["images/B.jpg"]);
  assert.deepEqual(paths({ query: "  sunset  " }), ["images/a.webp"]);
  assert.deepEqual(paths({ query: "SUMMER" }), ["images/B.jpg", "root.PNG"]);
  assert.equal(paths({ query: "  " }).length, 4);
});

test("accept supports extensions, image wildcard, MIME and comma separated choices", () => {
  assert.deepEqual(paths({ accept: " .PNG " }), ["root.PNG"]);
  assert.equal(paths({ accept: "image/*" }).length, 4);
  assert.deepEqual(paths({ accept: " IMAGE/JPEG " }), ["images/B.jpg"]);
  assert.deepEqual(paths({ accept: ".svg, image/webp" }), ["images/a.webp", "images/sub/c.svg"]);
  assert.equal(accepts("unknown.bin", "image/*"), false);
  assert.equal(accepts("unknown.bin"), true);
  assert.deepEqual(paths({ accept: "video/*" }), []);
});

test("folder distinguishes all, repository root and exact sub-folder", () => {
  assert.equal(paths({ folder: "" }).length, 4);
  assert.deepEqual(paths({ folder: "/" }), ["root.PNG"]);
  assert.deepEqual(paths({ folder: "images" }), ["images/a.webp", "images/B.jpg"]);
  assert.deepEqual(paths({ folder: "images/sub" }), ["images/sub/c.svg"]);
});

test("tags are unique and sorted; tag filter is exact and combines with other filters", () => {
  assert.deepEqual(mediaLibraryTags(library.metadata), ["People", "summer"]);
  assert.deepEqual(mediaLibraryTags({}), []);
  assert.deepEqual(paths({ tag: "summer" }), ["images/B.jpg", "root.PNG"]);
  assert.deepEqual(paths({ tag: "people" }), []);
  assert.deepEqual(paths({ tag: "summer", folder: "images", query: "portrait", accept: ".jpg" }), ["images/B.jpg"]);
});

test("name sorts paths; date and size descend with path tie-breaks and missing values as zero", () => {
  const items: MediaLibraryItem[] = [
    { path: "z.jpg" }, { path: "b.jpg", size: 30, date: 40 },
    { path: "a.jpg", size: 30, date: 40 }, { path: "c.jpg", size: 10, date: 50 },
    { path: "d.jpg", size: 0, date: 0 },
  ];
  const source = { key: "sort", items, metadata: {}, collections: [], usage: {} } satisfies MediaLibrary;
  assert.deepEqual(paths({ sort: "name" }, source), ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "z.jpg"]);
  assert.deepEqual(paths({ sort: "size" }, source), ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "z.jpg"]);
  assert.deepEqual(paths({ sort: "date" }, source), ["c.jpg", "a.jpg", "b.jpg", "d.jpg", "z.jpg"]);
  assert.deepEqual(items.map(item => item.path), ["z.jpg", "b.jpg", "a.jpg", "c.jpg", "d.jpg"]);
});

test("empty libraries and unmatched filters return no results", () => {
  assert.deepEqual(paths({ query: "absent" }), []);
  assert.deepEqual(paths({ folder: "missing" }), []);
  assert.deepEqual(paths({}, { key: "empty", items: [], metadata: {}, collections: [], usage: {} }), []);
});

test("tiles show one item per Image family and keep other files", () => {
  const items = [
    { path: "images/photo.webp" }, { path: "images/photo-480w.webp" }, { path: "images/photo-960.webp" },
    { path: "media/originals/photo.heic" }, { path: "images/photo-2.webp" }, { path: "images/logo-480w.png" },
    { path: "images/report-2024.png" }, { path: "docs/guide.pdf" }, { path: "images/hero-crop.jpg" },
  ];
  assert.deepEqual(mediaLibraryTiles(items).map(item => item.path), [
    "images/photo.webp", "images/photo-2.webp", "images/logo-480w.png", "images/report-2024.png", "docs/guide.pdf", "images/hero-crop.jpg",
  ]);
  const sized = [{ path: "a.png", size: 3 }, { path: "a-480w.png", size: 1 }];
  assert.equal(mediaLibraryTiles(sized)[0], sized[0]);
  assert.deepEqual(mediaLibraryTiles([]), []);
});

test("a family's main counts the pages of all its members, each once", () => {
  const items = [{ path: "images/photo.webp" }, { path: "images/photo-480w.webp" }, { path: "images/photo-960w.webp" }, { path: "images/solo.png" }, { path: "images/other.png" }];
  const use = (pages: string[], alts: string[] = []) => ({ pages, files: pages, alts });
  const copyOnly = mediaFamilyUsage({ items, usage: { "images/photo-480w.webp": use(["about/index.html"]), "images/solo.png": use(["index.html"]) } });
  assert.deepEqual(copyOnly["images/photo.webp"], use(["about/index.html"]));
  assert.deepEqual(copyOnly["images/solo.png"], use(["index.html"]));
  assert.equal(copyOnly["images/other.png"], undefined);
  const both = mediaFamilyUsage({ items, usage: {
    "images/photo.webp": use(["index.html"], ["Desk"]), "images/photo-480w.webp": use(["index.html", "work/index.html"], ["Desk"]),
    "images/photo-960w.webp": use(["work/index.html"], ["Studio"]),
  } });
  assert.deepEqual(both["images/photo.webp"], use(["index.html", "work/index.html"], ["Desk", "Studio"]));
  assert.deepEqual(both["images/photo-480w.webp"], use(["index.html", "work/index.html"], ["Desk"]));
  const unused = { "images/solo.png": use([]) };
  assert.deepEqual(mediaFamilyUsage({ items, usage: unused }), unused);
});
