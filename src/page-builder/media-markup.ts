import { startTags } from "../../shared/html-source";
import { mediaAttribute as startTagAttribute } from "./media-attributes";

export interface MediaVariant { path: string; width: number }
export interface MediaImage {
  path: string; width?: number; height?: number; alt: string; variants?: MediaVariant[];
}
export const DEFAULT_MEDIA_SIZES = "(max-width: 768px) 100vw, 960px";
export const mediaEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const mediaUrl = (path: string) => `/${path.split("/").map(encodeURIComponent).join("/")}`;

export function mediaSrcset(image: MediaImage): string | undefined {
  const variants = new Map((image.variants ?? []).filter((variant) => variant.width > 0 && (!image.width || variant.width < image.width)).map((variant) => [variant.width, variant.path]));
  if (!variants.size) return undefined;
  if (image.width) variants.set(image.width, image.path);
  return [...variants].sort(([a], [b]) => a - b).map(([width, path]) => `${mediaUrl(path)} ${width}w`).join(", ");
}

/** Only media attributes change; classes, slots, styles and other attributes survive. */
export function mediaImageMarkup(image: MediaImage, existing = "<img>", renderedWidth?: number): string {
  const tag = startTags(existing)[0];
  if (!tag || tag.name !== "img") throw new Error("Choose an image element to replace.");
  if (existing[tag.end - 1] !== ">") throw new Error("This image's opening tag is incomplete.");
  const srcset = mediaSrcset(image);
  const sizes = renderedWidth && renderedWidth > 0 ? `(max-width: 768px) 100vw, ${Math.round(renderedWidth)}px` : DEFAULT_MEDIA_SIZES;
  const attributes: Record<string, string | undefined> = {
    src: mediaUrl(image.path), alt: image.alt, width: image.width ? String(image.width) : undefined,
    height: image.height ? String(image.height) : undefined, loading: "lazy", decoding: "async", srcset, sizes: srcset ? sizes : undefined,
  };
  const edits = Object.entries(attributes).flatMap(([name, value]) => {
    const attribute = startTagAttribute(existing, tag, name);
    if (attribute) return [{ start: attribute.start, end: attribute.end, text: value === undefined ? "" : ` ${name}="${mediaEscape(value)}"` }];
    return [];
  });
  let text = existing;
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  const updated = startTags(text)[0];
  const append = Object.entries(attributes).filter(([name, value]) => value !== undefined && !startTagAttribute(text, updated, name))
    .map(([name, value]) => ` ${name}="${mediaEscape(value!)}"`).join("");
  return text.slice(0, updated.nameEnd) + append + text.slice(updated.nameEnd);
}

export function mediaVariantName(path: string, width: number) {
  if (!Number.isInteger(width) || width < 1) throw new Error("Variant width must be a positive integer.");
  return path.replace(/(\.[^./]+)$/, `-${width}w$1`);
}

export function mediaVariants(path: string, paths: string[]): MediaVariant[] {
  const dot = path.lastIndexOf(".");
  const stem = path.slice(0, dot), extension = path.slice(dot);
  return paths.flatMap((candidate) => {
    if (!candidate.startsWith(`${stem}-`) || !candidate.endsWith(extension)) return [];
    const width = /^(\d+)w$/.exec(candidate.slice(stem.length + 1, -extension.length));
    return width ? [{ path: candidate, width: Number(width[1]) }] : [];
  }).sort((a, b) => a.width - b.width);
}
