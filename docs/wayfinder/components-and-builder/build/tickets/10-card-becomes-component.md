---
title: "Make component: the repeated item becomes a card component"
type: task (AFK)
status: open
assignee:
blocked_by: [08-slot-plan-repeated-groups-and-lists, 09-slot-plan-nested-instances-and-stretched-links]
builder: claude ★
phase: 2
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §7–8.

- When the items slot's items are plain HTML, the plan also makes the item a component, `card-…`, named from the items slot (`services` → `card-service`; the unnamed slot from the section's name). Items that are instances already stay as they are.
- The card's own slots follow ticket 03 (slices 07–09). The items slot's fallback in the section template is one instance of the card.
- The plan returns both components; Create writes all four files and the page edit in one undo step (`makeComponent`, `src/page-builder/components.ts:1155`).
- What happens to this page's existing items (converted to card instances or left as HTML) is open point 4 in the [spec](../spec.md).
- `suggestTagName` (`component-model.ts:1043`) gives free names.

## Done when

- Unit tests: a grid of `<article class="card">` gives `section-…` plus `card-…` with the right slots and fallback; names singularised; existing instances untouched; free tag names.
- Making a component from the starter's Recent work section writes both components as one undo step.
