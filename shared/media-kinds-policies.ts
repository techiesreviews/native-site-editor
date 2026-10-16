// Caller policies used only by lazily loaded modules; boot code must import from ./media-kinds and never from here.
import { audioExtensions, creationExtensions, fontExtensions, heicExtensions, mimeMap, paths, pictureExtensions, sharingExtensions, videoExtensions } from "./media-kinds";

function bare(extensions: string, flags = "") { return new RegExp("^(?:" + extensions.split(" ").join("|") + ")$", flags); }
const replacementExtensions = "png jpg jpeg webp avif";
export const operationBinaryFiles = /* @__PURE__ */ paths(heicExtensions + " " + creationExtensions);
export const fileFonts = /* @__PURE__ */ paths(fontExtensions + " eot");
export const fileArchives = /* @__PURE__ */ paths("zip tar gz tgz 7z rar");
export const playableVideos = /* @__PURE__ */ paths(videoExtensions);
export const losslessImages = /* @__PURE__ */ paths("png gif bmp");
export const trimmableImages = /* @__PURE__ */ paths(pictureExtensions + " gif bmp");
export const rasterImages = /* @__PURE__ */ paths(pictureExtensions + " bmp tif tiff gif");
export const legacyRasterImages = /* @__PURE__ */ paths("bmp tif tiff");
export const convertedAudio = /* @__PURE__ */ paths("wav ogg oga opus flac");
export const sharingImageExtensions = /* @__PURE__ */ sharingExtensions.split(" ");
export const heicImages = /* @__PURE__ */ paths(heicExtensions);
export const libraryExcludedFiles = /* @__PURE__ */ paths("ts cts mts tsx jsx cjs map lock yml yaml toml jsonc json5 ini env sh ps1 py rb php vue svelte astro sass scss less njk liquid hbs woff woff2 ttf otf eot");
export const libraryArchives = /* @__PURE__ */ paths("zip gz tgz tar 7z rar bz2 xz");
export const librarySheets = /* @__PURE__ */ paths("xls xlsx ods csv numbers");
export const librarySlides = /* @__PURE__ */ paths("ppt pptx odp key");
export const libraryText = /* @__PURE__ */ paths("doc docx odt rtf pages txt md epub");
export const animationUncheckedImages = /* @__PURE__ */ paths("gif svg ico");
export const adviceVideos = /* @__PURE__ */ paths("mov mkv avi ogv");
export const adviceAudio = /* @__PURE__ */ paths("flac aif aiff ogg oga opus wma");
export const suitableFiles = /* @__PURE__ */ paths(pictureExtensions + " gif svg ico mp4 m4v webm mp3 m4a aac wav");
export const binaryFiles = /* @__PURE__ */ paths("png jpg jpeg gif webp avif heic heif ico icns cur apng jfif bmp tif tiff jxl psd raw aif aiff mid midi mpeg mpg 3gp mp3 mp4 m4a m4v webm mov avi mkv wav ogg oga ogv flac aac opus woff woff2 ttf ttc otf eot svgz zip gz tgz tar 7z rar bz2 xz br zst pdf doc docx xls xlsx ppt pptx odt odp ods pages numbers key wasm exe dll bin");
export const textMediaFiles = /* @__PURE__ */ paths("svg vtt srt");
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
export const playableMimeTypes = /* @__PURE__ */ mimeMap(videoExtensions + " " + audioExtensions);
export const outsidePictureFormats: Record<string, string> = /* @__PURE__ */ Object.fromEntries(Object.entries(/* @__PURE__ */ mimeMap("jpg png gif webp avif bmp")).map(([extension, mime]) => [mime, extension]));
export const replacementLabels: Record<string, string> = {"webp": "a WebP", "png": "a PNG", "jpg": "a JPEG", "jpeg": "a JPEG", "avif": "an AVIF"};
