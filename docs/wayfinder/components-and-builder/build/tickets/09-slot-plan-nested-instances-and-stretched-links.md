---
title: "Slot plan: nested instances and stretched links"
type: task (AFK)
status: open
assignee:
blocked_by: [07-slot-plan-whole-elements]
builder: claude ★
phase: 2
---

## What

Ticket [03](../../tickets/03-default-editables.md) §2 and §6.

- §6 A nested component instance becomes one whole slot, so each page owns that instance and its own slots.
- §2 A link-wrapped card (`<a class="card">…</a>`) becomes a stretched link: the heading (or the first text element) becomes the link slot, the template CSS gets `a::after { inset: 0 }`, the image and texts become their own slots. A wrapper with no text becomes one whole slot. The plan carries a note the making mode shows ("The whole card stays clickable…").
- The exact stretched-link markup and where its CSS lives is open point 3 in the [spec](../spec.md); build 03 §2 as written unless the lead says otherwise.

## Done when

- Unit tests: a nested `<card-note>` becomes a whole slot; a link-wrapped card becomes a stretched link with its CSS; a text-less link wrapper is one slot.
