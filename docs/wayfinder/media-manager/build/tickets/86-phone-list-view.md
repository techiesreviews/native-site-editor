---
title: A readable list view on phones
type: task (AFK)
status: open
assignee: claude (mm-86 runner)
blocked_by: [12-usage-badges-and-list]
builder: claude
phase: 1
---

## What

Follow-up to slice [12](12-usage-badges-and-list.md)'s list view, seen in the stage-1 screenshots at 390 px: file names break in the middle of a word ("favicon.sv" / "g", "glaze-" / "tests.jpg") because the usage words leave the name about 55 px, the usage words wrap ("Used on 6" / "pages"), and one row shows a highlighted background for no visible reason.

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Phone and tablet": phone file names may shorten long names; details shows the complete name; usage and selection targets stay at least 44 px and never overlap.

- On phones each list row keeps the name on one line, never broken mid-word. A name that does not fit shortens in the middle, keeping its end and extension ("portrait-m…maya.jpg"); the complete name stays in the row's accessible name, as a tooltip, and in File details. At 390 px everyday names (up to about 20 letters) fit whole; the narrowest phones (320 px) shorten more.
- The usage number and words stay on one tidy line below the name (only the longest words, "0 pages · Other uses found", may take two balanced lines inside the 44 px target on the narrowest phones); the selection and usage targets stay 44 px, apart, and the list never scrolls sideways (320 to 1280 px).
- On wider screens the list keeps complete names, and the usage numbers line up in one column.
- A row is highlighted only by real hover (a mouse), keyboard focus or selection. The hover background of the selection and usage controls covers only that control, never the whole row, and does not stay behind after a tap on a touch screen.
- Code stays in the lazily loaded Media chunk.

## Done when

- `tests/native-save/native-media-screen.spec.ts`: on a 390 px phone a long name shows on one line, shortened with its extension kept and the complete name in its accessible name and tooltip; short names are whole; usage words do not wrap; targets 44 px and apart; no sideways scroll at 320 px. After a tap on a row's usage, no row keeps a highlighted background; hovering a control with a mouse highlights only that control.
- Unit tests for the pure name-shortening split.
- Scratch screenshots at 320, 390, 768 and 1280 px, before and after.
