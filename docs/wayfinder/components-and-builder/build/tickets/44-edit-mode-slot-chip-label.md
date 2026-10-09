---
title: "Edit component mode: the slot chip in the edit bar label"
type: task (AFK)
status: open
assignee:
blocked_by: [41-edit-mode-shell, 24-slot-chip-rename-in-place]
builder: sol
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §4, with the shared chip built in slices 23–24 (decided at handoff, 8; there is no making mode, Lex 2026-10-09).

- In the mode, the edit bar's name label reads "◇ Section work › Heading [title]", with the shared chip after the element name: purple for a slot, pink for an items slot ("items ×1"), grey struck through for a fixed part.
- A click toggles slot ↔ fixed and a double-click renames in place, each applied to the template as one undo step, with the code pane following. No chips on the canvas and no "+" on hover.
- Slice 45 widens each toggle and rename to every page at once.

## Done when

- Nightly spec: the label shows the right chip for a slot, an items slot and a fixed part in the mode; a click makes a slot fixed in the template (and back), a double-click rename renames it there; one undo each.
