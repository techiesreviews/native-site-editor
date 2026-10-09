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

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §5: Structure shows the end result, the editor's normal rows, names and icons for the component. This slice also builds what slice 25 (dropped with making mode, Lex 2026-10-09) would have provided, now for Edit component mode:

- One purple border round the component and its rows, readable in light and dark (`src/components/page-structure.ts` and `.css`).
- Each part that is or can be a slot carries the shared chip (slices 23–24) as its badge: purple when a slot, pink for an items slot, muted and struck through when fixed. Click and double-click behave as on the label and go through slices 44 and 45; a badge and the label chip for the same part change together.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-tree.ts` (`drawTree` `:107`); the frame idea from `src/prototype/cb04-d.ts` (`decorateStructure` `:298`) on `prototype/cb-04-make-component`.

## Done when

- Nightly spec: in the mode, the component's rows are framed in light and dark and carry badges matching the label chip; toggling or renaming a badge changes the label chip at once and applies the change to the template and every page.
