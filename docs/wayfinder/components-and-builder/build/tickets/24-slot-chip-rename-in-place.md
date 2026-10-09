---
title: Slot chips rename in place
type: task (AFK)
status: open
assignee:
blocked_by: [23-slot-chip]
builder: claude ★
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §3 as amended by [14](../../tickets/14-prototype-edit-component-visually.md) ("Changed after closing"), on the shared chip (slice 23).

- A double-click puts a caret in the chip's own text; it is edited like any text, never an input field. Enter or leaving it commits, Esc cancels. The name is normalised as typed (slice 21).
- Wherever the same slot shows a chip (the label, its Structure badge once slice 25 lands), all show the new name at once.

## Done when

- Nightly spec: double-click the label chip, type "Lead Text", Enter: the chip reads `lead-text` and Create writes `slot="lead-text"`; Esc restores the old name.
