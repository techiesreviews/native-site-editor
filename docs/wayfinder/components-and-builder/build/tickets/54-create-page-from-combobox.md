---
title: Create page from the card's combobox
type: task (AFK)
status: open
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
