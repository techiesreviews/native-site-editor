---
title: "Slot plan: repeated groups and lists"
type: task (AFK)
status: open
assignee:
blocked_by: [07-slot-plan-whole-elements]
builder: claude ★
phase: 2
---

## What

Ticket [03](../../tickets/03-default-editables.md) §5, with the [04](../../tickets/04-prototype-making-components.md) §10 amendment.

- Two or more siblings with the same tag and the same first class become the unnamed slot; the items stay plain HTML (or instances) in the page. Only the first group is unnamed; later groups are `items-2`, `items-3`.
- An items slot may be renamed and still counts as an items slot (04 §10).
- A `<ul>`/`<ol>` becomes one named slot, `list`; its `li` are not slots of their own.
- Reuse the repeated-run detection in `src/page-builder/card-grid.ts` (`itemKind` `:31`, `repeatedRun` `:45`) where it fits.

## Done when

- Unit tests: a card grid becomes the unnamed slot with the cards in the page; a second group is `items-2`; one item alone is not a group; a list becomes `list`; a renamed items slot keeps its items role.
