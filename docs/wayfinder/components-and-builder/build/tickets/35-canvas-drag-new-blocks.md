---
title: Drag blocks from the rail onto the canvas
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- Rail blocks drag onto the canvas through `makeInsertDraggable` (now any target, 7 px, contexts may load lazily): `block-drag.ts` probes the containers under the pointer one probe at a time, takes slice 33's target (Alt/Tab up, Shift+Tab back, reset over a new innermost container) or slice 34's band snap for a Section, and draws a line (sideways in rows and grids), an empty container's "Drop into the empty Div (stack)" area or a refusal's red outline (`drop-indicator.ts`), named in the pointer's label. Drops go through slice 30's insert (`drop` in the block-insert controller, refused when the page changed since it was measured). Items slots refuse until slice 40. Empty Sections/Divs keep 72 px dashed in the preview. "Drop section here" is now "Drop here".
- Commits `2e98e09`, `4d20fde`, `b72a23e`, review `065da5d`, `7f07e2c` (a release is decided by a probe of its own point; no retry loop on unanswered probes). Boot +1.4 KB gzip; lazy chunk 2.5 KB + 0.4 KB CSS.
- Tests: `tests/drop-indicator.test.ts`; `tests/block-drag-session.test.ts`; `tests/block-insert-controller.test.ts` (drop); `tests/native-save/native-block-drag.spec.ts` (@smoke: Paragraph between two cards of the nested grid, one undo; nightly: Alt and Tab up, Esc cancels, title slot refuses, empty Div area, Section snaps).
