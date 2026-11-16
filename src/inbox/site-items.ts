// What the Inbox finds on the site's pages (mock-up 05 v2, TOOLS-222): a picture without a description and a page
// without a title, each listed once with where it is. The picture's verdict is the edit bar's own (its "Alt text"
// warning, src/controllers/page-structure-controller.ts), handed in, so the two never disagree. TOOLS-253 adds the
// rest of site-quality ticket 41: a link with no name or with words that say nothing, a heading that skips a level and
// a video without subtitles, and every check but the headings' also over the shared parts' templates (an item there
// names its part and the pages a fix changes). Pure; tested in tests/inbox-site-items.test.ts.

import { startTagAttribute } from "../../shared/html-source";
import { descendants, parseSource, type SourceElement } from "../page-builder/source-tree";
import { decodeHtmlEntities } from "../page-builder/html-entities";
import { mediaResolvePath } from "../page-builder/media-references";
import type { InboxItem } from "./inbox-item";

/** The site's file a picture's address shows, when the site holds it: a broken picture or another address has none. */
export function siteFile(src: string, page: string, prefix: string | undefined, holds: (path: string) => boolean) {
  const path = mediaResolvePath(decodeHtmlEntities(src, true), page, undefined, prefix);
  return path && holds(path) ? path : undefined;
}

/** A page of the site as the Inbox reads it: its file, the Pages tab's name and address, and its text now. */
export interface InboxPage { file: string; label: string; route: string; source: string | undefined }
/** A shared part (a component's template) as the Inbox reads it: its file, tag, shown name, the pages that show it
 * (src/inbox/inbox.ts counts them as Edit component mode does) and its text now. */
export interface InboxPart { file: string; tag: string; name: string; pages: readonly string[]; source: string | undefined }

export interface SiteItemRules {
  /** The edit bar's verdict on a picture's description at a place; undefined while it is not known yet. */
  picture(page: string, src: string, alt: string | undefined): "described" | "decorative" | "missing" | undefined;
  /** The repository file a picture's address shows, when it is one. */
  file(page: string, src: string): string | undefined;
}

/** A srcset of a <source> in the <picture> that is the img's parent (the edit bar's rule), if any. */
function pictureSource(source: string, img: SourceElement) {
  const parent = img.parent;
  if (parent?.name.toLowerCase() !== "picture") return undefined;
  for (const element of descendants(parent.children))
    if (element.name.toLowerCase() === "source") {
      const srcset = startTagAttribute(source, element.tag, "srcset")?.value.trim();
      if (srcset) return srcset;
    }
  return undefined;
}

/** Whether an element sits in a <template> the browser does not show (a declarative shadow root's is shown). */
function inInactiveTemplate(source: string, element: SourceElement) {
  for (let up = element.parent; up; up = up.parent)
    if (up.name.toLowerCase() === "template" && !startTagAttribute(source, up.tag, "shadowrootmode")) return true;
  return false;
}

type Verdict = "described" | "decorative" | "missing";

/** The edit bar's Alt text warning as a verdict (src/controllers/page-structure-controller.ts): no alt attribute is
 * missing at once; then the Media record's state, or an empty alt not marked decorative; undefined only while the
 * record of a picture `stored` in the site is not known yet. */
export function pictureVerdict(alt: string | undefined, state: Verdict | undefined, stored: boolean): Verdict | undefined {
  if (alt === undefined) return "missing";
  if (state === undefined && stored) return undefined;
  return state === "missing" || (!alt && state !== "decorative") ? "missing" : state ?? "described";
}

interface PagePicture { at: number; src: string | undefined; alt: string | undefined; shown: string; hidden: boolean }

interface PageLink { at: number; href: string; words: string; named: boolean; plain: boolean }
interface PageHeading { at: number; level: number; words: string }
interface PageVideo { at: number; src: string; waits: boolean }
interface PageRead { source: string; titled: boolean; pictures: readonly PagePicture[]; links: readonly PageLink[]; headings: readonly PageHeading[]; videos: readonly PageVideo[] }

