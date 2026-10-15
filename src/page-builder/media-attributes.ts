import { startTags } from "../../shared/html-source";
import { decodeHtmlEntities } from "./html-entities";
import type { StartTag, TagAttribute } from "../../shared/html-source";

/** Attribute scan that never matches a name inside another quoted attribute value. */
export function mediaAttribute(source: string, tag: StartTag, wanted: string): TagAttribute | undefined {
  let at = tag.nameEnd;
  while (at < tag.end - 1) {
    const start = at;
    while (/\s/.test(source[at] ?? "")) at++;
    if (at >= tag.end - 1 || source[at] === "/") break;
    const nameStart = at;
    while (at < tag.end - 1 && !/[\s=/>]/.test(source[at])) at++;
    if (at === nameStart) { at++; continue; }
    const name = source.slice(nameStart, at).toLowerCase();
    const nameEnd = at;
    while (/\s/.test(source[at] ?? "")) at++;
    let valueStart = at, valueEnd = at;
    if (source[at] === "=") {
      at++;
      while (/\s/.test(source[at] ?? "")) at++;
      const quote = source[at];
      if (quote === "'" || quote === '"') {
        valueStart = ++at;
        while (at < tag.end - 1 && source[at] !== quote) at++;
        valueEnd = at;
        if (source[at] === quote) at++;
      } else {
        valueStart = at;
        while (at < tag.end - 1 && !/\s/.test(source[at])) at++;
        valueEnd = at;
      }
    } else { at = nameEnd; valueStart = nameEnd; valueEnd = nameEnd; }
    if (name === wanted.toLowerCase()) return { start, end: at, valueStart, valueEnd, value: source.slice(valueStart, valueEnd) };
  }
  return undefined;
}

export const mediaEscape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");


/**
 * The alt text an existing `<img>` start tag holds, decoded (including an empty
 * value), or undefined when it has no alt attribute. A picker
 * replacing that image offers it first, so a written alt survives.
 */
export function mediaExistingAlt(existing: string): string | undefined {
  const tag = startTags(existing)[0];
  if (!tag || tag.name !== "img") return undefined;
  const attribute = mediaAttribute(existing, tag, "alt");
  return attribute ? decodeHtmlEntities(attribute.value, true) : undefined;
}
