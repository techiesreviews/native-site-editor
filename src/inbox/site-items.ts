// What the Inbox finds on the site's pages (mock-up 05 v2, TOOLS-222): a picture without a description and a page
// without a title, each listed once with where it is. The picture's verdict is the edit bar's own (its "Alt text"
// warning, src/controllers/page-structure-controller.ts), handed in, so the two never disagree. Pure; tested in
// tests/inbox-site-items.test.ts.

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

interface PageRead { source: string; titled: boolean; pictures: readonly PagePicture[] }

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
  const page = { source, titled: hasTitle(source, elements), pictures };
  read.set(file, page);
  return page;
}

export function siteItems(pages: readonly InboxPage[], rules: SiteItemRules): InboxItem[] {
  const items: InboxItem[] = [];
  const listed = new Set(pages.map(page => page.file));
  for (const file of read.keys()) if (!listed.has(file)) read.delete(file);
  for (const page of pages) {
    const { source } = page;
    if (source === undefined) continue;
    const { titled, pictures: found } = readPage(page.file, source);
    if (!titled) items.push({ key: `title\n${page.file}`, kind: "title", what: "Page without a title", where: page.route, page: page.file });
    // The edit bar asks Media about the src alone; Decorative, like Media's, marks pictures by their src.
    const pictures = found.map(picture => ({ ...picture,
      waits: rules.picture(page.file, picture.src ?? "", picture.alt) === "missing", media: picture.src ? rules.file(page.file, picture.src) : undefined }));
    const seen = new Set<string>();
    for (const { at, shown, waits, hidden, media } of pictures) {
      if (!waits || hidden) continue;
      const key = `picture\n${page.file}\n${media ?? shown}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, kind: "picture", what: "Picture without a description", where: `${page.label} page`, page: page.file, at,
        ...(media ? { media, wave: "Decorative", allUses: pictures.every(other => other.media !== media || other.waits), found: source } : {}) });
    }
  }
  return items;
}
