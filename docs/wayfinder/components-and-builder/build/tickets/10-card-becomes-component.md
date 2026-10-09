---
title: "Make component: the repeated item becomes a card component"
type: task (AFK)
status: closed
assignee:
blocked_by: [08-slot-plan-repeated-groups-and-lists, 09-slot-plan-nested-instances-and-stretched-links]
builder: claude ★
phase: 2
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §7–8, and decided at handoff (4, 9).

- When the items slot's items are plain HTML, the plan also makes the item a component, `card-…`, named from the items slot (`services` → `card-service`; the unnamed slot from the element's name). Items that are instances already stay as they are.
- The card's own slots follow ticket 03 (slices 07–09). The items slot's fallback in the template is one instance of the card.
- **This page's items become instances of the new card component**, each keeping its own content in its slots (supersedes ticket 03 §5's "items stay plain HTML").
- The plan returns both components; Create writes all four files and the page edit in one undo step (`makeComponent`, `src/page-builder/components.ts:1155`).
- `suggestTagName` (`component-model.ts:1043`) gives free names; a card name without a hyphen gets `card-` (slice 21).

## Done when

- Unit tests: a grid of `<article class="card">` gives `section-…` plus `card-…` with the right slots and fallback, and the page's items rewritten as `<card-…>` instances with their own text, images and links in slots; names singularised; existing instances untouched; free tag names.
- Making a component from the starter's Recent work section writes both components and converts the items as one undo step; the page looks the same.

## Done (2026-10-09)

- `makeComponentPlan(…, taken)` returns `cards`: a group of plain items (article, div, figure, a, blockquote) becomes `card-…` (`cardTagFor`: the items slot's name, else the new component's, last word singular, numbered when taken); the items whose own plan has a heading slot (`hasHeadingSlot`) and that are written alike (the same template, byte for byte, once fallbacks go; at least two) become its instances with their own content, odd ones stay plain. The items slot's fallback is one empty card instance, also for a group of existing `card-…` instances. Make component writes all files and the page in one undo step.
- Commits "Make component: repeated plain items become a card component" and a review-fix commit on `dev`. Card hosts are `display: block` like every Make component host; page CSS for them is slice 64.
- Tests: `tests/component-model.test.ts` (card grid, odd/unlike items, list items, no heading, instances, fixed groups, two groups, link cards, names, heading slot); `native-cards.spec.ts` "Make component on a grid of plain cards…" (the starter's Recent work holds `card-project` instances already, so the spec uses the native-cards Home with its cards written out plain).
