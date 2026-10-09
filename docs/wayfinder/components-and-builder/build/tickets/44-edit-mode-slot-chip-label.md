---
title: "Edit component mode: the slot chip in the edit bar label"
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- `slotChange` (`component-model.ts`, pure) plans one chip action on the template: a fixed part wrapped in `<slot name>` (on its own lines when it spans several), a slot or the items slot unwrapped to its children at its indentation (text that keeps its spaces left as is), a rename; taken or unchanged names and stale reports refuse. It returns `change` (`made-slot` / `made-fixed` / `renamed`) for slice 45 to rewrite the pages in the same operation. `components.ts` listens to `SLOT_CHIP_EVENT` in the mode and applies each as one `applyNativeOperation` on the template (new `ComponentDeps.operation`; recorded in the page's shared history), the part selected again; a refused rename is cancelled. A slot made fixed offers its old name again while the template reads as that left it (Undo/Redo too).
- Commits 834df90b, 4fd3c061 and the re-review fix (built by Sol, reviewed and fixed by Claude). Tests: `tests/slot-change.test.ts` (10: wrap, unwrap named/items/empty/deep/multi-line, rename, refusals, offered name, `pre`); `native-slot-chip-apply-actual.spec.ts` (@actual: chips, lede made a slot and back, title made fixed, rename, name kept through fixed/Undo/Redo, taken name refused, items slot made fixed, one undo each, frame not reloaded).
