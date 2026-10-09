---
title: Edit component mode in Structure
type: task (AFK)
status: open
assignee:
blocked_by: [44-edit-mode-slot-chip-label]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §5: Structure shows the end result, the editor's normal rows, names and icons for the component with one purple outline round it. Each part that is or can be a slot carries the shared chip as a badge: purple when a slot, muted and struck through when fixed; click and double-click behave as on the label.

- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-tree.ts` (`drawTree` `:107`).

## Done when

- Nightly spec: in the mode, Structure rows carry badges matching the label chip; toggling a badge toggles the slot.
