---
title: Slot chips rename in place
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- `slot-chip.ts`: the chip is now a `span` acting as a button (Enter/Space toggle, F2 or a double-click renames). Renaming makes its name part `contenteditable` (plain text): the whole name selected, made valid as typed (`normaliseField`), Enter or leaving commits, Esc cancels; keys stay out of the editor's shortcuts. Chips sharing a `group` (template + slot path) show the name as typed, ready for slice 46's badges. Only slot and items chips rename; a fixed chip's double-click does nothing.
- The commit (`committedSlotName`, `component-names.ts`: final spelling, none when empty or unchanged) goes to the owner as a cancelable `SLOT_CHIP_EVENT` `{ action: "rename", …, name }`; `preventDefault()` refuses it and the old name comes back (slice 44 applies it). The edit bar puts the caret back if it renders while a name is typed.
- Tests: `tests/slot-chip.test.ts` (typed and committed names); `native-slot-chip-actual.spec.ts` @actual rename test (as typed, Esc, Enter, refused, leaving commits, mirrored stand-in badge, fixed chip no rename).
