---
title: "A dragged card targets the gaps between cards"
type: task (AFK)
status: open
assignee:
blocked_by: [36-blocks-drag-themselves]
builder: sol
phase: 4
---

## What

From slice 36 (see its Done note): reordering cards is awkward, because while a card is dragged, hovering another card's text hits that card's named slot and shows a red refusal; you have to press Alt/Tab or aim at the padding. When the dragged element is an item of a grid or an items slot (a card, or any repeated item), hovering another item of the same container targets the gap before or after that item (by the pointer's half along the grid's axis), never the item's insides. Other blocks keep slice 33's innermost-container rule. Same in Structure once slice 37 mirrors drags.

## Done when

- Unit test for the item-to-item targeting; nightly spec: drag the first card over the middle of the third card's title → the line sits after (or before) the third card, the drop reorders, one undo.
