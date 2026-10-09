---
title: "A dragged card targets the gaps between cards"
type: task (AFK)
status: closed
assignee:
blocked_by: [36-blocks-drag-themselves]
builder: sol
phase: 4
---

## What

From slice 36 (see its Done note): reordering cards is awkward, because while a card is dragged, hovering another card's text hits that card's named slot and shows a red refusal; you have to press Alt/Tab or aim at the padding. When the dragged element is an item of a grid or an items slot (a card, or any repeated item), hovering another item of the same container targets the gap before or after that item (by the pointer's half along the grid's axis), never the item's insides. Other blocks keep slice 33's innermost-container rule. Same in Structure once slice 37 mirrors drags.

## Done when

- Unit test for the item-to-item targeting; nightly spec: drag the first card over the middle of the third card's title → the line sits after (or before) the third card, the drop reorders, one undo.

## Done (2026-10-09)

- `dropTarget` (`src/page-builder/drop-target.ts`, `siblingUnder`): a moved item of a grid or an items slot, over another item of the same container (the child holding the next inner container, or a leaf's own box), targets that container before or after the item by the pointer's half along its axis, never its slots or insides, without the edge escape; Alt/Tab step up from there. An items-slot sibling must be in the same slot, not only the same instance. Everything else keeps slice 33's rule. Structure gets it through `dropTarget` once slice 37 uses it.
- Commits `92b3dbd`, review fixes `b347802` (leaf items, line position), `0e845d2` (same slot).
- Tests: `tests/drop-target.test.ts` (grid and items slot, both halves along row and column, insides of every kind, Alt, over itself, leaf items at the grid's edge, a different items slot); nightly `native-block-move.spec.ts` (first card over the third card's title: line at its right edge, reorder, one undo; the sideways test now shows the gap instead of the slot's refusal).
