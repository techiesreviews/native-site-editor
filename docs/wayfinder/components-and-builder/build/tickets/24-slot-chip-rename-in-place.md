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

Ticket [14](../../tickets/14-prototype-edit-component-visually.md) §4 and its "Changed after closing", on the shared chip (slice 23), in Edit component mode's label and on Structure badges.

- A double-click puts a caret in the chip's own text; it is edited like any text, never an input field. Enter or leaving it commits, Esc cancels. The name is normalised as typed (slice 21, `normaliseField`).
- Wherever the same slot shows a chip (the label, its Structure badge once slice 46 lands), all show the new name at once.
- The commit hands the new name to the chip's owner: slice 44 renames the slot in the template, slice 45 on every page.

## Done when

- Nightly spec: in Edit component mode, double-click the label chip, type "Lead Text": the chip reads `lead-text` as typed; Enter commits it (the owner hears `lead-text`); Esc restores the old name.
