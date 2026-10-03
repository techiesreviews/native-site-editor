import { elementEnd, startTagAttribute, startTags, type StartTag } from "../../shared/html-source";

export type HeadField = "title" | "description" | "og:title" | "og:description" | "og:image" | "og:site_name" | "canonical" | "robots" | "theme-color" | "icon";
const order: HeadField[] = ["title", "description", "robots", "canonical", "theme-color", "icon", "og:site_name", "og:title", "og:description", "og:image"];
export const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeValue = (value: string, quote = '"') => escapeText(value).replace(quote === "'" ? /'/g : /"/g, quote === "'" ? "&#39;" : "&quot;");
export const decodeText = (value: string) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, key: string) => {
  if (key[0] === "#") { const n = parseInt(key.slice(key[1].toLowerCase() === "x" ? 2 : 1), key[1].toLowerCase() === "x" ? 16 : 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all; }
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[key.toLowerCase()] ?? all;
});

/** Changes only an attribute's value, retaining quote style and surrounding source. */
export function withAttribute(html: string, tag: StartTag, name: string, value: string): string {
  const attr = startTagAttribute(html, tag, name);
  if (attr) {
    const quote = html[attr.valueStart - 1];
    if (quote === "'" || quote === '"') return html.slice(0, attr.valueStart) + escapeValue(value, quote) + html.slice(attr.valueEnd);
    return html.slice(0, attr.start) + ` ${name}="${escapeValue(value)}"` + html.slice(attr.end);
  }
  const at = tag.end - (html[tag.end - 2] === "/" ? 2 : 1);
  return html.slice(0, at) + ` ${name}="${escapeValue(value)}"` + html.slice(at);
}

export function headTags(html: string) {
  const tags = startTags(html);
  const head = tags.find((tag) => tag.name === "head");
  const range = head ? elementEnd(html, tags, tags.indexOf(head), html.length) : undefined;
  const end = range?.close?.start ?? -1;
  if (!head || end < 0) throw new Error("This document needs a complete <head> before page settings can be edited.");
  return { head, end, tags: tags.filter((tag) => tag.start >= head.end && tag.end <= end) };
}

function fieldOf(html: string, tag: StartTag): HeadField | undefined {
  if (tag.name === "title") return "title";
  if (tag.name === "meta") {
    const key = (startTagAttribute(html, tag, "name") ?? startTagAttribute(html, tag, "property"))?.value.toLowerCase();
    return key && !["title", "icon", "canonical"].includes(key) && order.includes(key as HeadField) ? key as HeadField : undefined;
  }
  if (tag.name === "link") {
    const rel = startTagAttribute(html, tag, "rel")?.value.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("canonical")) return "canonical";
    if (rel.includes("icon")) return "icon";
  }
  return undefined;
}

export function readHeadSettings(html: string): Record<HeadField, string> {
  const out = Object.fromEntries(order.map((key) => [key, ""])) as Record<HeadField, string>;
  const { tags, end } = headTags(html);
  for (const tag of [...tags].reverse()) {
    const field = fieldOf(html, tag);
    if (!field) continue;
    const range = field === "title" ? elementEnd(html, tags, tags.indexOf(tag), end) : undefined;
    out[field] = decodeText(field === "title" ? html.slice(tag.end, range?.close?.start ?? tag.end) : startTagAttribute(html, tag, field === "icon" || field === "canonical" ? "href" : "content")?.value ?? "");
  }
  return out;
}

/** Upserts one head field. Existing tags remain in place; new tags precede assets/scripts. */
export function upsertHeadTag(html: string, field: HeadField, value: string): string {
  const { head, tags, end } = headTags(html);
  const existing = tags.filter((tag) => fieldOf(html, tag) === field);
  const wanted = value.replace(/[\r\n]+/g, " ").trim();
  if (existing.length) {
    // Duplicate tags must not leave conflicting metadata for crawlers.
    for (const tag of existing.reverse()) {
      const range = field === "title" ? elementEnd(html, tags, tags.indexOf(tag), end) : undefined;
      if (field === "title" && !range?.close) throw new Error("The title tag is incomplete.");
      if (wanted || field === "title") {
        html = field === "title" ? html.slice(0, tag.end) + escapeText(wanted) + html.slice(range!.close!.start) : withAttribute(html, tag, field === "icon" || field === "canonical" ? "href" : "content", wanted);
        // Changing an icon's format must not retain a stale MIME type.
        if (field === "icon") {
          const updated = startTags(html).find((item) => item.start === tag.start)!;
          const type = startTagAttribute(html, updated, "type");
          if (type) html = html.slice(0, type.start) + html.slice(type.end);
        }
      } else {
        const after = range?.end ?? tag.end;
        const line = html.lastIndexOf("\n", tag.start - 1) + 1;
        const tail = /^[ \t]*(?:\r?\n|$)/.exec(html.slice(after));
        html = /^[ \t]*$/.test(html.slice(line, tag.start)) && tail ? html.slice(0, line) + html.slice(after + tail[0].length) : html.slice(0, tag.start) + html.slice(after);
      }
    }
    return html;
  }
  if (!wanted) return html;
  const line = field === "title" ? `<title>${escapeText(wanted)}</title>` : field === "icon" || field === "canonical" ? `<link rel="${field}" href="${escapeValue(wanted)}">` : `<meta ${field.startsWith("og:") ? "property" : "name"}="${field}" content="${escapeValue(wanted)}">`;
  const newline = html.includes("\r\n") ? "\r\n" : "\n";
  const first = tags[0];
  const indent = first ? /^[ \t]*/.exec(html.slice(html.lastIndexOf("\n", first.start - 1) + 1, first.start))?.[0] || "  " : "  ";
  const before = tags.find((tag) => {
    const other = fieldOf(html, tag);
    return other ? order.indexOf(other) > order.indexOf(field) : tag.name === "script" || tag.name === "style" || (tag.name === "link" && startTagAttribute(html, tag, "rel")?.value === "stylesheet");
  });
  const position = before?.start ?? end;
  const lineStart = html.lastIndexOf("\n", position - 1) + 1;
  if (lineStart >= head.end && /^[ \t]*$/.test(html.slice(lineStart, position))) return html.slice(0, lineStart) + indent + line + newline + html.slice(lineStart);
  return html.slice(0, position) + newline + indent + line + newline + html.slice(position);
}

export function withSearchHidden(robots: string, hidden: boolean): string {
  const tokens = robots.split(",").map((item) => item.trim()).filter(Boolean).filter((item) => !/^(noindex|index|none)$/i.test(item));
  if (/\bnone\b/i.test(robots) && !tokens.some((token) => /^nofollow$/i.test(token))) tokens.push("nofollow");
  if (hidden) tokens.unshift("noindex");
  return tokens.join(", ");
}

/** Mirroring is inferred from equal/missing OG values; no editor attributes enter the site. */
export function withPageField(html: string, field: HeadField, value: string, linked?: boolean): string {
  const current = readHeadSettings(html);
  const mirror = field === "title" ? "og:title" : field === "description" ? "og:description" : undefined;
  const follows = linked ?? (mirror ? !current[mirror] || current[mirror] === current[field] : false);
  let next = upsertHeadTag(html, field, value);
  if (mirror && follows) next = upsertHeadTag(next, mirror, value);
  return next;
}
