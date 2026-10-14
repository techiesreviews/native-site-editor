---
title: Trim, zoom and turn in the popup
type: task (AFK)
status: open
assignee:
blocked_by: [39-image-button-and-popup, 40-trimmed-copies]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13); [crop-popup.html](../../prototype/crop-popup.html).

- **Free** shows four corner handles; **Zoom** and **Turn left/right** in the popup.
- The message turns yellow whenever the result saves a Trimmed copy; previews update live.
- Done makes the copy (slice 40) and places it in this spot, one Undo step; other places keep the original.
- Re-opening a trimmed place starts from the original with the trim restored.

## Done when

- Nightly in `native-image-popup.spec.ts`: Free-trim an image, Done; a `-crop` file is placed only here; re-open shows the trim on the original; re-trim writes a new name.
