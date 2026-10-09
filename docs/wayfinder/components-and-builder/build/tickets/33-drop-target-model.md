---
title: Drop target model
type: task (AFK)
status: open
assignee:
blocked_by: [32-nested-container-geometry]
builder: claude ★
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §5 and §9, [10](../../tickets/10-block-set.md) §5 with the 04 amendment. A pure module (for example `src/page-builder/drop-target.ts`) beside `insert-target.ts`.

- From slice 32's report, the dragged block, the pointer and a level: the innermost valid container wins; within ~8 px of its edge the target escapes to the parent; Alt or Tab steps up a level, Shift+Tab back.
- The index runs along the container's axis (sideways in rows and grids).
- Where blocks may go: Section only between bands (slice 34); others inside a Section or Div; into an instance only through its items slots; named slots refuse with their reason ("The “title” slot is filled by editing its text…").
- The label text: "Into Div (stack) › after Paragraph".
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-core.ts` (`containerKind` `:162`, `allowed` `:174`, `deepestAt` `:225`, `containersAt` `:248`, `indexAt`/`sideIndex` `:209-219`, `targetFor` `:280`, `whereText` `:299`).

## Done when

- Unit tests: innermost wins; the edge escape; level up and down; sideways index in a grid; refusals with reasons; the label text.
