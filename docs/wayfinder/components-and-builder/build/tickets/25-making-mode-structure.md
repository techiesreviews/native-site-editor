---
title: "Making mode in Structure: frame and slot badges"
type: task (AFK)
status: closed
assignee:
blocked_by: [24-slot-chip-rename-in-place]
builder: sol
phase: 3
---

Dropped (Lex, 2026-10-09): making mode removed. Make component creates at once (slice 22); the Structure frame and slot badges it would have provided are built for Edit component mode in slice [46](46-edit-mode-structure-badges.md).

## What (as written before it was dropped)

Ticket [04](../../tickets/04-prototype-making-components.md) §2 and decided at handoff (8): while making, Structure shows one purple border round the element and its rows, readable in light and dark. Each part that is or can be a slot carries the shared chip (slices 23–24) as its badge; click and double-click behave as on the label. `src/components/page-structure.ts` and `.css`. Slice 46 reuses the badges in Edit component mode.

- Prototype: `src/prototype/cb04-d.ts` (`decorateStructure` `:298`) on `prototype/cb-04-make-component`; `src/prototype/cb14-tree.ts` (`drawTree` `:107`) on `prototype/cb-14-edit-component`.
