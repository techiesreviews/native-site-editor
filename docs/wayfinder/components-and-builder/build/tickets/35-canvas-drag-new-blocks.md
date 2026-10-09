---
title: Drag blocks from the rail onto the canvas
type: task (AFK)
status: open
assignee:
blocked_by: [28-block-rail, 33-drop-target-model, 34-section-snap]
builder: claude ★
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §5.

- Dragging a rail icon uses `makeInsertDraggable` (`src/page-builder/insert-drag.ts:31`: 7 px start, auto-scroll near the frame edges, Esc cancels) with slice 33's targets.
- A thin insertion line, sideways between items in rows and grids, and a floating label naming the target. No border round the target container. Empty containers show a tinted "Drop into the empty Div" area.
- Sections use slice 34. The drop writes through slice 30's insert (with the placeholder image file on first use), selects the new block, one undo step.
- The block-neutral label replaces "Drop section here" (`src/components/insert-controls.ts`, research 11 gap 3).
- Touch drag is out of scope for this run (decided at handoff, 11).
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-drag.ts`.

## Done when

- `@smoke` spec (for example `tests/native-save/native-block-drag.spec.ts`): drag a Paragraph from the rail between two items of a nested Div; it lands there, one undo step.
- Nightly: sideways line in a grid, empty Div area, Alt steps up, Esc cancels, a named slot refuses.
