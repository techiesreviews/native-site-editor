// One thing the Inbox lists (site-quality slice 40; CONTEXT.md **Inbox**): what needs doing and where, the page it
// sits on, and the wave-off it may carry. Slice 41 (TOOLS-222, TOOLS-253) adds links, headings and videos, items in a
// shared part and the fixes Fix with AI suggests; slices 43 and 44 add their own kinds.

export interface InboxItem {
  /** Stays the same while the cause does, so the list and the dots follow it. */
  key: string;
  kind: "picture" | "title" | "link" | "heading" | "video";
  /** What needs doing, as the row says it ("Picture without a description"). */
  what: string;
  /** Where it is, as the row's second line says it ("About page", "/blog/new", a shared part's name). */
  where: string;
  /** The file it sits in: a page, or a shared part's template. */
  page: string;
  /** The source offset of the element it is about (a picture's, link's, heading's or video's tag). */
  at?: number;
  /** The Media file it is about: its tile wears the dot. */
  media?: string;
  /** The wave-off, named for what it means ("Decorative", "No speech"). */
  wave?: string;
  /** Every use of `media` on the page waits, so Decorative marks them all; otherwise only the one at `at`. */
  allUses?: boolean;
  /** The file's text the item was found in: a fix or a wave-off writes only over that text, never a change made since. */
  found?: string;
  /** What Fix with AI suggests and Accept writes: a picture's description, a link's name, or a link's words. */
  fix?: "alt" | "name" | "words";
  /** A vague link's words now. */
  words?: string;
  /** A heading that skips a level: its level, and the one the edit bar's one press gives it. */
  level?: { from: number; to: number };
  /** In a shared part: its tag, its shown name and the pages that show it, so a fix there changes them all. */
  shared?: { tag: string; name: string; pages: readonly string[] };
}
