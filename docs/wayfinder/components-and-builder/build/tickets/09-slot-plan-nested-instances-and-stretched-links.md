---
title: "Slot plan: nested instances and card links"
type: task (AFK)
status: open
assignee:
blocked_by: [07-slot-plan-whole-elements]
builder: claude ★
phase: 2
---

## What

Ticket [03](../../tickets/03-default-editables.md) §2 and §6, with card links as decided at handoff (3).

- §6 A nested component instance becomes one whole slot, so each page owns that instance and its own slots. It is an ordinary slot, not an items slot (decided at handoff, 5).
- §2 A link-wrapped card (`<a class="card" href>…</a>`): the wrapping link goes, the image and texts become their own slots, and the title's text is wrapped in the card's link inside the title slot (`<h3 slot="title"><a href="…">Title</a></h3>` on the page), so each page owns the address. The card stays clickable through the card link rule (slice 65): the component's CSS gets `:host { position: relative; }`, and the site's shared rule `[slot="title"] > a:only-child::after` stretches the link. Component CSS can't do the stretching itself: `::slotted()` reaches only the slotted heading, not the link inside it. No `stretched` class.
- A wrapper with no text becomes one whole slot. The plan carries a note the making mode shows ("The whole card stays clickable through its title link").

## Done when

- Unit tests: a nested `<card-note>` becomes an ordinary whole slot; a link-wrapped card gives a title slot holding the link and `:host { position: relative; }` in its CSS; a text-less link wrapper is one slot.
