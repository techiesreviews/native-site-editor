---
title: Blocks drag themselves
type: task (AFK)
status: closed
assignee:
blocked_by: [35-canvas-drag-new-blocks]
builder: claude ★
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §10 and §12.

- Pressing on a block and moving 7 px moves it; a plain click still selects or starts text editing. The name chip above the edit bar also drags (how a text block being edited is moved). The header and footer don't drag from the page.
- Moves go across containers through `nativeMoveEdit` (`native-operations.ts:336`) with slice 33's targets, sections included, so there is one move engine (research 11 gaps 6–7; today's section-only path is `onSectionDrag` → `moveNativeSectionTo` in `src/main.ts`).
- No ⠿ grip and no "Move to…": remove the grip and the unwired `nativeElementMoveChoices` (`src/page-builder/native-move-choices.ts:99`).
- Cards reorder the same way, with the sideways line.

## Done when

- Nightly specs: move a Heading into another Div; reorder cards sideways; a click still edits text; the header doesn't drag. `native-section-drag.spec.ts` passes on the new path.

## Done (2026-10-09)

- A press on a page block moved 7 px drags it (the selection when the press is inside it, else the pressed block; inline gives its block, an instance's part its outermost instance; only `<main>`'s own blocks, never the header or footer, nothing in Edit component mode); the runtime relays the pointer as `press-drag`. The edit bar's name chip (no grip dots, named by the block, title "Drag to move") drags any movable block, so text being typed moves from there; the bar holds its render while the chip is pressed. All canvas drags, sections included, go through `trackDrag` (`insert-drag.ts`) + the block drag session with a `DraggedBlock` and the block-insert controller's `move` (`nativeElementMovePlan`/`nativeMoveEdit`: instances move whole, moves into items slots take the slot's name, one undo step, moved block selected). The runtime's section drag, `section-drag`/`onSectionDrag`, the insert controls' drag gaps and `nativeElementMoveChoices` are gone.
- Commits `95edaa2`, `2d8660f`, `db152e2`, `a8164fd` (the last three from two Sol reviews: route in the drag's proof, typing committed by the chip's press accepted only when the bytes changed inside the block (`nativeEditInside`), relayed-drag teardown, pointercancel, items-slot moves).
- Tests: `tests/native-operations.test.ts`, `tests/block-insert-controller.test.ts` (move), `tests/block-drag-session.test.ts`, `tests/drop-indicator.test.ts`, `tests/native-move-choices.test.ts`; nightly `tests/native-save/native-block-move.spec.ts` (Heading into a Div, cards sideways with Alt, click still edits and the chip moves typed text, 6/7 px and the header, into a card's items); `native-section-drag.spec.ts` rewritten for the new path.
- For slice 79 (click selects, double-click edits): the runtime arms a press drag unless the press is inside the element being typed in (`editing`); once a single click no longer starts typing, an unselected text block drags on press-and-move without more work. Card reorder over a card's named slot refuses in place (slice 33's rule); Alt/Tab steps up to the grid, and over the card's padding (no slot) the grid takes it.

- Fix (2026-10-10, Lex, fix-lex-2, `0e4c265e`, `98109c84`): a press inside the selection no longer moves the selection, and an inline element straight in a Section or Div (an image, an unstyled button) is its own block: an image pressed in a selected Div (or a card in a selected section component) drags itself, while formatting and in-text Buttons still give their text block; the selection boxes and the edit bar now follow layout changed without a render (the placeholder image arriving). Tests: `native-plain-section-drops-actual.spec.ts`, `native-block-move.spec.ts`, `native-section-drag.spec.ts`.
