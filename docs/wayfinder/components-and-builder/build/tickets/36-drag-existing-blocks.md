---
title: Blocks drag themselves
type: task (AFK)
status: open
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
