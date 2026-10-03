import { elementEnd, startTagAttribute, startTags } from "../../shared/html-source";
import { decodeText, escapeText, withAttribute } from "./site-head";

export interface NavigationLink { href: string; label: string; source?: string }
export interface NavigationList { start: number; end: number; links: NavigationLink[]; indent: string; newline: string; pattern?: string }
export function safeNavigationHref(value: string): boolean {
  const href = value.trim();
  if (!/^(?:\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(href) || /[\u0000-\u0020]/.test(href)) return false;
  if (/^https?:/i.test(href)) { try { return Boolean(new URL(href).hostname); } catch { return false; } }
  return true;
}

/** Recognises a simple nav in a header, including a ul/ol of single-link li items. */
export function readNavigation(html: string, component = false): NavigationList | undefined {
  const tags = startTags(html);
  const header = tags.findIndex((tag) => tag.name === "header");
  const headerRange = header >= 0 ? elementEnd(html, tags, header, html.length) : undefined;
  const navIndex = tags.findIndex((tag) => tag.name === "nav" && (component || (headerRange && tag.start >= headerRange.tag.end && tag.end < headerRange.end)));
  if (navIndex < 0) return undefined;
  const nav = elementEnd(html, tags, navIndex, headerRange?.close?.start ?? html.length);
  if (!nav?.close) return undefined;
  const listIndex = tags.findIndex((tag) => (tag.name === "ul" || tag.name === "ol") && tag.start >= nav.tag.end && tag.end < nav.close!.start);
  const list = listIndex >= 0 ? elementEnd(html, tags, listIndex, nav.close.start) : nav;
  if (!list?.close) return undefined;
  const items = tags.filter((tag) => tag.start >= list.tag.end && tag.end <= list.close!.start && tag.name === (listIndex >= 0 ? "li" : "a"));
  const links: NavigationLink[] = [];
  let cursor = list.tag.end;
  for (const [itemIndex, tag] of items.entries()) {
    if (html.slice(cursor, tag.start).trim()) return undefined;
    const range = elementEnd(html, tags, tags.indexOf(tag), items[itemIndex + 1]?.start ?? list.close.start);
    if (!range?.close) return undefined;
    const anchors = tags.filter((item) => item.name === "a" && item.start >= tag.start && item.end <= range.end);
    if (anchors.length !== 1) return undefined;
    const anchor = anchors[0];
    const anchorRange = elementEnd(html, tags, tags.indexOf(anchor), range.end);
    if (!anchorRange?.close) return undefined;
    // Don't silently flatten icons, submenus or dynamic component markup.
    const label = html.slice(anchor.end, anchorRange.close.start);
    if (label.includes("<")) return undefined;
    if (tag.name === "li" && (html.slice(tag.end, anchor.start).trim() || html.slice(anchorRange.end, range.close.start).trim())) return undefined;
    const href = startTagAttribute(html, anchor, "href");
    if (!href) return undefined;
    links.push({ href: decodeText(href.value, true), label: decodeText(label), source: html.slice(tag.start, range.end) });
    cursor = range.end;
  }
  if (html.slice(cursor, list.close.start).trim()) return undefined;
  const first = items[0];
  const indent = first ? /^[ \t]*$/.test(html.slice(html.lastIndexOf("\n", first.start - 1) + 1, first.start)) ? html.slice(html.lastIndexOf("\n", first.start - 1) + 1, first.start) : "    " : "    ";
  return { start: list.tag.end, end: list.close.start, links, indent, newline: html.includes("\r\n") ? "\r\n" : "\n", pattern: links[0]?.source ?? (listIndex >= 0 ? '<li><a href="/">Page</a></li>' : '<a href="/">Page</a>') };
}

export function editNavigation(html: string, list: NavigationList, links: NavigationLink[]): string {
  const items = links.map((link) => {
    if (!link.label.trim()) throw new Error("Every navigation link needs a label.");
    if (!safeNavigationHref(link.href)) throw new Error("Use a page URL, https:// link, mailto: or tel: address.");
    let source = link.source ?? list.pattern ?? '<a href="/">Page</a>';
    const tags = startTags(source);
    const index = tags.findIndex((tag) => tag.name === "a");
    const anchor = elementEnd(source, tags, index, source.length);
    if (!anchor?.close) throw new Error("This navigation item is incomplete.");
    if (decodeText(source.slice(anchor.tag.end, anchor.close.start)) !== link.label.trim())
      source = source.slice(0, anchor.tag.end) + escapeText(link.label.trim()) + source.slice(anchor.close.start);
    const originalHref = startTagAttribute(source, startTags(source)[index], "href")?.value ?? "";
    if (decodeText(originalHref, true) !== link.href.trim())
      source = withAttribute(source, startTags(source)[index], "href", link.href.trim());
    // Current-page state belongs to each page, never copied into a new shared link.
    if (!link.source) {
      const tag = startTags(source)[index];
      const current = startTagAttribute(source, tag, "aria-current");
      if (current) source = source.slice(0, current.start) + source.slice(current.end);
      // Wrappers can carry unique IDs or source keys; do not clone either.
      for (const item of startTags(source).reverse()) {
        for (const attribute of ["id", "data-key"].map((name) => startTagAttribute(source, item, name)).filter((value) => value !== undefined).sort((a, b) => b.start - a.start)) {
          source = source.slice(0, attribute.start) + source.slice(attribute.end);
        }
      }
    }
    return list.indent + source;
  });
  const closeIndent = /^[ \t]*$/.test(html.slice(html.lastIndexOf("\n", list.end - 1) + 1, list.end)) ? html.slice(html.lastIndexOf("\n", list.end - 1) + 1, list.end) : "  ";
  return html.slice(0, list.start) + list.newline + items.join(list.newline) + (items.length ? list.newline : "") + closeIndent + html.slice(list.end);
}
