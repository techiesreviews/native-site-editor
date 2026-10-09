---
title: "Items in a component's items slot can be moved on the page"
type: task (AFK)
status: open
assignee:
blocked_by: [88-card-drag-targets-grid]
builder: sol
phase: 4
---

## What

From slice 88 (see its Done note): cards (or any items) inside a section component's items slot on the page (e.g. `section-work`'s cards) can't be dragged, because move guards in `src/page-builder/native-operations.ts` (around lines 432 and 470) keep instances sealed. The page owns its items slot's content (ticket 04, ticket 10 amendment), so moving those items — reordering within the slot, moving them into another items slot, and moving a block from the page into the slot — must be allowed, with the seal kept everywhere else (named slots, template parts). Same for Alt+arrow moves (slices 39, 78).

## Done when

- Unit tests for the guard (items-slot children move; named-slot and template content still refused); nightly spec: reorder two cards inside a `section-work` instance by drag (slice 88's gap line), one undo.
