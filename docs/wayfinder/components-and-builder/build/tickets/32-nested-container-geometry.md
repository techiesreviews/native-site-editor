---
title: The preview reports nested containers
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 4
---

## What

Research 11 gaps 1, 2 and 15 (`git show research/cb-11-insert-drag-today:docs/wayfinder/components-and-builder/research/11-insert-drag-today.md`).

- During a drag, the runtime (`src/components/native-preview-runtime.js`, `insertPoints` `:766`) reports the containers under the pointer: each with its source path, rect, kind (main, section, div, an instance's items slot), its children's rects, its flow axis (rows and grids run sideways) and whether it is empty. It stops at sealed instances as `native-operations.ts` does, except at items slots.
- The editor sends x as well as y. Measure per move, not the whole page.
- Keep the measuring separate from deciding: slice 33 decides.
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-frame.js` (the dump), `cb12-core.ts` (`RawNode`, `Dump` `:45-47`).

## Done when

- Unit tests for any pure part (axis detection from child rects).
- Nightly spec: on a page with a Section › Div (grid) › items, the report lists the nested containers with the grid's sideways axis.

## Done (2026-10-09)

- The runtime answers a `drop-probe` (x, y, moving path) with `drop-containers`: main, section, div and items-slot containers under the point, innermost first, with paths, boxes, children's boxes, layout and emptiness; sealed instances stay closed except through items slots, named slots come back as `slot`. `src/page-builder/drop-report.ts` validates it and derives the axis (`flowAxis`); `probeDrop` on the preview sends it.
- Commits `4b9c589`, `c10f7f9`.
- Tests: `tests/drop-report.test.ts` (axis, parsing); `tests/native-save/native-drop-containers.spec.ts` (Section › grid Div › cards with the row axis, probe settling, items-slot seal).
