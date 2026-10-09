---
title: Structure mirrors drags and takes depth from x
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- Over the canvas, Structure unfolds to the drag's target and shows the same spot as an indented line (a dot at its start), the container's row faintly tinted; rows the drag unfolded fold back when its target moves elsewhere or the drag ends, except on the way to where it dropped. Over the tree, a rail block or a dragged row takes the gap under the pointer at the depth its x picks (14 px per level, now the tree's indent), the nearest depth whose container takes it (Section, Div, an instance's items slot; not inside a named slot); a Section snaps between band rows (header first, footer last). Rows of `<main>`'s blocks (whole instances, not their parts) drag through `trackDrag`, the block drag session and the block-insert controller, as the canvas does; the sibling-only section row drag (`canDrag`/`onMoveTo`) is gone. Pure rules in `src/page-builder/tree-drop.ts`; `page-structure.ts` gives a `dropView`.
- Commits `e42a4b6f`, `ed5161ef` (review: line cleared off both surfaces, named slots, folded `<main>`, redraws), `16cf264d` (re-review: exact slot names, a release decided by a late probe keeps no branch open). Lazy block-drag chunk 2.8 → 4.0 KB gzip; boot unchanged.
- Tests: `tests/tree-drop.test.ts`, `tests/block-drag-session.test.ts` (tree side); nightly `native-structure-drag.spec.ts` (canvas drag mirrored and folded back on Escape, a row's depth from x, a Section snapping in the tree, a rail block dropped in the tree); `native-section-drag.spec.ts` and the Structure harness specs updated to the new row drag.
- Not done: rows inside a component's items slot don't drag from Structure, since the move engine refuses moves out of an instance (the canvas moves the whole instance too).
