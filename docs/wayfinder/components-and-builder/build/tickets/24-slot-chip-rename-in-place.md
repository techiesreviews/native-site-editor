---
title: Slot chips rename in place
type: task (AFK)
status: open
assignee:
blocked_by: [23-making-mode-chips]
builder: claude ★
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §3 as amended by [14](../../tickets/14-prototype-edit-component-visually.md) ("Changed after closing").

- A double-click puts a caret in the chip's own text; it is edited like any text, never an input field. Enter or leaving it commits, Esc cancels. The name is normalised as typed (slice 21).
- The chip and its Structure row show the new name at the same time.
- This is the shared chip control's behaviour, so the edit bar label (slice 44) and Structure badges (slice 46) get it too.

## Done when

- Nightly spec: double-click, type "Lead Text", Enter: the chip reads `lead-text`, Structure says the same, Create writes `slot="lead-text"`; Esc restores the old name.
