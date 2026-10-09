---
title: "Edit component mode: the slot chip in the edit bar label"
type: task (AFK)
status: open
assignee:
blocked_by: [41-edit-mode-shell, 24-slot-chip-rename-in-place]
builder: claude ★
phase: 5
---

## What

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §4.

- The edit bar's name label reads "◇ Section work › Heading [title]": the chip comes after the element name and is the shared chip control (slices 23–24).
- A slot is a solid purple chip, an items slot pink ("items ×1"); a fixed part a muted grey chip with its name struck through (the name it had, or the role name it would get).
- A click toggles slot ↔ fixed (with the short wait); a double-click renames in place. No chips at the element's end on the canvas and no "+" on hover.
- This slice changes the template; slice 45 carries the change to the pages.
- Prototype: `prototype/cb-14-edit-component`, `src/prototype/cb14-label.ts` (`slotBadge` `:48`, `decorateLabel` `:105`).

## Done when

- Nightly spec: the label shows the right chip for a slot, an items slot and a fixed part; a click toggles; a double-click renames.
