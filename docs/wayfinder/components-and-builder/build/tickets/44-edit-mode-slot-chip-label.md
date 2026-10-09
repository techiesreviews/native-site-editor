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

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §4, with the shared chip built in slices 23–24 (decided at handoff, 8).

- In the mode, the edit bar's name label reads "◇ Section work › Heading [title]", with the shared chip after the element name: purple for a slot, pink for an items slot ("items ×1"), grey struck through for a fixed part.
- A click toggles slot ↔ fixed and a double-click renames in place, as in making mode. No chips on the canvas and no "+" on hover.
- Each toggle or rename goes through slice 45, which rewrites the template and every page at once.

## Done when

- Nightly spec: the label shows the right chip for a slot, an items slot and a fixed part in the mode; the chip's click and double-click reach slice 45's change.
