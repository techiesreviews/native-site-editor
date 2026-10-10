---
title: Create page from the card's combobox
type: task (AFK)
status: closed
assignee:
blocked_by: [53-fill-card-and-info-strip]
builder: sol
phase: 6
---

## What

Ticket [09](../../tickets/09-prototype-add-existing-page.md) §3: typing an address or title that matches no page offers "+ Create page `/work/hello/`". A typed title becomes an address under the inferred folder ("Hello there" → `/work/hello-there/`). Picking it creates the page as today's Create page and card does (`planCardPage` `src/page-builder/cards.ts:121`, from a sibling page's structure) and fills the card; the page and the fill are one undo step.

- Prototype: `prototype/cb-09-add-existing-page`, `src/prototype/cb09-list.ts` (`CreateOffer`).

## Done when

- Unit test: title → address under the folder; a taken address.
- Nightly spec: create a page from the combobox; the page exists, the card links to it; one undo removes both.

**Added (2026-10-10, from slice 52):** ticket 09 applies card-first to every grid: on plain HTML and collection grids (e.g. the starter's own `div.cards` Recent work), Add card no longer opens the old "New card with its own page" popover; it places the card (a copy of the last item with its text reset, as today) and opens slice 52's "Link to a page…" combobox, with this slice's Create page option. Remove the old popover and update its specs (not loosened).

**Also (2026-10-10, from slice 53):** the info strip lists a "Content: kept" row for the card's unnamed slot; hide rows for an empty unnamed slot (they say nothing).

## Done (2026-10-10)

- "Link to a page…" offers "+ Create page /work/…/" for typed text that names no page (pure `createPageOffer` in `page-choices.ts`: a title under the cards' folder, an address as typed with one new folder level; unusable offers greyed with their reason). Picking it makes the page from a sibling's structure (`siblingPages`: the grid's own pages, the card's own slot only) and fills the card as one undo step (`createPage` in `cards.ts`, the draft as the edit's companion; a fill that changes nothing refuses). The old "New card with its own page" popover is gone: Add card on plain and collection grids places a copy, then opens the combobox for component items or a collection (`canFill`, for slice 55 to widen); plain items fill their title and page link. The strip drops an empty unnamed slot's row.
- Commits a104280b (built by Sol), f626a115 and a slot-isolation fix (review).
- Tests: `tests/card-page-offer.test.ts`, card-fill row case; popover specs rewritten to the combobox (`native-cards`, `native-card-paths`, `native-card-paths-starter` @actual, `native-block-move`); nightly Create page cases in `native-add-card.spec.ts` (card slot, no siblings + redo refusal, named slots) and `native-cards.spec.ts` (plain collection, a card's second link).
