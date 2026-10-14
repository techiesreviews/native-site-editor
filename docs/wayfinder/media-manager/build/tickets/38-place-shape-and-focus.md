---
title: Shape and focus point per place
type: task (AFK)
status: in progress
assignee: claude (mm-38 runner)
blocked_by: [33-placed-image-markup]
builder: sol
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13) "Shapes and what gets saved"; research 03 §5–6.

- Writing a place's shape: inline `aspect-ratio` and `object-fit: cover` for Square, 4:3, 16:9, Tall 4:5; Original removes them. Focus point: inline `object-position` in percent.
- Edits change single declarations inside an existing `style` attribute and keep the rest (research 03's change list).
- `sizes` is re-measured after a shape change (slice 32, cover-adjusted).
- Reading back a place's shape, focus and whether it uses a Trimmed copy, for the popup's state badge.
- Nothing new is saved for a shape or focus change.

## Done when

- `tests/place-frame.test.ts`: each shape, focus, Original clears, other style declarations kept, reading back, slot images.
