/** Canonical kinds. MIME types below cover historical callers and the path helper's PDF/ZIP cases. */
const imageExtensions = "svg png jpg jpeg gif webp avif ico bmp";
const fontExtensions = "woff2 woff ttf otf";
const audioExtensions = "mp3 m4a aac oga ogg opus wav flac";
const videoExtensions = "mp4 m4v webm mov ogv";
const heicExtensions = "heic heif";
export const MEDIA_KINDS = {
  image: imageExtensions + " tif tiff " + heicExtensions + " icns cur apng jfif jxl psd raw svgz",
  font: fontExtensions + " eot ttc",
  audio: audioExtensions + " aif aiff mid midi wma",
  video: videoExtensions + " avi mkv mpeg mpg 3gp",
  document: "pdf doc docx xls xlsx ppt pptx odt ods odp rtf epub csv pages numbers key txt md vtt srt",
  archive: "zip gz tgz tar 7z rar bz2 xz br zst",
  binary: "wasm exe dll bin",
} as const;
export type MediaKind = keyof typeof MEDIA_KINDS;
export function extensionsOf(kind: MediaKind): string[] { return MEDIA_KINDS[kind].split(" "); }
function extension(path: string) { return /\.([a-z\d]+)$/i.exec(path)?.[1].toLowerCase() ?? ""; }
/** Suffix checks retain the old path regex semantics (including dotfiles and `$`). */
export function mediaKind(path: string): MediaKind | "other" {
  const suffix = extension(path);
  return (Object.keys(MEDIA_KINDS) as MediaKind[]).find(kind => extensionsOf(kind).includes(suffix)) ?? "other";
}
export function mimeType(path: string): string | undefined {
  const suffix = extension(path);
  if (suffix === "pdf" || suffix === "zip") return "application/" + suffix;
  return Object.hasOwn(MIME_TYPES, suffix) ? MIME_TYPES[suffix] : undefined;
}
export const isImagePath = (path: string) => mediaKind(path) === "image";

// Listed image/audio/video/font extensions default to `${kind}/${extension}`; only exceptions need spelling out.
function types(kind: string, extensions: string, exceptions: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(extensions.split(" ").map(extension => [extension, `${kind}/${exceptions[extension] ?? extension}`]));
}
const MIME_TYPES: Record<string, string> = {
  .../* @__PURE__ */ types("image", imageExtensions, { svg: "svg+xml", jpg: "jpeg", ico: "x-icon" }),
  .../* @__PURE__ */ types("font", fontExtensions),
  .../* @__PURE__ */ types("audio", audioExtensions, { mp3: "mpeg", m4a: "mp4", oga: "ogg", opus: "ogg" }),
  .../* @__PURE__ */ types("video", videoExtensions, { m4v: "mp4", mov: "quicktime", ogv: "ogg" }),
};

function paths(extensions: string) { return new RegExp("\\.(?:" + extensions.split(" ").join("|") + ")$", "i"); }
function bare(extensions: string, flags = "") { return new RegExp("^(?:" + extensions.split(" ").join("|") + ")$", flags); }
function mimeMap(extensions: string): Record<string, string> {
  return Object.fromEntries(extensions.split(" ").map(extension => [extension, MIME_TYPES[extension]]));
}

