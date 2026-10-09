---
title: The preview reports nested containers
type: task (AFK)
status: open
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
