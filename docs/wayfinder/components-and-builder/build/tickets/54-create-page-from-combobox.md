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
