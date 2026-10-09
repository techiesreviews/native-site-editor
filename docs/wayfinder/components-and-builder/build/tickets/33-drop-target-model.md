---
title: Drop target model
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- `src/page-builder/drop-target.ts`: `dropTarget(containers, pointer, block, level)` (innermost valid container, 8 px edge escape, levels up from there, a named slot refuses in place, index along the axis), `dropRefusal` (ticket 10 §5 with the 04 amendment) and `dropLabel` ("Into Div (stack) › after Paragraph", the reason, or "Stays where it is"). The probe now also reports each child's `tag`/`cls` and the container's child `count`.
- Commits `f60e01d`, `c9cd8bb`.
- Tests: `tests/drop-target.test.ts`; `tests/drop-report.test.ts` (new fields); `native-drop-containers.spec.ts` checks the slot refusal and a grid label on the real probe.
