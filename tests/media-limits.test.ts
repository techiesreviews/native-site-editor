import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_FILE_CAP_BYTES, LARGE_IMAGE_BYTES, LARGE_DOWNLOAD_BYTES, REPO_SIZE_LARGE_BYTES, REPO_SIZE_NEAR_LIMIT_BYTES,
  largeDownloadNote, preparationFailure, mayHoldHiddenDetails, svgHasExecutableContent, repoSizeStatus,
} from "../src/page-builder/media-limits";

const ascii = (value: string) => [...new TextEncoder().encode(value)];
const jpeg = (marker?: number) => new Uint8Array([0xff, 0xd8, ...marker === undefined ? [] : [0xff, marker, 0, 2], 0xff, 0xd9]);
const pngChunk = (kind: string, data: number[] = []) => [0, 0, 0, data.length, ...ascii(kind), ...data, 0, 0, 0, 0];
const png = (kind?: string) => new Uint8Array([
  137, ...ascii("PNG\r\n"), 26, 10, ...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
  ...kind ? pngChunk(kind) : [], ...pngChunk("IEND"),
]);
const webp = (kind = "VP8 ") => new Uint8Array([...ascii("RIFF"), 12, 0, 0, 0, ...ascii("WEBP"), ...ascii(kind), 0, 0, 0, 0]);
const jpegWith = (marker: number, data: number[]) => new Uint8Array([0xff, 0xd8, 0xff, marker, 0, data.length + 2, ...data, 0xff, 0xd9]);
const jfif = [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0];
const adobe = [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1];
const failure = (name: string, bytes = new Uint8Array(), size = bytes.length, shown = true) => preparationFailure({ name, size }, bytes, shown);
const advice = (name: string, pattern: RegExp, bytes = new Uint8Array(), size = bytes.length, shown = true) => {
  const result = failure(name, bytes, size, shown);
  assert.equal(result.kind, "advice");
  if (result.kind === "advice") assert.match(result.message, pattern);
};