const pictureExtensions = "jpg jpeg png webp avif";
const agentVideoExtensions = videoExtensions + " avi mkv mpeg mpg";
const agentAudioExtensions = audioExtensions + " aif aiff";
const replacementExtensions = "png jpg jpeg webp avif";
const creationExtensions = "png jpg jpeg gif webp avif ico bmp tif tiff pdf zip gz tgz tar 7z woff woff2 ttf otf eot mp3 mp4 m4a webm mov wav ogg";
// These subsets are policies, not additional kind or MIME tables. Do not widen a caller by replacing its subset with a kind.
export const previewablePictures = /* @__PURE__ */ paths(pictureExtensions + " gif svg");
export const agentImages = /* @__PURE__ */ paths(imageExtensions + " tif tiff " + heicExtensions);
export const agentVideos = /* @__PURE__ */ paths(agentVideoExtensions);
export const agentAudio = /* @__PURE__ */ paths(agentAudioExtensions);
export const agentDocuments = /* @__PURE__ */ paths("pdf doc docx xls xlsx ppt pptx odt ods odp rtf epub csv");
export const previewImages = /* @__PURE__ */ paths(imageExtensions);
export const creationBinaryFiles = /* @__PURE__ */ paths(creationExtensions);
export const operationBinaryFiles = /* @__PURE__ */ paths(heicExtensions + " " + creationExtensions);
export const fileFonts = /* @__PURE__ */ paths(fontExtensions + " eot");
export const fileArchives = /* @__PURE__ */ paths("zip tar gz tgz 7z rar");
export const playableVideos = /* @__PURE__ */ paths(videoExtensions);
export const losslessImages = /* @__PURE__ */ paths("png gif bmp");
export const trimmableImages = /* @__PURE__ */ paths(pictureExtensions + " gif bmp");
export const rasterImages = /* @__PURE__ */ paths(pictureExtensions + " bmp tif tiff gif");
export const legacyRasterImages = /* @__PURE__ */ paths("bmp tif tiff");
export const convertedAudio = /* @__PURE__ */ paths("wav ogg oga opus flac");
const sharingExtensions = "avif webp";
export const sharingImages = /* @__PURE__ */ paths(sharingExtensions);
export const sharingImageExtensions = /* @__PURE__ */ sharingExtensions.split(" ");
export const heicImages = /* @__PURE__ */ paths(heicExtensions);
export const libraryExcludedFiles = /* @__PURE__ */ paths("ts cts mts tsx jsx cjs map lock yml yaml toml jsonc json5 ini env sh ps1 py rb php vue svelte astro sass scss less njk liquid hbs woff woff2 ttf otf eot");
export const libraryArchives = /* @__PURE__ */ paths("zip gz tgz tar 7z rar bz2 xz");
export const librarySheets = /* @__PURE__ */ paths("xls xlsx ods csv numbers");
export const librarySlides = /* @__PURE__ */ paths("ppt pptx odp key");
export const libraryText = /* @__PURE__ */ paths("doc docx odt rtf pages txt md epub");
export const subtitles = /* @__PURE__ */ paths("vtt srt");
export const animationUncheckedImages = /* @__PURE__ */ paths("gif svg ico");
export const adviceVideos = /* @__PURE__ */ paths("mov mkv avi ogv");
export const adviceAudio = /* @__PURE__ */ paths("flac aif aiff ogg oga opus wma");
export const suitableFiles = /* @__PURE__ */ paths(pictureExtensions + " gif svg ico mp4 m4v webm mp3 m4a aac wav");
export const binaryFiles = /* @__PURE__ */ paths("png jpg jpeg gif webp avif heic heif ico icns cur apng jfif bmp tif tiff jxl psd raw aif aiff mid midi mpeg mpg 3gp mp3 mp4 m4a m4v webm mov avi mkv wav ogg oga ogv flac aac opus woff woff2 ttf ttc otf eot svgz zip gz tgz tar 7z rar bz2 xz br zst pdf doc docx xls xlsx ppt pptx odt odp ods pages numbers key wasm exe dll bin");
export const textMediaFiles = /* @__PURE__ */ paths("svg vtt srt");
export const renamableMedia = /* @__PURE__ */ paths(imageExtensions + " " + heicExtensions + " " + agentVideoExtensions + " " + agentAudioExtensions + " pdf");
export const optimisableImages = /* @__PURE__ */ paths(pictureExtensions + " bmp svg " + heicExtensions);
export const transparentImages = /* @__PURE__ */ paths("png webp gif avif svg");
export const replaceableImages = /* @__PURE__ */ paths(pictureExtensions + " gif bmp tif tiff " + heicExtensions);
export const replacementFormats = /* @__PURE__ */ bare(replacementExtensions);
export const replacementOutputFormats = /* @__PURE__ */ bare(replacementExtensions, "i");
export const olderCopyFormats = /* @__PURE__ */ pictureExtensions.split(" ");
export const paletteImages = /* @__PURE__ */ "png jpg jpeg gif webp avif ico".split(" ");
export const losslessImageTypes = /^image\/(?:png|gif|bmp)$/;
export const heicImageTypes = /^image\/(?:heic|heif)(?:-sequence)?$/i;
function extensionAccept(extensions: string) { return extensions.split(" ").map(extension => "." + extension).join(","); }
function mimeAccept(extensions: string) { return Object.values(mimeMap(extensions)).join(","); }
export const VIDEO_ACCEPT = /* @__PURE__ */ extensionAccept(videoExtensions);
export const HEIC_ACCEPT = /* @__PURE__ */ extensionAccept(heicExtensions);
export const REPLACE_ACCEPT = /* @__PURE__ */ mimeAccept("png jpg webp avif");
export const SOCIAL_IMAGE_ACCEPT = /* @__PURE__ */ mimeAccept("jpg png webp avif gif bmp");
export const assetMimeTypes = /* @__PURE__ */ mimeMap(imageExtensions + " " + fontExtensions);
export const audioMimeTypes = /* @__PURE__ */ mimeMap(audioExtensions);
export const uploadMimeTypes = /* @__PURE__ */ mimeMap(imageExtensions);
export const playableMimeTypes = /* @__PURE__ */ mimeMap(videoExtensions + " " + audioExtensions);
export const outsidePictureFormats: Record<string, string> = /* @__PURE__ */ Object.fromEntries(Object.entries(/* @__PURE__ */ mimeMap("jpg png gif webp avif bmp")).map(([extension, mime]) => [mime, extension]));
export const replacementLabels: Record<string, string> = {"webp": "a WebP", "png": "a PNG", "jpg": "a JPEG", "jpeg": "a JPEG", "avif": "an AVIF"};
