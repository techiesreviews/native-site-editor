---
title: Card links follow the card
type: task (AFK)
status: closed
assignee:
blocked_by: [53-fill-card-and-info-strip, 09-slot-plan-nested-instances-and-stretched-links]
builder: sol
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §4 and §6, as decided at handoff (3). No `stretched` class.

- A card with its own link slot gets that slot filled when a page is chosen (slice 51's mapping, "Read about <title>").
- A card without a link slot gets its title's text wrapped in a link to the page (`<h3 slot="title"><a href="/work/x/">Title</a></h3>` in a card component, `<h3><a href…>` in a plain item), marked "added" in the strip. The card's CSS stretches it over the card through the card link rule (slice 65, the selectors are there): for a card component the editor adds `:host { position: relative; }` to its CSS when missing, in the same undo step; plain `.cards` grids rely on the site's shared rule. A site without the rule still gets a working title link, just not a whole-card one.
- One shared rule because component CSS can't reach a link inside slotted content (`::slotted()` takes only the slotted element).

## Done when

- Unit tests for the markup change: a card component without a link slot, a plain item, a card that has a link slot (untouched), a title that already holds a link.
- Nightly spec (on a fixture with slice 65's rule): picking a page for a plain-grid card and for a card component without a link slot makes the whole card clickable, and the strip says "added".

## Done (2026-10-10)

- Add card on a plain grid whose items have a heading title now opens "Link to a page…" (`canFill`); picking or creating a page wraps the title in a link to it (`itemFill` in `card-grid.ts`: an existing whole-title link, or a link around the heading, is repointed, never nested; the copy's own emptied page link is filled as before), the strip's Link row says "added". A card component without a link slot whose CSS has no unconditional positioned `:host` gets `:host { position: relative; }` (its `.css` made when absent) in the fill's undo step, or Create page's, through one operation (`cardLinkCss` in `card-link-css.ts`, loaded lazily; site, editor and files rechecked after the load).
- Commits "Card links follow the card…" (built by Sol), a review-fix commit and a proof follow-up on `dev`.
- Tests: `tests/card-link-css.test.ts` (4), 5 `itemFill` cases in `tests/card-grid.test.ts` (component cases were already in `card-fill.test.ts`); nightly in `native-add-card.spec.ts`: a plain unlinked grid and a `card-quote`-like component without a link slot, each by picking and by creating a page, with the starter's shared rule: corner hit test lands on the title link, "added", one undo (fill and CSS together), redo.
