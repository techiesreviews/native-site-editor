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
const failure = (name: string, bytes = new Uint8Array(), size = bytes.length) => preparationFailure({ name, size }, bytes);
const advice = (name: string, pattern: RegExp, bytes = new Uint8Array(), size = bytes.length) => {
  const result = failure(name, bytes, size);
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
  for (const ext of ["heic", "heif", "tif", "tiff", "bmp"]) advice(`photo.${ext}`, /JPEG or PNG/);
  for (const ext of ["mov", "mkv", "avi", "ogv"]) advice(`film.${ext}`, /MP4 \(H\.264\)/);
  for (const ext of ["flac", "aiff", "aif", "ogg", "oga", "opus", "wma"]) advice(`song.${ext}`, /MP3 or M4A/);
});
test("clean suitable files can only be added after asking", () => {
  for (const name of ["guide.pdf", "files.zip", "film.mp4", "film.m4v", "film.webm", "song.mp3", "song.m4a", "song.aac", "song.wav", "animation.gif", "icon.ico"])
    assert.equal(failure(name).kind, "ask", name);
  assert.equal(failure("photo.jpg", jpeg()).kind, "ask");
  assert.equal(failure("photo.jpeg", jpeg(0xe0)).kind, "ask");
  assert.equal(failure("photo.png", png()).kind, "ask");
  assert.equal(failure("photo.webp", webp()).kind, "ask");
});
test("hidden details and broken or unknown images cannot bypass preparation", () => {
  advice("photo.jpg", /Hidden personal details/, new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0, 2, 0xff, 0xe1, 0, 2, 0xff, 0xd9]));
  for (const marker of [0xe1, 0xed]) advice("photo.jpg", /Hidden personal details.*new JPEG or PNG/, jpeg(marker));
  for (const kind of ["tEXt", "eXIf", "iTXt", "zTXt"]) advice("photo.png", /Hidden personal details/, png(kind));
  for (const kind of ["EXIF", "XMP "]) advice("photo.webp", /Hidden personal details/, webp(kind));
  for (const name of ["photo.jpg", "photo.png", "photo.webp", "photo.avif"]) advice(name, /Hidden personal details/);
  for (const name of ["photo.jpg", "photo.png", "photo.webp"]) assert.equal(mayHoldHiddenDetails(new Uint8Array([1, 2]), name), true);
  assert.equal(mayHoldHiddenDetails(png().subarray(0, 30), "photo.png"), true);
  assert.equal(mayHoldHiddenDetails(webp().subarray(0, 19), "photo.webp"), true);
});
test("SVG executable content cannot bypass preparation", () => {
  for (const source of ['<svg><script/></svg>', '<svg onload="go()"/>', '<svg><a href="javascript:go()"/></svg>',
    "<svg><FOREIGNOBJECT/></svg>", "<svg><iframe/></svg>", "<svg><embed/></svg>", "<svg><object/></svg>"]) {
    const bytes = new TextEncoder().encode(source);
    assert.equal(svgHasExecutableContent(bytes), true);
    advice("logo.svg", /scripts that cannot be removed/, bytes);
  }
  const clean = new TextEncoder().encode('<svg><path d="M0 0"/></svg>');
  assert.equal(svgHasExecutableContent(clean), false);
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
