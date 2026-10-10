---
title: Right-click slot items in Edit component mode
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- A slot provider (`slotMenu` in `components.ts`, rule `slotMenuItems` in `slot-menu.ts`) joins `elementMenuItems` in `main.ts`: in the mode, a fixed part offers Make slot, a slot or items slot Rename slot and Remove slot, read from the same `templateChip` state as the label chip. Make/Remove dispatch the chip's own `SLOT_CHIP_EVENT` toggle (one undo step, slice 45's page rewrites included); Rename starts the chip's in-place edit (`renameSlotChip`, `slot-chip.ts`): the edit bar's label chip from the canvas, the row's badge from Structure. Template rows target their one badge (none or several: no slot items) and are checked against the painted template; the root, outer levels and parts inside a nested instance (now no chip either) offer nothing.
- Built by Sol, review fixes by Claude: f7b765ed and the "Slice 66 review" commit.
- Tests: `tests/slot-menu.test.ts`; `native-slot-context-menu-actual.spec.ts` (@actual: canvas, Structure right-click, ⋯, Shift+F10, ContextMenu; each action one undo; root, badge-less fallback row, nested contents and outer rows refuse).
