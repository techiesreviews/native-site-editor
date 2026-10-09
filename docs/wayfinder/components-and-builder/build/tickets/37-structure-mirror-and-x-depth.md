---
title: Structure mirrors drags and takes depth from x
type: task (AFK)
status: open
assignee:
blocked_by: [35-canvas-drag-new-blocks]
builder: claude ★
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §6 (and §8 for Sections).

- While dragging over the canvas, the tree unfolds to the target and shows the same spot as an indented line.
- Dragging in the tree (new blocks and existing rows) picks the depth from the pointer's x, as in file trees. The target row gets a faint tint, no border. Sections snap (slice 34).
- Today's row drag stays among siblings (`src/components/page-structure.ts`, the press-to-drag at `:292`; research 11 gap 8).
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-tree.ts` (`expandTo` `:36`, `boxAmong`, `boxInside`), `cb12-drag.ts` (`showTreeLine` `:68`).

## Done when

- Nightly specs: a canvas drag shows the indented line in Structure; a row dragged left and right changes depth; a Section dragged in the tree snaps between bands.
