---
title: The block rail beside Structure
type: task (AFK)
status: open
assignee:
blocked_by: [04-six-block-catalogue]
builder: sol
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §1.

- An icon rail at the far left, before Page Structure, always visible: the six blocks (slice 04) as plain icons (`src/components/element-icons.ts`). Hover or focus shows the name only ("Section", "Div", "Image"…), which is also the accessible label. Keyboard focusable.
- The Add panel keeps components and sections only.
- The rail is boot UI: report the byte-budget delta. Clicking and dragging come in slices 30 and 35.
- Touch drag is out of scope for this run (decided at handoff, 11); clicking a block works on touch.
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-rail.ts` (`mountRail`), `cb12.css`.

## Done when

- Nightly spec: the rail shows six blocks with their names as labels and tooltips, in light and dark.
