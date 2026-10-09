---
title: Add card adds the slot's card component
type: task (AFK)
status: closed
assignee:
blocked_by: [40-items-slot-drops]
builder: claude ★
phase: 6
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §8, [09](../../tickets/09-prototype-add-existing-page.md) §1.

- On an items slot whose fallback is a card component (an unnamed slot holding plain items has none), Add card places a fresh instance of it with its template's fallbacks, no variant, after the last item, as one undo step. It works with 0 or 1 items: the kind comes from the fallback, not from counting siblings.
- Grids whose items are plain HTML with no card component keep today's copy (`itemCopy`, `src/page-builder/card-grid.ts:319`).
- The Add card control lives in `src/components/card-grid-controls.ts` and `src/controllers/cards-controller.ts`; items slots come from slice 40 (the unnamed slot, or one whose fallback is a `card-…` component; decided at handoff, 5).

## Done when

- Unit test: the card markup comes from the fallback for 0, 1 and many items.
- Nightly spec: Add card on an empty items slot adds a card; undo removes it.

## Done (2026-10-09)

- An instance's card slot (an items slot whose fallback is card components only, `cardSlotOf` in `src/page-builder/card-slot.ts`) gets a fresh instance of that card on Add card: its template's text and image fallbacks copied in (`slotMarkup`), no variant, after the slot's last item, one undo step (`nativeInstanceInsertEdit`). The preview reports a card slot as a grid with 0, 1 or many items (`slot` on the report; empty: where its first card goes; of several, the one nearest the pointer); it places the card at once, no page popover. Plain grids keep `itemCopy`.
- Commits "Add card on a card slot adds the slot's card component" and a review-fix commit on `dev`.
- Tests: `tests/card-slot.test.ts` (0, 1, many items, the kind from the fallback, named slots, refusals, srcset); nightly `native-add-card.spec.ts` (empty slot add and undo, one card beside, two named card slots).
