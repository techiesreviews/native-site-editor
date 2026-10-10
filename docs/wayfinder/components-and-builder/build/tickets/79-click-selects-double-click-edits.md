---
title: "Click selects, double-click edits, everywhere on the page"
type: task (AFK)
status: closed
assignee:
blocked_by: [36-blocks-drag-themselves]
builder: claude ★
phase: 4
---

## What

Lex (2026-10-09): text, images and buttons behave like components on click. One rule for the whole page:

- **A click selects** any heading, paragraph, text element, image, button or link (and an inserted block): the edit bar shows, and it can be dragged at once (slice 36's press-and-move). A click never puts a caret in text.
- **A double-click edits:** it puts the caret in the text at the double-clicked point (for a link or button, in its text; for an image, it opens Choose image…). **Enter** on a selected text block also starts editing; **Esc** leaves editing and keeps the block selected.
- While editing, clicks inside the same text move the caret as today; a click elsewhere selects that element (not editing).
- Click-insert (slice 30) and drops (slices 35, 40) leave the new block selected, not editing.
- Remove slice 36's workaround that text being edited is moved by its name chip, if it's no longer needed (keep the chip draggable).
- Structure rows: click selects; double-click a text row starts editing that text on the canvas.

Many existing browser specs click to type; update them to double-click (or Enter) without loosening what they check. Run the full suite (`scripts/agents/full-suite.sh 3`) since this touches shared plumbing.

## Done when

- Unit tests for the selection/edit state rules; `@smoke`: click a paragraph → selected, edit bar, no caret; double-click → caret, typing changes the text, Esc → selected; drag a just-clicked paragraph moves it.
- Full native-save suite green.

## Done (2026-10-10)

- One rule in the runtime (`canvasGesture`, a pure block in `native-preview-runtime.js`): a click selects any text, image, button or link and never puts a caret in it, so a just-clicked block drags at once; a double-click types with the caret at the point (an image opens Choose image… through `image-edit`); Enter on selected text types at its end; Enter or Escape leaves typing with the text kept (one undo step) and the block selected, and the next Escape selects the parent. A render re-arms typing only for the replaced element itself, so inserts and drops land selected, not typed in. Structure: a click selects (and ends typing in that element); a double-click types in the row's text on the page, except rows that already edit in place in Structure (slot text), which keep their in-place editor. Slice 36's chip-press handling (`nativeEditInside`) stays: pressing the chip while typing still commits the typing. The shortcut sheet says "Type in the selected text" and "Finish typing: Enter or Escape".
- Commits 947ad567, bb713dd2 (review: a Structure click on the element being typed in ends typing; Ctrl+K specs type first), then spec updates 8213e31f, 7b46a3b8, d9dee697, 94ab6ef6, 7847b1cd.
- Tests: `tests/canvas-gesture.test.ts` (the rule, read from the runtime file); `@smoke` in `native-block-move.spec.ts` (click selects with no caret, double-click at the point, Escape keeps it selected, the clicked paragraph drags); nightly `native-text.spec.ts` (image double-click, link click/double-click/Enter/Escape, Structure double-click and click), `native-blocks.spec.ts` (an insert while typing lands not typed in). About 15 specs that clicked to type now double-click or press Enter.
