// Static, portable HTML. Keys identify editor choices, never published attributes.
import { decodeHtmlEntities } from "./html-entities";
import type { AddChoice } from "./add-catalog";

export type NativeElementKind = "section" | "div" | "heading" | "paragraph" | "image" | "button";
export interface NativeElementOptions {
  text?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  src?: string;
  href?: string;
  alt?: string;
}
export const PLACEHOLDER_IMAGE_PATH = "images/placeholder.svg";
/** Why a Section can't go into a component's template (Edit component mode): components sit in page bands. */
export const templateSectionRefusal = "A Section goes only between page bands, not inside a component's template. Build with a Div here.";
export const PLACEHOLDER_IMAGE_WIDTH = 640;
export const PLACEHOLDER_IMAGE_HEIGHT = 400;
/** Site asset written on first image insertion; neutral colours work in any page tone. */
export const placeholderImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLACEHOLDER_IMAGE_WIDTH} ${PLACEHOLDER_IMAGE_HEIGHT}" width="${PLACEHOLDER_IMAGE_WIDTH}" height="${PLACEHOLDER_IMAGE_HEIGHT}">
  <rect x="1" y="1" width="638" height="398" rx="12" fill="#808080" fill-opacity=".12" stroke="#808080" stroke-width="2"/>
  <g fill="none" stroke="#808080" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="240" y="140" width="160" height="120" rx="12"/>
    <circle cx="285" cy="175" r="14"/>
    <path d="m248 248 45-45 30 30 30-45 39 60"/>
  </g>
</svg>`;
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
/** Validate a raw attribute value without changing the value written to HTML. */
export function nativeElementUrlProblem(raw: string, allowed: readonly string[] = ["http", "https", "mailto", "tel", "about:blank"], decodeSourceEntities = true): string | undefined {
  const decoded = decodeSourceEntities ? decodeHtmlEntities(raw, true) : raw;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return "URLs cannot contain control characters.";
  const normalized = decoded.replace(/ /g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1].toLowerCase();
  if (!scheme || allowed.includes(scheme)) return undefined;
  if (normalized.toLowerCase() === "about:blank" && allowed.includes("about:blank")) return undefined;
  return "Use a relative URL or an HTTP(S) URL.";
}
function url(value: string) {
  const decoded = decodeHtmlEntities(value, true);
  const problem = nativeElementUrlProblem(value);
  if (problem) throw new Error(problem);
  return escape(decoded);
}
export const nativeElementChoices: readonly AddChoice[] = [
  ["section", "Section"], ["div", "Div"], ["heading", "Heading"],
  ["paragraph", "Paragraph"], ["image", "Image"], ["button", "Button"],
].map(([kind, label]) => ({ tag: `native:${kind}`, label, group: "Blocks", kind: "native" }));

/** Portable HTML styled by the site's own flow and btn classes. */
export function nativeElementMarkup(kind: NativeElementKind, options: NativeElementOptions = {}): string {
  switch (kind) {
    case "section": return '<section class="flow"></section>';
    case "div": return '<div class="flow"></div>';
    case "heading": {
      const level = options.level ?? 2;
      if (![1, 2, 3, 4, 5, 6].includes(level)) throw new Error("Invalid heading level.");
      return `<h${level}>${escape(options.text ?? "Heading")}</h${level}>`;
    }
    case "paragraph": return `<p>${escape(options.text ?? "Text")}</p>`;
    case "image": {
      // The placeholder's own size; another src has its size set when it is chosen.
      const size = options.src === undefined ? ` width="${PLACEHOLDER_IMAGE_WIDTH}" height="${PLACEHOLDER_IMAGE_HEIGHT}"` : "";
      return `<img src="${url(options.src ?? `/${PLACEHOLDER_IMAGE_PATH}`)}" alt="${escape(options.alt ?? "")}"${size}>`;
    }
    case "button": return `<a class="btn" href="${url(options.href ?? "#")}">${escape(options.text ?? "Button")}</a>`;
    default: throw new Error("Unknown native element.");
  }
}
export function nativeChoiceMarkup(key: string, options?: NativeElementOptions) {
  const choice = nativeElementChoices.find((item) => item.tag === key);
  return choice ? nativeElementMarkup(key.slice(7) as NativeElementKind, options) : undefined;
}
