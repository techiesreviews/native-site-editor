import assert from "node:assert/strict";
import { test } from "node:test";
import * as media from "../shared/media-kinds.ts";

// Historical accepted sets, captured before migration. Keep these literal.
const callers: [string, RegExp, string[]][] = [
  ["shared/agent.ts:145", media.previewablePictures, ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]],
  ["shared/agent.ts:147", media.agentImages, ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg", "ico", "bmp", "tif", "tiff", "heic", "heif"]],
  ["shared/agent.ts:148", media.agentVideos, ["mp4", "webm", "mov", "m4v", "avi", "mkv", "ogv", "mpeg", "mpg"]],
  ["shared/agent.ts:149", media.agentAudio, ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "aif", "aiff"]],
  ["shared/agent.ts:150", media.agentDocuments, ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "epub", "csv"]],
  ["src/native-structure.ts:185", media.previewImages, ["svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp"]],
  ["src/native-create.ts:17", media.creationBinaryFiles, ["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tif", "tiff", "pdf", "zip", "gz", "tgz", "tar", "7z", "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "m4a", "webm", "mov", "wav", "ogg"]],
  ["src/controllers/file-operations-controller.ts:64", media.operationBinaryFiles, ["heic", "heif", "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tif", "tiff", "pdf", "zip", "gz", "tgz", "tar", "7z", "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "m4a", "webm", "mov", "wav", "ogg"]],
  ["src/components/file-type.ts:19", media.fileFonts, ["woff", "woff2", "ttf", "otf", "eot"]],
  ["src/components/file-type.ts:20", media.fileArchives, ["zip", "tar", "gz", "tgz", "7z", "rar"]],
  ["src/page-builder/media-video-place.ts:16", media.playableVideos, ["mp4", "m4v", "webm", "mov", "ogv"]],
  ["src/page-builder/image-optimise.worker.ts:168", media.losslessImages, ["png", "gif", "bmp"]],
  ["src/page-builder/image-popup-trim.ts:180", media.trimmableImages, ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"]],
  ["src/page-builder/improve-images.ts:58", media.rasterImages, ["jpg", "jpeg", "png", "bmp", "tif", "tiff", "webp", "avif", "gif"]],
  ["src/page-builder/improve-images.ts:87", media.legacyRasterImages, ["bmp", "tif", "tiff"]],
  ["src/page-builder/media-adding-rules.ts:34", media.convertedAudio, ["wav", "ogg", "oga", "opus", "flac"]],
  ["src/page-builder/media-families.ts:21", media.agentImages, ["svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tif", "tiff", "heic", "heif"]],
  ["src/page-builder/media-families.ts:26", media.subtitles, ["vtt", "srt"]],
  ["src/page-builder/media-families.ts:81", media.sharingImages, ["avif", "webp"]],
  ["src/page-builder/media-families.ts:83", media.sharingImages, ["avif", "webp"]],
  ["src/page-builder/media-heic.ts:4", media.heicImages, ["heic", "heif"]],
  ["src/page-builder/media-library-filter.ts:35", media.libraryExcludedFiles, ["ts", "cts", "mts", "tsx", "jsx", "cjs", "map", "lock", "yml", "yaml", "toml", "jsonc", "json5", "ini", "env", "sh", "ps1", "py", "rb", "php", "vue", "svelte", "astro", "sass", "scss", "less", "njk", "liquid", "hbs", "woff", "woff2", "ttf", "otf", "eot"]],
  ["src/page-builder/media-library-filter.ts:135", media.libraryArchives, ["zip", "gz", "tgz", "tar", "7z", "rar", "bz2", "xz"]],
  ["src/page-builder/media-library-filter.ts:135", media.librarySheets, ["xls", "xlsx", "ods", "csv", "numbers"]],
  ["src/page-builder/media-library-filter.ts:136", media.librarySlides, ["ppt", "pptx", "odp", "key"]],
  ["src/page-builder/media-library-filter.ts:136", media.libraryText, ["doc", "docx", "odt", "rtf", "pages", "txt", "md", "epub"]],
  ["src/page-builder/media-library-filter.ts:136", media.subtitles, ["vtt", "srt"]],
  ["src/page-builder/media-limits.ts:30", media.animationUncheckedImages, ["gif", "svg", "ico"]],
  ["src/page-builder/media-limits.ts:168", media.legacyRasterImages, ["tif", "tiff", "bmp"]],
  ["src/page-builder/media-limits.ts:170", media.adviceAudio, ["flac", "aif", "aiff", "ogg", "oga", "opus", "wma"]],
  ["src/page-builder/media-limits.ts:179", media.suitableFiles, ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg", "ico", "mp4", "m4v", "webm", "mp3", "m4a", "aac", "wav"]],
  ["src/page-builder/media-mentions.ts:6", media.binaryFiles, ["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "heif", "ico", "icns", "cur", "apng", "jfif", "bmp", "tif", "tiff", "jxl", "psd", "raw", "aif", "aiff", "mid", "midi", "mpeg", "mpg", "3gp", "mp3", "mp4", "m4a", "m4v", "webm", "mov", "avi", "mkv", "wav", "ogg", "oga", "ogv", "flac", "aac", "opus", "woff", "woff2", "ttf", "ttc", "otf", "eot", "svgz", "zip", "gz", "tgz", "tar", "7z", "rar", "bz2", "xz", "br", "zst", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "odp", "ods", "pages", "numbers", "key", "wasm", "exe", "dll", "bin"]],
  ["src/page-builder/media-mentions.ts:12", media.textMediaFiles, ["svg", "vtt", "srt"]],
  ["src/page-builder/media-names.ts:7", media.renamableMedia, ["svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "heif", "ico", "bmp", "mp4", "m4v", "webm", "mov", "ogv", "mkv", "avi", "mpg", "mpeg", "mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "aif", "aiff", "pdf"]],
  ["src/page-builder/media-storage.ts:13", media.agentVideos, ["mp4", "m4v", "webm", "mov", "mkv", "ogv", "avi", "mpg", "mpeg"]],
  ["src/page-builder/media-storage.ts:15", media.optimisableImages, ["jpg", "jpeg", "png", "webp", "avif", "bmp", "svg", "heic", "heif"]],
  ["src/page-builder/media-transparency.ts:3", media.transparentImages, ["png", "webp", "gif", "avif", "svg"]],
  ["src/page-builder/replace-everywhere.ts:21", media.replaceableImages, ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "tif", "tiff", "heic", "heif"]],
  ["src/page-builder/replace-everywhere.ts:139", media.sharingImages, ["avif", "webp"]],
  ["src/native-settings.ts:243", media.trimmableImages, ["jpg", "jpeg", "png", "webp", "avif", "bmp", "gif"]],
  ["src/native-settings.ts:252", media.trimmableImages, ["jpg", "jpeg", "png", "webp", "avif", "bmp", "gif"]],
  ["src/page-builder/agent-media-place.ts:37", media.playableVideos, ["mp4", "webm", "m4v", "mov", "ogv"]],
  ["src/page-builder/improve-heavy.ts:137", media.sharingImages, ["avif", "webp"]],
  ["src/page-builder/improve-heavy.ts:220", media.sharingImages, ["avif", "webp"]],
  ["src/page-builder/media-file-details.ts:117", media.trimmableImages, ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"]],
  ["src/page-builder/media-older-copies.ts:10", media.trimmableImages, ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"]],
  ["src/page-builder/media-spot-pick.ts:11", media.agentVideos, ["mp4", "m4v", "webm", "mov", "ogv", "mkv", "avi", "mpg", "mpeg"]],
  ["src/page-builder/social-image.ts:44", media.trimmableImages, ["jpg", "jpeg", "png", "webp", "avif", "bmp", "gif"]],
  ["src/page-builder/social-sharing.ts:20", media.trimmableImages, ["jpg", "jpeg", "png", "webp", "avif", "bmp", "gif"]],
  ["src/page-builder/media-limits.ts:169", media.adviceVideos, ["mov", "mkv", "avi", "ogv"]],
];
const probes = [...new Set([...Object.values(media.MEDIA_KINDS).flatMap(extensions => extensions.split(" ")), ...callers.flatMap(([, , extensions]) => extensions), "unknown", "jpeg2000", "mp42", "", "txt"])];
for (const [caller, pattern, extensions] of callers) {
  test(`${caller}: historical path set`, () => {
    for (const extension of probes) {
      for (const spelling of [extension, extension.toUpperCase()]) {
        assert.equal(pattern.test(`folder/file.${spelling}`), extensions.includes(extension), `${caller}: ${spelling}`);
        assert.equal(pattern.test(`file.${spelling}/child`), false);
        assert.equal(pattern.test(`file.${spelling}?query`), false);
        assert.equal(pattern.test(spelling), false);
      }
    }
  });
}

test("shared/asset-types.ts: ASSET_TYPES mapping", () => {
  assert.deepEqual(media.assetMimeTypes, {"svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp", "avif": "image/avif", "ico": "image/x-icon", "bmp": "image/bmp", "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "otf": "font/otf"});
});

test("shared/asset-types.ts: AUDIO_TYPES mapping", () => {
  assert.deepEqual(media.audioMimeTypes, {"mp3": "audio/mpeg", "m4a": "audio/mp4", "aac": "audio/aac", "oga": "audio/ogg", "ogg": "audio/ogg", "opus": "audio/ogg", "wav": "audio/wav", "flac": "audio/flac"});
});

test("src/uploads.ts: IMAGE_TYPES mapping", () => {
  assert.deepEqual(media.uploadMimeTypes, {"svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp", "avif": "image/avif", "ico": "image/x-icon", "bmp": "image/bmp"});
});

test("src/page-builder/media-play.ts: MEDIA_TYPES mapping", () => {
  assert.deepEqual(media.playableMimeTypes, {"mp4": "video/mp4", "m4v": "video/mp4", "webm": "video/webm", "mov": "video/quicktime", "ogv": "video/ogg", "mp3": "audio/mpeg", "m4a": "audio/mp4", "aac": "audio/aac", "oga": "audio/ogg", "ogg": "audio/ogg", "opus": "audio/ogg", "wav": "audio/wav", "flac": "audio/flac"});
});

test("src/page-builder/outside-pictures.ts: formats mapping", () => {
  assert.deepEqual(media.outsidePictureFormats, {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/bmp": "bmp"});
});

test("src/page-builder/media-replace-rules.ts: FORMATS mapping", () => {
  assert.deepEqual(media.replacementLabels, {"webp": "a WebP", "png": "a PNG", "jpg": "a JPEG", "jpeg": "a JPEG", "avif": "an AVIF"});
});

const bareCallers: [string, RegExp | string[], string[], boolean][] = [
  ["src/page-builder/media-replace-rules.ts: format(chosen)", media.replacementFormats, ["png", "jpg", "jpeg", "webp", "avif"], false],
  ["src/page-builder/replace-everywhere.ts: output.extension", media.replacementOutputFormats, ["png", "jpg", "jpeg", "webp", "avif"], true],
  ["src/page-builder/media-older-copies.ts: own", media.olderCopyFormats, ["jpg", "jpeg", "png", "webp", "avif"], false],
  ["src/page-builder/palette-catalog.ts: ext", media.paletteImages, ["png", "jpg", "jpeg", "gif", "webp", "avif", "ico"], false],
];
for (const [caller, pattern, extensions, insensitive] of bareCallers) {
  test(`${caller}: historical bare-extension set`, () => {
    const accepts = (value: string) => pattern instanceof RegExp ? pattern.test(value) : pattern.includes(value);
    for (const extension of probes) {
      assert.equal(accepts(extension), extensions.includes(extension), extension);
      assert.equal(accepts(extension.toUpperCase()), insensitive && extensions.includes(extension), extension);
      assert.equal(accepts(`file.${extension}`), false);
      assert.equal(accepts(`.${extension}`), false);
      assert.equal(accepts(`${extension}?query`), false);
      assert.equal(accepts(extension + "\n"), false);
    }
  });
}

test("image-optimise.worker and media-heic retain MIME input, flags and anchors", () => {
  const callers: [RegExp, string[], boolean][] = [
    [media.losslessImageTypes, ["image/png", "image/gif", "image/bmp"], false],
    [media.heicImageTypes, ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"], true],
  ];
  for (const [pattern, types, insensitive] of callers) {
    for (const type of [...types, ...probes.map(extension => media.mimeType(`file.${extension}`)).filter((type): type is string => !!type), "image/unknown"]) {
      assert.equal(pattern.test(type), types.includes(type), type);
      assert.equal(pattern.test(type.toUpperCase()), insensitive && types.includes(type), type);
      assert.equal(pattern.test(type + ";charset=utf-8"), false);
      assert.equal(pattern.test(type.replace("image/", "")), false);
    }
  }
});

test("picker accept strings retain exact order, aliases and MIME input", () => {
  assert.equal(media.VIDEO_ACCEPT, ".mp4,.m4v,.webm,.mov,.ogv"); // media-spot-pick and media-video-place
  assert.equal(media.HEIC_ACCEPT, ".heic,.heif"); // media-library-shell
  assert.equal(media.REPLACE_ACCEPT, "image/png,image/jpeg,image/webp,image/avif");
  assert.equal(media.SOCIAL_IMAGE_ACCEPT, "image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp");
});

test("canonical helpers classify a path and enumerate kinds without inherited keys", () => {
  for (const [path, kind, mime] of [
    ["photo.JPG", "image", "image/jpeg"], ["folder/clip.M4V", "video", "video/mp4"],
    ["sound.opus", "audio", "audio/ogg"], ["document.PDF", "document", "application/pdf"],
    ["font.woff2", "font", "font/woff2"], ["download.zip", "archive", "application/zip"],
  ]) {
    assert.equal(media.mediaKind(path), kind);
    assert.equal(media.mimeType(path), mime);
    assert.equal(media.isImagePath(path), kind === "image");
  }
  assert.deepEqual(media.extensionsOf("font"), ["woff2", "woff", "ttf", "otf", "eot", "ttc"]);
  for (const path of ["jpg", "file.unknown", "file.jpg?query", "file.jpg/child", "file.constructor", "file.__proto__", "file.ts", "file.json5", "file.ps1"]) {
    assert.equal(media.mediaKind(path), "other", path);
    assert.equal(media.mimeType(path), undefined, path);
  }
});

// improve-heavy reserves these exact companion addresses, in this order (old line 138).
test("improve-heavy sharing companions retain the old extension set and name order", () => {
  assert.deepEqual(media.sharingImageExtensions, ["avif", "webp"]);
  const stem = "images/photo";
  assert.deepEqual([stem + "-sharing.jpg", ...media.sharingImageExtensions.map(extension => stem + "." + extension)],
    ["images/photo-sharing.jpg", "images/photo.avif", "images/photo.webp"]);
});

// Unused MIME strings must not turn kind-only entries into supported upload/play formats.
test("kind-only extensions keep classification without unused MIME types", () => {
  const kinds = {
    image: ["tif", "tiff", "heic", "heif", "icns", "cur", "apng", "jfif", "jxl", "psd", "raw", "svgz"],
    audio: ["aif", "aiff", "mid", "midi", "wma"],
    video: ["avi", "mkv", "mpeg", "mpg", "3gp"],
    font: ["eot", "ttc"],
    document: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "epub", "csv", "pages", "numbers", "key", "txt", "md", "vtt", "srt"],
    archive: ["gz", "tgz", "tar", "7z", "rar", "bz2", "xz", "br", "zst"],
    binary: ["wasm", "exe", "dll", "bin"],
  };
  for (const [kind, extensions] of Object.entries(kinds)) {
    for (const extension of extensions) {
      const path = `folder/file.${extension.toUpperCase()}`;
      assert.equal(media.mediaKind(path), kind, path);
      assert.equal(media.mimeType(path), undefined, path);
    }
  }
});
