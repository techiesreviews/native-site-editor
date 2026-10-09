---
title: "Items in a component's items slot can be moved on the page"
type: task (AFK)
status: closed
assignee:
blocked_by: [88-card-drag-targets-grid]
builder: sol
phase: 4
---

## What

From slice 88 (see its Done note): cards (or any items) inside a section component's items slot on the page (e.g. `section-work`'s cards) can't be dragged, because move guards in `src/page-builder/native-operations.ts` (around lines 432 and 470) keep instances sealed. The page owns its items slot's content (ticket 04, ticket 10 amendment), so moving those items — reordering within the slot, moving them into another items slot, and moving a block from the page into the slot — must be allowed, with the seal kept everywhere else (named slots, template parts). Same for Alt+arrow moves (slices 39, 78).

## Done when

- Unit tests for the guard (items-slot children move; named-slot and template content still refused); nightly spec: reorder two cards inside a `section-work` instance by drag (slice 88's gap line), one undo.

## Done (2026-10-10)

- The move guards open an instance's seal at its items slots only (`moveDestination`, `nativeMovableBlock(…, items)`): items reorder in their slot, move to another items slot (the `slot` attribute rewritten, or dropped for the unnamed slot and when leaving the instance; beside itself into another slot of its instance is a move), and out onto the page; named non-items slots, a card's parts and template content stay sealed. A press on an item drags the item, not its section component (runtime `pressBlock`, `dropItem`); Structure rows of items-slot children and the bar's name chip drag them too (lead's request after slice 37). Alt+↑/↓ steps among the slot's own items, Alt+←/→ keeps slice 39's Section/Div rule.
- Commits `48bcce57` (built by Sol), `0854555a` (Structure rows, bar chip), `715b3b05` (review: cross-slot moves beside itself), `cdf11306` (specs after slice 91).
- Tests: `tests/native-operations.test.ts`, `tests/native-move-choices.test.ts`, `tests/drop-target.test.ts` (`dropStays` per slot); nightly `native-block-move.spec.ts` (first card of a `section-work` dragged after the second, one undo), `native-structure-drag.spec.ts` (the same by its Structure row; the title's row doesn't drag).
