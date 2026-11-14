// One thing the Inbox lists (site-quality slice 40; CONTEXT.md **Inbox**): what needs doing and where, the page it
// sits on, and the wave-off it may carry. Slices 41, 43 and 44 add their own kinds.

export interface InboxItem {
  /** Stays the same while the cause does, so the list and the dots follow it. */
  key: string;
  kind: "picture" | "title";
  /** What needs doing, as the row says it ("Picture without a description"). */
  what: string;
  /** Where it is, as the row's second line says it ("About page", "/blog/new"). */
  where: string;
  /** The page file it sits on. */
  page: string;
  /** The source offset of the element it is about (a picture's tag). */
  at?: number;
  /** The Media file it is about: its tile wears the dot. */
  media?: string;
  /** The wave-off, named for what it means ("Decorative"). */
  wave?: string;
  /** Every use of `media` on the page waits, so Decorative marks them all; otherwise only the one at `at`. */
  allUses?: boolean;
}
