---
title: "Making mode in Structure: frame and slot badges"
type: task (AFK)
status: open
assignee:
blocked_by: [24-slot-chip-rename-in-place]
builder: sol
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §2 and decided at handoff (8): while making, Structure shows one purple border round the element and its rows, readable in light and dark. Each part that is or can be a slot carries the shared chip (slices 23–24) as its badge; click and double-click behave as on the label. `src/components/page-structure.ts` and `.css`. Slice 46 reuses the badges in Edit component mode.

- Prototype: `src/prototype/cb04-d.ts` (`decorateStructure` `:298`) on `prototype/cb-04-make-component`; `src/prototype/cb14-tree.ts` (`drawTree` `:107`) on `prototype/cb-14-edit-component`.

## Done when

- Nightly spec: in making mode the element's rows are framed and carry badges matching the label chip, in light and dark; toggling or renaming a badge changes the label chip and the canvas outline at once.
