---
title: "Delete key removes the selected element; no delete icon on Structure rows"
type: task (AFK)
status: open
assignee:
blocked_by: [79-click-selects-double-click-edits]
builder: sol
phase: 4
---

## What

Lex (2026-10-09):
- **Delete / Backspace on a selected element** (not editing text) removes it, as one undo step, on the canvas and on a focused Structure row; the selection moves to the next sibling, else the previous, else the parent. While editing text, the keys work as text keys (slice 79's editing state).
- Same in Edit component mode on the template's parts (removing a slot's element removes the slot, per decision 6, in the same undo step).
- Not on the page's header/footer components, `<main>`, or parts inside a component on the page (outside Edit component mode).
- **No delete icon on Structure rows** (remove it); the edit bar's remove action stays.

## Done when

- Unit tests for the next-selection rule; nightly spec: select a paragraph, Delete → gone, one undo restores; Delete while editing text deletes a character; Structure row without the icon, Delete on a focused row removes it.
