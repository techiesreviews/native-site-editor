// What the Inbox finds on the site's pages (mock-up 05 v2, TOOLS-222): a picture without a description and a page
// without a title, each listed once with where it is. The picture's verdict is the edit bar's own (its "Alt text"
// warning, src/controllers/page-structure-controller.ts), handed in, so the two never disagree. Pure; tested in
// tests/inbox-site-items.test.ts.

import { startTagAttribute, startTags } from "../../shared/html-source";
import type { InboxItem } from "./inbox-item";

/** A page of the site as the Inbox reads it: its file, the Pages tab's name and address, and its text now. */
export interface InboxPage { file: string; label: string; route: string; source: string | undefined }

export interface SiteItemRules {
  /** The edit bar's verdict on a picture's description at a place; undefined while it is not known yet. */
  picture(page: string, src: string, alt: string | undefined): "described" | "decorative" | "missing" | undefined;
  /** The repository file a picture's address shows, when it is one. */
  file(page: string, src: string): string | undefined;
}

/** The page's own `<title>` text (in its head, not an SVG's in the body), trimmed. */
function pageTitle(source: string) {
  const headEnd = source.search(/<\/head\s*>|<body[\s>]/i);
  return /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(headEnd < 0 ? source : source.slice(0, headEnd))?.[1].trim() ?? "";
}

export function siteItems(pages: readonly InboxPage[], rules: SiteItemRules): InboxItem[] {
  const items: InboxItem[] = [];
  for (const page of pages) {
    const { source } = page;
    if (source === undefined) continue;
    if (!pageTitle(source)) items.push({ key: `title\n${page.file}`, kind: "title", what: "Page without a title", where: page.route, page: page.file });
    const seen = new Set<string>();
    for (const tag of startTags(source)) {
      if (tag.name !== "img") continue;
      const src = startTagAttribute(source, tag, "src")?.value.trim();
      // No address at all is the edit bar's "No image", not a description to write.
      if (!src || rules.picture(page.file, src, startTagAttribute(source, tag, "alt")?.value) !== "missing") continue;
      const media = rules.file(page.file, src);
      const key = `picture\n${page.file}\n${media ?? src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, kind: "picture", what: "Picture without a description", where: `${page.label} page`, page: page.file, at: tag.start,
        ...(media ? { media, wave: "Decorative" } : {}) });
    }
  }
  return items;
}
