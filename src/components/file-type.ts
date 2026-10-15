import { mediaKind } from "../../shared/agent";

/** What a Files row's file is, by its name: its icon, colour and kind label follow. */
export type FileType = "page" | "style" | "script" | "data" | "text" | "picture" | "video" | "sound" | "pdf" | "document" | "font" | "archive" | "other";

const LABELS: Record<FileType, string> = {
  page: "Page", style: "Style", script: "Script", data: "Settings", text: "Text", picture: "Picture",
  video: "Video", sound: "Sound", pdf: "PDF", document: "Document", font: "Font", archive: "Archive", other: "",
};

/** A file's type by its name (the last path part); unknown names are "other". */
export function fileType(name: string): FileType {
  const base = name.slice(name.lastIndexOf("/") + 1);
  if (/\.html?$/i.test(base)) return "page";
  if (/\.css$/i.test(base)) return "style";
  if (/\.(?:m?js|cjs|ts|mts)$/i.test(base)) return "script";
  if (/\.(?:jsonc?|webmanifest|ya?ml|toml|xml)$/i.test(base) || /^_(?:redirects|headers)$/.test(base)) return "data";
  if (/\.(?:md|markdown|txt)$/i.test(base) || /^(?:license|readme|robots\.txt)$/i.test(base)) return "text";
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(base)) return "font";
  if (/\.(?:zip|tar|gz|tgz|7z|rar)$/i.test(base)) return "archive";
  if (/\.pdf$/i.test(base)) return "pdf";
  const media = mediaKind(base);
  return media === "image" ? "picture" : media === "audio" ? "sound" : media === "video" ? "video" : media === "document" ? "document" : "other";
}

/** The quiet word a wide Files panel shows after a name ("" for other files). */
export const fileTypeLabel = (type: FileType) => LABELS[type];