test("stored cap is exactly 20 MiB, labelled 20 MB", () => {
  assert.equal(MEDIA_FILE_CAP_BYTES, 20_971_520);
  assert.equal(failure("guide.pdf", undefined, 20_971_520).kind, "ask");
  advice("guide.pdf", /21\.0 MB.*20 MB.*smaller export/, undefined, 20_971_521);
});
test("large download thresholds and sizes use decimal bytes", () => {
  assert.equal(LARGE_IMAGE_BYTES, 1_000_000); assert.equal(LARGE_DOWNLOAD_BYTES, 10_000_000);
  for (const name of ["photo.jpg", "photo.webp", "photo.svg"]) {
    assert.equal(largeDownloadNote({ name, size: 1_000_000 }), undefined);
    assert.match(largeDownloadNote({ name, size: 1_000_001 })!, /1\.0 MB.*phones/);
  }
  assert.match(largeDownloadNote({ name: "holiday.webp", size: 1_400_000 })!, /holiday.webp is 1\.4 MB/);
  for (const name of ["film.mp4", "song.mp3", "guide.pdf", "files.zip"]) {
    assert.equal(largeDownloadNote({ name, size: 10_000_000 }), undefined);
    assert.match(largeDownloadNote({ name, size: 10_000_001 })!, /10\.0 MB/);
  }
});
test("unsuitable formats give useful export advice", () => {
  for (const ext of ["tif", "tiff", "bmp"]) advice(`photo.${ext}`, /JPEG or PNG/);
  for (const ext of ["mov", "mkv", "avi", "ogv"]) advice(`film.${ext}`, /MP4 \(H\.264\)/);
  for (const ext of ["flac", "aiff", "aif", "ogg", "oga", "opus", "wma"]) advice(`song.${ext}`, /MP3 or M4A/);
});
test("clean suitable files can only be added after asking", () => {
  for (const name of ["guide.pdf", "files.zip", "film.mp4", "film.m4v", "film.webm", "song.mp3", "song.m4a", "song.aac", "song.wav", "animation.gif", "icon.ico"])
    assert.equal(failure(name).kind, "ask", name);
  assert.equal(failure("photo.jpg", jpeg()).kind, "ask");
  assert.equal(failure("photo.jpeg", jpegWith(0xe0, jfif)).kind, "ask");
  assert.equal(failure("photo.jpeg", jpegWith(0xe0, [...jfif.slice(0, 12), 1, 1, 9, 9, 9])).kind, "ask");
  assert.equal(failure("photo.jpg", jpegWith(0xee, adobe)).kind, "ask");
  assert.equal(failure("photo.png", png()).kind, "ask");
  assert.equal(failure("photo.webp", webp()).kind, "ask");
  // Colour profiles and harmless layout blocks are not personal details.
  assert.equal(failure("photo.jpg", jpegWith(0xe2, ascii("ICC_PROFILE\0\x01\x01"))).kind, "ask");
  assert.equal(failure("photo.png", png("iCCP")).kind, "ask");
  assert.equal(failure("photo.webp", new Uint8Array([...ascii("RIFF"), 20, 0, 0, 0, ...ascii("WEBP"), ...ascii("ICCP"), 0, 0, 0, 0, ...ascii("VP8 "), 0, 0, 0, 0])).kind, "ask");
});
test("a picture this browser cannot show is never offered unchanged", () => {
  for (const [name, bytes] of [["photo.jpg", jpeg()], ["photo.png", png()], ["photo.webp", webp()], ["logo.svg", new TextEncoder().encode("<svg/>")]] as const)
    advice(name, /cannot show it as a picture.*JPEG or PNG/, bytes, bytes.length, false);
  // Other kinds are not pictures; showing them is not checked.
  assert.equal(failure("guide.pdf", undefined, 0, false).kind, "ask");
});
test("hidden details and broken or unknown images cannot bypass preparation", () => {
  advice("photo.jpg", /Hidden personal details/, new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0, 2, 0xff, 0xe1, 0, 2, 0xff, 0xd9]));
  // Exif/XMP, IPTC, comments and any other unknown block may hold personal details.
  for (const marker of [0xe1, 0xe3, 0xec, 0xed, 0xef, 0xfe]) advice("photo.jpg", /Hidden personal details.*new JPEG or PNG/, jpeg(marker));
  advice("photo.jpg", /Hidden personal details/, jpegWith(0xfe, ascii("Taken at 12 Elm Street")));
  advice("photo.jpg", /Hidden personal details/, jpegWith(0xe2, ascii("MPF\0")));
  // APP0 and APP14 pass only in their standard shape.
  const address = ascii("Taken at 12 Elm Street");
  for (const data of [[...ascii("JFIF\0"), ...address], [...jfif, ...address], [...jfif.slice(0, 12), 1, 1], [...ascii("JFXX\0"), 0x10, 0xff, 0xd8], address])
    advice("photo.jpg", /Hidden personal details/, jpegWith(0xe0, data));
  for (const data of [[...adobe, ...address], [...ascii("Adobe"), ...address], address])
    advice("photo.jpg", /Hidden personal details/, jpegWith(0xee, data));
  advice("photo.png", /Hidden personal details/, png("prVt"));
  advice("photo.webp", /Hidden personal details/, webp("abcd"));
  for (const kind of ["tEXt", "eXIf", "iTXt", "zTXt"]) advice("photo.png", /Hidden personal details/, png(kind));
  for (const kind of ["EXIF", "XMP "]) advice("photo.webp", /Hidden personal details/, webp(kind));
  for (const name of ["photo.jpg", "photo.png", "photo.webp", "photo.avif"]) advice(name, /Hidden personal details/);
  for (const name of ["photo.jpg", "photo.png", "photo.webp"]) assert.equal(mayHoldHiddenDetails(new Uint8Array([1, 2]), name), true);
  assert.equal(mayHoldHiddenDetails(png().subarray(0, 30), "photo.png"), true);
  assert.equal(mayHoldHiddenDetails(webp().subarray(0, 19), "photo.webp"), true);
});
test("SVG executable content cannot bypass preparation", () => {
  for (const source of ['<svg><script/></svg>', '<svg onload="go()"/>', '<svg><a href="javascript:go()"/></svg>',
    '<svg><use href="java&#x73;cript:go()"/></svg>', '<svg><use href="java&#9;script:go()"/></svg>',
    '<svg><use href="VBScript:go()"/></svg>', '<svg><use href="data:text/html,go()"/></svg>',
    '<svg><animate attributeName="xlink:href" to="#safe"/></svg>', "<svg><s:script/></svg>",
    "<svg><FOREIGNOBJECT/></svg>", "<svg><iframe/></svg>", "<svg><embed/></svg>", "<svg><object/></svg>",
    '<?xml-stylesheet type="text/xsl" href="evil.xsl"?><svg/>',
    // A quoted ">" is not the end of a tag; entities defined in a DOCTYPE can expand into markup; unreadable markup is unsafe.
    '<svg xmlns="http://www.w3.org/2000/svg" data-note=">" onload="alert(1)"><rect width="10" height="10"/></svg>',
    "<svg data-note='>' ONLOAD='go()'/>", '<!DOCTYPE svg [<!ENTITY run "x">]><svg>&run;</svg>', "<svg><a href=javascript:go()/></svg>",
    "<svg>< script>go()</script></svg>", '<svg><path d="M0 0"', '<svg><use href="&#x6A;avascript&colon;go()"/></svg>',
    '<svg><set attributeName="xlink:href" to="#x"/></svg>', '<svg><set attributeName="onclick" to="go()"/></svg>']) {
    const bytes = new TextEncoder().encode(source);
    assert.equal(svgHasExecutableContent(bytes), true);
    advice("logo.svg", /scripts that cannot be removed/, bytes);
  }
  const clean = new TextEncoder().encode('<svg><path d="M0 0"/></svg>');
  assert.equal(svgHasExecutableContent(clean), false);
  // Displayed words are not code, even when they look like it.
  for (const words of ["online=yes", "javascript: example", "&lt;script&gt;", "&#106;avascript:x", "a > b", "<![CDATA[online=yes]]>", "<![CDATA[<script>go()</script>]]>"])
    assert.equal(svgHasExecutableContent(new TextEncoder().encode(`<svg><text>${words}</text></svg>`)), false, words);
  // Plain attributes may say "javascript:" as words; names may be in any script.
  for (const source of ['<svg><rect data-note="javascript: example"/></svg>', '<svg xmlns:\u56f3="http://www.w3.org/2000/svg"><\u56f3:rect width="10"/></svg>'])
    assert.equal(svgHasExecutableContent(new TextEncoder().encode(source)), false, source);
  for (const source of ['<svg><image src="javascript:go()"/></svg>', '<svg><a xml:base="javascript:go()//" href="x"/></svg>', '<svg><animate attributeName="href" values="javascript:go()"/></svg>'])
    assert.equal(svgHasExecutableContent(new TextEncoder().encode(source)), true, source);
  assert.equal(failure("logo.svg", clean).kind, "ask");
  assert.equal(mayHoldHiddenDetails(clean, "logo.svg"), false);
});
test("repository size converts KiB to decimal MB and GB with exact thresholds", () => {
  assert.equal(REPO_SIZE_LARGE_BYTES, 500_000_000); assert.equal(REPO_SIZE_NEAR_LIMIT_BYTES, 900_000_000);
  assert.equal(repoSizeStatus(undefined), undefined);
  assert.deepEqual(repoSizeStatus(488_281), { bytes: 499_999_744, label: "500 MB", level: "ok" });
  assert.equal(repoSizeStatus(488_282)?.level, "large");
  assert.equal(repoSizeStatus(878_906)?.level, "large");
  assert.equal(repoSizeStatus(878_907)?.level, "near-limit");
  assert.equal(repoSizeStatus(500_000)?.label, "512 MB");
  assert.equal(repoSizeStatus(1_074_219)?.label, "1.1 GB");
  assert.match(repoSizeStatus(878_907)?.message ?? "", /GitHub Pages.*1 GB.*Git history.*removed or replaced.*deleting files does not shrink/);
});
