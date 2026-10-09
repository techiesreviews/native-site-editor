---
title: Sections snap between page bands
type: task (AFK)
status: closed
assignee:
blocked_by: [32-nested-container-geometry]
builder: sol
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §8: a dragged Section (new or existing, including section components) never refuses; it snaps to the nearest gap between page bands. The half of the band under the pointer picks before or after; a nested row resolves to its band; the header and footer give the first and last gap.

- A pure function, used on the canvas (slice 35) and in Structure (slice 37).
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-core.ts` (`bandTarget` `:289`).

## Done when

- Unit tests: upper and lower half, over a nested element, over the header and footer, an empty `<main>`.

## Done (2026-10-09)

- `src/page-builder/section-snap.ts`: `snapIndex(bands, y)` (after the last shown band whose midpoint is above y, else before the first; empty `<main>` → 0) for the canvas and Structure, and `sectionSnap(main, y)` giving a `<main>` drop target for `dropLabel`. A `bands` drop probe (`probeDrop(at, moving, true)`) reports `<main>` with every band whatever the point, so the header and footer give the first and last gap; a band without a box (display: contents) spans what it shows.
- Commits `84e5643`, `df64f74`.
- Tests: `tests/section-snap.test.ts`; `native-drop-containers.spec.ts` (bands probe over header and footer on the cards fixture, a box-less band through the preview).
