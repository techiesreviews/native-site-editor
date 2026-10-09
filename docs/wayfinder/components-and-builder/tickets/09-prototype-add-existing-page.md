---
title: Prototype Add card with an existing page
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [03-default-editables]
---

## Question

Add card offers **Create page and card** and card-only today (`src/page-builder/cards.ts`, `src/components/card-grid-controls.ts`). How does **Add existing page** fit into that popover: which pages are offered first (siblings under the grid's parent, then all pages, searchable), how pages already in the grid are shown, and how the page's title/h1, meta description, og:image and address map onto the card's slots by slot kind when a card has several text slots or none of them? What happens on a grid whose items aren't links? Prototype it on `dev` behind a flag.

## Resolution (2026-10-09)

Decided with Lex by reacting live on the real starter (tunnel to a local editor) to two rounds of variants behind `?proto=cards`: A popover tab, B multi-select picker sheet, C card first and link after; then C revised, plus D (look chip on the card), E (look picked on Add card) and F (look row in the strip). **C, with D and E combined, is the design.** The prototype code is throwaway and lives only on the branch `prototype/cb-09-add-existing-page` (round 1 `2ebc5ac`, round 2 `2772578`), never on `dev`.

**Card first, link after (C)**

1. **Add card places the card at once:** a fresh instance of the items slot's card component with its template's fallbacks (ticket 04), no variant. It shows a "Link to a page…" combobox at its foot. Esc leaves the card blank.
2. **The list is every page on the site**, except the grid's own page and 404. Pages under the folder the existing cards link to (inferred from their hrefs, here `/work/`) come first, then an always-visible "Other pages" group. Search covers all pages. Pages already in the grid are greyed out with "In this grid" and can't be picked.
3. **Typing an address or title that matches no page** offers "+ Create page `/work/hello/`". A typed title becomes an address under the inferred folder ("Hello there" → `/work/hello-there/`). Picking it creates the page as today's "Create page and card" does (from a sibling page's structure) and fills the card; the page and the fill are one undo step.
4. **How a card fills:** title (h1, else `<title>`) → the first heading slot; meta description → the first text slot after the title (else before it); og:image → the first image slot; address → the link slot (text "Read about <title>"). Other slots fill **by matching**: when the page holds the same component or class the slot uses (a `/work/` page's `<card-note>` line), its text is copied; otherwise the fallback stays.
5. **After filling, a strip on the card** lists each slot and its source (`h1`, `meta description`, `og:image`, `address`, kept, not used), with Change page and close. It is information only: no per-row Keep placeholder.
6. **Grids whose items aren't links:** choosing a page makes the card's title a stretched link (`<a href class="stretched">`, ticket 03), marked "added" in the strip.

**Choosing the card's look (D + E)**

7. **On Add card:** the ghost button is split, "+ │ ▾". The plus adds the slot's card component (1); the ▾ opens a gallery, "Add card as…", of every card look rendered with the site's CSS, and places a blank card of the chosen look. The link combobox follows as in 1.
8. **On the card:** a "Card: card-project ▾" chip, on the combobox and on the strip after filling, opens the same set and swaps the card in place.
9. **The set of looks:** every card component on the site (a tag starting `card-` whose template has a heading slot), then the current component's variants (ticket 07, `:host([data-x="v"])`). Mixed looks in one grid are fine (ticket 04: any block may go in an items slot).
10. **Swapping keeps content** by slot role (title, body, image, link; other slots by name), read back from the card so canvas edits carry over. Fallback text doesn't count as content. What the new look has no slot for is kept aside, not lost, listed as "Not shown by card-quote: image (no image slot)", and comes back on a swap to a look that has a place for it.

This extends ticket 04 rule 8: the plain Add card still adds the slot's card component; ▾ and the chip are the deliberate way to another look.

