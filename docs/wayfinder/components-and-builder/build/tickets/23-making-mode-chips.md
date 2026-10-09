---
title: "Making mode: slot chips toggle"
type: task (AFK)
status: open
assignee:
blocked_by: [22-making-mode-shell]
builder: claude ★
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §3.

- Each outlined part has a name chip. A click switches it between slot and fixed; the single click waits a moment so a double-click never flips it. The plan is recomputed with the fixed parts.
- Hovering a part that is not a slot by default offers a faint "+ slot". The context menu has Make slot, Keep fixed, Rename slot. Nothing in the edit bar.
- Build the chip as one shared control (for example `src/components/slot-chip.ts`): slice 44 reuses it in the edit bar label and slice 46 in Structure.
- Open point 8 in the [spec](../spec.md): canvas chips here versus the label chip in Edit component mode.
- Prototype: `src/prototype/cb04-d.ts` (`setEditable`, `markingControls`) on `prototype/cb-04-make-component`; `src/prototype/cb14-label.ts` (`slotBadge` `:48`) on `prototype/cb-14-edit-component`.

## Done when

- Unit test for the click/double-click timing helper.
- Nightly spec: a click makes a part fixed and Create leaves it in the template; "+ slot" adds one; the context menu does both.
