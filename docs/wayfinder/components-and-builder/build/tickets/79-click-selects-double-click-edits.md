---
title: "Click selects, double-click edits, everywhere on the page"
type: task (AFK)
status: open
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