/** Link words that do not say where a link goes (research 01's words rules), compared lower case with spaces folded. */
const VAGUE_WORDS = new Set(["click here", "here", "read more", "more", "learn more", "link", "this", "click", "go", "details", "more info"]);
/** Whether a link's words say nothing about where it goes. */
export const vagueWords = (words: string) => VAGUE_WORDS.has(words.toLowerCase().replace(/\s+/g, " ").trim());

const attribute = (source: string, element: SourceElement, name: string) => startTagAttribute(source, element.tag, name)?.value;
/** An element's words as the page shows them: its text, tags left out, entities read, spaces folded. */
function wordsOf(source: string, element: SourceElement) {
  if (!element.close) return "";
  return decodeHtmlEntities(source.slice(element.tag.end, element.close.start).replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
/** Whether something inside `element` names it: a non-empty aria-label, or a picture's non-empty alt (the edit bar's rule). */
function namedInside(source: string, element: SourceElement) {
  return [...descendants(element.children)].some(inner => Boolean(attribute(source, inner, "aria-label")?.trim())
    || inner.name.toLowerCase() === "img" && Boolean(attribute(source, inner, "alt")?.trim()));
}

// Each page file as read from its text: a check after an edit reads again only the page that changed, and keeps one
// entry per page of the site listed last (another site's pages are let go).
const read = new Map<string, PageRead>();
/** How many pages' text is held (a seam for tests). */
export const heldPages = () => read.size;
/** Lets go of every page's text: no site is open, or another one is loading (src/inbox/inbox.ts). */
export const forgetPages = () => read.clear();

/** Whether the page's own <title> (not an SVG's, nor one in a comment or a script) has words. */
function hasTitle(source: string, elements: readonly SourceElement[]) {
  const title = elements.find(element => {
    if (element.name.toLowerCase() !== "title") return false;
    for (let up = element.parent; up; up = up.parent) if (/^(svg|body)$/i.test(up.name)) return false;
    return true;
  });
  return Boolean(title?.close && source.slice(title.tag.end, title.close.start).trim());
}

/** A page's text read once: whether it has a title, and each picture: its address (its src, else its srcset, else a source of the <picture> it is in, as
 * the edit bar reads them) and whether it sits in a <template> the page does not show. Such a picture is never listed
 * but counts as a use of its file, since Media's Decorative marks every img showing the file. No address at all is
 * the edit bar's "No image", not a description to write. */
function readPage(file: string, source: string): PageRead {
  const known = read.get(file);
  if (known?.source === source) return known;
  const elements = [...descendants(parseSource(source))];
  const pictures = elements.flatMap(element => {
    if (element.name.toLowerCase() !== "img") return [];
    const { tag } = element;
    const src = startTagAttribute(source, tag, "src")?.value.trim();
    const shown = src || startTagAttribute(source, tag, "srcset")?.value.trim() || pictureSource(source, element);
    return shown ? [{ at: tag.start, src, alt: startTagAttribute(source, tag, "alt")?.value, shown, hidden: inInactiveTemplate(source, element) }] : [];
  });
  const shown = elements.filter(element => !inInactiveTemplate(source, element));
  const links = shown.flatMap(element => {
    if (element.name.toLowerCase() !== "a" || attribute(source, element, "href") === undefined) return [];
    const words = wordsOf(source, element);
    const named = Boolean(words || attribute(source, element, "aria-label")?.trim() || attribute(source, element, "aria-labelledby")?.trim()
      || attribute(source, element, "title")?.trim() || namedInside(source, element));
    // Plain: the link holds only its words, so new words can replace them.
    const plain = element.children.every(child => child.type === "text");
    return [{ at: element.tag.start, href: attribute(source, element, "href") ?? "", words, named, plain }];
  });
  const headings = shown.flatMap(element => {
    const match = /^h([1-6])$/i.exec(element.name);
    return match && element.close ? [{ at: element.tag.start, level: Number(match[1]), words: wordsOf(source, element) }] : [];
  });
  const videos = shown.flatMap(element => {
    if (element.name.toLowerCase() !== "video") return [];
    const tracks = [...descendants(element.children)].some(inner => inner.name.toLowerCase() === "track" && /^(subtitles|captions)$/i.test(attribute(source, inner, "kind")?.trim() ?? ""));
    // A muted video says nothing to hear; "No speech" marks one with sound but no words.
    const silent = attribute(source, element, "muted") !== undefined || attribute(source, element, "data-no-speech") !== undefined;
    return [{ at: element.tag.start, src: attribute(source, element, "src")?.trim() ?? "", waits: !tracks && !silent }];
  });
  const page = { source, titled: hasTitle(source, elements), pictures, links, headings, videos };
  read.set(file, page);
  return page;
}

/** Where an item sits: a page, or a shared part with the pages that show it. */
interface Place { file: string; where: string; source: string; shared?: InboxItem["shared"] }

/** The pictures, links and videos of a page or a shared part that wait (headings are judged on pages only). */
function placeItems(place: Place, read: PageRead, rules: SiteItemRules): InboxItem[] {
  const items: InboxItem[] = [];
  const { file, where, source, shared } = place;
  const common = { where, page: file, ...(shared ? { shared } : {}) };
  // The edit bar asks Media about the src alone; Decorative, like Media's, marks pictures by their src.
  const pictures = read.pictures.map(picture => ({ ...picture,
    waits: rules.picture(file, picture.src ?? "", picture.alt) === "missing", media: picture.src ? rules.file(file, picture.src) : undefined }));
  const seen = new Set<string>();
  for (const { at, shown, waits, hidden, media } of pictures) {
    if (!waits || hidden) continue;
    const key = `picture\n${file}\n${media ?? shown}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ key, kind: "picture", what: "Picture without a description", ...common, at, fix: "alt",
      ...(media ? { media, wave: "Decorative", allUses: pictures.every(other => other.media !== media || other.waits), found: source } : { found: source }) });
  }
  // A link's key: its address and its place among the links to it, so words written above it keep it.
  const count = new Map<string, number>();
  for (const link of read.links) {
    const nth = count.get(link.href) ?? 0;
    count.set(link.href, nth + 1);
    const key = `link\n${file}\n${link.href}\n${nth}`;
    if (!link.named) items.push({ key, kind: "link", what: "Link without a name", ...common, at: link.at, fix: "name", found: source });
    else if (link.words && vagueWords(link.words))
      items.push({ key, kind: "link", what: `Link that only says “${link.words}”`, ...common, at: link.at, words: link.words, found: source, ...(link.plain ? { fix: "words" as const } : {}) });
  }
  const videos = new Map<string, number>();
  for (const video of read.videos) {
    const nth = videos.get(video.src) ?? 0;
    videos.set(video.src, nth + 1);
    if (video.waits) items.push({ key: `video\n${file}\n${video.src}\n${nth}`, kind: "video", what: "Video without subtitles", ...common, at: video.at, wave: "No speech", found: source });
  }
  return items;
}

export function siteItems(pages: readonly InboxPage[], rules: SiteItemRules, parts: readonly InboxPart[] = []): InboxItem[] {
  const items: InboxItem[] = [];
  const listed = new Set([...pages.map(page => page.file), ...parts.map(part => part.file)]);
  for (const file of read.keys()) if (!listed.has(file)) read.delete(file);
  for (const page of pages) {
    const { source } = page;
    if (source === undefined) continue;
    const known = readPage(page.file, source);
    if (!known.titled) items.push({ key: `title\n${page.file}`, kind: "title", what: "Page without a title", where: page.route, page: page.file });
    items.push(...placeItems({ file: page.file, where: `${page.label} page`, source }, known, rules));
    // A heading after one more than a level above it skips; the fix is the edit bar's one press, the next level down.
    let previous = 0;
    const named = new Map<string, number>();
    for (const heading of known.headings) {
      const nth = named.get(heading.words) ?? 0;
      named.set(heading.words, nth + 1);
      if (previous > 0 && heading.level > previous + 1)
        items.push({ key: `heading\n${page.file}\n${heading.words}\n${nth}`, kind: "heading", what: "Heading skips a level", where: `${page.label} page`, page: page.file,
          at: heading.at, level: { from: heading.level, to: previous + 1 }, found: source });
      previous = heading.level;
    }
  }
  for (const part of parts) {
    if (part.source === undefined) continue;
    const shared = { tag: part.tag, name: part.name, pages: part.pages };
    items.push(...placeItems({ file: part.file, where: part.name, source: part.source, shared }, readPage(part.file, part.source), rules));
  }
  return items;
}
