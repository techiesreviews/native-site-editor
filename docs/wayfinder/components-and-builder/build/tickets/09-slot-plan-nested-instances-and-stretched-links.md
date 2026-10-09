---
title: "Slot plan: nested instances and card links"
type: task (AFK)
status: closed
assignee: claude (slice runner)
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

## Done (2026-10-09)

- `makeComponentPlan`: a nested instance is one ordinary whole slot named from its tag (`card-note` → `note`); a link wrapping more than text is one whole slot (`link`). A link-wrapped card made a component becomes an `<article>`, its title (the first heading the plan slots, else the first line) holds the link in the `title` slot, the CSS gets `:host { position: relative; }` and `notes` says the card stays clickable, while that slot keeps its name and isn't fixed. A link card inside a bigger element stays one whole slot (its stretch would cover the whole host).
- Commits "Slot plan: nested instances and link-wrapped cards" and two review-fix commits on `dev`. Choice paths inside the title name the element's own parts; the id leaves the element before planning.
- Tests in `tests/component-model.test.ts`: nested instances (prefixes, kept fixed, fixed groups), link cards (title choice, link attributes, class ties, renames, summaries, grouped rows, fixed title, choices inside the title), text-less wrappers at the root and inside.
- Open: `templateSlots` reads a slot whose fallback is one `card-…` instance (`<slot name="note"><card-note>`) as an items slot, so the planned ordinary slot reads back as items; slice 40 needs a rule that tells it from slice 10's card fallback.
