/** Canonical kinds. MIME types below cover historical callers and the path helper's PDF/ZIP cases. */
const imageExtensions = "svg png jpg jpeg gif webp avif ico bmp";
export const fontExtensions = "woff2 woff ttf otf";
export const audioExtensions = "mp3 m4a aac oga ogg opus wav flac";
export const videoExtensions = "mp4 m4v webm mov ogv";
export const heicExtensions = "heic heif";
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

export function paths(extensions: string) { return new RegExp("\\.(?:" + extensions.split(" ").join("|") + ")$", "i"); }
export function mimeMap(extensions: string): Record<string, string> {
  return Object.fromEntries(extensions.split(" ").map(extension => [extension, MIME_TYPES[extension]]));
}

export const pictureExtensions = "jpg jpeg png webp avif";
const agentVideoExtensions = videoExtensions + " avi mkv mpeg mpg";
const agentAudioExtensions = audioExtensions + " aif aiff";
export const creationExtensions = "png jpg jpeg gif webp avif ico bmp tif tiff pdf zip gz tgz tar 7z woff woff2 ttf otf eot mp3 mp4 m4a webm mov wav ogg";
// These subsets are policies, not additional kind or MIME tables. Do not widen a caller by replacing its subset with a kind.
export const previewablePictures = /* @__PURE__ */ paths(pictureExtensions + " gif svg");
export const agentImages = /* @__PURE__ */ paths(imageExtensions + " tif tiff " + heicExtensions);
export const agentVideos = /* @__PURE__ */ paths(agentVideoExtensions);
export const agentAudio = /* @__PURE__ */ paths(agentAudioExtensions);
export const agentDocuments = /* @__PURE__ */ paths("pdf doc docx xls xlsx ppt pptx odt ods odp rtf epub csv");
export const previewImages = /* @__PURE__ */ paths(imageExtensions);
export const creationBinaryFiles = /* @__PURE__ */ paths(creationExtensions);
export const sharingExtensions = "avif webp";
export const sharingImages = /* @__PURE__ */ paths(sharingExtensions);
export const subtitles = /* @__PURE__ */ paths("vtt srt");
export const renamableMedia = /* @__PURE__ */ paths(imageExtensions + " " + heicExtensions + " " + agentVideoExtensions + " " + agentAudioExtensions + " pdf");
export const assetMimeTypes = /* @__PURE__ */ mimeMap(imageExtensions + " " + fontExtensions);
export const audioMimeTypes = /* @__PURE__ */ mimeMap(audioExtensions);
export const uploadMimeTypes = /* @__PURE__ */ mimeMap(imageExtensions);
