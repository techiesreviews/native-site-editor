---
title: Card links follow the card
type: task (AFK)
status: open
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
