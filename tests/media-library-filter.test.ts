import { test } from "node:test";
import assert from "node:assert/strict";
import { accepts, filterMediaLibrary, mediaFamilyUsage, mediaKind, mediaLibraryRecovery, mediaLibraryTiles, nameEnds } from "../src/page-builder/media-library-filter";
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
  return filterMediaLibrary(source, { query: "", collection: "", kind: "all", ...options }).map(item => item.path);
}

test("search trims and ignores case across path, default alt, tags and usage alts", () => {
  assert.deepEqual(paths({ query: "  B.JPG  " }), ["images/B.jpg"]);
  assert.deepEqual(paths({ query: "  PORTRAIT  " }), ["images/B.jpg"]);
  assert.deepEqual(paths({ query: "pEoPlE" }), ["images/B.jpg"]);
  assert.deepEqual(paths({ query: "  sunset  " }), ["images/a.webp"]);
  assert.deepEqual(paths({ query: "SUMMER" }), ["root.PNG", "images/B.jpg"]);
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

test("a collection is exact and combines with search, kind and accept", () => {
  assert.deepEqual(paths({ collection: "summer" }), ["root.PNG", "images/B.jpg"]);
  assert.deepEqual(paths({ collection: "people" }), []);
  assert.deepEqual(paths({ collection: "summer", query: "portrait", accept: ".jpg" }), ["images/B.jpg"]);
  assert.deepEqual(paths({ collection: "summer", kind: "video" }), []);
});

test("results are newest first, then by name, and the library is left as it was", () => {
  const items: MediaLibraryItem[] = [{ path: "z.jpg" }, { path: "b.jpg", size: 30 }, { path: "a.jpg", date: 40 }];
  const source = { key: "order", items, metadata: {}, collections: [], usage: {} } satisfies MediaLibrary;
  assert.deepEqual(paths({}, source), ["a.jpg", "b.jpg", "z.jpg"]);
  assert.deepEqual(items.map(item => item.path), ["z.jpg", "b.jpg", "a.jpg"]);
});

test("each file has one kind from its extension; Documents are PDFs and every other download", () => {
  assert.deepEqual(["a.JPG", "b.webp", "c.svg", "d.heic", "e.avif"].map(mediaKind), ["image", "image", "image", "image", "image"]);
  assert.deepEqual(["clip.mp4", "clip.WEBM", "clip.mov"].map(mediaKind), ["video", "video", "video"]);
  assert.deepEqual(["song.mp3", "song.m4a", "song.wav", "song.ogg"].map(mediaKind), ["audio", "audio", "audio", "audio"]);
  assert.deepEqual(["guide.pdf", "brief.docx", "pack.zip", "README"].map(mediaKind), ["document", "document", "document", "document"]);
});

const mixed = {
  key: "mixed",
  items: [
    { path: "media/studio.webp" }, { path: "media/studio-tour.mp4" }, { path: "media/studio-intro.mp3" },
    { path: "media/studio-guide.pdf" }, { path: "media/brief.zip" }, { path: "media/beach.jpg" },
  ],
  metadata: { "media/studio.webp": { alt: "", tags: ["Studio"] }, "media/studio-tour.mp4": { alt: "", tags: ["Studio"] } },
  collections: ["Studio", "Empty"], usage: {},
} satisfies MediaLibrary;

test("search respects the kind: Images, Video, Audio and Documents each narrow the same search", () => {
  assert.deepEqual(paths({ query: "studio" }, mixed), ["media/studio-guide.pdf", "media/studio-intro.mp3", "media/studio-tour.mp4", "media/studio.webp"]);
  assert.deepEqual(paths({ query: "studio", kind: "image" }, mixed), ["media/studio.webp"]);
  assert.deepEqual(paths({ query: "studio", kind: "video" }, mixed), ["media/studio-tour.mp4"]);
  assert.deepEqual(paths({ query: "studio", kind: "audio" }, mixed), ["media/studio-intro.mp3"]);
  assert.deepEqual(paths({ query: "studio", kind: "document" }, mixed), ["media/studio-guide.pdf"]);
  assert.deepEqual(paths({ kind: "document" }, mixed), ["media/brief.zip", "media/studio-guide.pdf"]);
  assert.deepEqual(paths({ query: "beach", kind: "video" }, mixed), []);
  assert.deepEqual(paths({ query: "studio", kind: "video", collection: "Studio" }, mixed), ["media/studio-tour.mp4"]);
});

test("when nothing matches, recovery steps back to all media first, then all collections, then clears the search", () => {
  const filter = { query: "", collection: "", kind: "all" as const };
  // A search hidden by the kind finds its file under All.
  const kind = mediaLibraryRecovery({ ...filter, query: "beach", kind: "video" });
  assert.deepEqual(kind, { label: "Search all media", change: { kind: "all" } });
  assert.deepEqual(paths({ query: "beach", kind: "video", ...kind?.change }, mixed), ["media/beach.jpg"]);
  assert.deepEqual(mediaLibraryRecovery({ ...filter, kind: "audio", collection: "Empty" }), { label: "Show all media", change: { kind: "all" } });
  assert.deepEqual(mediaLibraryRecovery({ ...filter, collection: "Empty" }), { label: "Show all collections", change: { collection: "" } });
  assert.deepEqual(mediaLibraryRecovery({ ...filter, collection: "Studio", query: "beach" }), { label: "Search all collections", change: { collection: "" } });
  assert.deepEqual(mediaLibraryRecovery({ ...filter, query: "  absent " }), { label: "Clear search", change: { query: "" } });
  assert.equal(mediaLibraryRecovery({ ...filter, query: "   " }), undefined);
  assert.equal(mediaLibraryRecovery(filter), undefined);
});

test("empty libraries and unmatched filters return no results", () => {
  assert.deepEqual(paths({ query: "absent" }), []);
  assert.deepEqual(paths({ collection: "missing" }), []);
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

test("nameEnds keeps a long name's end and extension for shortening in the middle", () => {
  assert.deepEqual(nameEnds("summer-workshop-poster.png"), ["summer-workshop-po", "ster.png"]);
  assert.deepEqual(nameEnds("portrait-maya.jpg"), ["portrait-", "maya.jpg"]);
  // Short stems keep only the extension; nothing is lost when joined.
  assert.deepEqual(nameEnds("favicon.svg"), ["favicon", ".svg"]);
  assert.deepEqual(nameEnds("a.svg"), ["a", ".svg"]);
  for (const name of ["summer-workshop-poster.png", "favicon.svg", "README", ".htaccess", "café-crème-brûlée.jpeg"]) assert.equal(nameEnds(name).join(""), name);
});

test("nameEnds treats dot files, long extensions and no extension as stems", () => {
  assert.deepEqual(nameEnds(".htaccess"), [".htac", "cess"]);
  assert.deepEqual(nameEnds("backup.archive-2026"), ["backup.archive-", "2026"]);
  assert.deepEqual(nameEnds("README"), ["README", ""]);
  assert.deepEqual(nameEnds("CHANGELOG"), ["CHANG", "ELOG"]);
});

test("nameEnds never splits a character made of two code units", () => {
  assert.deepEqual(nameEnds("holiday-🎉🎉🎉🎉.png"), ["holiday-", "🎉🎉🎉🎉.png"]);
});

import { formatMediaLength, isMediaLibraryPath, mediaTileLook, mediaTileStills } from "../src/page-builder/media-library-filter";
import { mediaFamilyOf } from "../src/page-builder/media-families";

test("Media lists every kind and leaves the site's own files out", () => {
  for (const path of ["media/images/a.webp", "logo.svg", "media/videos/a.mp4", "media/audio/a.mp3", "media/downloads/a.pdf", "files/archive.zip", "media/videos/a.vtt", "media/originals/a.jpg"])
    assert.equal(isMediaLibraryPath(path), true, path);
  for (const path of ["index.html", "styles/site.css", "scripts/media-player.js", "fonts/a.woff2", ".editor/media.json", "CNAME", "_redirects", "src/a.ts", "a/.gitkeep", "node_modules/x/a.png", "notes.md", "data.json", "wrangler.jsonc", "build.sh", "eleventy.config.cjs", "styles/site.scss"])
    assert.equal(isMediaLibraryPath(path), false, path);
});

test("a length reads as a player shows it", () => {
  assert.deepEqual([0.2, 4.6, 59.5, 61, 754, 3723].map(formatMediaLength), ["0:01", "0:04", "0:59", "1:01", "12:34", "1:02:03"]);
});

test("each kind's tile: a still and length, a sound picture and length, a first page, a type picture", () => {
  const paths = ["v/clip.mp4", "v/clip.webp", "d/report.pdf", "d/report.webp", "v/raw.mov", "d/guide.pdf"];
  const stills = mediaTileStills(paths);
  assert.deepEqual(mediaTileLook("v/clip.mp4", stills.get("v/clip.mp4"), 12.9), { picture: "v/clip.webp", icon: "video", type: "MP4", length: "0:12", fact: "0:12" });
  assert.deepEqual(mediaTileLook("a/talk.mp3", undefined, 95), { picture: undefined, icon: "audio", type: "MP3", length: "1:35", fact: "1:35" });
  assert.deepEqual(mediaTileLook("d/report.pdf", stills.get("d/report.pdf")), { picture: "d/report.webp", icon: "pdf", type: "PDF", length: undefined, fact: "PDF" });
  // Without a still or a recorded length: the type picture, and the type in its middle only.
  assert.deepEqual(mediaTileLook("v/raw.mov", stills.get("v/raw.mov")), { picture: undefined, icon: "video", type: "MOV", length: undefined, fact: undefined });
  assert.deepEqual(mediaTileLook("d/guide.pdf"), { picture: undefined, icon: "pdf", type: "PDF", length: undefined, fact: undefined });
  assert.equal(mediaTileLook("v/clip.mp4", "v/clip.webp").fact, "MP4");
  assert.deepEqual(["a.zip", "a.docx", "a.csv", "a.key", "a.vtt", "a.bin"].map(path => mediaTileLook(path).icon), ["archive", "text", "sheet", "slides", "subtitles", "file"]);
  // Pictures draw themselves and carry no corner fact; a bad length is no length.
  assert.deepEqual(mediaTileLook("a.png", undefined, 3), { picture: "a.png", icon: "file", type: "PNG", length: undefined, fact: undefined });
  assert.equal(mediaTileLook("a.mp3", undefined, Number.NaN).length, undefined);
  // The grid hides the still: one tile for the video, and Video narrows to it.
  const items = paths.map(path => ({ path }));
  const tiles = mediaLibraryTiles(items).map(item => item.path);
  assert.deepEqual(tiles, ["v/clip.mp4", "d/report.pdf", "v/raw.mov", "d/guide.pdf"]);
  const only = (kind: MediaLibraryFilter["kind"]) => filterMediaLibrary({ ...library, items: mediaLibraryTiles(items) }, { query: "", collection: "", kind }).map(item => item.path);
  assert.deepEqual(only("video"), ["v/clip.mp4", "v/raw.mov"]);
  assert.deepEqual(only("document"), ["d/guide.pdf", "d/report.pdf"]);
  assert.deepEqual(only("image"), []);
});

test("MPEG is video and AIFF audio, as agents see them; they own stills and subtitles like other kinds", () => {
  assert.deepEqual(["a.mpeg", "a.mpg", "a.aif", "a.aiff", "a.mkv", "a.docx", "a.bin"].map(mediaKind), ["video", "video", "audio", "audio", "video", "document", "document"]);
  assert.equal(mediaTileStills(["a.mpg", "a.webp"]).get("a.mpg"), "a.webp");
  assert.deepEqual(mediaFamilyOf("a.aiff", ["a.aiff", "a.vtt"])?.subtitles, ["a.vtt"]);
});


test("online copied still families have no tile; own stills and unrelated pictures keep theirs", () => {
  const items = ["media/videos/film.webp", "media/videos/film-480.webp", "media/originals/film.jpg",
    "media/own.webp", "media/own-480.webp", "media/other.jpg"].map(path => ({ path }));
  const onlineVideos = [
    { key: "online:youtube:film", service: "youtube", id: "film", still: items[0].path, stillCopied: true, uses: [] },
    { key: "online:vimeo:42", service: "vimeo", id: "42", still: "media/own.webp", uses: [] },
  ] satisfies NonNullable<MediaLibrary["onlineVideos"]>;
  assert.deepEqual(mediaLibraryTiles(items, onlineVideos).map(item => item.path), ["media/own.webp", "media/other.jpg"]);
  assert.deepEqual(mediaLibraryTiles(items).map(item => item.path), ["media/videos/film.webp", "media/own.webp", "media/other.jpg"]);
  assert.deepEqual(mediaLibraryTiles(items, []), mediaLibraryTiles(items));
});

test("Media lists the newest first; undated files follow by name, numbers in order, then by folder (slice 103)", async () => {
  const { mediaNewestFirst } = await import("../src/page-builder/media-library-filter");
  const items = [
    { path: "images/photo-10.jpg" }, { path: "media/images/old.webp", date: 1_000 }, { path: "images/Photo-2.jpg" },
    { path: "media/images/new.webp", date: 3_000 }, { path: "a/photo-2.jpg" }, { path: "media/images/mid.webp", date: 2_000 },
  ];
  assert.deepEqual([...items].sort(mediaNewestFirst).map(item => item.path), [
    "media/images/new.webp", "media/images/mid.webp", "media/images/old.webp",
    "a/photo-2.jpg", "images/Photo-2.jpg", "images/photo-10.jpg",
  ]);
  // Same moment: by name.
  assert.ok(mediaNewestFirst({ path: "z/a.png", date: 5 }, { path: "a/b.png", date: 5 }) < 0);
});

test("search results keep the newest-first order, and a just-added file leads them", () => {
  const added = { ...library, items: [...library.items, { path: "media/images/zebra.webp", date: 99 }] };
  assert.deepEqual(filterMediaLibrary(added, { query: "", collection: "", kind: "all" }).map(item => item.path), ["media/images/zebra.webp", "root.PNG", "images/a.webp", "images/B.jpg", "images/sub/c.svg"]);
});

test("a record's added time is read leniently: missing or unreadable values leave the file undated", async () => {
  const { mediaAddedTime } = await import("../src/page-builder/media-library-filter");
  assert.equal(mediaAddedTime({ added: "2026-10-15T08:30:00.000Z" }), Date.UTC(2026, 9, 15, 8, 30));
  for (const record of [undefined, {}, { added: "soon" }, { added: 12 }]) assert.equal(mediaAddedTime(record), undefined);
});
