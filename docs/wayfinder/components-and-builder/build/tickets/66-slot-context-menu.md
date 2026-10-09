---
title: Right-click slot items in Edit component mode
type: task (AFK)
status: open
assignee:
blocked_by: [24-slot-chip-rename-in-place, 26-make-component-entry-points, 44-edit-mode-slot-chip-label]
builder: sol
phase: 5
---

## What

Lex (2026-10-09): the right-click menu offers the slot actions that make sense for the clicked part in Edit component mode, on the canvas and on Structure rows (slice 26's menu). There is no making mode (Lex, 2026-10-09): Make component creates at once and lands in this mode.

- On a fixed part that can be a slot: **Make slot** (same as clicking the grey chip; named by role).
- On a slot: **Rename slot** (puts the caret in the chip's name, as a double-click does, slice 24) and **Remove slot** (same as clicking the purple chip: the part becomes fixed; each page's element for it is removed in the same undo step, decided at handoff 6, slice 45).
- No "Keep fixed". Nothing on parts that can't be slots (the component root, inside a nested component).
- Make component itself stays in the menu outside the mode (slice 26).

## Done when

- The menu shows exactly the actions above per part, and each does the same as the chip.
- Nightly spec: in the mode, right-click a fixed part → Make slot; right-click that slot → Rename slot (caret in the chip) and Remove slot.
