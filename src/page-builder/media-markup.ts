import { mediaFamilyOf, RESPONSIVE_COPY_WIDTHS } from "./media-families";
import { startTags, type ElementRange } from "../../shared/html-source";
import { readSource, tagAttribute } from "./source-tree";
import { mediaAttribute as startTagAttribute } from "./media-attributes";

export interface MediaVariant { path: string; width: number }
export interface MediaImage {
  path: string; width?: number; height?: number; alt: string; variants?: MediaVariant[];
}
export interface MediaMeasured { sizes?: string; firstScreen: boolean; large: boolean; images: MediaPageImage[] }
export interface MediaPageImage { node: number[]; firstScreen: boolean; large: boolean }
export function mediaPriority(images: readonly MediaPageImage[]): number[] | undefined {
  return [...images].sort((a, b) => {
    for (let i = 0; i < Math.min(a.node.length, b.node.length); i++) if (a.node[i] !== b.node[i]) return a.node[i] - b.node[i];
    return a.node.length - b.node.length;
  }).find(image => image.firstScreen && image.large)?.node;
}
export function mediaPlacement(measured?: Pick<MediaMeasured, "sizes" | "firstScreen">, priority = false) {
  const lazy = !measured?.firstScreen;
  return { sizes: `${lazy ? "auto, " : ""}${measured?.sizes || "100vw"}`, lazy, priority: !lazy && priority };
}
export type MediaPlacement = ReturnType<typeof mediaPlacement>;
export { mediaEscape, mediaUrl, mediaExistingAlt } from "./media-attributes";
import { mediaEscape, mediaUrl } from "./media-attributes";

export function mediaSrcset(image: MediaImage): string | undefined {
  if (image.path.startsWith("media/originals/")) return undefined;
  const variants = new Map((image.variants ?? []).filter((variant) => !variant.path.startsWith("media/originals/") && variant.width > 0 && !!image.width && variant.width < image.width).map((variant) => [variant.width, variant.path]));
  if (!variants.size) return undefined;
  if (image.width) variants.set(image.width, image.path);
  return [...variants].sort(([a], [b]) => a - b).map(([width, path]) => `${mediaUrl(path)} ${width}w`).join(", ");
}

/**
 * Only media attributes change; classes, slots, styles and other attributes survive.
 * `keepAlt` leaves an existing alt attribute exactly as written (the picker
 * kept the page's alt unchanged), so its source is not re-escaped.
 */
export function mediaImageMarkup(image: MediaImage, existing = "<img>", placement = mediaPlacement(), keepAlt = false): string {
  const tag = startTags(existing)[0];
  if (!tag || tag.name !== "img") throw new Error("Choose an image element to replace.");
  if (existing[tag.end - 1] !== ">") throw new Error("This image's opening tag is incomplete.");
  const srcset = mediaSrcset(image);
  const attributes: Record<string, string | undefined> = {
    src: mediaUrl(image.path), alt: image.alt, width: image.width ? String(image.width) : undefined,
    height: image.height ? String(image.height) : undefined, loading: placement.lazy ? "lazy" : undefined, fetchpriority: placement.priority ? "high" : undefined, decoding: "async", srcset, sizes: srcset ? placement.sizes : undefined,
  };
  if (keepAlt && startTagAttribute(existing, tag, "alt")) delete attributes.alt;
  return mediaAttributes(existing, attributes);
}

export function mediaAttributes(existing: string, attributes: Record<string, string | undefined>): string {
  const tag = startTags(existing)[0];
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

/** Name words used by picker fields and to recognise legacy page-image alts. */
export function mediaNameAlt(path: string) {
  return (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

export function mediaVariantName(path: string, width: number) {
  if (!Number.isInteger(width) || width < 1) throw new Error("Variant width must be a positive integer.");
  return path.replace(/(\.[^./]+)$/, `-${width}${(RESPONSIVE_COPY_WIDTHS as readonly number[]).includes(width) ? "" : "w"}$1`);
}

export function mediaVariants(path: string, paths: string[]): MediaVariant[] {
  return mediaFamilyOf(path, paths)?.copies ?? [];
}

/** Remove a picture's sources and wrapper without touching its image's opening tag. */
export function mediaPictureUnwrap(source: string, img: Pick<ElementRange, "start" | "end">, picture: ElementRange | undefined) {
  if (picture?.tag.name !== "picture") return undefined;
  const tree = readSource(source, { from: picture.tag.end, to: picture.close?.start ?? picture.end });
  const children = tree.children();
  const image = children.find(child => child.type === "element" && child.name === "img" && child.start === img.start);
  if (!image) return undefined;
  const artDirected = children.some(child => child.type === "element" && child.name === "source" && !!tree.attribute(child, "media")?.value.trim());
  const slot = tree.attribute(image, "slot") ? undefined : tagAttribute(source, picture.tag, "slot")?.value;
  return { edits: [{ start: picture.start, end: img.start, text: "" }, { start: img.end, end: picture.end, text: "" }], artDirected, slot };
}

/** Build the image the picker and agents pass to the shared placement transaction. */
export function mediaImageForPlacement(path: string, size: { width?: number; height?: number }, paths: string[]): MediaImage {
  return { path, width: size.width, height: size.height, variants: mediaVariants(path, paths), alt: "" };
}
